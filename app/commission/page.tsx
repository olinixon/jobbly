import type { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/Card'
import CommissionPageClient from '@/components/commission/CommissionPageClient'
import ClientCommissionPage from '@/components/commission/ClientCommissionPage'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'

export const revalidate = 30

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth()
  const title = session?.user.role === 'CLIENT' ? 'Financials' : 'Commission'
  return { title: `${title} | Jobbly` }
}

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ dateRange?: string; from?: string; to?: string }>
}) {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CLIENT')) redirect('/login')

  const role = session.user.role

  // Client commission view — delegate entirely to dedicated component
  if (role === 'CLIENT') {
    const sp = await searchParams
    const campaign = session.user.campaignId
      ? await prisma.campaign.findUnique({
          where: { id: session.user.campaignId },
          select: { name: true, clientCompanyName: true, subcontractorCompanyName: true },
        })
      : null

    return (
      <AppShell>
        <ClientCommissionPage
          campaignId={session.user.campaignId ?? ''}
          campaignName={campaign?.name ?? ''}
          clientCompanyName={campaign?.clientCompanyName ?? ''}
          subcontractorCompanyName={campaign?.subcontractorCompanyName ?? ''}
          initialDateRange={sp.dateRange ?? 'all-time'}
          initialFrom={sp.from ?? ''}
          initialTo={sp.to ?? ''}
        />
      </AppShell>
    )
  }

  // Admin commission view
  const campaignId = await getActiveCampaignId(session.user.campaignId, role)
  const where: Record<string, unknown> = { status: 'JOB_COMPLETED' }
  if (campaignId) where.campaignId = campaignId

  const leads = await prisma.lead.findMany({
    where,
    select: { omnisideCommission: true, reconciliationBatchId: true },
  })

  const totalCompleted = leads.length
  const totalEarned = leads.filter(l => l.reconciliationBatchId != null).reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)
  const totalPending = leads.filter(l => l.reconciliationBatchId == null).reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)
  const avgCommission = totalCompleted > 0 ? (totalEarned + totalPending) / totalCompleted : 0

  return (
    <AppShell>
      <PageHeader title="Commission" subtitle="Track and reconcile completed jobs by month" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Commission Received (ex GST)" value={`$${totalEarned.toFixed(2)}`} />
        <StatCard label="Commission Owed to Me (ex GST)" value={`$${totalPending.toFixed(2)}`} />
        <StatCard label="Jobs Completed" value={totalCompleted} />
        <StatCard label="Avg Commission (ex GST)" value={`$${avgCommission.toFixed(2)}`} />
      </div>

      <CommissionPageClient />
    </AppShell>
  )
}
