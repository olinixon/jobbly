// Stripe webhook handler — receives payment events from Stripe
//
// Dual-account verification: tries CustomerPaymentProfile webhook secrets first
// (new customer payment platform), then falls back to STRIPE_WEBHOOK_SECRET env var
// (legacy path used by original BillingProfile flow).
//
// This endpoint is public — verified by Stripe signature only.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const rawBody = await request.text()

  let event: Stripe.Event | null = null

  // ── Attempt 1: Try CustomerPaymentProfile Stripe webhook secrets (new path) ──
  const customerProfiles = await prisma.customerPaymentProfile.findMany({
    where: { provider: 'STRIPE', verified: true, stripe_webhook_secret: { not: null } },
    select: { stripe_webhook_secret: true },
  })

  for (const profile of customerProfiles) {
    try {
      const secret = decrypt(profile.stripe_webhook_secret!)
      // constructEvent is a local HMAC operation — no API key needed
      event = Stripe.webhooks.constructEvent(rawBody, sig, secret)
      break // verified
    } catch {
      // Try next secret
    }
  }

  // ── Attempt 2: Try STRIPE_WEBHOOK_SECRET env var (legacy path) ───────────────
  if (!event) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (webhookSecret) {
      try {
        const stripe = new Stripe(webhookSecret)
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      } catch (err) {
        console.error('[stripe-webhook] Legacy signature verification failed:', err)
      }
    } else {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured')
    }
  }

  if (!event) {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  // Ignore all events except checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const token = session.client_reference_id
  if (!token) {
    console.error('[stripe-webhook] checkout.session.completed missing client_reference_id')
    return NextResponse.json({ received: true })
  }

  const lead = await prisma.lead.findUnique({
    where: { customerPortalToken: token },
    select: { id: true, campaignId: true, status: true },
  })

  if (!lead) {
    console.error('[stripe-webhook] Lead not found for token:', token)
    return NextResponse.json({ received: true })
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      customer_paid_at: new Date(),
      stripe_payment_intent: paymentIntentId,
    },
  })

  // Write audit log — use first admin user for the campaign to satisfy FK constraint
  const adminUser = await prisma.user.findFirst({
    where: { campaignId: lead.campaignId, role: 'ADMIN' },
    select: { id: true },
  })

  if (adminUser) {
    await prisma.auditLog.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        changedByUserId: adminUser.id,
        changedByName: 'Stripe — payment received',
        oldStatus: lead.status,
        newStatus: lead.status,
      },
    })
  }

  console.log('[stripe-webhook] Payment recorded for token:', token)
  return NextResponse.json({ received: true })
}
