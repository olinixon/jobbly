import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CLIENT')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { batchId } = await params
  const userRole = session.user.role
  const campaignId = session.user.campaignId

  // Fetch the batch with all leads
  const batch = await prisma.reconciliationBatch.findUnique({
    where: { id: batchId },
    include: {
      leads: {
        select: {
          quoteNumber: true,
          customerName: true,
          omnisideCommission: true,
          grossMarkup: true,
        },
        orderBy: { jobCompletedAt: 'asc' },
      },
    },
  })

  if (!batch) {
    return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  }

  // Ensure the batch belongs to the user's campaign
  if (campaignId && batch.campaignId !== campaignId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Check if already sent (role-aware)
  const alreadySentId = userRole === 'ADMIN' ? batch.stripe_invoice_id : batch.client_stripe_invoice_id
  const alreadySentAt = userRole === 'ADMIN' ? batch.invoice_sent_at : batch.client_invoice_sent_at

  if (alreadySentId) {
    return NextResponse.json(
      { error: 'An invoice has already been sent for this batch.' },
      { status: 409 }
    )
  }

  // Fetch billing profile for this user's role
  const effectiveCampaignId = campaignId ?? batch.campaignId
  const billingProfile = await prisma.billingProfile.findUnique({
    where: { campaign_id_role: { campaign_id: effectiveCampaignId, role: userRole } },
    select: {
      company_name: true,
      billing_email: true,
      billing_address: true,
      stripe_verified: true,
    },
  })

  if (!billingProfile || !billingProfile.stripe_verified) {
    return NextResponse.json(
      { error: 'Stripe not connected. Complete Stripe setup in Settings before sending invoices.' },
      { status: 403 }
    )
  }

  // Build line items using the correct cut amount per role
  const lineItems = batch.leads.map(lead => ({
    quote_number: lead.quoteNumber,
    customer_name: lead.customerName,
    amount_ex_gst: userRole === 'ADMIN'
      ? (lead.omnisideCommission ?? 0)
      : (lead.grossMarkup ?? 0),
  }))

  const subtotalExGst = lineItems.reduce((s, l) => s + l.amount_ex_gst, 0)
  const gstAmount = subtotalExGst * 0.15
  const totalInclGst = subtotalExGst + gstAmount

  return NextResponse.json({
    batch_id: batch.id,
    period_label: batch.label,
    recipient: {
      company_name: billingProfile.company_name,
      billing_email: billingProfile.billing_email,
      billing_address: billingProfile.billing_address,
    },
    line_items: lineItems,
    subtotal_ex_gst: subtotalExGst,
    gst_amount: gstAmount,
    total_incl_gst: totalInclGst,
    already_sent: !!alreadySentId,
    invoice_sent_at: alreadySentAt?.toISOString() ?? null,
  })
}
