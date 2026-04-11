import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStripeClient } from '@/lib/stripeClient'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const lead = await prisma.lead.findUnique({
    where: { customerPortalToken: token },
    select: {
      id: true,
      quoteNumber: true,
      customerEmail: true,
      customerPrice: true,
      invoiceTotalGstInclusive: true,
      propertyAddress: true,
      stripeCheckoutUrl: true,
      campaignId: true,
    },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Look up CLIENT BillingProfile for this campaign
  const billingProfile = await prisma.billingProfile.findUnique({
    where: { campaign_id_role: { campaign_id: lead.campaignId, role: 'CLIENT' } },
  })

  if (process.env.NODE_ENV === 'development') {
    console.log('[create-checkout] BillingProfile lookup result:', {
      found: !!billingProfile,
      stripe_verified: billingProfile?.stripe_verified ?? null,
      campaign_id: lead.campaignId,
      role: 'CLIENT',
    })
  }

  if (!billingProfile || !billingProfile.stripe_verified) {
    return NextResponse.json({ checkoutUrl: null })
  }

  const stripe = getStripeClient(billingProfile.stripe_secret_key)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Determine amount in cents (GST-inclusive — confirmed by Oli)
  // Use AI-extracted total if available; fall back to customerPrice * 1.15
  const rawAmount = lead.invoiceTotalGstInclusive ?? (lead.customerPrice != null ? lead.customerPrice * 1.15 : null)
  if (!rawAmount || rawAmount <= 0) {
    return NextResponse.json({ checkoutUrl: null })
  }
  const unitAmount = Math.round(rawAmount * 100)

  // If a checkout URL exists, try to verify it is still valid
  if (lead.stripeCheckoutUrl) {
    try {
      // Extract session ID from stored URL — format: https://checkout.stripe.com/c/pay/cs_xxx#...
      const match = lead.stripeCheckoutUrl.match(/\/(cs_[^#?/]+)/)
      const sessionId = match?.[1]
      if (sessionId) {
        const existing = await stripe.checkout.sessions.retrieve(sessionId)
        if (existing.status === 'open') {
          return NextResponse.json({ checkoutUrl: lead.stripeCheckoutUrl })
        }
      }
    } catch {
      // Session retrieval failed — clear and create new
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { stripeCheckoutUrl: null } })
  }

  // Create new Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'nzd',
          product_data: {
            name: `Gutter Clean — ${lead.propertyAddress}`,
            description: `Invoice ref: ${lead.quoteNumber}`,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${appUrl}/portal/${token}?paid=true`,
    cancel_url: `${appUrl}/portal/${token}`,
    customer_email: lead.customerEmail ?? undefined,
  })

  const checkoutUrl = session.url!
  await prisma.lead.update({
    where: { id: lead.id },
    data: { stripeCheckoutUrl: checkoutUrl },
  })

  return NextResponse.json({ checkoutUrl })
}
