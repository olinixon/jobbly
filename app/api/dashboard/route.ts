import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const campaignId = session.user.role === 'ADMIN'
    ? (url.searchParams.get('campaignId') ?? session.user.campaignId)
    : session.user.campaignId

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (session.user.role !== 'ADMIN') where.is_test = false

  const [total, quoteSent, jobBooked, jobCompleted, completedLeads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { ...where, status: { in: ['QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED'] } } }),
    prisma.lead.count({ where: { ...where, status: { in: ['JOB_BOOKED', 'JOB_COMPLETED'] } } }),
    prisma.lead.count({ where: { ...where, status: 'JOB_COMPLETED' } }),
    prisma.lead.findMany({
      where: { ...where, status: 'JOB_COMPLETED' },
      select: { customerPrice: true, omnisideCommission: true, reconciliationBatchId: true },
    }),
  ])

  type CompletedLead = { customerPrice: number | null; omnisideCommission: number | null; reconciliationBatchId: string | null }
  const totalRevenue = completedLeads.reduce((sum: number, l: CompletedLead) => sum + (l.customerPrice ?? 0), 0)
  const commissionEarned = completedLeads.filter((l: CompletedLead) => l.reconciliationBatchId != null).reduce((sum: number, l: CompletedLead) => sum + (l.omnisideCommission ?? 0), 0)
  const commissionPending = completedLeads.filter((l: CompletedLead) => l.reconciliationBatchId == null).reduce((sum: number, l: CompletedLead) => sum + (l.omnisideCommission ?? 0), 0)

  return NextResponse.json({
    totalLeads: total,
    quotesSent: quoteSent,
    jobsBooked: jobBooked,
    jobsCompleted: jobCompleted,
    totalRevenue,
    commissionEarned,
    commissionPending,
  })
}
