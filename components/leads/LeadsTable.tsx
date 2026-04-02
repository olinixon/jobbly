'use client'

import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/lib/formatDate'

interface Lead {
  id: string
  quoteNumber: string
  customerName: string
  customerPhone: string
  propertyAddress: string
  googleMapsUrl: string
  status: string
  createdAt: Date
  customerPrice: number | null
  omnisideCommission: number | null
  urgencyLevel?: 'HIGH' | 'MEDIUM' | null
}

interface LeadsTableProps {
  leads: Lead[]
  isAdmin: boolean
  role?: string
}

export default function LeadsTable({ leads, isAdmin, role }: LeadsTableProps) {
  const router = useRouter()

  function handleRowClick(quoteNumber: string) {
    if (role === 'SUBCONTRACTOR') {
      router.push(`/jobs/${quoteNumber}`)
    } else {
      router.push(`/leads/${quoteNumber}`)
    }
  }

  return (
    <>
      {/* Mobile card layout */}
      <div className="block md:hidden space-y-3">
        {leads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => handleRowClick(lead.quoteNumber)}
            className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 shadow-sm cursor-pointer active:opacity-80 transition-opacity"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                {lead.urgencyLevel === 'HIGH' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Urgent" />}
                {lead.urgencyLevel === 'MEDIUM' && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Needs attention" />}
                <span className="font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{lead.quoteNumber}</span>
              </div>
              <Badge status={lead.status} />
            </div>
            <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</p>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] truncate">{lead.propertyAddress}</p>
            <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-1">{formatDateTime(lead.createdAt)}</p>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Address</th>
              {isAdmin && <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Phone</th>}
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Date</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Price <span className="normal-case font-normal text-[#9CA3AF]">(ex GST)</span></th>
              {isAdmin && <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Commission <span className="normal-case font-normal text-[#9CA3AF]">(ex GST)</span></th>}
              {isAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => handleRowClick(lead.quoteNumber)}
                className="border-b border-[#F3F4F6] dark:border-[#0F172A] hover:bg-[#F0F7FF] dark:hover:bg-[#1e3a5f]/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">
                  <div className="flex items-center gap-1.5">
                    {lead.urgencyLevel === 'HIGH' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Urgent" />}
                    {lead.urgencyLevel === 'MEDIUM' && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Needs attention" />}
                    {lead.quoteNumber}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{lead.propertyAddress}</td>
                {isAdmin && <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8]">{lead.customerPhone}</td>}
                <td className="px-4 py-3"><Badge status={lead.status} /></td>
                <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                  {formatDateTime(lead.createdAt)}
                </td>
                <td className="px-4 py-3 text-right text-[#111827] dark:text-[#F1F5F9]">
                  {lead.customerPrice != null ? `$${lead.customerPrice.toFixed(2)}` : '—'}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right text-[#111827] dark:text-[#F1F5F9]">
                    {lead.omnisideCommission != null ? `$${lead.omnisideCommission.toFixed(2)}` : '—'}
                  </td>
                )}
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <a
                      href={lead.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#2563EB] dark:text-[#3B82F6] hover:underline text-xs"
                      title="View on Google Maps"
                    >
                      🗺️
                    </a>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </>
  )
}
