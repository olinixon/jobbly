'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface FinancialStats {
  totalCustomerRevenue: number
  campaignRevenue: number
  commissionEarned: number
  commissionPending: number
}

interface Props {
  initialStats: FinancialStats
  isAdmin: boolean
  campaignId: string
  dateRange: string
  from: string
  to: string
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

export default function FinancialsStatCards({ initialStats, isAdmin, campaignId, dateRange, from, to }: Props) {
  const [stats, setStats] = useState(initialStats)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (campaignId) params.set('campaignId', campaignId)
      if (dateRange && dateRange !== 'all-time') params.set('dateRange', dateRange)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/dashboard-stats?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setStats({
        totalCustomerRevenue: data.totalCustomerRevenue,
        campaignRevenue: data.campaignRevenue,
        commissionEarned: data.commissionEarned,
        commissionPending: data.commissionPending,
      })
    } finally {
      inFlight.current = false
      setRefreshing(false)
    }
  }, [campaignId, dateRange, from, to])

  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div>
      <div className="flex items-center mb-2">
        <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Financials</p>
        <RefreshButton loading={refreshing} onClick={refresh} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Total Billed to Customers (ex GST)</p>
          <p className="mt-1 text-2xl font-semibold text-[#111827] dark:text-[#F1F5F9]">${stats.totalCustomerRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Our Margin (ex GST)</p>
          <p className="mt-1 text-2xl font-semibold text-[#111827] dark:text-[#F1F5F9]">${stats.campaignRevenue.toFixed(2)}</p>
        </div>
        {isAdmin && (
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Commission Received (ex GST)</p>
            <p className="mt-1 text-2xl font-semibold text-[#111827] dark:text-[#F1F5F9]">${stats.commissionEarned.toFixed(2)}</p>
          </div>
        )}
        {isAdmin && (
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Commission Owed to Me (ex GST)</p>
            <p className="mt-1 text-2xl font-semibold text-[#111827] dark:text-[#F1F5F9]">${stats.commissionPending.toFixed(2)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
