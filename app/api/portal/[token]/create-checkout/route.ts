import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStripeClient } from '@/lib/stripeClient'
import { createCustomerPaymentCheckout } from '@/lib/stripe/createCustomerPaymentCheckout'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Parse and validate paymentMethod from request body
  let paymentMethod: 'card' | 'bank_transfer' = 'card'
  try {
    const body = await request.json().catch(() => ({}))
    if (body.paymentMethod === 'bank_transfer') {
      paymentMethod = 'bank_transfer'
    } else if (body.paymentMethod && body.paymentMethod !== 'card') {
      return NextResponse.json({ error: 'Invalid paymentMethod' }, { status: 400 })
    }
  } catch {
    // empty body — default to 'card'
  }

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
      stripe_customer_payment_url: true,
      myob_invoice_url: true,
      myob_invoice_created_at: true,
      jobCompletedAt: true,
      campaignId: true,
    },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Guard 1: MYOB path — return invoice URL directly, no Stripe session ──────
  if (lead.myob_invoice_url) {
    return NextResponse.json({ myobInvoiceUrl: lead.myob_invoice_url })
  }

  const amountInclGst = lead.invoiceTotalGstInclusive ??
    (lead.customerPrice != null ? lead.customerPrice * 1.15 : 0)

  // ── New Stripe path (CustomerPaymentProfile) ─────────────────────────────────
  const paymentProfile = await prisma.customerPaymentProfile.findFirst({
    where: { campaign_id: lead.campaignId, is_active: true, verified: true },
  })

  if (paymentProfile?.stripe_secret_key) {
    try {
      const result = await createCustomerPaymentCheckout({
        campaignId: lead.campaignId,
        quoteNumber: lead.quoteNumber,
        propertyAddress: lead.propertyAddress,
        customerEmail: lead.customerEmail ?? '',
        amountInclGst,
        portalToken: token,
        paymentMethod,
      })
      await prisma.lead.update({
        where: { customerPortalToken: token },
        data: {
          stripe_customer_payment_url: result.checkoutUrl,
          customer_payment_method: paymentMethod,
        },
      })
      return NextResponse.json({ checkoutUrl: result.checkoutUrl })
    } catch (error) {
      console.error('[Portal] Stripe session creation failed:', error)
      return NextResponse.json({ checkoutUrl: null })
    }
  }

  // ── Legacy path: Stripe Checkout via CLIENT BillingProfile ───────────────────
  // Everything below this line is unchanged from the original implementation.

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
    console.error('[create-checkout] EARLY RETURN — no billing profile or not verified:', {
      found: !!billingProfile,
      stripe_verified: billingProfile?.stripe_verified ?? null,
      campaign_id: lead.campaignId,
    })
    return NextResponse.json({ checkoutUrl: null })
  }

  let stripe: ReturnType<typeof getStripeClient>
  try {
    stripe = getStripeClient(billingProfile.stripe_secret_key)
  } catch (err) {
    console.error('[create-checkout] getStripeClient/decrypt FAILED:', err)
    return NextResponse.json({ checkoutUrl: null })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  console.error('[create-checkout] appUrl:', appUrl)

  // Determine amount in cents (GST-inclusive — confirmed by Oli)
  // Use AI-extracted total if available; fall back to customerPrice * 1.15
  const rawAmount = lead.invoiceTotalGstInclusive ?? (lead.customerPrice != null ? lead.customerPrice * 1.15 : null)
  if (!rawAmount || rawAmount <= 0) {
    console.error('[create-checkout] EARLY RETURN — no valid amount:', { invoiceTotalGstInclusive: lead.invoiceTotalGstInclusive, customerPrice: lead.customerPrice, rawAmount })
    return NextResponse.json({ checkoutUrl: null })
  }
  const unitAmount = Math.round(rawAmount * 100)
  console.error('[create-checkout] unitAmount (cents):', unitAmount)

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
    } catch (err) {
      console.error('[create-checkout] existing session retrieval failed (will create new):', err)
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { stripeCheckoutUrl: null } })
  }

  // Create new Stripe Checkout Session
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>
  try {
    session = await stripe.checkout.sessions.create({
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
      client_reference_id: token,
      success_url: `${appUrl}/portal/${token}?paid=true`,
      cancel_url: `${appUrl}/portal/${token}`,
      customer_email: lead.customerEmail ?? undefined,
    })
  } catch (err) {
    console.error('[create-checkout] stripe.checkout.sessions.create FAILED:', err)
    return NextResponse.json({ checkoutUrl: null })
  }

  const checkoutUrl = session.url!
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      stripeCheckoutUrl: checkoutUrl,
      customer_payment_method: paymentMethod,
    },
  })

  return NextResponse.json({ checkoutUrl })
}
