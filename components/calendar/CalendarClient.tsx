'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarBooking {
  id: string
  windowStart: string
  windowEnd: string
  lead: {
    quoteNumber: string
    customerName: string
    propertyAddress: string
    jobType: { name: string; durationMinutes: number } | null
  }
}

interface CalendarSlot {
  id: string
  date: string  // ISO string
  startTime: string
  endTime: string
  notes: string | null
  bookings: CalendarBooking[]
}

type ViewMode = 'month' | 'week' | 'day'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6) // 6am–8pm

function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day // adjust so Mon=start
  return addDays(d, diff)
}

function nzDateLabel(d: Date): string {
  return d.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' })
}

// ─── CalendarClient ───────────────────────────────────────────────────────────

interface UpcomingBooking {
  slotDate: string
  windowStart: string
  windowEnd: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  jobTypeName: string | null
}

export default function CalendarClient() {
  const [view, setView] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [slots, setSlots] = useState<CalendarSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([])
  const [panelOpen, setPanelOpen] = useState(true)
  const [showMobilePanel, setShowMobilePanel] = useState(false)

  // Build from/to based on current view
  function getRange(): { from: Date; to: Date } {
    if (view === 'month') {
      const y = anchor.getFullYear()
      const m = anchor.getMonth()
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) }
    } else if (view === 'week') {
      const mon = startOfWeek(anchor)
      return { from: mon, to: addDays(mon, 6) }
    } else {
      return { from: anchor, to: anchor }
    }
  }

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRange()
    try {
      const res = await fetch(`/api/calendar?from=${isoDate(from)}&to=${isoDate(to)}`)
      if (res.ok) {
        const data = await res.json()
        setSlots(data.slots ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [anchor, view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch upcoming bookings (today to today+90 days)
  const fetchUpcoming = useCallback(async () => {
    const todayDate = new Date()
    const futureDate = addDays(todayDate, 90)
    try {
      const res = await fetch(`/api/calendar?from=${isoDate(todayDate)}&to=${isoDate(futureDate)}`)
      if (!res.ok) return
      const data = await res.json()
      const allSlots: CalendarSlot[] = data.slots ?? []
      const todayStr = isoDate(todayDate)
      const bookings: UpcomingBooking[] = []
      for (const slot of allSlots) {
        const slotDate = slot.date.split('T')[0]
        if (slotDate < todayStr) continue
        for (const b of slot.bookings) {
          bookings.push({
            slotDate,
            windowStart: b.windowStart,
            windowEnd: b.windowEnd,
            quoteNumber: b.lead.quoteNumber,
            customerName: b.lead.customerName,
            propertyAddress: b.lead.propertyAddress,
            jobTypeName: b.lead.jobType?.name ?? null,
          })
        }
      }
      bookings.sort((a, b) => {
        if (a.slotDate !== b.slotDate) return a.slotDate < b.slotDate ? -1 : 1
        return toMinutes(a.windowStart) - toMinutes(b.windowStart)
      })
      setUpcomingBookings(bookings)
    } catch {
      // silently ignore
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchSlots() }, [fetchSlots])
  useEffect(() => { fetchUpcoming() }, [fetchUpcoming])

  function navigate(delta: number) {
    setAnchor(prev => {
      const d = new Date(prev)
      if (view === 'month') d.setMonth(d.getMonth() + delta)
      else if (view === 'week') d.setDate(d.getDate() + delta * 7)
      else d.setDate(d.getDate() + delta)
      return d
    })
  }

  function periodLabel(): string {
    if (view === 'month') {
      return anchor.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'long', year: 'numeric' })
    } else if (view === 'week') {
      const mon = startOfWeek(anchor)
      const sun = addDays(mon, 6)
      return `${shortDate(mon)} – ${shortDate(sun)} ${sun.getFullYear()}`
    } else {
      return nzDateLabel(anchor)
    }
  }

  // Build a lookup: date string → slot
  const slotByDate: Record<string, CalendarSlot[]> = {}
  for (const slot of slots) {
    const key = slot.date.split('T')[0]
    if (!slotByDate[key]) slotByDate[key] = []
    slotByDate[key].push(slot)
  }

  const today = isoDate(new Date())
  const selectedDaySlots = selectedDay ? (slotByDate[selectedDay] ?? []) : []

  return (
    <div className="flex gap-6">
      {/* Main calendar area */}
      <div className="flex-1 min-w-0">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="px-3 py-1.5 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] hover:bg-[#F3F4F6] dark:hover:bg-[#334155]">←</button>
            <button onClick={() => setAnchor(new Date())} className="px-3 py-1.5 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] hover:bg-[#F3F4F6] dark:hover:bg-[#334155]">Today</button>
            <button onClick={() => navigate(1)} className="px-3 py-1.5 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] hover:bg-[#F3F4F6] dark:hover:bg-[#334155]">→</button>
            <span className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9] ml-2">{periodLabel()}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile upcoming toggle */}
            <button
              onClick={() => setShowMobilePanel(!showMobilePanel)}
              className="md:hidden px-3 py-1.5 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] hover:bg-[#F3F4F6] dark:hover:bg-[#334155]"
            >
              Upcoming
            </button>
            <div className="flex border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
              {(['month', 'week', 'day'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-1.5 text-sm font-medium capitalize ${view === v ? 'bg-[#2563EB] text-white' : 'bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155]'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile upcoming panel */}
        {showMobilePanel && (
          <div className="md:hidden mb-4">
            <UpcomingPanel bookings={upcomingBookings} />
          </div>
        )}

        {loading && <div className="text-sm text-[#6B7280] mb-2">Loading…</div>}

        {view === 'month' && (
          <MonthView
            anchor={anchor}
            slotByDate={slotByDate}
            today={today}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}
        {view === 'week' && (
          <WeekView anchor={anchor} slotByDate={slotByDate} today={today} />
        )}
        {view === 'day' && (
          <DayView date={anchor} slotByDate={slotByDate} today={today} />
        )}
      </div>

      {/* Day detail panel (month view) */}
      {view === 'month' && selectedDay && (
        <DayDetailPanel
          dateStr={selectedDay}
          slots={selectedDaySlots}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Upcoming bookings panel — desktop */}
      <div className="hidden md:block shrink-0">
        {panelOpen ? (
          <div className="w-64">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Upcoming Bookings</span>
              <button onClick={() => setPanelOpen(false)} className="text-xs text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#CBD5E1] transition-colors">
                → Hide
              </button>
            </div>
            <UpcomingPanel bookings={upcomingBookings} />
          </div>
        ) : (
          <div className="flex flex-col items-center pt-8">
            <button
              onClick={() => setPanelOpen(true)}
              className="text-xs text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#CBD5E1] transition-colors rotate-90 whitespace-nowrap"
            >
              ← Show
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  anchor,
  slotByDate,
  today,
  selectedDay,
  onSelectDay,
}: {
  anchor: Date
  slotByDate: Record<string, CalendarSlot[]>
  today: string
  selectedDay: string | null
  onSelectDay: (d: string) => void
}) {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const firstDay = new Date(y, m, 1)
  const lastDay = new Date(y, m + 1, 0)

  // Pad start of grid to Monday
  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  const days: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(y, m, d))
  }
  while (days.length % 7 !== 0) days.push(null)

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[#E5E7EB] dark:border-[#334155]">
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-[#6B7280] dark:text-[#94A3B8]">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="border-b border-r border-[#F3F4F6] dark:border-[#334155] h-24 bg-[#F9FAFB] dark:bg-[#0F172A]" />
          const key = isoDate(day)
          const daySlots = slotByDate[key] ?? []
          const allBookings = daySlots.flatMap(s => s.bookings)
          const isToday = key === today
          const isPast = key < today
          const isSelected = key === selectedDay
          const hasSlots = daySlots.length > 0
          const hasBookings = allBookings.length > 0

          return (
            <div
              key={key}
              onClick={() => (hasSlots || hasBookings) && onSelectDay(key)}
              className={`border-b border-r border-[#F3F4F6] dark:border-[#334155] h-24 p-1.5 overflow-hidden transition-colors ${
                hasSlots || hasBookings ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20' : ''
              } ${hasSlots && !isPast ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''} ${isPast ? 'bg-[#F9FAFB] dark:bg-[#0F172A]' : ''} ${isSelected ? 'ring-2 ring-inset ring-[#2563EB]' : ''}`}
            >
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[#2563EB] text-white' : isPast ? 'text-[#9CA3AF]' : 'text-[#111827] dark:text-[#F1F5F9]'}`}>
                {day.getDate()}
              </div>
              {daySlots.length > 0 && !isPast && (
                <div className="text-[10px] text-[#2563EB] dark:text-[#3B82F6] truncate mb-0.5">
                  {fmt12h(daySlots[0].startTime)}–{fmt12h(daySlots[0].endTime)}
                  {daySlots.length > 1 && ` +${daySlots.length - 1}`}
                </div>
              )}
              {allBookings.slice(0, 2).map(b => (
                <div key={b.id} className={`text-[10px] px-1 py-0.5 rounded truncate mb-0.5 ${isPast ? 'bg-[#E5E7EB] text-[#6B7280]' : 'bg-[#2563EB] text-white'}`}>
                  {fmt12h(b.windowStart)} {b.lead.customerName.split(' ')[0]}
                </div>
              ))}
              {allBookings.length > 2 && (
                <div className="text-[10px] text-[#6B7280] dark:text-[#94A3B8]">+{allBookings.length - 2} more</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ anchor, slotByDate, today }: { anchor: Date; slotByDate: Record<string, CalendarSlot[]>; today: string }) {
  const mon = startOfWeek(anchor)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  const CELL_HEIGHT = 48 // px per hour

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-auto">
      {/* Header */}
      <div className="grid" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
        <div className="border-b border-r border-[#E5E7EB] dark:border-[#334155] h-10" />
        {weekDays.map(d => {
          const key = isoDate(d)
          const isToday = key === today
          return (
            <div key={key} className={`border-b border-r border-[#E5E7EB] dark:border-[#334155] h-10 flex flex-col items-center justify-center ${isToday ? 'bg-[#EFF6FF] dark:bg-[#1e3a5f]' : ''}`}>
              <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{DAYS[(d.getDay() + 6) % 7]}</span>
              <span className={`text-sm font-semibold ${isToday ? 'text-[#2563EB] dark:text-[#3B82F6]' : 'text-[#111827] dark:text-[#F1F5F9]'}`}>{d.getDate()}</span>
            </div>
          )
        })}
      </div>
      {/* Time grid */}
      <div className="relative grid" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
        {/* Hour rows */}
        {HOURS.map(h => (
          <div key={h} className="contents">
            <div className="border-b border-r border-[#F3F4F6] dark:border-[#334155] flex items-start pt-1 pr-2 text-[10px] text-[#9CA3AF]" style={{ height: CELL_HEIGHT }}>
              {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
            </div>
            {weekDays.map(d => (
              <div key={isoDate(d)} className="border-b border-r border-[#F3F4F6] dark:border-[#334155] relative" style={{ height: CELL_HEIGHT }} />
            ))}
          </div>
        ))}

        {/* Slot and booking overlays */}
        {weekDays.map((d, colIdx) => {
          const key = isoDate(d)
          const daySlots = slotByDate[key] ?? []
          return daySlots.map(slot => {
            const slotStart = toMinutes(slot.startTime)
            const slotEnd = toMinutes(slot.endTime)
            const gridStart = 6 * 60 // 6am
            const top = ((slotStart - gridStart) / 60) * CELL_HEIGHT
            const height = ((slotEnd - slotStart) / 60) * CELL_HEIGHT
            const colOffset = 50 + colIdx * ((100 - 50 / 8)) // approximate
            return (
              <div
                key={slot.id}
                className="absolute bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded overflow-hidden"
                style={{
                  top: top,
                  height: height,
                  left: `calc(50px + ${colIdx} * (100% - 50px) / 7)`,
                  width: 'calc((100% - 50px) / 7 - 2px)',
                }}
              >
                <div className="text-[10px] text-blue-700 dark:text-blue-300 px-1 pt-0.5 truncate">
                  Available {fmt12h(slot.startTime)}–{fmt12h(slot.endTime)}
                </div>
                {slot.bookings.map(b => {
                  const bStart = toMinutes(b.windowStart)
                  const bEnd = toMinutes(b.windowEnd)
                  const bTop = ((bStart - slotStart) / 60) * CELL_HEIGHT
                  const bHeight = ((bEnd - bStart) / 60) * CELL_HEIGHT
                  return (
                    <Link
                      key={b.id}
                      href={`/leads/${b.lead.quoteNumber}`}
                      className="absolute left-0 right-0 bg-[#2563EB] text-white px-1 rounded text-[10px] truncate hover:bg-[#1D4ED8] transition-colors"
                      style={{ top: bTop, height: bHeight }}
                    >
                      {b.lead.customerName.split(' ')[0]} — {b.lead.quoteNumber}
                    </Link>
                  )
                })}
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({ date, slotByDate, today }: { date: Date; slotByDate: Record<string, CalendarSlot[]>; today: string }) {
  const key = isoDate(date)
  const daySlots = slotByDate[key] ?? []
  const CELL_HEIGHT = 64

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-auto">
      <div className="flex border-b border-[#E5E7EB] dark:border-[#334155] p-3">
        <h2 className={`text-sm font-semibold ${key === today ? 'text-[#2563EB]' : 'text-[#111827] dark:text-[#F1F5F9]'}`}>
          {nzDateLabel(date)}
        </h2>
      </div>

      {daySlots.length === 0 ? (
        <div className="p-6 text-sm text-[#9CA3AF] dark:text-[#475569]">No availability set for this day.</div>
      ) : (
        <div className="relative">
          {HOURS.map(h => (
            <div key={h} className="flex border-b border-[#F3F4F6] dark:border-[#334155]" style={{ height: CELL_HEIGHT }}>
              <div className="w-16 text-[10px] text-[#9CA3AF] pt-1 px-2 shrink-0">
                {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
              </div>
              <div className="flex-1" />
            </div>
          ))}

          {/* Slot blocks */}
          {daySlots.map(slot => {
            const slotStart = toMinutes(slot.startTime)
            const slotEnd = toMinutes(slot.endTime)
            const gridStart = 6 * 60
            const top = ((slotStart - gridStart) / 60) * CELL_HEIGHT
            const height = ((slotEnd - slotStart) / 60) * CELL_HEIGHT

            return (
              <div
                key={slot.id}
                className="absolute bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden"
                style={{ top, height, left: '64px', right: '8px' }}
              >
                <div className="text-xs text-blue-600 dark:text-blue-400 px-2 pt-1 font-medium">
                  Available {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
                  {slot.notes && <span className="ml-2 font-normal text-[#6B7280]">{slot.notes}</span>}
                </div>

                {slot.bookings.map(b => {
                  const bStart = toMinutes(b.windowStart)
                  const bEnd = toMinutes(b.windowEnd)
                  const bTop = ((bStart - slotStart) / 60) * CELL_HEIGHT
                  const bHeight = ((bEnd - bStart) / 60) * CELL_HEIGHT
                  const dur = b.lead.jobType?.durationMinutes
                  return (
                    <Link
                      key={b.id}
                      href={`/leads/${b.lead.quoteNumber}`}
                      className="absolute left-2 right-2 bg-[#2563EB] text-white rounded px-2 py-1 hover:bg-[#1D4ED8] transition-colors"
                      style={{ top: bTop, height: bHeight, overflow: 'hidden' }}
                    >
                      <div className="text-xs font-semibold truncate">{b.lead.customerName}</div>
                      <div className="text-[10px] truncate">{b.lead.quoteNumber} · {fmt12h(b.windowStart)}–{fmt12h(b.windowEnd)}{dur ? ` · ${Math.floor(dur / 60)}h` : ''}</div>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────

function DayDetailPanel({
  dateStr,
  slots,
  onClose,
}: {
  dateStr: string
  slots: CalendarSlot[]
  onClose: () => void
}) {
  const date = new Date(dateStr + 'T12:00:00')
  const allBookings = slots.flatMap(s => s.bookings)

  return (
    <div className="w-72 shrink-0">
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-[#111827] dark:text-[#F1F5F9]">{nzDateLabel(date)}</h3>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#374151] text-lg leading-none">×</button>
        </div>

        {slots.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-2">Availability</h4>
            {slots.map(s => (
              <div key={s.id} className="text-sm text-[#111827] dark:text-[#F1F5F9] bg-blue-50 dark:bg-blue-950/20 rounded px-2 py-1 mb-1">
                {fmt12h(s.startTime)} – {fmt12h(s.endTime)}
                {s.notes && <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{s.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {allBookings.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-2">Bookings</h4>
            {allBookings.map(b => (
              <Link
                key={b.id}
                href={`/leads/${b.lead.quoteNumber}`}
                className="block mb-2 p-2 rounded-lg bg-[#F3F4F6] dark:bg-[#0F172A] hover:bg-[#EFF6FF] dark:hover:bg-[#1e3a5f] transition-colors"
              >
                <div className="text-xs font-medium text-[#111827] dark:text-[#F1F5F9]">
                  {fmt12h(b.windowStart)} – {fmt12h(b.windowEnd)}
                </div>
                <div className="text-xs text-[#6B7280] dark:text-[#94A3B8] truncate">{b.lead.customerName}</div>
                <div className="text-xs text-[#9CA3AF] truncate">{b.lead.quoteNumber}</div>
                {b.lead.jobType && (
                  <div className="text-xs text-[#9CA3AF]">{b.lead.jobType.name}</div>
                )}
              </Link>
            ))}
          </div>
        )}

        {slots.length === 0 && allBookings.length === 0 && (
          <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">No availability or bookings.</p>
        )}
      </div>
    </div>
  )
}

// ─── Upcoming Bookings Panel ───────────────────────────────────────────────────

function UpcomingPanel({ bookings }: { bookings: UpcomingBooking[] }) {
  const MAX = 20
  const shown = bookings.slice(0, MAX)

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 shadow-sm">
      {shown.length === 0 ? (
        <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">No upcoming bookings.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((b, i) => {
            const date = new Date(b.slotDate + 'T12:00:00')
            const dateLabel = date.toLocaleDateString('en-NZ', {
              timeZone: 'Pacific/Auckland',
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })
            return (
              <Link
                key={i}
                href={`/leads/${b.quoteNumber}`}
                className="block p-2 rounded-lg hover:bg-[#EFF6FF] dark:hover:bg-[#1e3a5f] transition-colors"
              >
                <div className="text-xs font-medium text-[#374151] dark:text-[#CBD5E1]">
                  {dateLabel} — {fmt12h(b.windowStart)}–{fmt12h(b.windowEnd)}
                </div>
                <div className="text-xs font-semibold text-[#111827] dark:text-[#F1F5F9] truncate mt-0.5">{b.customerName}</div>
                {b.jobTypeName && (
                  <div className="text-xs text-[#6B7280] dark:text-[#94A3B8] truncate">{b.jobTypeName}</div>
                )}
                <div className="text-xs text-[#9CA3AF] dark:text-[#475569] truncate">{b.propertyAddress}</div>
              </Link>
            )
          })}
          {bookings.length > MAX && (
            <Link
              href="/dashboard"
              className="block text-xs text-[#2563EB] dark:text-[#3B82F6] hover:underline pt-1"
            >
              View all in leads table →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
