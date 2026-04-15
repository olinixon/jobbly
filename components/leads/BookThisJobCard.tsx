'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface BookThisJobCardProps {
  quoteNumber: string
  showNotConverted?: boolean
}

export default function BookThisJobCard({ quoteNumber, showNotConverted = true }: BookThisJobCardProps) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Not Converted modal state
  const [showModal, setShowModal] = useState(false)
  const [ncReason, setNcReason] = useState('')
  const [ncLoading, setNcLoading] = useState(false)
  const [ncError, setNcError] = useState('')

  function setToday() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
    setDate(today)
    setError('')
  }

  async function handleSubmit() {
    if (!date) {
      setError('Please select the booked job date.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/jobs/${quoteNumber}/book`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_booked_date: date }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Something went wrong.')
        return
      }
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        router.refresh()
      }, 4000)
    } finally {
      setLoading(false)
    }
  }

  async function handleNotConverted() {
    setNcLoading(true)
    setNcError('')
    try {
      const res = await fetch(`/api/jobs/${quoteNumber}/not-converted`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: ncReason }),
      })
      if (!res.ok) {
        const d = await res.json()
        setNcError(d.error ?? 'Something went wrong.')
        return
      }
      setShowModal(false)
      router.refresh()
    } finally {
      setNcLoading(false)
    }
  }

  return (
    <>
      {success && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold shadow-lg">
          Well done on getting the job booked! 🎉
        </div>
      )}

      {/* Not Converted confirmation modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-xl w-full max-w-sm">
            <h3 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-2">Mark as Not Converted?</h3>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
              This lead will be closed out and removed from the active queue.
            </p>
            <label className="block text-sm text-[#374151] dark:text-[#CBD5E1] mb-1">
              Reason <span className="text-[#9CA3AF]">(optional)</span>
            </label>
            <input
              type="text"
              value={ncReason}
              onChange={e => { setNcReason(e.target.value.slice(0, 200)); setNcError('') }}
              placeholder="e.g. Not interested, wrong number, no answer"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB] mb-3"
            />
            {ncError && <p className="text-xs text-[#DC2626] mb-3">{ncError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowModal(false); setNcReason(''); setNcError('') }}
                disabled={ncLoading}
                className="px-4 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#0F172A] disabled:opacity-60 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNotConverted}
                disabled={ncLoading}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#374151] text-white hover:bg-[#1F2937] disabled:opacity-60 transition-colors"
              >
                {ncLoading ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Actions</h2>

        <div className="border-t border-[#F3F4F6] dark:border-[#334155] pt-4 space-y-3">
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Book this job</p>

          {/* Desktop: date + Today on one row. Mobile: stacked */}
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <label className="text-sm text-[#374151] dark:text-[#CBD5E1] md:whitespace-nowrap">Job date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setError('') }}
              className="w-full md:w-36 px-3 py-1.5 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <button
              type="button"
              onClick={setToday}
              className="w-full md:w-auto px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors whitespace-nowrap"
            >
              Today
            </button>
          </div>
          {error && <p className="text-xs text-[#DC2626]">{error}</p>}

          {/* Job Booked button — right-aligned on desktop, full width on mobile */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full md:w-auto px-5 py-2 text-sm font-semibold rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving…' : 'Job Booked'}
            </button>
          </div>
        </div>

        {showNotConverted && (
          <>
            <div className="border-t border-[#F3F4F6] dark:border-[#334155] mt-4 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="px-4 py-2 text-sm border border-[#D1D5DB] dark:border-[#4B5563] rounded-lg text-[#6B7280] dark:text-[#94A3B8] hover:bg-[#F3F4F6] dark:hover:bg-[#0F172A] transition-colors"
              >
                Mark as Not Converted
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
