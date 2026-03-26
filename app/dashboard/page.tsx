import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import type { Lead } from '@/app/generated/prisma/client'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'

interface SearchParams {
  campaignId?: string
  search?: string
  status?: string
  page?: string
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
  const page = parseInt(sp.page ?? '1')
  const pageSize = 50

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (statusFilter) where.status = statusFilter
  if (search) {
    where.OR = [
      { quoteNumber: { contains: search } },
      { customerName: { contains: search } },
      { propertyAddress: { contains: search } },
    ]
  }

  const [leads, total, stats] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where: campaignId ? { campaignId } : {},
      select: { status: true, customerPrice: true, omnisideCommission: true, commissionReconciled: true },
    }),
  ])

  type StatLead = { status: string; customerPrice: number | null; omnisideCommission: number | null; commissionReconciled: boolean }
  const totalLeads = stats.length
  const quotesSent = stats.filter((l: StatLead) => ['QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED'].includes(l.status)).length
  const jobsBooked = stats.filter((l: StatLead) => ['JOB_BOOKED', 'JOB_COMPLETED'].includes(l.status)).length
  const jobsCompleted = stats.filter((l: StatLead) => l.status === 'JOB_COMPLETED').length
  const totalRevenue = stats.filter((l: StatLead) => l.status === 'JOB_COMPLETED').reduce((s: number, l: StatLead) => s + (l.customerPrice ?? 0), 0)
  const commissionEarned = stats.filter((l: StatLead) => l.status === 'JOB_COMPLETED' && l.commissionReconciled).reduce((s: number, l: StatLead) => s + (l.omnisideCommission ?? 0), 0)
  const commissionPending = stats.filter((l: StatLead) => l.status === 'JOB_COMPLETED' && !l.commissionReconciled).reduce((s: number, l: StatLead) => s + (l.omnisideCommission ?? 0), 0)
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
        <StatCard label="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} />
        {isAdmin && <StatCard label="Commission Earned" value={`$${commissionEarned.toFixed(2)}`} />}
        {isAdmin && <StatCard label="Commission Pending" value={`$${commissionPending.toFixed(2)}`} />}
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 mb-4">
        <input
          name="campaignId"
          type="hidden"
          value={campaignId ?? ''}
        />
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by quote, name, or address…"
          className="flex-1 min-w-48 px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        >
          <option value="">All Statuses</option>
          <option value="LEAD_RECEIVED">Lead Received</option>
          <option value="QUOTE_SENT">Quote Sent</option>
          <option value="JOB_BOOKED">Job Booked</option>
          <option value="JOB_COMPLETED">Job Completed</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8]"
        >
          Filter
        </button>
      </form>

      {/* Table */}
      {leads.length === 0 ? (
        <EmptyState message="No leads yet. They'll appear here automatically after each call." />
      ) : (
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Address</th>
                  {isAdmin && <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Phone</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Price</th>
                  {isAdmin && <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Commission</th>}
                  {isAdmin && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead: Lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-[#F3F4F6] dark:border-[#1E293B] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">
                      <Link href={`/leads/${lead.quoteNumber}`} className="hover:text-[#2563EB] dark:hover:text-[#3B82F6]">
                        {lead.quoteNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                    <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{lead.propertyAddress}</td>
                    {isAdmin && <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8]">{lead.customerPhone}</td>}
                    <td className="px-4 py-3"><Badge status={lead.status} /></td>
                    <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                      {new Date(lead.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right text-[#111827] dark:text-[#F1F5F9]">
                      {lead.customerPrice != null ? `$${lead.customerPrice.toFixed(2)}` : '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right text-[#111827] dark:text-[#F1F5F9]">
                        {lead.omnisideCommission != null ? `$${lead.omnisideCommission.toFixed(2)}` : '—'}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <a
                          href={lead.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2563EB] dark:text-[#3B82F6] hover:underline text-xs"
                          title="View on Google Maps"
                        >
                          🗺️
                        </a>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="px-4 py-3 flex items-center justify-between border-t border-[#E5E7EB] dark:border-[#334155]">
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/dashboard?page=${page - 1}&search=${search}&status=${statusFilter}&campaignId=${campaignId ?? ''}`}
                    className="px-3 py-1 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A]"
                  >
                    ← Prev
                  </Link>
                )}
                {page * pageSize < total && (
                  <Link
                    href={`/dashboard?page=${page + 1}&search=${search}&status=${statusFilter}&campaignId=${campaignId ?? ''}`}
                    className="px-3 py-1 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A]"
                  >
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}
