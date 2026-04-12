import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getStripeClient } from '@/lib/stripeClient'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CLIENT')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { batch_id, flow } = await request.json()

  if (!batch_id || !flow) {
    return NextResponse.json({ error: 'batch_id and flow are required.' }, { status: 400 })
  }

  // Confirm role matches flow
  const userRole = session.user.role
  if (
    (userRole === 'ADMIN' && flow !== 'admin_to_client') ||
    (userRole === 'CLIENT' && flow !== 'client_to_subcontractor')
  ) {
    return NextResponse.json({ error: 'Flow does not match your role.' }, { status: 403 })
  }

  const campaignId = session.user.campaignId

  // Fetch the batch with leads
  const batch = await prisma.reconciliationBatch.findUnique({
    where: { id: batch_id },
    include: {
      leads: {
        select: {
          quoteNumber: true,
          customerName: true,
          omnisideCommission: true,
          grossMarkup: true,
        },
      },
    },
  })

  if (!batch) {
    return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  }

  if (campaignId && batch.campaignId !== campaignId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Check if already sent (role-aware)
  const alreadySentId = userRole === 'ADMIN' ? batch.stripe_invoice_id : batch.client_stripe_invoice_id
  if (alreadySentId) {
    return NextResponse.json(
      { error: 'An invoice has already been sent for this batch.' },
      { status: 409 }
    )
  }

  // Fetch billing profile
  const effectiveCampaignId = campaignId ?? batch.campaignId
  const billingProfile = await prisma.billingProfile.findUnique({
    where: { campaign_id_role: { campaign_id: effectiveCampaignId, role: userRole } },
  })

  if (!billingProfile || !billingProfile.stripe_verified) {
    return NextResponse.json({ error: 'Stripe not connected.' }, { status: 403 })
  }

  if (!billingProfile.stripe_customer_id) {
    return NextResponse.json({ error: 'Stripe invoicing is not fully configured for this account.' }, { status: 403 })
  }

  const stripeCustomerId = billingProfile.stripe_customer_id

  // Build invoice via Stripe — entire sequence wrapped in try/catch
  try {
    const stripe = getStripeClient(billingProfile.stripe_secret_key)

    // Create the invoice (do not auto-advance — we control when it sends)
    const invoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      auto_advance: false,
      collection_method: 'send_invoice',
      days_until_due: 14,
    })

    // Calculate totals across all leads
    const subtotalExGst = batch.leads.reduce((sum, lead) => {
      const cut = userRole === 'ADMIN' ? (lead.omnisideCommission ?? 0) : (lead.grossMarkup ?? 0)
      return sum + cut
    }, 0)
    const gstAmount = Math.round(subtotalExGst * 0.15 * 100) / 100

    // Two summary line items: subtotal ex GST + GST 15%
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: `Commission — ${batch.label} (ex GST)`,
      amount: Math.round(subtotalExGst * 100),
      currency: 'nzd',
    })

    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: 'GST (15%)',
      amount: Math.round(gstAmount * 100),
      currency: 'nzd',
    })

    // Finalise then send
    await stripe.invoices.finalizeInvoice(invoice.id)
    const sentInvoice = await stripe.invoices.sendInvoice(invoice.id)

    // Only write to DB after all Stripe calls succeed
    if (userRole === 'ADMIN') {
      await prisma.reconciliationBatch.update({
        where: { id: batch_id },
        data: {
          stripe_invoice_id: sentInvoice.id,
          invoice_sent_at: new Date(),
          invoice_sent_by: session.user.id,
        },
      })
    } else {
      await prisma.reconciliationBatch.update({
        where: { id: batch_id },
        data: {
          client_stripe_invoice_id: sentInvoice.id,
          client_invoice_sent_at: new Date(),
          client_invoice_sent_by: session.user.id,
        },
      })
    }

    return NextResponse.json({
      success: true,
      stripe_invoice_id: sentInvoice.id,
      stripe_invoice_url: sentInvoice.hosted_invoice_url ?? null,
      invoice_sent_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[invoices/send] Stripe error:', err)
    return NextResponse.json(
      { error: 'Invoice sending failed. The invoice was not sent — please try again.' },
      { status: 500 }
    )
  }
}
