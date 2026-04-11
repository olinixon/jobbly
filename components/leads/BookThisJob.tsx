'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface BookThisJobProps {
  quoteNumber: string
}

export default function BookThisJob({ quoteNumber }: BookThisJobProps) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function setToday() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
    setDate(today)
    setError('')
  }

  async function handleSubmit() {
    if (!date) {
      setError('Please select the booked job date before submitting.')
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

  return (
    <>
      {success && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold shadow-lg">
          Well done on getting the job booked! 🎉
        </div>
      )}

      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Book This Job</h2>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">
            Booked Job Date
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setError('') }}
              className="flex-1 px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <button
              type="button"
              onClick={setToday}
              className="px-4 py-2 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors whitespace-nowrap"
            >
              Today
            </button>
          </div>
          {error && <p className="text-sm text-[#DC2626]">{error}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving…' : 'Job Booked'}
          </button>
        </div>
      </div>
    </>
  )
}
