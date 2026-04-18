import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { neon } from '@neondatabase/serverless'
import { MONTHLY_QUOTA, YEARLY_QUOTA, FREE_QUOTA } from '@/lib/quota-plans'

/** Parse Stripe metadata userId as a positive integer. Returns null when invalid. */
function parseUserId(raw: unknown): number | null {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  return Number.isFinite(n) && n > 0 ? n : null
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
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const userId = parseUserId(subscription.metadata?.userId)
        if (!userId) {
          console.warn('[webhook] invalid userId metadata on', event.type, subscription.id)
          break
        }

        const priceId = subscription.items.data[0].price.id
        const quotaUpdate =
          priceId === process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
            ? MONTHLY_QUOTA
            : priceId === process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID
            ? YEARLY_QUOTA
            : FREE_QUOTA

        await sql`
          UPDATE auth_users
          SET
            stripe_customer_id = ${subscription.customer},
            stripe_subscription_id = ${subscription.id},
            stripe_price_id = ${priceId},
            stripe_current_period_end = to_timestamp(${subscription.current_period_end}),
            text_quota = ${quotaUpdate.text_quota},
            image_quota = ${quotaUpdate.image_quota},
            pdf_quota = ${quotaUpdate.pdf_quota},
            speech_quota = ${quotaUpdate.speech_quota},
            video_quota = ${quotaUpdate.video_quota}
          WHERE id = ${userId}
        `
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const userId = parseUserId(subscription.metadata?.userId)
        if (!userId) {
          console.warn('[webhook] invalid userId metadata on deleted', subscription.id)
          break
        }

        const now = new Date()
        const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        await sql`
          UPDATE auth_users
          SET stripe_subscription_id = NULL, stripe_price_id = NULL, stripe_current_period_end = NULL,
              text_quota = ${FREE_QUOTA.text_quota}, image_quota = ${FREE_QUOTA.image_quota},
              pdf_quota = ${FREE_QUOTA.pdf_quota}, speech_quota = ${FREE_QUOTA.speech_quota},
              video_quota = ${FREE_QUOTA.video_quota}, quota_reset_at = ${firstDayOfMonth}
          WHERE id = ${userId}
        `
        break
      }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const userId = parseUserId(subscription.metadata?.userId)
        if (!userId) {
          console.warn('[webhook] invalid userId metadata on', event.type, invoice.id)
          break
        }

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
