'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { StatCard } from '@/components/ui/Card'

interface InvoiceLead {
  quoteNumber: string
  customerName: string
  grossMarkup: number | null
  sentAt: string | null
  paidAt: string | null
  isPaid: boolean
  isSent: boolean
}

interface Props {
  campaignId: string
  campaignName: string
  clientCompanyName: string
  subcontractorCompanyName: string
  initialDateRange: string
  initialFrom: string
  initialTo: string
}

const fmt = (n: number | null | undefined) => (n != null ? `$${n.toFixed(2)}` : '—')

const fmtDate = (iso: string | null) => {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

const DATE_RANGE_OPTIONS = [
  { value: 'all-time', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-quarter', label: 'Last quarter' },
  { value: 'custom', label: 'Custom range' },
]

function getFromTo(dateRange: string, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date()
  switch (dateRange) {
    case 'today': {
      const d = now.toISOString().split('T')[0]
      return { from: d, to: d }
    }
    case 'last7': {
      const from = new Date(now); from.setDate(from.getDate() - 7)
      return { from: from.toISOString().split('T')[0] }
    }
    case 'mtd':
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01` }
    case 'last-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] }
    }
    case 'last-quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), (q - 1) * 3, 1)
      const end = new Date(now.getFullYear(), q * 3, 0)
      return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] }
    }
    case 'custom':
      return { from: customFrom || undefined, to: customTo || undefined }
    default:
      return {}
  }
}

export default function ClientCommissionPage({
  campaignName,
  initialDateRange,
  initialFrom,
  initialTo,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tab, setTab] = useState<'unpaid' | 'paid'>('unpaid')
  const [dateRange, setDateRange] = useState(initialDateRange)
  const [customFrom, setCustomFrom] = useState(initialFrom)
  const [customTo, setCustomTo] = useState(initialTo)
  const [leads, setLeads] = useState<InvoiceLead[]>([])
  const [loading, setLoading] = useState(true)

  function buildUrl(params: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); else sp.delete(k) })
    return `/commission?${sp.toString()}`
  }

  function applyRange(range: string, from = customFrom, to = customTo) {
    const url = buildUrl({ dateRange: range, from: range === 'custom' ? from : '', to: range === 'custom' ? to : '' })
    router.push(url)
  }

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const { from, to } = getFromTo(dateRange, customFrom, customTo)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/client/commission/invoices?${params.toString()}`)
    if (res.ok) setLeads(await res.json())
    setLoading(false)
  }, [dateRange, customFrom, customTo])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const unpaid = leads.filter(l => !l.isPaid)
  const paid = leads.filter(l => l.isPaid)
  const shown = tab === 'unpaid' ? unpaid : paid

  const totalMarkup = leads.reduce((s, l) => s + (l.grossMarkup ?? 0), 0)
  const paidMarkup = paid.reduce((s, l) => s + (l.grossMarkup ?? 0), 0)

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9]">Financials</h1>
          <p className="mt-1 text-sm text-[#6B7280] dark:text-[#94A3B8]">Invoice summary — {campaignName}</p>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => { setDateRange(e.target.value); applyRange(e.target.value) }}
            className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            {DATE_RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {dateRange === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
              <span className="text-[#6B7280] dark:text-[#94A3B8] text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); if (customFrom) applyRange('custom', customFrom, e.target.value) }} className="px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
            </>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Total Margin Generated (ex GST)" value={fmt(totalMarkup)} />
        <StatCard label="Total Margin (incl. GST)" value={fmt(totalMarkup * 1.15)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#F3F4F6] dark:bg-[#0F172A] rounded-lg p-1 w-fit">
        {(['unpaid', 'paid'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t
                ? 'bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] shadow-sm'
                : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-[#F1F5F9]'
            }`}
          >
            {t === 'unpaid' ? `Unpaid${unpaid.length > 0 ? ` (${unpaid.length})` : ''}` : `Paid${paid.length > 0 ? ` (${paid.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[#6B7280] dark:text-[#94A3B8] py-8 text-center">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 text-[#6B7280] dark:text-[#94A3B8]">
          <p className="text-lg font-medium">
            {tab === 'unpaid' ? 'No unpaid invoices.' : 'No paid invoices yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9FAFB] dark:bg-[#0F172A] border-b border-[#E5E7EB] dark:border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Quote #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Customer</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Margin (ex GST)</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Sent</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Paid</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(lead => (
                  <tr
                    key={lead.quoteNumber}
                    onClick={() => router.push(`/leads/${lead.quoteNumber}?from=commission`)}
                    className="border-t border-[#F3F4F6] dark:border-[#1E293B] hover:bg-[#F0F7FF] dark:hover:bg-[#1e3a5f]/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{lead.quoteNumber}</td>
                    <td className="px-4 py-3 text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#16A34A]">{fmt(lead.grossMarkup)}</td>
                    <td className="px-4 py-3 text-center">
                      {lead.isSent
                        ? <span className="text-xs text-[#16A34A]">{fmtDate(lead.sentAt) ?? 'Yes'}</span>
                        : <span className="text-xs text-[#9CA3AF]">No</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {lead.isPaid
                        ? <span className="text-xs text-[#16A34A]">{fmtDate(lead.paidAt) ?? 'Yes'}</span>
                        : <span className="text-xs text-[#9CA3AF]">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tab === 'paid' && paid.length > 0 && (
            <div className="border-t border-[#E5E7EB] dark:border-[#334155] px-4 py-3 flex justify-end gap-8">
              <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                Paid margin (ex GST): <span className="font-semibold text-[#16A34A]">{fmt(paidMarkup)}</span>
              </span>
              <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                incl. GST: <span className="font-semibold text-[#16A34A]">{fmt(paidMarkup * 1.15)}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
