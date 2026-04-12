// Stripe webhook handler — receives payment events from Stripe
//
// Setup (per client):
//   1. In Stripe Dashboard → Developers → Webhooks → Add endpoint
//   2. Endpoint URL: https://[your-domain]/api/webhooks/stripe
//   3. Select event: checkout.session.completed
//   4. Copy the Signing Secret (whsec_...) into STRIPE_WEBHOOK_SECRET env var
//      (or save it via the Webhook Setup section in Client Settings)
//
// This endpoint is public — verified by Stripe signature only.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 })
  }

  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const body = await request.text()

  // constructEvent is a local HMAC operation — no API key needed, webhookSecret used as Stripe instance key
  const stripe = new Stripe(webhookSecret)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
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
