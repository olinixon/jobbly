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

interface LeadActionsProps {
  quoteNumber: string
  currentStatus: string
  hasInvoice: boolean
  commissionReconciled: boolean
  notes: string
}

export default function LeadActions({
  quoteNumber,
  currentStatus,
  hasInvoice,
  commissionReconciled,
  notes,
}: LeadActionsProps) {
  const router = useRouter()
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [notesValue, setNotesValue] = useState(notes)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  const nextStatus = currentIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIdx + 1] : null

  async function updateStatus(status: string) {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/leads/${quoteNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong.')
      return
    }
    setShowStatusModal(false)
    router.refresh()
  }

  async function uploadInvoice() {
    if (!file) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('quoteNumber', quoteNumber)
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

  async function toggleReconciled() {
    await fetch(`/api/leads/${quoteNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commissionReconciled: !commissionReconciled }),
    })
    router.refresh()
  }

  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {nextStatus && (
            <Button onClick={() => setShowStatusModal(true)}>
              Move to {STATUS_LABELS[nextStatus]}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowInvoiceModal(true)}>
            {hasInvoice ? 'Replace Invoice' : 'Attach Invoice'}
          </Button>
          <Button variant="secondary" onClick={() => setShowNotesModal(true)}>
            Edit Notes
          </Button>
          {currentStatus === 'JOB_COMPLETED' && (
            <Button variant={commissionReconciled ? 'secondary' : 'primary'} onClick={toggleReconciled}>
              {commissionReconciled ? 'Mark Unreconciled' : 'Mark Reconciled'}
            </Button>
          )}
        </div>
      </div>

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
          {error && <p className="text-sm text-[#DC2626] mb-3">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button
              onClick={() => updateStatus(nextStatus)}
              disabled={saving || (nextStatus === 'JOB_COMPLETED' && !hasInvoice)}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}

      {showInvoiceModal && (
        <Modal title="Attach Invoice" onClose={() => setShowInvoiceModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            Upload a PDF, JPG, or PNG. Max 10MB.
          </p>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[#374151] dark:text-[#CBD5E1] mb-4"
          />
          {error && <p className="text-sm text-[#DC2626] mb-3">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowInvoiceModal(false)}>Cancel</Button>
            <Button onClick={uploadInvoice} disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </Modal>
      )}

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
