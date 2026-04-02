'use client'

import { useState } from 'react'
import Link from 'next/link'

interface DuplicateWarningBannerProps {
  quoteNumber: string
  confidence: string
  reason: string
  matchedQuoteNumber: string
  matchedCustomerName: string
  isAdmin: boolean
}

export default function DuplicateWarningBanner({
  quoteNumber,
  confidence,
  reason,
  matchedQuoteNumber,
  matchedCustomerName,
  isAdmin,
}: DuplicateWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  if (dismissed) return null

  async function handleDismiss() {
    setDismissing(true)
    try {
      await fetch(`/api/leads/${quoteNumber}/dismiss-duplicate`, { method: 'PATCH' })
      setDismissed(true)
    } catch {
      setDismissing(false)
    }
  }

  const isHigh = confidence === 'high'

  return (
    <div className={`mb-6 p-4 rounded-xl border ${isHigh ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700' : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-700'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div className="space-y-1">
            <p className={`text-sm font-semibold ${isHigh ? 'text-amber-800 dark:text-amber-300' : 'text-yellow-800 dark:text-yellow-300'}`}>
              {isHigh ? 'Possible duplicate lead' : 'Check for duplicate'}
            </p>
            <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
              {isHigh
                ? 'A lead for the same phone number and address already exists within the last 6 months:'
                : 'A lead with the same phone number already exists within the last 6 months:'}
            </p>
            <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
              <Link
                href={`/leads/${matchedQuoteNumber}`}
                className="font-medium text-[#2563EB] dark:text-[#3B82F6] hover:underline"
              >
                [{matchedQuoteNumber}]
              </Link>
              {' · '}{matchedCustomerName}
              {' · '}
              <Link
                href={`/leads/${matchedQuoteNumber}`}
                className="text-[#2563EB] dark:text-[#3B82F6] hover:underline text-xs"
              >
                View lead →
              </Link>
            </p>
            <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
              {isHigh ? 'Review both leads before actioning.' : 'This may be the same customer.'}
            </p>
            {!isAdmin && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{reason}</p>}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D1D5DB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors disabled:opacity-50"
          >
            {dismissing ? 'Dismissing…' : 'Dismiss warning'}
          </button>
        )}
      </div>
    </div>
  )
}
