import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'
import { computeUrgency } from '@/lib/urgency'
import NeedsActionTable from '@/components/leads/NeedsActionTable'

export default async function NeedsActionPage() {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUBCONTRACTOR')) {
    redirect('/login')
  }

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) redirect('/campaigns')

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: { not: 'JOB_COMPLETED' },
    },
    select: {
      id: true,
      quoteNumber: true,
      customerName: true,
      propertyAddress: true,
      status: true,
      createdAt: true,
      jobBookedDate: true,
      invoiceUrl: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const urgent = leads
    .map(l => ({ ...l, urgencyLevel: computeUrgency(l) as 'HIGH' | 'MEDIUM' }))
    .filter(l => l.urgencyLevel !== null)
    .sort((a, b) => {
      if (a.urgencyLevel === b.urgencyLevel) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return a.urgencyLevel === 'HIGH' ? -1 : 1
    })

  const isAdmin = session.user.role === 'ADMIN'

  return (
    <AppShell>
      <PageHeader title="Needs Action" subtitle={`${urgent.length} lead${urgent.length === 1 ? '' : 's'} requiring attention`} />
      {urgent.length === 0 ? (
        <EmptyState message="All caught up! No leads need attention right now." />
      ) : (
        <NeedsActionTable leads={urgent} isAdmin={isAdmin} />
      )}
    </AppShell>
  )
}
