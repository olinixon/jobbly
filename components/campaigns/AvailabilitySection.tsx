'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface Slot {
  id: string
  date: string
  startTime: string
  endTime: string
  notes: string | null
  createdAt: string
  confirmedBookings: number
}

interface JobType {
  id: string
  durationMinutes: number
}

interface Props {
  campaignId: string
  initialSlots: Slot[]
  jobTypes: JobType[]
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function totalPossibleWindows(startTime: string, endTime: string, minDuration: number): number {
  if (minDuration <= 0) return 0
  const start = parseTimeToMinutes(startTime)
  const end = parseTimeToMinutes(endTime)
  return Math.floor((end - start) / minDuration)
}

function formatSlotDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

function isPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date(new Date().setHours(0, 0, 0, 0))
}

export default function AvailabilitySection({ campaignId, initialSlots, jobTypes }: Props) {
  const [slots, setSlots] = useState<Slot[]>(initialSlots)
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addDate, setAddDate] = useState('')
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const minDuration = jobTypes.length > 0
    ? Math.min(...jobTypes.map(jt => jt.durationMinutes))
    : 0

  const upcomingSlots = slots
    .filter(s => !isPast(s.date))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const pastSlots = slots
    .filter(s => isPast(s.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const visibleSlots = view === 'upcoming' ? upcomingSlots : pastSlots

  function startEdit(slot: Slot) {
    setEditingId(slot.id)
    setEditDate(slot.date.split('T')[0])
    setEditStart(slot.startTime)
    setEditEnd(slot.endTime)
    setEditNotes(slot.notes ?? '')
    setError('')
  }

  async function saveEdit(id: string) {
    if (!editDate || !editStart || !editEnd) { setError('Date, start time, and end time are required.'); return }
    if (editStart >= editEnd) { setError('Start time must be before end time.'); return }
    setSaving(id)
    setError('')
    const res = await fetch(`/api/campaigns/${campaignId}/availability/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: editDate, startTime: editStart, endTime: editEnd, notes: editNotes || null }),
    })
    setSaving(null)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed.'); return }
    const updated = await res.json()
    setSlots(prev => prev.map(s => s.id === id ? { ...updated, date: updated.date ?? s.date } : s))
    setEditingId(null)
  }

  async function confirmDelete(id: string) {
    setDeleting(id)
    setDeleteConfirmId(null)
    setError('')
    const res = await fetch(`/api/campaigns/${campaignId}/availability/${id}`, { method: 'DELETE' })
    setDeleting(null)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Delete failed.'); return }
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  async function addSlot() {
    if (!addDate || !addStart || !addEnd) { setError('Date, start time, and end time are required.'); return }
    if (addStart >= addEnd) { setError('Start time must be before end time.'); return }
    setAdding(true)
    setError('')
    const res = await fetch(`/api/campaigns/${campaignId}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: addDate, startTime: addStart, endTime: addEnd, notes: addNotes || null }),
    })
    setAdding(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Add failed.'); return }
    const created = await res.json()
    setSlots(prev => [...prev, created])
    setAddDate(''); setAddStart(''); setAddEnd(''); setAddNotes('')
    setShowAddForm(false)
  }

  const deleteConfirmSlot = deleteConfirmId ? slots.find(s => s.id === deleteConfirmId) : null

  return (
    <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9]">Section 5b: Booking Availability</h2>
        <Button onClick={() => { setShowAddForm(v => !v); setError('') }} variant="secondary">
          {showAddForm ? 'Cancel' : '+ Add Slot'}
        </Button>
      </div>
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">Define when jobs can be booked. Each slot is a block of time on a specific date.</p>

      {error && <p className="text-sm text-[#DC2626] mb-3">{error}</p>}

      {showAddForm && (
        <div className="mb-4 p-4 border border-[#E5E7EB] dark:border-[#334155] rounded-xl bg-[#F9FAFB] dark:bg-[#0F172A] space-y-3">
          <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">New availability slot</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">Date</label>
              <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
            </div>
            <div>
              <label className="block text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">Start time</label>
              <input type="time" value={addStart} onChange={e => setAddStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
            </div>
            <div>
              <label className="block text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">End time</label>
              <input type="time" value={addEnd} onChange={e => setAddEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">Notes (optional, internal only)</label>
            <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="e.g. Team A available"
              className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
          </div>
          <div className="flex justify-end">
            <Button onClick={addSlot} disabled={adding}>{adding ? 'Adding…' : 'Add Slot'}</Button>
          </div>
        </div>
      )}

      {/* Upcoming / Past toggle */}
      <div className="flex gap-1 mb-4 p-1 bg-[#F3F4F6] dark:bg-[#0F172A] rounded-lg w-fit">
        <button
          onClick={() => setView('upcoming')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            view === 'upcoming'
              ? 'bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] shadow-sm'
              : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#CBD5E1]'
          }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setView('past')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            view === 'past'
              ? 'bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] shadow-sm'
              : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#CBD5E1]'
          }`}
        >
          Past
        </button>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmSlot && (
        <div className="mb-4 p-4 border border-[#DC2626]/30 rounded-xl bg-[#FEF2F2] dark:bg-[#DC2626]/10 space-y-3">
          <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">Are you sure you want to delete this slot?</p>
          <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
            {formatSlotDate(deleteConfirmSlot.date)} &middot; {fmt12h(deleteConfirmSlot.startTime)} &ndash; {fmt12h(deleteConfirmSlot.endTime)}
          </p>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">This cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <button
              onClick={() => confirmDelete(deleteConfirmSlot.id)}
              disabled={!!deleting}
              className="px-4 py-1.5 text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 rounded-lg transition-colors"
            >
              {deleting === deleteConfirmSlot.id ? 'Deleting…' : 'Delete slot'}
            </button>
          </div>
        </div>
      )}

      {visibleSlots.length === 0 ? (
        <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">
          {view === 'upcoming'
            ? 'No upcoming availability slots. Add a slot above to get started.'
            : 'No past slots found.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleSlots.map(slot => {
            const past = isPast(slot.date)
            const possible = minDuration > 0 ? totalPossibleWindows(slot.startTime, slot.endTime, minDuration) : null

            return (
              <div key={slot.id} className={`border rounded-xl p-4 ${past ? 'border-[#E5E7EB] dark:border-[#2D3748] opacity-60' : 'border-[#E5E7EB] dark:border-[#334155]'}`}>
                {editingId === slot.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">Date</label>
                        <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                      </div>
                      <div>
                        <label className="block text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">Start time</label>
                        <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                      </div>
                      <div>
                        <label className="block text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">End time</label>
                        <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                      </div>
                    </div>
                    <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes (optional)"
                      className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button onClick={() => saveEdit(slot.id)} disabled={saving === slot.id}>{saving === slot.id ? 'Saving…' : 'Save'}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">
                        {formatSlotDate(slot.date)}
                        {past && <span className="ml-2 text-xs text-[#9CA3AF] dark:text-[#475569]">(past)</span>}
                      </p>
                      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                        {fmt12h(slot.startTime)} – {fmt12h(slot.endTime)}
                      </p>
                      {slot.notes && <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-0.5">{slot.notes}</p>}
                      <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-1">
                        {slot.confirmedBookings} confirmed
                        {possible !== null && ` / ${possible} possible`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="secondary" onClick={() => startEdit(slot)} disabled={!!saving || !!deleting}>
                        Edit
                      </Button>
                      <button
                        onClick={() => slot.confirmedBookings === 0 ? setDeleteConfirmId(slot.id) : undefined}
                        disabled={!!deleting || slot.confirmedBookings > 0}
                        title={slot.confirmedBookings > 0 ? 'Cannot delete — this slot has confirmed bookings' : undefined}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#DC2626]/30 text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#DC2626]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {deleting === slot.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
