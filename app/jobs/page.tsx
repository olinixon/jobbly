import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import JobsTable from '@/components/jobs/JobsTable'

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
        <JobsTable jobs={jobs} />
      )}
    </AppShell>
  )
}
