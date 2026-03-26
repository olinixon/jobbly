'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DashboardFiltersProps {
  campaignId: string
  search: string
  status: string
  dateRange: string
  from: string
  to: string
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

export default function DashboardFilters({ campaignId, search, status, dateRange, from, to }: DashboardFiltersProps) {
  const router = useRouter()
  const [selectedRange, setSelectedRange] = useState(dateRange)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const params = new URLSearchParams()
    if (campaignId) params.set('campaignId', campaignId)
    const s = data.get('search') as string
    const st = data.get('status') as string
    const dr = data.get('dateRange') as string
    const f = data.get('from') as string
    const t = data.get('to') as string
    if (s) params.set('search', s)
    if (st) params.set('status', st)
    if (dr && dr !== 'all-time') params.set('dateRange', dr)
    if (dr === 'custom' && f) params.set('from', f)
    if (dr === 'custom' && t) params.set('to', t)
    router.push(`/dashboard?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 mb-4">
      <input name="campaignId" type="hidden" value={campaignId} />
      <input
        name="search"
        defaultValue={search}
        placeholder="Search by quote, name, or address…"
        className="flex-1 min-w-48 px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
      />
      <select
        name="status"
        defaultValue={status}
        className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
      >
        <option value="">All Statuses</option>
        <option value="LEAD_RECEIVED">Lead Received</option>
        <option value="QUOTE_SENT">Quote Sent</option>
        <option value="JOB_BOOKED">Job Booked</option>
        <option value="JOB_COMPLETED">Job Completed</option>
      </select>
      <select
        name="dateRange"
        value={selectedRange}
        onChange={e => setSelectedRange(e.target.value)}
        className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
      >
        {DATE_RANGE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {selectedRange === 'custom' && (
        <>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </>
      )}
      <button
        type="submit"
        className="px-4 py-2 text-sm font-medium bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8]"
      >
        Filter
      </button>
    </form>
  )
}
