import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { sendJobCompletedEmail } from '@/lib/notifications'

const STATUS_ORDER = ['LEAD_RECEIVED', 'QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED']

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

  // Scope check
  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  // Handle status update
  if (body.status) {
    const currentIdx = STATUS_ORDER.indexOf(lead.status)
    const newIdx = STATUS_ORDER.indexOf(body.status)

    if (newIdx <= currentIdx) {
      return NextResponse.json(
        { error: 'Status can only move forward' },
        { status: 400 }
      )
    }

    if (body.status === 'JOB_COMPLETED' && !lead.invoiceUrl) {
      return NextResponse.json(
        { error: 'Attach an invoice before marking this job complete' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          changedByUserId: session.user.id,
          changedByName: session.user.name,
          oldStatus: lead.status,
          newStatus: body.status,
        },
      })
      await tx.lead.update({
        where: { id: lead.id },
        data: { status: body.status },
      })
    })

    if (body.status === 'JOB_COMPLETED') {
      sendJobCompletedEmail({
        quoteNumber,
        customerName: lead.customerName,
        propertyAddress: lead.propertyAddress,
        contractorRate: lead.contractorRate,
        customerPrice: lead.customerPrice,
        omnisideCommission: lead.omnisideCommission,
      }).catch(console.error)
    }
  }

  // Handle notes update (admin only)
  if (body.notes !== undefined && session.user.role === 'ADMIN') {
    await prisma.lead.update({ where: { id: lead.id }, data: { notes: body.notes } })
  }

  // Handle commission reconciliation (admin only)
  if (body.commissionReconciled !== undefined && session.user.role === 'ADMIN') {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        commissionReconciled: body.commissionReconciled,
        commissionReconciledAt: body.commissionReconciled ? new Date() : null,
      },
    })
  }

  const updated = await prisma.lead.findUnique({ where: { quoteNumber } })
  return NextResponse.json(updated)
}
