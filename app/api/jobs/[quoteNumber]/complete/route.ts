import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { analyzeInvoice } from '@/lib/analyzeInvoice'
import { buildCustomerNotificationEmail } from '@/lib/buildCustomerNotificationEmail'
import { sendMissingCustomerEmailAlert } from '@/lib/notifications'
import { createMyobInvoice } from '@/lib/myob/createMyobInvoice'
import { createCustomerPaymentCheckout } from '@/lib/stripe/createCustomerPaymentCheckout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'SUBCONTRACTOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { quoteNumber } = await params

  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: { campaign: { select: { id: true, clientCompanyName: true } } },
  })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'JOB_BOOKED') {
    return NextResponse.json({ error: 'This job is not in the correct status to be completed.' }, { status: 400 })
  }
  if (!lead.invoiceUrl) {
    return NextResponse.json({ error: 'Please attach an invoice before submitting.' }, { status: 400 })
  }
  if (!lead.jobReportUrl) {
    return NextResponse.json({ error: 'Please attach a job report before submitting.' }, { status: 400 })
  }

  // ── Step 1: AI invoice analysis ──────────────────────────────────────────────
  let gstInclusiveTotal: number | null = null
  let aiConcern: string | null = null

  try {
    const invoiceRes = await fetch(lead.invoiceUrl)
    if (!invoiceRes.ok) throw new Error(`Failed to fetch invoice: ${invoiceRes.status}`)
    const invoiceBuffer = Buffer.from(await invoiceRes.arrayBuffer())
    const result = await analyzeInvoice(invoiceBuffer, lead.invoiceUrl)
    gstInclusiveTotal = result.gstInclusiveTotal
    aiConcern = result.concern
  } catch (err) {
    console.error('AI invoice analysis failed:', err)
    // Non-blocking — proceed without AI result
  }

  // ── Step 2: Generate portal token ─────────────────────────────────────────
  const customerPortalToken = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const portalUrl = `${appUrl}/portal/${customerPortalToken}`

  // ── Step 3: Build notes appendage ─────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' })
  let notesAppendage = ''
  if (aiConcern) {
    notesAppendage += `\n[AI Invoice Review — ${today}] ${aiConcern}`
  }

  // ── Step 4: Advance lead to JOB_COMPLETED ─────────────────────────────────
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: 'JOB_COMPLETED',
        jobCompletedAt: now,
        customerPortalToken,
        invoiceTotalGstInclusive: gstInclusiveTotal,
        ...(notesAppendage ? { notes: (lead.notes ?? '') + notesAppendage } : {}),
      },
    })
    await tx.auditLog.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        changedByUserId: session.user.id,
        changedByName: session.user.name,
        oldStatus: 'JOB_BOOKED',
        newStatus: 'JOB_COMPLETED',
      },
    })
  })

  // ── Step 5: Create payment record on connected platform ──────────────────
  const paymentProfile = await prisma.customerPaymentProfile.findUnique({
    where: { campaign_id: lead.campaignId },
  })

  let myobInvoiceId: string | null = null
  let myobInvoiceUrl: string | null = null
  let stripeCustomerPaymentUrl: string | null = null

  if (paymentProfile?.verified) {
    try {
      if (paymentProfile.provider === 'MYOB') {
        const result = await createMyobInvoice({
          campaignId: lead.campaignId,
          quoteNumber: lead.quoteNumber,
          customerName: lead.customerName,
          customerEmail: lead.customerEmail ?? '',
          propertyAddress: lead.propertyAddress,
          amountExGst: lead.customerPrice ?? 0, // customer_price is ex-GST (confirmed by Oli 2026-04-13)
        })
        myobInvoiceId = result.myobInvoiceId
        myobInvoiceUrl = result.myobInvoiceUrl

      } else if (paymentProfile.provider === 'STRIPE') {
        // customer_price is ex-GST — multiply by 1.15, or use AI-extracted total if available
        const amountInclGst = lead.invoiceTotalGstInclusive ?? (lead.customerPrice != null ? lead.customerPrice * 1.15 : 0)
        const result = await createCustomerPaymentCheckout({
          campaignId: lead.campaignId,
          quoteNumber: lead.quoteNumber,
          propertyAddress: lead.propertyAddress,
          customerEmail: lead.customerEmail ?? '',
          amountInclGst,
          portalToken: customerPortalToken,
        })
        stripeCustomerPaymentUrl = result.checkoutUrl
      }

    } catch (error) {
      // Log but do not throw — job completion must succeed regardless
      console.error(`[Payment] Failed for ${lead.quoteNumber}:`, error)

      // Append error to lead notes
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          notes: `${lead.notes ?? ''}\n[Payment Creation Error — ${new Date().toISOString()}] ${String(error)}`.trim(),
        },
      }).catch(() => {})

      // Alert Oli — homeowner will have no payment link
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: process.env.EMAIL_OLI!,
          subject: `Payment link failed — ${lead.quoteNumber} — ${lead.customerName}`,
          text: [
            'Hi Oli,',
            '',
            'A payment link could not be created for a completed job.',
            'The homeowner email was sent but the Pay Invoice button will not work.',
            '',
            `Quote:    ${lead.quoteNumber}`,
            `Customer: ${lead.customerName}`,
            `Address:  ${lead.propertyAddress}`,
            `Platform: ${paymentProfile.provider}`,
            `Error:    ${String(error)}`,
            '',
            'Portal link (share manually if needed):',
            `${appUrl}/portal/${customerPortalToken}`,
            '',
            'Please create the invoice manually and send the payment link to the customer.',
            '',
            'Jobbly by Omniside AI',
          ].join('\n'),
        })
      } catch (emailError) {
        console.error('[Payment] Failed to send Oli alert email:', emailError)
      }
    }
  } else {
    console.warn(`[Payment] No verified payment platform for campaign ${lead.campaignId}`)
  }

  // Save payment fields to lead — do NOT write to stripeCheckoutUrl (legacy field only)
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      myob_invoice_id: myobInvoiceId,
      myob_invoice_url: myobInvoiceUrl,
      myob_invoice_created_at: myobInvoiceId ? new Date() : null,
      stripe_customer_payment_url: stripeCustomerPaymentUrl,
    },
  })

  // ── Step 6: Send customer email (fire-and-forget) ─────────────────────────
  ;(async () => {
    if (lead.customerEmail) {
      try {
        const { subject, html, attachments, attachmentNotes } = await buildCustomerNotificationEmail(
          lead,
          lead.campaign,
          portalUrl
        )
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: lead.customerEmail,
          subject,
          html,
          attachments,
        })
        const finalNotes = (lead.notes ?? '') + notesAppendage + attachmentNotes
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            customerEmailSentAt: new Date(),
            ...(attachmentNotes ? { notes: finalNotes } : {}),
          },
        })
      } catch (err) {
        console.error('Customer portal email failed:', err)
        const errDate = new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' })
        await prisma.lead.update({
          where: { id: lead.id },
          data: { notes: { set: (lead.notes ?? '') + notesAppendage + `\n[Email Error — ${errDate}] Customer notification failed to send. Share the portal link manually: ${portalUrl}` } },
        }).catch(() => {})
      }
    } else {
      try {
        await sendMissingCustomerEmailAlert({
          quoteNumber: lead.quoteNumber,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
          portalUrl,
        })
      } catch (err) {
        console.error('Missing customer email alert failed:', err)
      }
    }
  })()

  return NextResponse.json({ success: true, hasCustomerEmail: !!lead.customerEmail })
}
