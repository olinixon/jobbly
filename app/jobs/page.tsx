import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import JobsTable from '@/components/jobs/JobsTable'
import JobsFilters from '@/components/jobs/JobsFilters'
import { computeUrgency } from '@/lib/urgency'

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

  const isNeedsActionFilter = statusFilter === 'NEEDS_ACTION'

  // New Jobs page: restricted to LEAD_RECEIVED and QUOTE_SENT only
  const NEW_JOB_STATUSES = ['LEAD_RECEIVED', 'QUOTE_SENT'] as const
  type NewJobStatus = typeof NEW_JOB_STATUSES[number]

  const baseWhere: Record<string, unknown> = {}
  if (session.user.campaignId) baseWhere.campaignId = session.user.campaignId
  if (search) {
    baseWhere.OR = [
      { quoteNumber: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
    ]
  }

  // If a valid single-status filter is applied, use it; otherwise show both new-job statuses
  const statusIn: NewJobStatus[] =
    statusFilter && !isNeedsActionFilter && NEW_JOB_STATUSES.includes(statusFilter as NewJobStatus)
      ? [statusFilter as NewJobStatus]
      : [...NEW_JOB_STATUSES]

  const activeWhere = { ...baseWhere, status: { in: statusIn } }

  // Needs-action count (unfiltered, matches sidebar badge)
  const needsActionBaseWhere: Record<string, unknown> = { status: { not: 'JOB_COMPLETED' } }
  if (session.user.campaignId) needsActionBaseWhere.campaignId = session.user.campaignId

  let jobs: { id: string; quoteNumber: string; customerName: string; propertyAddress: string; status: string; createdAt: Date; jobBookedDate?: Date | null; urgencyLevel?: 'HIGH' | 'MEDIUM' | null }[] = []

  if (isNeedsActionFilter) {
    const activeJobs = await prisma.lead.findMany({ where: activeWhere, orderBy: { createdAt: 'asc' } })
    const urgent = activeJobs
      .map(l => ({ ...l, urgencyLevel: computeUrgency(l) }))
      .filter(l => l.urgencyLevel !== null) as typeof jobs
    urgent.sort((a, b) => {
      if (a.urgencyLevel === b.urgencyLevel) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return a.urgencyLevel === 'HIGH' ? -1 : 1
    })
    jobs = urgent
  } else {
    const activeJobs = await prisma.lead.findMany({ where: activeWhere, orderBy: { createdAt: 'asc' } })
    jobs = activeJobs.map(l => ({ ...l, urgencyLevel: computeUrgency(l) }))
  }

  const needsActionLeads = await prisma.lead.findMany({
    where: needsActionBaseWhere,
    select: { status: true, createdAt: true, jobBookedDate: true, invoiceUrl: true },
  })
  const needsActionCount = needsActionLeads.filter(l => computeUrgency(l) !== null).length

  return (
    <AppShell>
      <PageHeader title="New Jobs" />

      <JobsFilters search={search} status={statusFilter} needsActionCount={needsActionCount} />

      {jobs.length === 0 ? (
        <EmptyState message="No jobs yet. They'll appear here as leads come in." />
      ) : (
        <JobsTable jobs={jobs} />
      )}
    </AppShell>
  )
}
