'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

const STATUS_ORDER = ['LEAD_RECEIVED', 'QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED']
const STATUS_LABELS: Record<string, string> = {
  QUOTE_SENT: 'Quote Sent',
  JOB_BOOKED: 'Job Booked',
  JOB_COMPLETED: 'Job Completed',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CURRENT_YEAR = new Date().getFullYear()

interface LeadActionsProps {
  quoteNumber: string
  currentStatus: string
  hasInvoice: boolean
  notes: string
  markupPercentage: number
}

export default function LeadActions({
  quoteNumber,
  currentStatus,
  hasInvoice,
  notes,
  markupPercentage,
}: LeadActionsProps) {
  const router = useRouter()
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [notesValue, setNotesValue] = useState(notes)
  const [file, setFile] = useState<File | null>(null)
  const [contractorRate, setContractorRate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Job booked date picker
  const [bookedDay, setBookedDay] = useState('')
  const [bookedMonth, setBookedMonth] = useState('')
  const [bookedYear, setBookedYear] = useState('')
  const [dateError, setDateError] = useState('')

  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  const nextStatus = currentIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIdx + 1] : null
  const isBookingStep = nextStatus === 'JOB_BOOKED'

  const previewPrice =
    contractorRate && !isNaN(parseFloat(contractorRate))
      ? (parseFloat(contractorRate) * (1 + markupPercentage / 100)).toFixed(2)
      : null

  function validateBookedDate(): Date | null {
    if (!bookedDay || !bookedMonth || !bookedYear) return null
    const d = new Date(parseInt(bookedYear), parseInt(bookedMonth) - 1, parseInt(bookedDay))
    if (
      d.getFullYear() !== parseInt(bookedYear) ||
      d.getMonth() !== parseInt(bookedMonth) - 1 ||
      d.getDate() !== parseInt(bookedDay)
    ) {
      return null
    }
    return d
  }

  const bookedDateFilled = !!(bookedDay && bookedMonth && bookedYear)
  const bookedDateValid = bookedDateFilled ? validateBookedDate() !== null : true

  async function updateStatus() {
    if (isBookingStep) {
      const d = validateBookedDate()
      if (!d) {
        setDateError('Please select a valid date.')
        return
      }
      setDateError('')
      setSaving(true)
      setError('')
      const res = await fetch(`/api/leads/${quoteNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, jobBookedDate: d.toISOString() }),
      })
      setSaving(false)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Something went wrong.')
        return
      }
    } else {
      if (!nextStatus) return
      setSaving(true)
      setError('')
      const res = await fetch(`/api/leads/${quoteNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      setSaving(false)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Something went wrong.')
        return
      }
    }
    setShowStatusModal(false)
    router.refresh()
  }

  async function uploadInvoice() {
    if (!file || !contractorRate) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('quoteNumber', quoteNumber)
    fd.append('contractorRate', contractorRate)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    setUploading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Upload failed.')
      return
    }
    setShowInvoiceModal(false)
    router.refresh()
  }

  async function saveNotes() {
    setSaving(true)
    await fetch(`/api/leads/${quoteNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesValue }),
    })
    setSaving(false)
    setShowNotesModal(false)
    router.refresh()
  }

  const confirmDisabled =
    saving ||
    (nextStatus === 'JOB_COMPLETED' && !hasInvoice) ||
    (isBookingStep && bookedDateFilled && !bookedDateValid)

  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {nextStatus && (
            <Button onClick={() => { setError(''); setDateError(''); setShowStatusModal(true) }}>
              Move to {STATUS_LABELS[nextStatus]}
            </Button>
          )}
          <Button variant="secondary" onClick={() => { setError(''); setShowInvoiceModal(true) }}>
            {hasInvoice ? 'Replace Invoice' : 'Attach Invoice'}
          </Button>
          <Button variant="secondary" onClick={() => setShowNotesModal(true)}>
            Edit Notes
          </Button>
        </div>
      </div>

      {/* Status modal */}
      {showStatusModal && nextStatus && (
        <Modal title="Update Status" onClose={() => setShowStatusModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            Move this lead to <strong>{STATUS_LABELS[nextStatus]}</strong>?
            {nextStatus === 'JOB_COMPLETED' && !hasInvoice && (
              <span className="block mt-2 text-[#DC2626]">
                You must attach an invoice before marking this job complete.
              </span>
            )}
          </p>

          {isBookingStep && (
            <div className="mb-4">
              <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-2">Job booked date</p>
              <div className="flex gap-2">
                <select
                  value={bookedDay}
                  onChange={(e) => { setBookedDay(e.target.value); setDateError('') }}
                  className="flex-1 px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  value={bookedMonth}
                  onChange={(e) => { setBookedMonth(e.target.value); setDateError('') }}
                  className="flex-[2] px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={bookedYear}
                  onChange={(e) => { setBookedYear(e.target.value); setDateError('') }}
                  className="flex-1 px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="">Year</option>
                  <option value={CURRENT_YEAR}>{CURRENT_YEAR}</option>
                  <option value={CURRENT_YEAR + 1}>{CURRENT_YEAR + 1}</option>
                </select>
              </div>
              {dateError && <p className="mt-1 text-xs text-[#DC2626]">{dateError}</p>}
              {bookedDateFilled && !bookedDateValid && (
                <p className="mt-1 text-xs text-[#DC2626]">Please select a valid date.</p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-[#DC2626] mb-3">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button
              onClick={updateStatus}
              disabled={confirmDisabled || (isBookingStep && !bookedDateFilled)}
            >
              {saving ? 'Saving…' : `Confirm — Move to ${STATUS_LABELS[nextStatus]}`}
            </Button>
          </div>
        </Modal>
      )}

      {/* Invoice modal */}
      {showInvoiceModal && (
        <Modal title="Attach Invoice" onClose={() => setShowInvoiceModal(false)}>
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
                Contractor rate (ex GST)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={contractorRate}
                onChange={(e) => setContractorRate(e.target.value)}
                placeholder="e.g. 200.00"
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
              {previewPrice && (
                <p className="mt-1 text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  Customer price: <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">${previewPrice}</span>
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
                Invoice file (PDF, JPG, or PNG — max 10MB)
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[#374151] dark:text-[#CBD5E1]"
              />
            </div>
          </div>
          {error && <p className="text-sm text-[#DC2626] mb-3">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowInvoiceModal(false)}>Cancel</Button>
            <Button onClick={uploadInvoice} disabled={!file || !contractorRate || uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Notes modal */}
      {showNotesModal && (
        <Modal title="Edit Notes" onClose={() => setShowNotesModal(false)}>
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={5}
            className="w-full text-sm px-3 py-2 border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB] mb-4 resize-none"
            placeholder="Add notes about this lead…"
          />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowNotesModal(false)}>Cancel</Button>
            <Button onClick={saveNotes} disabled={saving}>{saving ? 'Saving…' : 'Save Notes'}</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
