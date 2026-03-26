import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import LeadsTable from '@/components/leads/LeadsTable'
import DashboardFilters from '@/components/dashboard/DashboardFilters'
import Link from 'next/link'

interface SearchParams {
  campaignId?: string
  search?: string
  status?: string
  page?: string
  dateRange?: string
  from?: string
  to?: string
}

function getDateFilter(dateRange: string, from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
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
    case 'mtd': {
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1) }
    }
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const sp = await searchParams
  const campaignId = session.user.role === 'ADMIN'
    ? (sp.campaignId ?? session.user.campaignId)
    : session.user.campaignId

  const search = sp.search ?? ''
  const statusFilter = sp.status ?? ''
  const dateRange = sp.dateRange ?? 'all-time'
  const fromParam = sp.from ?? ''
  const toParam = sp.to ?? ''
  const page = parseInt(sp.page ?? '1')
  const pageSize = 50

  const dateFilter = getDateFilter(dateRange, fromParam, toParam)

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (statusFilter) where.status = statusFilter
  if (dateFilter) where.createdAt = dateFilter
  if (search) {
    where.OR = [
      { quoteNumber: { contains: search } },
      { customerName: { contains: search } },
      { propertyAddress: { contains: search } },
    ]
  }

  const statsWhere: Record<string, unknown> = {}
  if (campaignId) statsWhere.campaignId = campaignId
  if (dateFilter) statsWhere.createdAt = dateFilter

  const [leads, total, stats] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where: statsWhere,
      select: {
        status: true,
        customerPrice: true,
        omnisideCommission: true,
        reconciliationBatchId: true,
      },
    }),
  ])

  type StatLead = {
    status: string
    customerPrice: number | null
    omnisideCommission: number | null
    reconciliationBatchId: string | null
  }

  const totalLeads = stats.length
  const quotesSent = stats.filter((l: StatLead) => ['QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED'].includes(l.status)).length
  const jobsBooked = stats.filter((l: StatLead) => ['JOB_BOOKED', 'JOB_COMPLETED'].includes(l.status)).length
  const jobsCompleted = stats.filter((l: StatLead) => l.status === 'JOB_COMPLETED').length
  const completedLeads = stats.filter((l: StatLead) => l.status === 'JOB_COMPLETED')
  const totalRevenue = completedLeads.reduce((s: number, l: StatLead) => s + (l.customerPrice ?? 0), 0)
  const commissionEarned = completedLeads.filter((l: StatLead) => l.reconciliationBatchId != null).reduce((s: number, l: StatLead) => s + (l.omnisideCommission ?? 0), 0)
  const commissionPending = completedLeads.filter((l: StatLead) => l.reconciliationBatchId == null).reduce((s: number, l: StatLead) => s + (l.omnisideCommission ?? 0), 0)
  const isAdmin = session.user.role === 'ADMIN'

  return (
    <AppShell>
      <PageHeader title="Dashboard" subtitle="All leads for this campaign" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Leads" value={totalLeads} />
        <StatCard label="Quotes Sent" value={quotesSent} />
        <StatCard label="Jobs Booked" value={jobsBooked} />
        <StatCard label="Jobs Completed" value={jobsCompleted} />
        <StatCard label="Total Revenue (ex GST)" value={`$${totalRevenue.toFixed(2)}`} />
        {isAdmin && <StatCard label="Commission Earned (ex GST)" value={`$${commissionEarned.toFixed(2)}`} />}
        {isAdmin && <StatCard label="Commission Pending (ex GST)" value={`$${commissionPending.toFixed(2)}`} />}
      </div>

      {/* Filters */}
      <DashboardFilters
        campaignId={campaignId ?? ''}
        search={search}
        status={statusFilter}
        dateRange={dateRange}
        from={fromParam}
        to={toParam}
      />

      {/* Table */}
      {leads.length === 0 ? (
        <EmptyState message="No leads yet. They'll appear here automatically after each call." />
      ) : (
        <>
          <LeadsTable leads={leads} isAdmin={isAdmin} />

          {/* Pagination */}
          {total > pageSize && (
            <div className="px-4 py-3 flex items-center justify-between mt-2">
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/dashboard?page=${page - 1}&search=${search}&status=${statusFilter}&campaignId=${campaignId ?? ''}&dateRange=${dateRange}&from=${fromParam}&to=${toParam}`}
                    className="px-3 py-1 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A]"
                  >
                    ← Prev
                  </Link>
                )}
                {page * pageSize < total && (
                  <Link
                    href={`/dashboard?page=${page + 1}&search=${search}&status=${statusFilter}&campaignId=${campaignId ?? ''}&dateRange=${dateRange}&from=${fromParam}&to=${toParam}`}
                    className="px-3 py-1 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A]"
                  >
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
