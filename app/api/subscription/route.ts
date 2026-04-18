import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { stripe, PLANS } from '@/lib/stripe'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { getSiteUrl } from '@/lib/site'
import { parseJson } from '@/lib/server/validate'
import { SubscriptionBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

export const POST = withAuth(async (req, auth) => {
  const locale = getRequestLocale(req)
  try {
    const parsed = await parseJson(req, SubscriptionBody, locale, {
      errorKey: 'subscriptionPriceRequired',
      errorField: 'message',
    })
    if (!parsed.ok) return parsed.response
    const { priceId } = parsed.data

    if (!stripe) {
      return NextResponse.json({ message: apiMsg(locale, 'stripeNotConfigured') }, { status: 500 })
    }

    const paidPlans = [PLANS.monthly, PLANS.yearly]
    const plan = paidPlans.find(p => p.priceId === priceId)
    if (!plan) {
      return NextResponse.json({ message: apiMsg(locale, 'subscriptionInvalidPrice') }, { status: 400 })
    }

    // Reuse an existing Stripe customer instead of creating a duplicate on every checkout.
    const databaseUrl = process.env.DATABASE_URL?.trim()
    if (!databaseUrl) {
      return NextResponse.json({ message: apiMsg(locale, 'serviceNotConfigured') }, { status: 500 })
    }
    const sql = neon(databaseUrl)
    const rows = (await sql`
      SELECT stripe_customer_id FROM auth_users WHERE id = ${auth.userId}
    `) as { stripe_customer_id: string | null }[]

    if (rows.length === 0) {
      return NextResponse.json({ message: apiMsg(locale, 'userNotFound') }, { status: 404 })
    }

    let customerId = rows[0].stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.email,
        metadata: { userId: String(auth.userId) },
      })
      customerId = customer.id
      await sql`UPDATE auth_users SET stripe_customer_id = ${customerId} WHERE id = ${auth.userId}`
    }

    const origin = getSiteUrl()

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/profile?subscription=success`,
      cancel_url: `${origin}/pricing?canceled=true`,
      subscription_data: {
        // Use the authoritative DB id so the webhook can resolve back to the right user.
        metadata: { userId: String(auth.userId) },
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Subscription error:', error)
    return NextResponse.json({ message: apiMsg(locale, 'subscriptionInternalError') }, { status: 500 })
  }
}, { errorField: 'message' })
