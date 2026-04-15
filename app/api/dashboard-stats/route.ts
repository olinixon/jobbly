import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function getDateFilter(
  dateRange: string,
  from?: string,
  to?: string,
): { gte?: Date; lte?: Date } | undefined {
  const now = new Date()
  switch (dateRange) {
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return { gte: start }
    }
    case 'last7': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { gte: start }
    }
    case 'mtd':
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1) }
    case 'last-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 1)
      return { gte: start, lte: end }
    }
    case 'last-quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), (q - 1) * 3, 1)
      const end = new Date(now.getFullYear(), q * 3, 1)
      return { gte: start, lte: end }
    }
    case 'custom': {
      const filter: { gte?: Date; lte?: Date } = {}
      if (from) filter.gte = new Date(from)
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        filter.lte = end
      }
      return Object.keys(filter).length > 0 ? filter : undefined
    }
    default:
      return undefined
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId') || undefined
  const dateRange = searchParams.get('dateRange') || 'all-time'
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined

  const dateFilter = getDateFilter(dateRange, from, to)

  const countStatsWhere: Record<string, unknown> = { status: { not: 'NOT_CONVERTED' } }
  if (campaignId) countStatsWhere.campaignId = campaignId
  if (dateFilter) countStatsWhere.createdAt = dateFilter

  const financialStatsWhere: Record<string, unknown> = {
    status: 'JOB_COMPLETED',
    jobCompletedAt: { not: null, ...(dateFilter ?? {}) },
  }
  if (campaignId) financialStatsWhere.campaignId = campaignId

  const [countStats, financialStats] = await Promise.all([
    prisma.lead.findMany({
      where: countStatsWhere,
      select: { status: true },
    }),
    prisma.lead.findMany({
      where: financialStatsWhere,
      select: {
        customerPrice: true,
        contractorRate: true,
        grossMarkup: true,
        omnisideCommission: true,
        reconciliationBatchId: true,
      },
    }),
  ])

  const totalLeads = countStats.length
  const quotesSent = countStats.filter(l => ['JOB_BOOKED', 'JOB_COMPLETED'].includes(l.status)).length
  const jobsBooked = quotesSent
  const jobsCompleted = countStats.filter(l => l.status === 'JOB_COMPLETED').length

  const totalCustomerRevenue = financialStats.reduce((s, l) => s + (l.customerPrice ?? 0), 0)
  const campaignRevenue = financialStats.reduce((s, l) => s + (l.grossMarkup ?? 0), 0)
  const totalJobsRevenue = financialStats.reduce((s, l) => s + (l.contractorRate ?? 0), 0)
  const commissionEarned = financialStats
    .filter(l => l.reconciliationBatchId != null)
    .reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)
  const commissionPending = financialStats
    .filter(l => l.reconciliationBatchId == null)
    .reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)

  return NextResponse.json({
    totalLeads,
    quotesSent,
    jobsBooked,
    jobsCompleted,
    totalCustomerRevenue,
    campaignRevenue,
    totalJobsRevenue,
    commissionEarned,
    commissionPending,
  })
}
