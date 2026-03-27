'use client'

import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import { formatDateTime, formatDate } from '@/lib/formatDate'

interface UrgentLead {
  id: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  status: string
  createdAt: Date
  jobBookedDate?: Date | null
  urgencyLevel: 'HIGH' | 'MEDIUM'
}

interface NeedsActionTableProps {
  leads: UrgentLead[]
  isAdmin: boolean
}

const URGENCY_DOT: Record<string, string> = {
  HIGH: 'w-2.5 h-2.5 rounded-full bg-red-500 shrink-0',
  MEDIUM: 'w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0',
}

const URGENCY_LABEL: Record<string, string> = {
  HIGH: 'Urgent',
  MEDIUM: 'Soon',
}

export default function NeedsActionTable({ leads, isAdmin }: NeedsActionTableProps) {
  const router = useRouter()

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Priority</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Address</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Received</th>
              {isAdmin && <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Booked Date</th>}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => router.push(isAdmin ? `/leads/${lead.quoteNumber}` : `/jobs/${lead.quoteNumber}`)}
                className="border-b border-[#F3F4F6] dark:border-[#0F172A] hover:bg-[#F0F7FF] dark:hover:bg-[#1e3a5f]/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={URGENCY_DOT[lead.urgencyLevel]} />
                    <span className={`text-xs font-medium ${lead.urgencyLevel === 'HIGH' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {URGENCY_LABEL[lead.urgencyLevel]}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{lead.quoteNumber}</td>
                <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{lead.propertyAddress}</td>
                <td className="px-4 py-3"><Badge status={lead.status} /></td>
                <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">{formatDateTime(lead.createdAt)}</td>
                {isAdmin && (
                  <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                    {lead.jobBookedDate ? formatDate(lead.jobBookedDate) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
