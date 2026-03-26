import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role !== 'SUBCONTRACTOR') redirect('/login')

  const sp = await searchParams
  const search = sp.search ?? ''
  const statusFilter = sp.status ?? ''

  const where: Record<string, unknown> = {}
  if (session.user.campaignId) where.campaignId = session.user.campaignId
  if (statusFilter) where.status = statusFilter
  if (search) {
    where.OR = [
      { quoteNumber: { contains: search } },
      { customerName: { contains: search } },
    ]
  }

  const jobs = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return (
    <AppShell>
      <PageHeader title="My Jobs" />

      <form method="GET" className="flex gap-3 mb-4">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by quote number or customer…"
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
          Search
        </button>
      </form>

      {jobs.length === 0 ? (
        <EmptyState message="No jobs yet. They'll appear here as leads come in." />
      ) : (
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Address</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-[#F3F4F6] dark:border-[#0F172A] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{job.quoteNumber}</td>
                    <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{job.customerName}</td>
                    <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{job.propertyAddress}</td>
                    <td className="px-4 py-3"><Badge status={job.status} /></td>
                    <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/jobs/${job.quoteNumber}`}
                        className="text-sm text-[#2563EB] dark:text-[#3B82F6] hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  )
}
