'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Lead {
  id: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  updatedAt: Date
  contractorRate: number | null
  customerPrice: number | null
  omnisideCommission: number | null
  commissionReconciled: boolean
  invoiceUrl: string | null
}

export default function CommissionTable({ leads }: { leads: Lead[] }) {
  const router = useRouter()
  const [toggling, setToggling] = useState<string | null>(null)

  async function toggleReconciled(quoteNumber: string, current: boolean) {
    setToggling(quoteNumber)
    await fetch(`/api/leads/${quoteNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commissionReconciled: !current }),
    })
    setToggling(null)
    router.refresh()
  }

  const fmt = (n: number | null) => (n != null ? `$${n.toFixed(2)}` : '—')

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Completed</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Contractor Rate</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer Price</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Commission</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Reconciled</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-[#F3F4F6] dark:border-[#0F172A] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/leads/${lead.quoteNumber}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">
                    {lead.quoteNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                  {new Date(lead.updatedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-3 text-right text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.contractorRate)}</td>
                <td className="px-4 py-3 text-right text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.customerPrice)}</td>
                <td className="px-4 py-3 text-right font-semibold text-[#16A34A]">{fmt(lead.omnisideCommission)}</td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={lead.commissionReconciled}
                    disabled={toggling === lead.quoteNumber}
                    onChange={() => toggleReconciled(lead.quoteNumber, lead.commissionReconciled)}
                    className="w-4 h-4 accent-[#2563EB] cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  {lead.invoiceUrl && (
                    <a href={lead.invoiceUrl} download className="text-xs text-[#2563EB] dark:text-[#3B82F6] hover:underline">
                      Invoice
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
