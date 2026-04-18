import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { stripe } from '@/lib/stripe'
import { neon } from '@neondatabase/serverless'
import { MONTHLY_QUOTA, YEARLY_QUOTA, FREE_QUOTA } from '@/lib/quota-plans'

/** Parse Stripe metadata userId as a positive integer. Returns null when invalid. */
function parseUserId(raw: unknown): number | null {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Extract the subscription id from an invoice regardless of how Stripe populated the field. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription
  if (typeof sub === 'string') return sub
  if (sub && typeof sub === 'object' && 'id' in sub) return sub.id
  return null
}

const PAID_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing'])

function quotasForPrice(priceId: string | undefined | null) {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID) return MONTHLY_QUOTA
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID) return YEARLY_QUOTA
  return FREE_QUOTA
}

/**
 * Write the authoritative subscription state for a user.
 *
 * When Stripe reports the subscription as paid-up (active/trialing) we upgrade
 * the user to the quota for their price id. Any other status (past_due, unpaid,
 * canceled, incomplete_expired, incomplete, paused) is treated as "not paid"
 * and the user is reset to the free tier so they cannot continue consuming
 * paid quota after a failed renewal.
 */
async function applySubscriptionState(
  sql: NeonQueryFunction<false, false>,
  userId: number,
  subscription: Stripe.Subscription
): Promise<void> {
  const status = subscription.status
  const priceId = subscription.items.data[0]?.price.id
  const isPaid = PAID_STATUSES.has(status)

  if (isPaid) {
    const q = quotasForPrice(priceId)
    await sql`
      UPDATE auth_users
      SET
        stripe_customer_id = ${typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id},
        stripe_subscription_id = ${subscription.id},
        stripe_price_id = ${priceId ?? null},
        stripe_current_period_end = to_timestamp(${subscription.current_period_end}),
        text_quota = ${q.text_quota},
        image_quota = ${q.image_quota},
        pdf_quota = ${q.pdf_quota},
        speech_quota = ${q.speech_quota},
        video_quota = ${q.video_quota}
      WHERE id = ${userId}
    `
    return
  }

  // Not paid: strip subscription fields and reset to free-tier monthly allowance.
  // Setting quota_reset_at to the first of this month so the free-tier reset
  // logic in checkAndRecordUsage recognizes the current window.
  const now = new Date()
  const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  await sql`
    UPDATE auth_users
    SET
      stripe_subscription_id = NULL,
      stripe_price_id = NULL,
      stripe_current_period_end = NULL,
      text_quota = ${FREE_QUOTA.text_quota},
      image_quota = ${FREE_QUOTA.image_quota},
      pdf_quota = ${FREE_QUOTA.pdf_quota},
      speech_quota = ${FREE_QUOTA.speech_quota},
      video_quota = ${FREE_QUOTA.video_quota},
      quota_reset_at = ${firstDayOfMonth}
    WHERE id = ${userId}
  `
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return new NextResponse('Webhook not configured', { status: 500 })
  }

  if (!stripe) {
    console.error('Stripe is not configured')
    return new NextResponse('Stripe is not configured', { status: 500 })
  }

  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set')
    return new NextResponse('Database not configured', { status: 500 })
  }

  const body = await req.text()
  const headerList = await headers()
  const signature = headerList.get('stripe-signature')
  if (!signature) {
    return new NextResponse('Missing stripe-signature header', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[webhook] signature verification failed:', msg)
    return new NextResponse(`Webhook Error: ${msg}`, { status: 400 })
  }

  const sql = neon(databaseUrl)

  // Idempotency: claim the event by id. Stripe retries the same event on
  // transient failures, so we must only apply side effects once.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS stripe_events (
        id VARCHAR(255) PRIMARY KEY,
        event_type VARCHAR(100),
        processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `
    const claim = (await sql`
      INSERT INTO stripe_events (id, event_type) VALUES (${event.id}, ${event.type})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `) as { id: string }[]
    if (claim.length === 0) {
      // Duplicate – already handled on a previous delivery.
      return new NextResponse(null, { status: 200 })
    }
  } catch (err) {
    console.error('[webhook] idempotency claim failed:', err instanceof Error ? err.message : err)
    // Fail closed – Stripe will retry.
    return new NextResponse('Idempotency store unavailable', { status: 500 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const userId = parseUserId(subscription.metadata?.userId)
        if (!userId) {
          console.warn('[webhook] invalid userId metadata on', event.type, subscription.id)
          break
        }
        await applySubscriptionState(sql, userId, subscription)
        break
      }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subId = invoiceSubscriptionId(invoice)

        // Non-subscription invoices (one-off charges) have no subscription to sync.
        // Still record the payment history when we can resolve the user, then bail.
        if (!subId) {
          console.info('[webhook]', event.type, 'ignored: no subscription on invoice', invoice.id)
          break
        }

        const subscription = await stripe.subscriptions.retrieve(subId)
        const userId = parseUserId(subscription.metadata?.userId)
        if (!userId) {
          console.warn('[webhook] invalid userId metadata on', event.type, invoice.id)
          break
        }

        // Sync quota state to the current Stripe status before anything else.
        // On payment_failed the subscription typically flips to past_due – this
        // is the event that actually strips the user of paid quota. Relying on
        // customer.subscription.updated alone leaves a window where a failed
        // renewal still has the paid quota attached.
        await applySubscriptionState(sql, userId, subscription)

        // Log payment outcome for the user's history. Use ON CONFLICT to stay
        // idempotent in case Stripe redelivers the invoice event.
        const status = event.type === 'invoice.payment_succeeded' ? 'succeeded' : 'failed'
        const amount = event.type === 'invoice.payment_succeeded' ? invoice.amount_paid : invoice.amount_due
        await sql`
          INSERT INTO payment_history (user_id, stripe_invoice_id, amount, status, payment_date)
          VALUES (${userId}, ${invoice.id}, ${amount}, ${status}, to_timestamp(${invoice.created}))
          ON CONFLICT (stripe_invoice_id) DO NOTHING
        `
        break
      }
    }

    return new NextResponse(null, { status: 200 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[webhook] handler failed:', msg)
    // Release the idempotency claim so Stripe can retry successfully.
    try {
      await sql`DELETE FROM stripe_events WHERE id = ${event.id}`
    } catch {}
    return new NextResponse('Webhook handler failed', { status: 500 })
  }
}
