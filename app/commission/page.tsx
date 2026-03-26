import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/Card'
import CommissionPageClient from '@/components/commission/CommissionPageClient'

export default async function CommissionPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const campaignId = session.user.campaignId
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
        <StatCard label="Commission Earned" value={`$${totalEarned.toFixed(2)}`} />
        <StatCard label="Commission Pending" value={`$${totalPending.toFixed(2)}`} />
        <StatCard label="Jobs Completed" value={totalCompleted} />
        <StatCard label="Avg Commission" value={`$${avgCommission.toFixed(2)}`} />
      </div>

      <CommissionPageClient />
    </AppShell>
  )
}
