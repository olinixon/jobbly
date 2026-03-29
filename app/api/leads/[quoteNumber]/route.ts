import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { sendJobCompletedEmail } from '@/lib/notifications'

const STATUS_ORDER = ['LEAD_RECEIVED', 'QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED'] as const
type LeadStatus = typeof STATUS_ORDER[number]

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quoteNumber } = await params
  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: {
      auditLogs: { orderBy: { createdAt: 'asc' } },
      attachments: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Strip sensitive fields for subcontractor role
  if (session.user.role === 'SUBCONTRACTOR') {
    const { customerPhone: _p, customerEmail: _e, ...safeFields } = lead
    return NextResponse.json(safeFields)
  }

  return NextResponse.json(lead)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quoteNumber } = await params
  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()

  // Handle status REVERT (one step back, all roles)
  if (body.revert === true) {
    const currentIdx = STATUS_ORDER.indexOf(lead.status)
    if (currentIdx <= 0) {
      return NextResponse.json({ error: 'Cannot revert further.' }, { status: 400 })
    }
    if (lead.reconciliationBatchId) {
      return NextResponse.json(
        { error: 'This job has been reconciled. Unreconcile it first before reverting the status.' },
        { status: 400 }
      )
    }

    const previousStatus = STATUS_ORDER[currentIdx - 1]
    const clearData: Record<string, unknown> = { status: previousStatus }

    if (lead.status === 'JOB_BOOKED') clearData.jobBookedDate = null
    if (lead.status === 'JOB_COMPLETED') {
      clearData.jobCompletedAt = null
      clearData.invoiceUrl = null
      clearData.invoiceUploadedAt = null
      clearData.invoiceUploadedById = null
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          changedByUserId: session.user.id,
          changedByName: session.user.name,
          oldStatus: lead.status,
          newStatus: previousStatus,
        },
      })
      await tx.lead.update({ where: { id: lead.id }, data: clearData })
    })

    const updated = await prisma.lead.findUnique({ where: { quoteNumber } })
    return NextResponse.json(updated)
  }

  // Handle status update (forward only)
  if (body.status) {
    const currentIdx = STATUS_ORDER.indexOf(lead.status)
    const newIdx = STATUS_ORDER.indexOf(body.status)

    if (newIdx <= currentIdx) {
      return NextResponse.json({ error: 'Status can only move forward' }, { status: 400 })
    }

    if (body.status === 'JOB_COMPLETED' && !lead.invoiceUrl) {
      return NextResponse.json(
        { error: 'Attach an invoice before marking this job complete' },
        { status: 400 }
      )
    }

    if (body.status === 'JOB_BOOKED' && !body.jobBookedDate) {
      return NextResponse.json(
        { error: 'A job booked date is required.' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = { status: body.status }
    if (body.status === 'JOB_BOOKED' && body.jobBookedDate) {
      updateData.jobBookedDate = new Date(body.jobBookedDate)
    }
    if (body.status === 'JOB_COMPLETED') {
      updateData.jobCompletedAt = new Date()
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          changedByUserId: session.user.id,
          changedByName: session.user.name,
          oldStatus: lead.status,
          newStatus: body.status as LeadStatus,
        },
      })
      await tx.lead.update({
        where: { id: lead.id },
        data: updateData,
      })
    })

    if (body.status === 'JOB_COMPLETED') {
      ;(async () => {
        try {
          const admins = await prisma.user.findMany({
            where: { campaignId: lead.campaignId, role: 'ADMIN', isActive: true, notifyJobCompleted: true },
            select: { email: true },
          })
          if (admins.length > 0) {
            await sendJobCompletedEmail({
              to: admins.map(a => a.email),
              quoteNumber,
              customerName: lead.customerName,
              propertyAddress: lead.propertyAddress,
              contractorRate: lead.contractorRate,
              customerPrice: lead.customerPrice,
              omnisideCommission: lead.omnisideCommission,
            })
          }
        } catch (err) {
          console.error('Job completed email failed:', err)
        }
      })()
    }
  }

  // Handle internal_notes update (admin only)
  if (body.internal_notes !== undefined && session.user.role === 'ADMIN') {
    await prisma.lead.update({ where: { id: lead.id }, data: { internal_notes: body.internal_notes } })
  }

  const updated = await prisma.lead.findUnique({ where: { quoteNumber } })
  return NextResponse.json(updated)
}
