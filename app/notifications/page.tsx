import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'
import { formatDateTime } from '@/lib/formatDate'

export default async function NotificationsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  redirect('/dashboard')

  const isAdmin = session.user.role === 'ADMIN'
  const campaignId = session.user.campaignId
  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId

  const [newLeads, completions] = await Promise.all([
    prisma.lead.findMany({
      where: { ...where, status: 'LEAD_RECEIVED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.lead.findMany({
      where: { ...where, status: 'JOB_COMPLETED', invoiceUrl: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ])

  const notifications = [
    ...newLeads.map((l) => ({
      id: `lead-${l.id}`,
      type: 'NEW_LEAD' as const,
      quoteNumber: l.quoteNumber,
      customerName: l.customerName,
      timestamp: l.createdAt,
    })),
    ...completions.map((l) => ({
      id: `complete-${l.id}`,
      type: 'JOB_COMPLETED' as const,
      quoteNumber: l.quoteNumber,
      customerName: l.customerName,
      timestamp: l.updatedAt,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <AppShell>
      <PageHeader title="Notifications" subtitle="Recent activity from your campaign" />

      {notifications.length === 0 ? (
        <EmptyState message="No notifications yet. They'll appear here as leads come in and jobs complete." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={isAdmin ? `/leads/${n.quoteNumber}` : `/jobs/${n.quoteNumber}`}
              className="block bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{n.type === 'NEW_LEAD' ? '📥' : '✅'}</span>
                  <div>
                    <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">
                      {n.type === 'NEW_LEAD'
                        ? `New lead received — ${n.quoteNumber}`
                        : `Job completed — ${n.quoteNumber}`}
                    </p>
                    <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{n.customerName}</p>
                  </div>
                </div>
                <time className="text-xs text-[#9CA3AF] dark:text-[#475569]">
                  {formatDateTime(n.timestamp)}
                </time>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
