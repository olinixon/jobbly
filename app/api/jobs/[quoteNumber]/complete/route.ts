import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { analyzeInvoice } from '@/lib/analyzeInvoice'
import { sendCustomerPortalEmail, sendMissingCustomerEmailAlert } from '@/lib/notifications'

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

  // ── Step 5: Send customer email (fire-and-forget) ─────────────────────────
  const clientCompanyName = lead.campaign.clientCompanyName ?? 'Continuous Group'
  ;(async () => {
    if (lead.customerEmail) {
      try {
        await sendCustomerPortalEmail({
          to: lead.customerEmail,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
          portalUrl,
          clientCompanyName,
        })
        await prisma.lead.update({
          where: { id: lead.id },
          data: { customerEmailSentAt: new Date() },
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
