import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { stripe, PLANS } from '@/lib/stripe'
import { authOptions } from '../auth/[...nextauth]/auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { getSiteUrl } from '@/lib/site'

export async function POST(req: Request) {
  const locale = getRequestLocale(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ message: apiMsg(locale, 'subscriptionUnauthorized') }, { status: 401 })
    }

    const { priceId } = await req.json()
    if (!priceId) {
      return NextResponse.json({ message: apiMsg(locale, 'subscriptionPriceRequired') }, { status: 400 })
    }

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
      SELECT id, stripe_customer_id FROM auth_users WHERE email = ${session.user.email}
    `) as { id: number; stripe_customer_id: string | null }[]

    if (rows.length === 0) {
      return NextResponse.json({ message: apiMsg(locale, 'userNotFound') }, { status: 404 })
    }

    const dbUser = rows[0]
    let customerId = dbUser.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: { userId: String(dbUser.id) },
      })
      customerId = customer.id
      await sql`UPDATE auth_users SET stripe_customer_id = ${customerId} WHERE id = ${dbUser.id}`
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
        metadata: {
          userId: session.user.id,
        },
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Subscription error:', error)
    return NextResponse.json({ message: apiMsg(locale, 'subscriptionInternalError') }, { status: 500 })
  }
}
