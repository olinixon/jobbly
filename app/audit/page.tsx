import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'
import { formatDateTime } from '@/lib/formatDate'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; from?: string; to?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const sp = await searchParams
  const search = sp.search ?? ''
  const campaignId = session.user.campaignId
  const isAdmin = session.user.role === 'ADMIN'

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (search) {
    where.OR = [
      { lead: { quoteNumber: { contains: search } } },
      { changedByName: { contains: search } },
    ]
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: { lead: { select: { quoteNumber: true, customerName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return (
    <AppShell>
      <PageHeader title="Audit Log" subtitle="Every status change, who made it, and when" />

      <form method="GET" className="flex gap-3 mb-4">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by quote number or user…"
          className="flex-1 min-w-48 px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8]"
        >
          Search
        </button>
      </form>

      {logs.length === 0 ? (
        <EmptyState message="No audit entries yet." />
      ) : (
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Changed By</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">From</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">To</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[#F3F4F6] dark:border-[#0F172A] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors">
                    <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap text-xs">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={isAdmin ? `/leads/${log.lead.quoteNumber}` : `/jobs/${log.lead.quoteNumber}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">
                        {log.lead.quoteNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#111827] dark:text-[#F1F5F9]">{log.lead.customerName}</td>
                    <td className="px-4 py-3 text-[#374151] dark:text-[#CBD5E1]">{log.changedByName}</td>
                    <td className="px-4 py-3"><Badge status={log.oldStatus} /></td>
                    <td className="px-4 py-3"><Badge status={log.newStatus} /></td>
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
