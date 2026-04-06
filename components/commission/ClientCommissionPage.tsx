'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/Card'
import { formatDate } from '@/lib/formatDate'

interface MonthLead {
  quoteNumber: string
  customerName: string
  propertyAddress: string
  grossMarkup: number | null
}

interface MonthData {
  monthKey: string
  label: string
  jobCount: number
  totalGrossMarkup: number
  leads: MonthLead[]
}

interface Props {
  campaignId: string
  campaignName: string
  clientCompanyName: string
  subcontractorCompanyName: string
  initialDateRange: string
  initialFrom: string
  initialTo: string
  stripeVerified?: boolean
}

const fmt = (n: number | null | undefined) => (n != null ? `$${n.toFixed(2)}` : '—')

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
  clientCompanyName,
  subcontractorCompanyName,
  initialDateRange,
  initialFrom,
  initialTo,
  stripeVerified = false,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [dateRange, setDateRange] = useState(initialDateRange)
  const [customFrom, setCustomFrom] = useState(initialFrom)
  const [customTo, setCustomTo] = useState(initialTo)
  const [months, setMonths] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [invoiceMonth, setInvoiceMonth] = useState<MonthData | null>(null)

  function buildUrl(params: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); else sp.delete(k) })
    return `/commission?${sp.toString()}`
  }

  function applyRange(range: string, from = customFrom, to = customTo) {
    const url = buildUrl({ dateRange: range, from: range === 'custom' ? from : '', to: range === 'custom' ? to : '' })
    router.push(url)
  }

  const fetchMonths = useCallback(async () => {
    setLoading(true)
    const { from, to } = getFromTo(dateRange, customFrom, customTo)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/client/commission/months?${params.toString()}`)
    if (res.ok) setMonths(await res.json())
    setLoading(false)
  }, [dateRange, customFrom, customTo])

  useEffect(() => { fetchMonths() }, [fetchMonths])

  const totalMarkup = months.reduce((s, m) => s + m.totalGrossMarkup, 0)

  const dateLabel = DATE_RANGE_OPTIONS.find(o => o.value === dateRange)?.label ?? 'All time'

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9]">Financials</h1>
          <p className="mt-1 text-sm text-[#6B7280] dark:text-[#94A3B8]">Monthly markup summary — {campaignName}</p>
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
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard label="Total Margin Generated (ex GST)" value={fmt(totalMarkup)} />
        <StatCard label="Total Margin (incl. GST)" value={fmt(totalMarkup * 1.15)} />
      </div>

      {/* Month cards */}
      {loading ? (
        <div className="text-sm text-[#6B7280] dark:text-[#94A3B8] py-8 text-center">Loading…</div>
      ) : months.length === 0 ? (
        <div className="text-center py-16 text-[#6B7280] dark:text-[#94A3B8]">
          <p className="text-lg font-medium">No completed jobs in this period.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {months.map(month => (
            <div key={month.monthKey} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <button onClick={() => setExpanded(prev => { const next = new Set(prev); next.has(month.monthKey) ? next.delete(month.monthKey) : next.add(month.monthKey); return next })} className="flex-1 text-left">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">{month.label}</h3>
                    <span className="text-[#6B7280] dark:text-[#94A3B8] text-sm">{expanded.has(month.monthKey) ? '▲' : '▼'}</span>
                  </div>
                  <div className="flex gap-4 mt-1 text-sm text-[#6B7280] dark:text-[#94A3B8]">
                    <span>{month.jobCount} jobs</span>
                    <span>Margin: <span className="font-semibold text-[#16A34A]">{fmt(month.totalGrossMarkup)}</span></span>
                    <span className="text-[#9CA3AF]">incl. GST: {fmt(month.totalGrossMarkup * 1.15)}</span>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <button
                      disabled
                      className="px-3 py-1.5 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#9CA3AF] dark:text-[#4B5563] cursor-not-allowed"
                    >
                      Send Invoice
                    </button>
                    <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-10 w-56">
                      <div className="bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] text-xs rounded-lg px-3 py-2 text-center shadow-lg">
                        {stripeVerified
                          ? 'Invoice sending coming soon'
                          : 'Connect Stripe in Settings to enable invoicing'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setInvoiceMonth(month)}
                    className="px-3 py-1.5 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors"
                  >
                    Generate Invoice
                  </button>
                </div>
              </div>

              {expanded.has(month.monthKey) && (
                <div className="border-t border-[#E5E7EB] dark:border-[#334155] overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F9FAFB] dark:bg-[#0F172A]">
                        <th className="text-left px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Quote #</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Customer</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Address</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Margin (ex GST)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {month.leads.map(lead => (
                        <tr
                          key={lead.quoteNumber}
                          onClick={() => router.push(`/leads/${lead.quoteNumber}?from=commission`)}
                          className="border-t border-[#F3F4F6] dark:border-[#1E293B] hover:bg-[#F0F7FF] dark:hover:bg-[#1e3a5f]/30 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-2 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{lead.quoteNumber}</td>
                          <td className="px-4 py-2 text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                          <td className="px-4 py-2 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{lead.propertyAddress}</td>
                          <td className="px-4 py-2 text-right font-semibold text-[#16A34A]">{fmt(lead.grossMarkup)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invoice modal */}
      {invoiceMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 no-print" onClick={() => setInvoiceMonth(null)} />
          <div className="relative bg-white dark:bg-[#1E293B] rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-10">
            <div id="client-invoice-content" className="p-8 font-mono text-sm">
              <div className="border-b-2 border-[#111827] dark:border-[#F1F5F9] pb-4 mb-4">
                <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9] mb-1">INVOICE</h1>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[#111827] dark:text-[#F1F5F9] mb-6">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">From:</dt>
                <dd>{clientCompanyName}</dd>
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">To:</dt>
                <dd>{subcontractorCompanyName}</dd>
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Date:</dt>
                <dd>{formatDate(new Date())}</dd>
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Period:</dt>
                <dd>{invoiceMonth.label}</dd>
              </dl>

              <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-4 mb-4">
                <div className="grid grid-cols-[auto_1fr_auto] gap-x-6 text-xs text-[#6B7280] dark:text-[#94A3B8] mb-2 font-bold uppercase">
                  <span>Quote #</span>
                  <span>Customer Name</span>
                  <span>Margin (ex GST)</span>
                </div>
                {invoiceMonth.leads.map(lead => (
                  <div key={lead.quoteNumber} className="grid grid-cols-[auto_1fr_auto] gap-x-6 text-sm py-1 border-b border-[#F3F4F6] dark:border-[#1E293B]">
                    <span className="text-[#374151] dark:text-[#CBD5E1]">{lead.quoteNumber}</span>
                    <span className="text-[#111827] dark:text-[#F1F5F9] truncate">{lead.customerName}</span>
                    <span className="font-semibold text-[#16A34A]">{fmt(lead.grossMarkup)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-[#111827] dark:border-[#F1F5F9] pt-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280] dark:text-[#94A3B8]">Subtotal (ex GST):</span>
                  <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(invoiceMonth.totalGrossMarkup)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280] dark:text-[#94A3B8]">GST (15%):</span>
                  <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(invoiceMonth.totalGrossMarkup * 0.15)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-[#E5E7EB] dark:border-[#334155] pt-2 mt-1">
                  <span className="text-[#111827] dark:text-[#F1F5F9]">Total (incl. GST):</span>
                  <span className="text-[#16A34A]">{fmt(invoiceMonth.totalGrossMarkup * 1.15)}</span>
                </div>
              </div>

              <p className="mt-8 text-xs text-[#6B7280] dark:text-[#94A3B8]">Jobbly by Omniside AI</p>
            </div>

            <div className="flex gap-3 justify-end px-8 pb-6 no-print">
              <button onClick={() => window.print()} className="px-4 py-2 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors">
                Print / Save as PDF
              </button>
              <button onClick={() => setInvoiceMonth(null)} className="px-4 py-2 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
