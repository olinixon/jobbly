import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { quoteNumber } = await params
  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  await prisma.lead.update({
    where: { quoteNumber },
    data: { duplicate_dismissed: true },
  })

  await prisma.auditLog.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campaignId,
      changedByUserId: session.user.id,
      changedByName: `${session.user.name} — Duplicate warning dismissed`,
      oldStatus: lead.status,
      newStatus: lead.status,
    },
  })

  return NextResponse.json({ success: true })
}
