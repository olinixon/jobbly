'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface JobsFiltersProps {
  search: string
  status: string
  needsActionCount: number
}

export default function JobsFilters({ search, status, needsActionCount }: JobsFiltersProps) {
  const router = useRouter()
  const [localSearch, setLocalSearch] = useState(search)
  const [localStatus, setLocalStatus] = useState(status === 'NEEDS_ACTION' ? '' : status)
  const needsActionActive = status === 'NEEDS_ACTION'
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  function buildUrl(overrides: Partial<{ search: string; status: string }> = {}) {
    const s = overrides.search ?? localSearch
    const st = overrides.status ?? localStatus
    const params = new URLSearchParams()
    if (s) params.set('search', s)
    if (st) params.set('status', st)
    return `/jobs?${params.toString()}`
  }

  function handleNeedsActionClick() {
    if (needsActionActive) {
      router.push(buildUrl({ status: '' }))
    } else {
      setLocalStatus('')
      router.push(buildUrl({ status: 'NEEDS_ACTION' }))
    }
  }

  function handleStatusChange(val: string) {
    setLocalStatus(val)
    router.push(buildUrl({ status: val }))
  }

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
    <div className="flex flex-wrap gap-3 mb-4 items-center">
      <input
        value={localSearch}
        onChange={e => setLocalSearch(e.target.value)}
        placeholder="Search by quote number or customer…"
        className="flex-1 min-w-48 px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
      />
      <button
        onClick={handleNeedsActionClick}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap ${
          needsActionActive
            ? 'bg-amber-500 border-amber-500 text-white'
            : 'border-amber-400 text-amber-600 dark:text-amber-400 bg-white dark:bg-[#0F172A] hover:bg-amber-50 dark:hover:bg-amber-950/20'
        }`}
      >
        ⚡ Needs Action{needsActionCount > 0 && ` (${needsActionCount})`}
      </button>
      <select value={localStatus} onChange={e => handleStatusChange(e.target.value)} className={selectCls}>
        <option value="">All Statuses</option>
        <option value="LEAD_RECEIVED">Lead Received</option>
        <option value="QUOTE_SENT">Quote Sent</option>
        <option value="NOT_CONVERTED">Not Converted</option>
      </select>
    </div>
  )
}
