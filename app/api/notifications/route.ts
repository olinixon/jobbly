import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

// Notifications are derived from recent audit log entries and new leads
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUBCONTRACTOR')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaignId = session.user.campaignId

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (session.user.role !== 'ADMIN') where.is_test = false

  const [newLeads, completions] = await Promise.all([
    prisma.lead.findMany({
      where: { ...where, status: 'LEAD_RECEIVED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.lead.findMany({
      where: { ...where, status: 'JOB_COMPLETED', invoiceUrl: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ])

  type SimpleLead = { id: string; quoteNumber: string; customerName: string; createdAt: Date; updatedAt: Date }
  const notifications = [
    ...newLeads.map((l: SimpleLead) => ({
      id: `lead-${l.id}`,
      type: 'NEW_LEAD',
      quoteNumber: l.quoteNumber,
      customerName: l.customerName,
      timestamp: l.createdAt,
    })),
    ...completions.map((l: SimpleLead) => ({
      id: `complete-${l.id}`,
      type: 'JOB_COMPLETED',
      quoteNumber: l.quoteNumber,
      customerName: l.customerName,
      timestamp: l.updatedAt,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json(notifications)
}
