'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobEntry {
  quoteNumber: string
  customerName: string
}

type ViewMode = 'month' | 'week' | 'day'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}

function nzDateLabel(d: Date): string {
  return d.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' })
}

// ─── CalendarClient ───────────────────────────────────────────────────────────

export default function CalendarClient() {
  const [view, setView] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [jobsByDate, setJobsByDate] = useState<Record<string, JobEntry[]>>({})
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [upcomingJobs, setUpcomingJobs] = useState<{ date: string; jobs: JobEntry[] }[]>([])
  const [panelOpen, setPanelOpen] = useState(true)
  const [showMobilePanel, setShowMobilePanel] = useState(false)

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

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRange()
    try {
      const res = await fetch(`/api/calendar?from=${isoDate(from)}&to=${isoDate(to)}`)
      if (res.ok) {
        const data = await res.json()
        setJobsByDate(data.jobs ?? {})
      }
    } finally {
      setLoading(false)
    }
  }, [anchor, view]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUpcoming = useCallback(async () => {
    const todayDate = new Date()
    const futureDate = addDays(todayDate, 90)
    try {
      const res = await fetch(`/api/calendar?from=${isoDate(todayDate)}&to=${isoDate(futureDate)}`)
      if (!res.ok) return
      const data = await res.json()
      const byDate: Record<string, JobEntry[]> = data.jobs ?? {}
      const sorted = Object.entries(byDate)
        .filter(([date]) => date >= isoDate(todayDate))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, jobs]) => ({ date, jobs }))
      setUpcomingJobs(sorted)
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])
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

  const today = isoDate(new Date())
  const selectedDayJobs = selectedDay ? (jobsByDate[selectedDay] ?? []) : []

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

        {showMobilePanel && (
          <div className="md:hidden mb-4">
            <UpcomingPanel jobs={upcomingJobs} />
          </div>
        )}

        {loading && <div className="text-sm text-[#6B7280] mb-2">Loading…</div>}

        {view === 'month' && (
          <MonthView
            anchor={anchor}
            jobsByDate={jobsByDate}
            today={today}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}
        {view === 'week' && (
          <WeekView anchor={anchor} jobsByDate={jobsByDate} today={today} />
        )}
        {view === 'day' && (
          <DayView date={anchor} jobs={jobsByDate[isoDate(anchor)] ?? []} today={today} />
        )}
      </div>

      {/* Day detail panel (month view) */}
      {view === 'month' && selectedDay && (
        <DayDetailPanel
          dateStr={selectedDay}
          jobs={selectedDayJobs}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Upcoming jobs panel — desktop */}
      <div className="hidden md:block shrink-0">
        {panelOpen ? (
          <div className="w-64">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Upcoming Jobs</span>
              <button onClick={() => setPanelOpen(false)} className="text-xs text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#CBD5E1] transition-colors">
                → Hide
              </button>
            </div>
            <UpcomingPanel jobs={upcomingJobs} />
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
  jobsByDate,
  today,
  selectedDay,
  onSelectDay,
}: {
  anchor: Date
  jobsByDate: Record<string, JobEntry[]>
  today: string
  selectedDay: string | null
  onSelectDay: (d: string) => void
}) {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const firstDay = new Date(y, m, 1)
  const lastDay = new Date(y, m + 1, 0)

  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  const days: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(y, m, d))
  }
  while (days.length % 7 !== 0) days.push(null)

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[#E5E7EB] dark:border-[#334155]">
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-[#6B7280] dark:text-[#94A3B8]">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="border-b border-r border-[#F3F4F6] dark:border-[#334155] h-24 bg-[#F9FAFB] dark:bg-[#0F172A]" />
          const key = isoDate(day)
          const dayJobs = jobsByDate[key] ?? []
          const isToday = key === today
          const isPast = key < today
          const isSelected = key === selectedDay
          const hasJobs = dayJobs.length > 0

          return (
            <div
              key={key}
              onClick={() => hasJobs && onSelectDay(key)}
              className={`border-b border-r border-[#F3F4F6] dark:border-[#334155] h-24 p-1.5 overflow-hidden transition-colors ${
                hasJobs ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20' : ''
              } ${isPast ? 'bg-[#F9FAFB] dark:bg-[#0F172A]' : ''} ${isSelected ? 'ring-2 ring-inset ring-[#2563EB]' : ''}`}
            >
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[#2563EB] text-white' : isPast ? 'text-[#9CA3AF]' : 'text-[#111827] dark:text-[#F1F5F9]'}`}>
                {day.getDate()}
              </div>
              {hasJobs && (
                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${isPast ? 'bg-[#E5E7EB] text-[#6B7280]' : 'bg-[#2563EB] text-white'}`}>
                  {dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ anchor, jobsByDate, today }: { anchor: Date; jobsByDate: Record<string, JobEntry[]>; today: string }) {
  const mon = startOfWeek(anchor)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mon, i))

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[#E5E7EB] dark:border-[#334155]">
        {weekDays.map(d => {
          const key = isoDate(d)
          const isToday = key === today
          return (
            <div key={key} className={`border-r border-[#E5E7EB] dark:border-[#334155] h-14 flex flex-col items-center justify-center gap-0.5 ${isToday ? 'bg-[#EFF6FF] dark:bg-[#1e3a5f]' : ''}`}>
              <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{DAYS[(d.getDay() + 6) % 7]}</span>
              <span className={`text-sm font-semibold ${isToday ? 'text-[#2563EB] dark:text-[#3B82F6]' : 'text-[#111827] dark:text-[#F1F5F9]'}`}>{d.getDate()}</span>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 min-h-40">
        {weekDays.map(d => {
          const key = isoDate(d)
          const dayJobs = jobsByDate[key] ?? []
          const isPast = key < today
          return (
            <div key={key} className="border-r border-[#F3F4F6] dark:border-[#334155] p-2">
              {dayJobs.length > 0 && (
                <div className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mb-2 ${isPast ? 'bg-[#E5E7EB] text-[#6B7280]' : 'bg-[#2563EB] text-white'}`}>
                  {dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}
                </div>
              )}
              <div className="space-y-1">
                {dayJobs.map(j => (
                  <Link
                    key={j.quoteNumber}
                    href={`/leads/${j.quoteNumber}`}
                    className={`block text-[10px] px-1 py-0.5 rounded truncate ${isPast ? 'bg-[#F3F4F6] text-[#6B7280]' : 'bg-blue-50 dark:bg-blue-950/30 text-[#2563EB] dark:text-[#3B82F6] hover:bg-blue-100 dark:hover:bg-blue-900/40'}`}
                  >
                    {j.customerName.split(' ')[0]} · {j.quoteNumber}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({ date, jobs, today }: { date: Date; jobs: JobEntry[]; today: string }) {
  const key = isoDate(date)

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-hidden">
      <div className="flex border-b border-[#E5E7EB] dark:border-[#334155] p-3">
        <h2 className={`text-sm font-semibold ${key === today ? 'text-[#2563EB]' : 'text-[#111827] dark:text-[#F1F5F9]'}`}>
          {nzDateLabel(date)}
        </h2>
      </div>

      {jobs.length === 0 ? (
        <div className="p-6 text-sm text-[#9CA3AF] dark:text-[#475569]">No jobs booked for this day.</div>
      ) : (
        <div className="p-4 space-y-2">
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mb-3">{jobs.length} job{jobs.length !== 1 ? 's' : ''} booked</p>
          {jobs.map(j => (
            <Link
              key={j.quoteNumber}
              href={`/leads/${j.quoteNumber}`}
              className="block p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <div className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">{j.customerName}</div>
              <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{j.quoteNumber}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────

function DayDetailPanel({
  dateStr,
  jobs,
  onClose,
}: {
  dateStr: string
  jobs: JobEntry[]
  onClose: () => void
}) {
  const date = new Date(dateStr + 'T12:00:00')

  return (
    <div className="w-72 shrink-0">
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-[#111827] dark:text-[#F1F5F9]">{nzDateLabel(date)}</h3>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#374151] text-lg leading-none">×</button>
        </div>

        {jobs.length > 0 ? (
          <div>
            <h4 className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-2">
              {jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'}
            </h4>
            {jobs.map(j => (
              <Link
                key={j.quoteNumber}
                href={`/leads/${j.quoteNumber}`}
                className="block mb-2 p-2 rounded-lg bg-[#F3F4F6] dark:bg-[#0F172A] hover:bg-[#EFF6FF] dark:hover:bg-[#1e3a5f] transition-colors"
              >
                <div className="text-xs font-medium text-[#111827] dark:text-[#F1F5F9]">{j.customerName}</div>
                <div className="text-xs text-[#9CA3AF]">{j.quoteNumber}</div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">No jobs booked.</p>
        )}
      </div>
    </div>
  )
}

// ─── Upcoming Jobs Panel ──────────────────────────────────────────────────────

function UpcomingPanel({ jobs }: { jobs: { date: string; jobs: JobEntry[] }[] }) {
  const allJobs = jobs.flatMap(({ date, jobs: js }) => js.map(j => ({ date, ...j }))).slice(0, 20)

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 shadow-sm">
      {allJobs.length === 0 ? (
        <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">No upcoming jobs.</p>
      ) : (
        <div className="space-y-2">
          {allJobs.map((j, i) => {
            const date = new Date(j.date + 'T12:00:00')
            const dateLabel = date.toLocaleDateString('en-NZ', {
              timeZone: 'Pacific/Auckland',
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })
            return (
              <Link
                key={i}
                href={`/leads/${j.quoteNumber}`}
                className="block p-2 rounded-lg hover:bg-[#EFF6FF] dark:hover:bg-[#1e3a5f] transition-colors"
              >
                <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{dateLabel}</div>
                <div className="text-xs font-semibold text-[#111827] dark:text-[#F1F5F9] truncate mt-0.5">{j.customerName}</div>
                <div className="text-xs text-[#9CA3AF] dark:text-[#475569]">{j.quoteNumber}</div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
