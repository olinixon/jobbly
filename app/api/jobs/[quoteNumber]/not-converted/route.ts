import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { sendLeadNotConvertedAlert } from '@/lib/notifications'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session || !['ADMIN', 'SUBCONTRACTOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { quoteNumber } = await params
  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (lead.campaignId !== session.user.campaignId && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'LEAD_RECEIVED') {
    return NextResponse.json(
      { error: 'This lead is not in the correct status to be marked as not converted.' },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { reason } = body as { reason?: string }
  const trimmedReason = reason?.trim().slice(0, 200) || null

  const [updatedLead] = await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: 'NOT_CONVERTED',
        not_converted_reason: trimmedReason,
      },
    }),
    prisma.auditLog.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        changedByUserId: session.user.id,
        changedByName: session.user.name ?? session.user.role,
        oldStatus: lead.status,
        newStatus: 'NOT_CONVERTED',
      },
    }),
  ])

  // Fire-and-forget notification to Oli
  ;(async () => {
    try {
      await sendLeadNotConvertedAlert({
        quoteNumber: lead.quoteNumber,
        customerName: lead.customerName,
        propertyAddress: lead.propertyAddress,
        markedByName: session.user.name ?? 'Unknown',
        markedByRole: session.user.role,
        reason: trimmedReason,
      })
    } catch (err) {
      console.error('[not-converted] Notification failed:', err)
    }
  })()

  return NextResponse.json(updatedLead)
}
