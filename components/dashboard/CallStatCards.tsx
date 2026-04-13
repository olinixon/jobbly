'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface CallStatCardsProps {
  from?: string
  to?: string
}

interface CallStats {
  totalCalls: number
  answered: number
  notInterested: number
  transferAttempted: number
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm animate-pulse">
      <div className="h-4 w-24 bg-[#E5E7EB] dark:bg-[#334155] rounded mb-3" />
      <div className="h-7 w-16 bg-[#E5E7EB] dark:bg-[#334155] rounded" />
    </div>
  )
}

function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="ml-1.5 text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-[#F1F5F9] transition-colors disabled:opacity-40"
      title="Refresh"
    >
      <svg
        className={`w-3 h-3${loading ? ' animate-spin' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  )
}

export default function CallStatCards({ from, to }: CallStatCardsProps) {
  const [stats, setStats] = useState<CallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)

  const doFetch = useCallback(async (showSkeleton: boolean) => {
    if (!showSkeleton && inFlight.current) return
    inFlight.current = true
    setError(false)
    if (showSkeleton) setLoading(true)
    else setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const qs = params.toString()
      const res = await fetch(`/api/call-stats${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setStats(data)
    } catch {
      if (showSkeleton) setError(true)
    } finally {
      inFlight.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [from, to])

  // Fetch (with skeleton) on mount and when filter params change
  useEffect(() => {
    doFetch(true)
  }, [doFetch])

  // Silent background refresh every 15 minutes
  useEffect(() => {
    const id = setInterval(() => doFetch(false), 15 * 60_000)
    return () => clearInterval(id)
  }, [doFetch])

  const label = (
    <div className="flex items-center mb-2">
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Call Activity</p>
      <RefreshButton loading={refreshing} onClick={() => doFetch(false)} />
    </div>
  )

  if (loading) {
    return (
      <div>
        {label}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div>
        {label}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {['Total Calls', 'Answered', 'Not Interested', 'Transfer Attempted'].map(l => (
            <div key={l} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{l}</p>
              <p className="mt-1 text-sm text-[#9CA3AF] dark:text-[#64748B]">Call data unavailable</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const cards = [
    { label: 'Total Calls', value: stats.totalCalls },
    { label: 'Answered', value: stats.answered },
    { label: 'Not Interested', value: stats.notInterested },
    { label: 'Transfer Attempted', value: stats.transferAttempted },
  ]

  return (
    <div>
      {label}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#111827] dark:text-[#F1F5F9]">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
