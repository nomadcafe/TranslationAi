import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { neon } from '@neondatabase/serverless'

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return new NextResponse('Webhook not configured', { status: 500 })
  }

  if (!stripe) {
    console.error('Stripe 未配置')
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
  } catch (err: any) {
    console.error('Webhook 签名验证失败:', err)
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const sql = neon(databaseUrl)

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const userId = subscription.metadata.userId
        const priceId = subscription.items.data[0].price.id

        if (process.env.NODE_ENV === 'development') {
          console.info('[stripe webhook]', event.type, event.id)
        }

        // Map Stripe price -> plan quotas.
        const quotaUpdate = priceId === process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID ? {
          text_quota: -1,
          image_quota: 50,
          pdf_quota: 40,
          speech_quota: 30,
          video_quota: 10
        } : priceId === process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID ? {
          text_quota: -1,
          image_quota: 100,
          pdf_quota: 80,
          speech_quota: 60,
          video_quota: 20
        } : {
          text_quota: -1,
          image_quota: 5,
          pdf_quota: 3,
          speech_quota: 2,
          video_quota: 1
        }

        console.log('执行数据库更新:', {
          customerId: subscription.customer,
          subscriptionId: subscription.id,
          priceId: subscription.items.data[0].price.id,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          quotaUpdate
        })

        // Persist subscription + quota fields.
        const updateResult = await sql`
          UPDATE auth_users 
          SET 
            stripe_customer_id = ${subscription.customer},
            stripe_subscription_id = ${subscription.id},
            stripe_price_id = ${subscription.items.data[0].price.id},
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
        const userId = subscription.metadata.userId
        const now = new Date()
        const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        // Downgrade to free tier (monthly quota).
        await sql`
          UPDATE auth_users 
          SET stripe_subscription_id = NULL, stripe_price_id = NULL, stripe_current_period_end = NULL,
              text_quota = -1, image_quota = 5, pdf_quota = 3, speech_quota = 2, video_quota = 1,
              quota_reset_at = ${firstDayOfMonth}
          WHERE id = ${userId}
        `
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const userId = subscription.metadata.userId

        // Sync invoice payment outcome.
        await sql`
          INSERT INTO payment_history (
            user_id,
            stripe_invoice_id,
            amount,
            status,
            payment_date
          ) VALUES (
            ${userId},
            ${invoice.id},
            ${invoice.amount_paid},
            'succeeded',
            to_timestamp(${invoice.created})
          )
        `
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const userId = subscription.metadata.userId

        // Log failed payment for support/audit.
        await sql`
          INSERT INTO payment_history (
            user_id,
            stripe_invoice_id,
            amount,
            status,
            payment_date
          ) VALUES (
            ${userId},
            ${invoice.id},
            ${invoice.amount_due},
            'failed',
            to_timestamp(${invoice.created})
          )
        `

        // Optional: notify the user (email, in-app, etc.).
        break
      }
    }

    return new NextResponse(null, { status: 200 })
  } catch (error: any) {
    console.error('Webhook handler failed:', error)
    return new NextResponse('Webhook handler failed', { status: 500 })
  }
} 