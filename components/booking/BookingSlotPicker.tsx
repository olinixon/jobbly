'use client'

import { useState, useEffect, useCallback } from 'react'

interface Window {
  windowStart: string
  windowEnd: string
  available: boolean
  heldByMe: boolean
  heldUntil: string | null
}

interface Slot {
  id: string
  date: string
  windows: Window[]
}

interface BookingSlotPickerProps {
  jobTypeId?: string
  token: string
  jobTypeName: string
  durationMinutes: number
  initialSlots: Slot[]
  isReschedule?: boolean
  oldBooking?: { date: string; window_start: string; window_end: string }
}

function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h} hour${h !== 1 ? 's' : ''}`
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function BookingSlotPicker({ token, jobTypeName, durationMinutes, initialSlots, jobTypeId, isReschedule, oldBooking }: BookingSlotPickerProps) {
  const [slots, setSlots] = useState<Slot[]>(initialSlots)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [selectedWindow, setSelectedWindow] = useState<{ windowStart: string; windowEnd: string } | null>(null)
  const [holding, setHolding] = useState(false)
  const [holdExpiry, setHoldExpiry] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<{ bookingDate: string; windowStart: string; windowEnd: string } | null>(null)

  const holdExpired = holdExpiry ? holdExpiry <= new Date() : false

  // Countdown timer
  useEffect(() => {
    if (!holdExpiry) { setCountdown(''); return }
    const interval = setInterval(() => {
      const remaining = holdExpiry.getTime() - Date.now()
      if (remaining <= 0) {
        setCountdown('0:00')
        setHoldExpiry(null)
        setSelectedWindow(null)
        setSelectedSlotId(null)
        clearInterval(interval)
      } else {
        setCountdown(formatCountdown(remaining))
      }
    }, 500)
    return () => clearInterval(interval)
  }, [holdExpiry])

  const refreshSlots = useCallback(async () => {
    try {
      const slotsUrl = jobTypeId ? `/api/book/${token}/slots?job_type_id=${jobTypeId}` : `/api/book/${token}/slots`
      const res = await fetch(slotsUrl)
      if (res.ok) {
        const data = await res.json()
        setSlots(data.slots)
      }
    } catch {
      // ignore
    }
  }, [token, jobTypeId])

  // Fetch slots on mount (and whenever jobTypeId changes)
  useEffect(() => {
    refreshSlots()
  }, [refreshSlots])

  async function selectWindow(slotId: string, window: Window) {
    if (!window.available) return
    setHolding(true)
    setError('')

    try {
      const res = await fetch(`/api/book/${token}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, windowStart: window.windowStart, windowEnd: window.windowEnd }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to reserve this time slot. Please try again.')
        await refreshSlots()
        setHolding(false)
        return
      }

      setSelectedSlotId(slotId)
      setSelectedWindow({ windowStart: window.windowStart, windowEnd: window.windowEnd })
      setHoldExpiry(new Date(data.heldUntil))
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setHolding(false)
  }

  async function confirmBooking() {
    if (!selectedSlotId || !selectedWindow) return
    setConfirming(true)
    setError('')

    try {
      const confirmBody: Record<string, unknown> = {
        slotId: selectedSlotId,
        ...selectedWindow,
        job_type_id: jobTypeId ?? null,
      }
      if (isReschedule) {
        confirmBody.is_reschedule = true
        if (oldBooking) {
          confirmBody.old_date = oldBooking.date
          confirmBody.old_window_start = oldBooking.window_start
          confirmBody.old_window_end = oldBooking.window_end
        }
      }
      const res = await fetch(`/api/book/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmBody),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Booking failed. Please try again.')
        if (res.status === 409) {
          // Hold expired or slot taken — reset selection
          setSelectedWindow(null)
          setSelectedSlotId(null)
          setHoldExpiry(null)
          await refreshSlots()
        }
        setConfirming(false)
        return
      }

      setConfirmed({ bookingDate: data.bookingDate, windowStart: data.windowStart, windowEnd: data.windowEnd })
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setConfirming(false)
  }

  if (confirmed) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#111827] mb-2">Your job is booked</h2>
        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-5 text-left max-w-sm mx-auto mt-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-[#6B7280]">Date</span><span className="font-medium text-[#111827]">{confirmed.bookingDate}</span></div>
          <div className="flex justify-between text-sm"><span className="text-[#6B7280]">Time</span><span className="font-medium text-[#111827]">{confirmed.windowStart} – {confirmed.windowEnd}</span></div>
          <div className="flex justify-between text-sm"><span className="text-[#6B7280]">Job type</span><span className="font-medium text-[#111827]">{jobTypeName}</span></div>
        </div>
        <p className="text-sm text-[#6B7280] mt-4">We'll see you then. If you need to make any changes, please contact us.</p>
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[#374151] font-medium mb-1">No times are currently available for booking.</p>
        <p className="text-sm text-[#6B7280]">Please contact us to arrange a time.</p>
      </div>
    )
  }

  return (
    <div>
      {isReschedule && oldBooking && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <p className="font-medium text-blue-800">You are rescheduling your booking.</p>
          <p className="text-blue-700 mt-0.5">Your previous time was {oldBooking.date} at {fmt12h(oldBooking.window_start)} – {fmt12h(oldBooking.window_end)}.</p>
          <p className="text-blue-600 mt-0.5">Pick a new time below.</p>
        </div>
      )}
      <h2 className="text-lg font-semibold text-[#111827] mb-1">Choose a time that works for you</h2>
      <p className="text-sm text-[#6B7280] mb-4">{jobTypeName} — {formatDuration(durationMinutes)} slot</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {selectedWindow && holdExpiry && !holdExpired && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <div className="flex items-center justify-between">
            <span className="text-amber-800 font-medium">
              Reserved for you for <span className="font-bold">{countdown}</span>
            </span>
            <button
              onClick={() => { setSelectedWindow(null); setSelectedSlotId(null); setHoldExpiry(null) }}
              className="text-xs text-amber-600 hover:text-amber-800 underline"
            >
              Change
            </button>
          </div>
          <p className="text-amber-700 mt-1">
            {fmt12h(selectedWindow.windowStart)} – {fmt12h(selectedWindow.windowEnd)}
          </p>
        </div>
      )}

      <div className="space-y-6 mb-6">
        {slots.map(slot => (
          <div key={slot.id}>
            <p className="text-sm font-semibold text-[#374151] mb-2">{formatDate(slot.date)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {slot.windows.map((w: Window) => {
                const isSelected = selectedSlotId === slot.id && selectedWindow?.windowStart === w.windowStart && selectedWindow?.windowEnd === w.windowEnd
                return (
                  <button
                    key={`${w.windowStart}-${w.windowEnd}`}
                    onClick={() => !isSelected && w.available && selectWindow(slot.id, w)}
                    disabled={!w.available || holding || confirming}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all text-center ${
                      isSelected
                        ? 'border-[#2563EB] bg-[#2563EB] text-white'
                        : w.available
                          ? 'border-[#E5E7EB] bg-white text-[#374151] hover:border-[#2563EB] hover:bg-blue-50 cursor-pointer'
                          : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF] cursor-not-allowed'
                    }`}
                  >
                    {fmt12h(w.windowStart)} – {fmt12h(w.windowEnd)}
                    {!w.available && (
                      <span className="block text-xs mt-0.5 font-normal">Temporarily unavailable</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={confirmBooking}
        disabled={!selectedWindow || !holdExpiry || holdExpired || confirming || holding}
        className="w-full py-3 px-6 rounded-xl bg-[#18181b] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#27272a] transition-colors"
      >
        {confirming ? 'Confirming…' : 'Confirm Booking'}
      </button>
    </div>
  )
}
