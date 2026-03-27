'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [localSearch, setLocalSearch] = useState(search)
  const [localStatus, setLocalStatus] = useState(status)
  const [localRange, setLocalRange] = useState(dateRange)
  const [localFrom, setLocalFrom] = useState(from)
  const [localTo, setLocalTo] = useState(to)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  function buildUrl(overrides: Partial<{ search: string; status: string; range: string; from: string; to: string }> = {}) {
    const s = overrides.search ?? localSearch
    const st = overrides.status ?? localStatus
    const dr = overrides.range ?? localRange
    const f = overrides.from ?? localFrom
    const t = overrides.to ?? localTo
    const params = new URLSearchParams()
    if (campaignId) params.set('campaignId', campaignId)
    if (s) params.set('search', s)
    if (st) params.set('status', st)
    if (dr && dr !== 'all-time') params.set('dateRange', dr)
    if (dr === 'custom' && f) params.set('from', f)
    if (dr === 'custom' && t) params.set('to', t)
    return `/dashboard?${params.toString()}`
  }

  // Auto-apply status and date range immediately on change
  function handleStatusChange(val: string) {
    setLocalStatus(val)
    router.push(buildUrl({ status: val }))
  }

  function handleRangeChange(val: string) {
    setLocalRange(val)
    // Don't navigate yet if switching to custom — wait for both dates
    if (val !== 'custom') {
      router.push(buildUrl({ range: val, from: '', to: '' }))
    }
  }

  function handleFromChange(val: string) {
    setLocalFrom(val)
    if (localTo) {
      router.push(buildUrl({ from: val }))
    }
  }

  function handleToChange(val: string) {
    setLocalTo(val)
    if (localFrom) {
      router.push(buildUrl({ to: val }))
    }
  }

  // Debounce search — 400ms
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      router.push(buildUrl({ search: localSearch }))
    }, 400)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [localSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectCls = "px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        value={localSearch}
        onChange={e => setLocalSearch(e.target.value)}
        placeholder="Search by quote, name, or address…"
        className="flex-1 min-w-48 px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
      />
      <select value={localStatus} onChange={e => handleStatusChange(e.target.value)} className={selectCls}>
        <option value="">All Statuses</option>
        <option value="NEEDS_ACTION">⚡ Needs Action</option>
        <option value="LEAD_RECEIVED">Lead Received</option>
        <option value="QUOTE_SENT">Quote Sent</option>
        <option value="JOB_BOOKED">Job Booked</option>
        <option value="JOB_COMPLETED">Job Completed</option>
      </select>
      <select value={localRange} onChange={e => handleRangeChange(e.target.value)} className={selectCls}>
        {DATE_RANGE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {localRange === 'custom' && (
        <>
          <input
            type="date"
            value={localFrom}
            onChange={e => handleFromChange(e.target.value)}
            className={selectCls}
          />
          <input
            type="date"
            value={localTo}
            onChange={e => handleToChange(e.target.value)}
            className={selectCls}
          />
        </>
      )}
    </div>
  )
}
