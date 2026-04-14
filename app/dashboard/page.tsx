import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import LeadsTable from '@/components/leads/LeadsTable'
import DashboardFilters from '@/components/dashboard/DashboardFilters'
import DashboardExportButton from '@/components/dashboard/DashboardExportButton'
import AddLeadModal from '@/components/dashboard/AddLeadModal'
import CallStatCards from '@/components/dashboard/CallStatCards'
import PipelineStatCards from '@/components/dashboard/PipelineStatCards'
import FinancialsStatCards from '@/components/dashboard/FinancialsStatCards'
import SubcontractorStatCards from '@/components/dashboard/SubcontractorStatCards'
import SandboxToggle from '@/components/dashboard/SandboxToggle'
import SandboxBanner from '@/components/dashboard/SandboxBanner'
import Link from 'next/link'
import { computeUrgency } from '@/lib/urgency'

export const revalidate = 30

interface SearchParams {
  campaignId?: string
  search?: string
  status?: string
  page?: string
  dateRange?: string
  from?: string
  to?: string
}

// Compute from/to ISO strings for the call stats API — covers all preset date ranges
function getCallStatsRange(dateRange: string, from?: string, to?: string): { from?: string; to?: string } {
  const now = new Date()
  switch (dateRange) {
    case 'today': {
      const d = now.toISOString().split('T')[0]
      return { from: d, to: d }
    }
    case 'last7': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { from: start.toISOString().split('T')[0] }
    }
    case 'mtd':
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01` }
    case 'last-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] }
    }
    case 'last-quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), (q - 1) * 3, 1)
      const end = new Date(now.getFullYear(), q * 3, 0)
      return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] }
    }
    case 'custom':
      return { from: from || undefined, to: to || undefined }
    default:
      return {}
  }
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

  // All three roles can access dashboard
  const role = session.user.role

  const sp = await searchParams
  const campaignId = role === 'ADMIN'
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
  const callStatsRange = getCallStatsRange(dateRange, fromParam, toParam)

  const isNeedsActionFilter = statusFilter === 'NEEDS_ACTION'

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (statusFilter && !isNeedsActionFilter) where.status = statusFilter
  if (dateFilter) where.createdAt = dateFilter
  if (role !== 'ADMIN') where.is_test = false
  if (search) {
    where.OR = [
      { quoteNumber: { contains: search } },
      { customerName: { contains: search } },
      { propertyAddress: { contains: search } },
    ]
  }

  // Count stats filter by createdAt (when leads arrived)
  const countStatsWhere: Record<string, unknown> = {}
  if (campaignId) countStatsWhere.campaignId = campaignId
  if (dateFilter) countStatsWhere.createdAt = dateFilter
  if (role !== 'ADMIN') countStatsWhere.is_test = false

  // Financial stats filter by jobCompletedAt — must match commission page
  const financialStatsWhere: Record<string, unknown> = {
    campaignId: campaignId ?? undefined,
    status: 'JOB_COMPLETED',
    jobCompletedAt: { not: null, ...(dateFilter ?? {}) },
    ...(role !== 'ADMIN' ? { is_test: false } : {}),
  }
  if (!campaignId) delete financialStatsWhere.campaignId

  // Needs-action count for standalone button (unfiltered — matches sidebar badge)
  const needsActionBaseWhere: Record<string, unknown> = { status: { notIn: ['JOB_COMPLETED', 'JOB_CANCELLED'] } }
  if (campaignId) needsActionBaseWhere.campaignId = campaignId
  if (role !== 'ADMIN') needsActionBaseWhere.is_test = false

  // Two-tier sort: active leads first (oldest first), completed last (oldest first)
  const [activeLeadsRaw, completedLeadsRaw, total, countStats, financialStats, needsActionLeads, campaign] = await Promise.all([
    prisma.lead.findMany({ where: { ...where, status: { notIn: ['JOB_COMPLETED', 'JOB_CANCELLED'] } }, orderBy: { createdAt: 'asc' } }),
    prisma.lead.findMany({ where: { ...where, status: 'JOB_COMPLETED' }, orderBy: { createdAt: 'asc' } }),
    prisma.lead.count({ where }),
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
    prisma.lead.findMany({
      where: needsActionBaseWhere,
      select: { status: true, createdAt: true, jobBookedDate: true, invoiceUrl: true },
    }),
    campaignId ? prisma.campaign.findUnique({ where: { id: campaignId }, select: { sandbox_active: true } }) : null,
  ])
  // Keep stats as alias for countStats for backward compat below
  const stats = countStats
  const needsActionCount = needsActionLeads.filter(l => computeUrgency(l) !== null).length

  const withUrgency = activeLeadsRaw.map(l => ({ ...l, urgencyLevel: computeUrgency(l) }))

  let allLeads: typeof withUrgency
  if (isNeedsActionFilter) {
    allLeads = withUrgency
      .filter(l => l.urgencyLevel !== null)
      .sort((a, b) => {
        if (a.urgencyLevel === b.urgencyLevel) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        return a.urgencyLevel === 'HIGH' ? -1 : 1
      })
  } else {
    allLeads = [
      ...withUrgency,
      ...completedLeadsRaw.map(l => ({ ...l, urgencyLevel: null })),
    ]
  }

  const displayTotal = isNeedsActionFilter ? allLeads.length : total
  const leads = allLeads.slice((page - 1) * pageSize, page * pageSize)

  type CountLead = { status: string }
  type FinancialLead = {
    customerPrice: number | null
    contractorRate: number | null
    grossMarkup: number | null
    omnisideCommission: number | null
    reconciliationBatchId: string | null
  }

  // Count stats from createdAt-filtered data
  const totalLeads = stats.length
  // CL16: Quotes Sent = leads that reached JOB_BOOKED (booking means quote was accepted)
  const quotesSent = stats.filter((l: CountLead) => ['JOB_BOOKED', 'JOB_COMPLETED'].includes(l.status)).length
  const jobsBooked = stats.filter((l: CountLead) => ['JOB_BOOKED', 'JOB_COMPLETED'].includes(l.status)).length
  const jobsCompleted = stats.filter((l: CountLead) => l.status === 'JOB_COMPLETED').length

  // Financial stats from jobCompletedAt-filtered data — matches commission page exactly
  const totalCustomerRevenue = financialStats.reduce((s: number, l: FinancialLead) => s + (l.customerPrice ?? 0), 0)
  const campaignRevenue = financialStats.reduce((s: number, l: FinancialLead) => s + (l.grossMarkup ?? 0), 0)
  const totalJobsRevenue = financialStats.reduce((s: number, l: FinancialLead) => s + (l.contractorRate ?? 0), 0)
  const commissionEarned = financialStats.filter((l: FinancialLead) => l.reconciliationBatchId != null).reduce((s: number, l: FinancialLead) => s + (l.omnisideCommission ?? 0), 0)
  const commissionPending = financialStats.filter((l: FinancialLead) => l.reconciliationBatchId == null).reduce((s: number, l: FinancialLead) => s + (l.omnisideCommission ?? 0), 0)

  const isAdmin = role === 'ADMIN'
  const isClient = role === 'CLIENT'
  const isSubcontractor = role === 'SUBCONTRACTOR'
  const sandboxActive = isAdmin ? (campaign?.sandbox_active ?? false) : false

  const exportStats = [
    { label: 'Total Leads', value: String(totalLeads) },
    { label: 'Quotes Sent', value: String(quotesSent) },
    { label: 'Jobs Booked', value: String(jobsBooked) },
    { label: 'Jobs Completed', value: String(jobsCompleted) },
    ...(isSubcontractor ? [{ label: 'Total Jobs Revenue (ex GST)', value: `$${totalJobsRevenue.toFixed(2)}` }] : []),
    ...(isAdmin || isClient ? [{ label: 'Total Billed to Customers (ex GST)', value: `$${totalCustomerRevenue.toFixed(2)}` }] : []),
    ...(isAdmin || isClient ? [{ label: 'Our Margin (ex GST)', value: `$${campaignRevenue.toFixed(2)}` }] : []),
    ...(isAdmin ? [{ label: 'Commission Received (ex GST)', value: `$${commissionEarned.toFixed(2)}` }] : []),
    ...(isAdmin ? [{ label: 'Commission Owed to Me (ex GST)', value: `$${commissionPending.toFixed(2)}` }] : []),
  ]

  const dateLabel = dateRange === 'all-time' ? 'All time'
    : dateRange === 'today' ? 'Today'
    : dateRange === 'last7' ? 'Last 7 days'
    : dateRange === 'mtd' ? 'Month to date'
    : dateRange === 'last-month' ? 'Last month'
    : dateRange === 'last-quarter' ? 'Last quarter'
    : dateRange === 'custom' && fromParam && toParam ? `${fromParam} – ${toParam}`
    : 'Custom range'

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        subtitle="Campaign overview"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && <SandboxToggle sandboxActive={sandboxActive} />}
            {isAdmin && <AddLeadModal />}
            <DashboardExportButton stats={exportStats} dateLabel={dateLabel} />
          </div>
        }
      />

      {/* Sandbox banner */}
      {sandboxActive && <SandboxBanner />}

      {/* Stat cards */}
      {(isAdmin || isClient) ? (
        <div className="mb-8 space-y-6">
          {/* Row 1 — Call Activity (label + refresh button rendered inside component) */}
          <CallStatCards from={callStatsRange.from} to={callStatsRange.to} />

          {/* Row 2 — Pipeline */}
          <PipelineStatCards
            key={`pipeline-${campaignId}-${dateRange}-${fromParam}-${toParam}`}
            initialStats={{ totalLeads, quotesSent, jobsBooked, jobsCompleted }}
            campaignId={campaignId ?? ''}
            dateRange={dateRange}
            from={fromParam}
            to={toParam}
          />

          {/* Row 3 — Financials */}
          <FinancialsStatCards
            key={`financials-${campaignId}-${dateRange}-${fromParam}-${toParam}`}
            initialStats={{ totalCustomerRevenue, campaignRevenue, commissionEarned, commissionPending }}
            isAdmin={isAdmin}
            campaignId={campaignId ?? ''}
            dateRange={dateRange}
            from={fromParam}
            to={toParam}
          />
        </div>
      ) : (
        /* Subcontractor view — Quotes Sent removed CL16 */
        <SubcontractorStatCards
          key={`sub-${campaignId}-${dateRange}-${fromParam}-${toParam}`}
          initialStats={{ totalLeads, jobsBooked, jobsCompleted, totalJobsRevenue }}
          campaignId={campaignId ?? ''}
          dateRange={dateRange}
          from={fromParam}
          to={toParam}
        />
      )}

      {/* Filters */}
      <div className="no-print">
      <DashboardFilters
        campaignId={campaignId ?? ''}
        search={search}
        status={statusFilter}
        dateRange={dateRange}
        from={fromParam}
        to={toParam}
        needsActionCount={isAdmin ? needsActionCount : 0}
        showNeedsAction={isAdmin}
      />

      {/* Table */}
      {leads.length === 0 ? (
        <EmptyState message="No leads yet. They'll appear here automatically after each call." />
      ) : (
        <>
          <LeadsTable leads={leads} isAdmin={isAdmin} role={role} />

          {/* Pagination */}
          {displayTotal > pageSize && (
            <div className="px-4 py-3 flex items-center justify-between mt-2">
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, displayTotal)} of {displayTotal}
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
                {page * pageSize < displayTotal && (
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
      </div>
    </AppShell>
  )
}
