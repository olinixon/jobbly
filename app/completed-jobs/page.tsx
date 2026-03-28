import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import CompletedJobsTable from '@/components/jobs/CompletedJobsTable'

export default async function CompletedJobsPage() {
  const session = await auth()
  if (!session || (session.user.role !== 'SUBCONTRACTOR' && session.user.role !== 'ADMIN')) {
    redirect('/login')
  }

  const where: Record<string, unknown> = { status: 'JOB_COMPLETED' }
  if (session.user.campaignId) where.campaignId = session.user.campaignId

  const jobs = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      quoteNumber: true,
      customerName: true,
      propertyAddress: true,
      jobCompletedAt: true,
      contractorRate: true,
      invoiceUrl: true,
    },
    orderBy: { jobCompletedAt: 'desc' },
  })

  return (
    <AppShell>
      <PageHeader title="Completed Jobs" subtitle={`${jobs.length} completed job${jobs.length === 1 ? '' : 's'}`} />
      {jobs.length === 0 ? (
        <EmptyState message="No completed jobs yet." />
      ) : (
        <CompletedJobsTable jobs={jobs} />
      )}
    </AppShell>
  )
}
