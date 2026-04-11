'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/formatDate'

interface JobBookedActionsCardProps {
  quoteNumber: string
  jobBookedDate: Date | string | null
  readOnly?: boolean // client view — shows date only, no action buttons
}

export default function JobBookedActionsCard({
  quoteNumber,
  jobBookedDate,
  readOnly = false,
}: JobBookedActionsCardProps) {
  const router = useRouter()

  const [editOpen, setEditOpen] = useState(false)
  const [editDate, setEditDate] = useState(
    jobBookedDate
      ? new Date(jobBookedDate).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
      : ''
  )
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editSuccess, setEditSuccess] = useState(false)

  const [showUnbookModal, setShowUnbookModal] = useState(false)
  const [unbooking, setUnbooking] = useState(false)
  const [unbookError, setUnbookError] = useState('')

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  function setEditToday() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
    setEditDate(today)
    setEditError('')
  }

  async function handleRebook() {
    if (!editDate) { setEditError('Please select a date.'); return }
    setEditSaving(true)
    setEditError('')
    const res = await fetch(`/api/jobs/${quoteNumber}/rebook`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_booked_date: editDate }),
    })
    setEditSaving(false)
    if (!res.ok) { const d = await res.json(); setEditError(d.error ?? 'Save failed.'); return }
    setEditSuccess(true)
    setEditOpen(false)
    router.refresh()
  }

  async function handleUnbook() {
    setUnbooking(true)
    setUnbookError('')
    const res = await fetch(`/api/jobs/${quoteNumber}/unbook`, { method: 'PATCH' })
    setUnbooking(false)
    if (!res.ok) { const d = await res.json(); setUnbookError(d.error ?? 'Unbook failed.'); return }
    setShowUnbookModal(false)
    router.refresh()
  }

  async function handleCancel() {
    setCancelling(true)
    setCancelError('')
    const res = await fetch(`/api/jobs/${quoteNumber}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
    })
    setCancelling(false)
    if (!res.ok) { const d = await res.json(); setCancelError(d.error ?? 'Cancellation failed.'); return }
    setShowCancelModal(false)
    router.refresh()
  }

  const displayDate = jobBookedDate ? formatDate(new Date(jobBookedDate)) : '—'

  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Actions</h2>

        <div className="border-t border-[#F3F4F6] dark:border-[#334155] pt-4 space-y-4">
          {/* Booked date display */}
          <div className="space-y-2">
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Booked date</p>
            <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{displayDate}</p>
          </div>

          {!readOnly && (
            <>
              {/* Edit Booking Date */}
              {!editOpen ? (
                <button
                  onClick={() => { setEditOpen(true); setEditSuccess(false); setEditError('') }}
                  className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
                >
                  Edit Booking Date
                </button>
              ) : (
                <div className="space-y-2 bg-[#F9FAFB] dark:bg-[#0F172A] rounded-lg p-3 border border-[#E5E7EB] dark:border-[#334155]">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => { setEditDate(e.target.value); setEditError('') }}
                      className="w-full md:w-36 px-3 py-1.5 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                    <button
                      type="button"
                      onClick={setEditToday}
                      className="w-full md:w-auto px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors whitespace-nowrap"
                    >
                      Today
                    </button>
                  </div>
                  {editError && <p className="text-xs text-[#DC2626]">{editError}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleRebook}
                      disabled={editSaving}
                      className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-60 transition-colors"
                    >
                      {editSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditOpen(false); setEditError('') }}
                      className="text-sm text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {editSuccess && <p className="text-xs text-green-600 dark:text-green-400">Booking date updated ✓</p>}

              {/* Divider */}
              <div className="border-t border-[#F3F4F6] dark:border-[#334155]" />

              {/* Unbook + Cancel row */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => { setUnbookError(''); setShowUnbookModal(true) }}
                  className="px-4 py-2 text-sm font-medium border border-amber-400 dark:border-amber-600 rounded-lg bg-white dark:bg-[#0F172A] text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                >
                  Unbook Job
                </button>
                <button
                  onClick={() => { setCancelError(''); setCancelReason(''); setShowCancelModal(true) }}
                  className="px-4 py-2 text-sm font-medium border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-[#0F172A] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  Job Cancelled
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Unbook confirmation modal */}
      {showUnbookModal && (
        <Modal title="Unbook this job?" onClose={() => setShowUnbookModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            Are you sure you want to unbook this job? The lead will return to Lead Received and the booked date will be cleared.
          </p>
          {unbookError && <p className="text-sm text-[#DC2626] mb-3">{unbookError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowUnbookModal(false)}>Cancel</Button>
            <Button onClick={handleUnbook} disabled={unbooking}>{unbooking ? 'Unbooking…' : 'Yes, unbook'}</Button>
          </div>
        </Modal>
      )}

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <Modal title="Mark as cancelled?" onClose={() => setShowCancelModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-3">
            Optionally add a reason:
          </p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value.slice(0, 200))}
            placeholder="e.g. Customer cancelled, job not needed"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none mb-1"
          />
          <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mb-4">{cancelReason.length}/200</p>
          {cancelError && <p className="text-sm text-[#DC2626] mb-3">{cancelError}</p>}
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={() => setShowCancelModal(false)}
              className="text-sm text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] hover:underline"
            >
              Keep Job
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
