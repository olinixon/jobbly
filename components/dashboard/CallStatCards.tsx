'use client'

import { useEffect, useState } from 'react'

interface CallStatCardsProps {
  from?: string // ISO date string — passed down from dashboard date range filter state
  to?: string   // ISO date string — passed down from dashboard date range filter state
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

export default function CallStatCards({ from, to }: CallStatCardsProps) {
  const [stats, setStats] = useState<CallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchStats() {
      setLoading(true)
      setError(false)
      try {
        const params = new URLSearchParams()
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        const qs = params.toString()
        const res = await fetch(`/api/call-stats${qs ? `?${qs}` : ''}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        if (!cancelled) setStats(data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()
    return () => { cancelled = true }
  }, [from, to])

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['Total Calls', 'Answered', 'Not Interested', 'Transfer Attempted'].map(label => (
          <div key={label} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{label}</p>
            <p className="mt-1 text-sm text-[#9CA3AF] dark:text-[#64748B]">Call data unavailable</p>
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    { label: 'Total Calls', value: stats.totalCalls, icon: '📞' },
    { label: 'Answered', value: stats.answered, icon: '✅' },
    { label: 'Not Interested', value: stats.notInterested, icon: '👎' },
    { label: 'Transfer Attempted', value: stats.transferAttempted, icon: '↗️' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(card => (
        <div key={card.label} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{card.icon} {card.label}</p>
          <p className="mt-1 text-2xl font-semibold text-[#111827] dark:text-[#F1F5F9]">{card.value}</p>
        </div>
      ))}
    </div>
  )
}
