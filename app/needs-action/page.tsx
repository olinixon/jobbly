import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'
import { computeUrgency } from '@/lib/urgency'
import NeedsActionTable from '@/components/leads/NeedsActionTable'
import Link from 'next/link'

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

  const duplicateLeads = await prisma.lead.findMany({
    where: {
      campaignId,
      duplicate_confidence: { not: null },
      duplicate_dismissed: false,
    },
    select: {
      id: true,
      quoteNumber: true,
      customerName: true,
      propertyAddress: true,
      status: true,
      duplicate_confidence: true,
      duplicate_reason: true,
      duplicate_lead_id: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const isAdmin = session.user.role === 'ADMIN'
  const totalCount = urgent.length + duplicateLeads.length

  return (
    <AppShell>
      <PageHeader title="Needs Action" subtitle={`${totalCount} item${totalCount === 1 ? '' : 's'} requiring attention`} />
      {urgent.length === 0 && duplicateLeads.length === 0 ? (
        <EmptyState message="All caught up! No leads need attention right now." />
      ) : (
        <div className="space-y-8">
          {urgent.length > 0 && (
            <NeedsActionTable leads={urgent} isAdmin={isAdmin} />
          )}

          {duplicateLeads.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Possible duplicates</h2>
              <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                        <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Urgency</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Address</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Matched lead</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicateLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          className="border-b border-[#F3F4F6] dark:border-[#0F172A]"
                        >
                          <td className="px-4 py-3">
                            <span className={`text-sm ${lead.duplicate_confidence === 'high' ? 'text-amber-500' : 'text-yellow-400'}`}>⚠️</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <Link href={`/leads/${lead.quoteNumber}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">
                              {lead.quoteNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                          <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{lead.propertyAddress}</td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {lead.duplicate_lead_id ? (
                              <Link href={`/leads/${lead.duplicate_lead_id}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">
                                {lead.duplicate_lead_id}
                              </Link>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${lead.duplicate_confidence === 'high' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'}`}>
                              {lead.duplicate_confidence === 'high' ? 'High' : 'Medium'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}
