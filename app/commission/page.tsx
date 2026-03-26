import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import CommissionTable from '@/components/leads/CommissionTable'

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ reconciled?: string; from?: string; to?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const sp = await searchParams
  const reconciled = sp.reconciled
  const campaignId = session.user.campaignId

  const where: Record<string, unknown> = { status: 'JOB_COMPLETED' }
  if (campaignId) where.campaignId = campaignId
  if (reconciled === 'true') where.commissionReconciled = true
  if (reconciled === 'false') where.commissionReconciled = false

  const leads = await prisma.lead.findMany({ where, orderBy: { updatedAt: 'desc' } })

  const totalEarned = leads.filter(l => l.commissionReconciled).reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)
  const totalPending = leads.filter(l => !l.commissionReconciled).reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)
  const avgCommission = leads.length > 0 ? (totalEarned + totalPending) / leads.length : 0

  return (
    <AppShell>
      <PageHeader title="Commission" subtitle="Track and reconcile completed jobs" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Commission Earned" value={`$${totalEarned.toFixed(2)}`} />
        <StatCard label="Commission Pending" value={`$${totalPending.toFixed(2)}`} />
        <StatCard label="Jobs Completed" value={leads.length} />
        <StatCard label="Avg Commission" value={`$${avgCommission.toFixed(2)}`} />
      </div>

      {/* Filter */}
      <form method="GET" className="flex gap-3 mb-4">
        <select
          name="reconciled"
          defaultValue={reconciled ?? ''}
          className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        >
          <option value="">All</option>
          <option value="false">Unreconciled</option>
          <option value="true">Reconciled</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8]"
        >
          Filter
        </button>
      </form>

      {leads.length === 0 ? (
        <EmptyState message="No completed jobs yet." />
      ) : (
        <CommissionTable leads={leads} />
      )}
    </AppShell>
  )
}
