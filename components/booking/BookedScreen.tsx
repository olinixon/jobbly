'use client'

import { useState } from 'react'
import BookingFlow, { type QuoteOption } from '@/components/booking/BookingFlow'
import { generateCalendarLinks } from '@/lib/generateCalendarLinks'

function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

interface BookedScreenProps {
  token: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  quoteUrl: string | null
  bookingDate: string   // formatted NZ date string
  windowStart: string   // "07:00"
  windowEnd: string     // "09:00"
  slotDateNZ: string    // "2026-04-05"
  bookingId: string
  preSelectedJobTypeId: string | null
  quoteOptions: QuoteOption[] | null
  fallbackOptions: QuoteOption[]
}

export default function BookedScreen({
  token,
  quoteNumber,
  customerName,
  propertyAddress,
  quoteUrl,
  bookingDate,
  windowStart,
  windowEnd,
  slotDateNZ,
  bookingId,
  preSelectedJobTypeId,
  quoteOptions,
  fallbackOptions,
}: BookedScreenProps) {
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduled, setRescheduled] = useState(false)
  const [oldBooking, setOldBooking] = useState<{ date: string; window_start: string; window_end: string } | null>(null)
  const [rescheduleError, setRescheduleError] = useState('')

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const calendarLinks = generateCalendarLinks({
    bookingToken: token,
    bookingId,
    windowStartNZ: windowStart,
    windowEndNZ: windowEnd,
    slotDateNZ,
    propertyAddress,
    quoteNumber,
    jobTypeName: 'Gutter Clean',
    appUrl,
  })

  // Find pre-selected option
  const options = quoteOptions ?? fallbackOptions
  const preSelectedOption = preSelectedJobTypeId
    ? (options.find(o => o.job_type_id === preSelectedJobTypeId) ?? options[0] ?? null)
    : (options[0] ?? null)

  async function handleReschedule() {
    setRescheduling(true)
    setRescheduleError('')
    try {
      const res = await fetch(`/api/book/${token}/reschedule`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        setRescheduleError(d.error ?? 'Could not reschedule. Please try again.')
        setRescheduling(false)
        return
      }
      const data = await res.json()
      setOldBooking(data.old_booking)
      setRescheduled(true)
    } catch {
      setRescheduleError('Could not reschedule. Please try again.')
    }
    setRescheduling(false)
  }

  // After reschedule: show booking flow
  if (rescheduled) {
    return (
      <BookingFlow
        token={token}
        quoteNumber={quoteNumber}
        customerName={customerName}
        propertyAddress={propertyAddress}
        quoteUrl={quoteUrl}
        quoteOptions={quoteOptions}
        fallbackOptions={fallbackOptions}
        initialSelectedOption={preSelectedOption}
        isReschedule={true}
        oldBooking={oldBooking ?? undefined}
      />
    )
  }

  return (
    <div className="max-w-sm w-full bg-white rounded-2xl border border-[#E4E4E7] p-8 text-center shadow-sm">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-[#18181b] mb-4">Your job is booked</h1>
      <div className="text-left space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-[#71717A]">Date</span>
          <span className="font-medium text-[#18181b]">{bookingDate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#71717A]">Time</span>
          <span className="font-medium text-[#18181b]">{fmt12h(windowStart)} – {fmt12h(windowEnd)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#71717A]">Address</span>
          <span className="font-medium text-[#18181b] text-right ml-4">{propertyAddress}</span>
        </div>
      </div>

      {/* Add to Calendar */}
      <div className="mt-5 pt-4 border-t border-[#F4F4F5]">
        <p className="text-xs text-[#71717A] mb-2">Add to your calendar:</p>
        <div className="flex justify-center gap-2 flex-wrap">
          <a
            href={calendarLinks.google}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs border border-[#E4E4E7] rounded-lg text-[#18181b] hover:bg-[#F4F4F5] transition-colors"
          >
            Google
          </a>
          <a
            href={calendarLinks.apple_ics}
            className="px-3 py-1.5 text-xs border border-[#E4E4E7] rounded-lg text-[#18181b] hover:bg-[#F4F4F5] transition-colors"
          >
            Apple
          </a>
          <a
            href={calendarLinks.outlook}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs border border-[#E4E4E7] rounded-lg text-[#18181b] hover:bg-[#F4F4F5] transition-colors"
          >
            Outlook
          </a>
        </div>
      </div>

      {/* Reschedule */}
      <div className="mt-4 pt-3 border-t border-[#F4F4F5]">
        {rescheduleError && <p className="text-xs text-red-600 mb-2">{rescheduleError}</p>}
        <button
          onClick={handleReschedule}
          disabled={rescheduling}
          className="text-sm text-[#71717A] hover:text-[#18181b] transition-colors underline disabled:opacity-50"
        >
          {rescheduling ? 'Processing…' : 'Need to change your time? Reschedule my booking'}
        </button>
      </div>

      <p className="text-xs text-[#A1A1AA] mt-3">You're all set — you can close this tab now.</p>
    </div>
  )
}
