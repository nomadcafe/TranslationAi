import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
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

    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: {
        userId: session.user.id
      }
    })

    const origin = getSiteUrl()

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.id,
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
