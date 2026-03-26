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

interface JobActionsProps {
  quoteNumber: string
  currentStatus: string
  hasInvoice: boolean
  invoiceUrl: string | null
}

export default function JobActions({ quoteNumber, currentStatus, hasInvoice, invoiceUrl }: JobActionsProps) {
  const router = useRouter()
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
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

  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-2">Current Status</h2>
        <div className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9] mb-4">
          {currentStatus.replace(/_/g, ' ')}
        </div>
        <div className="flex flex-wrap gap-3">
          {nextStatus && (
            <Button onClick={() => setShowStatusModal(true)}>
              Move to {STATUS_LABELS[nextStatus]}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowInvoiceModal(true)}>
            {hasInvoice ? 'Replace Invoice' : 'Attach Invoice'}
          </Button>
        </div>
      </div>

      {/* Invoice section */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Invoice</h2>
        {hasInvoice && invoiceUrl ? (
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">Invoice attached ✓</p>
            <a href={invoiceUrl} download className="text-sm text-[#2563EB] dark:text-[#3B82F6] hover:underline">Download</a>
          </div>
        ) : (
          <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">
            No invoice yet. Attach an invoice before marking the job complete.
          </p>
        )}
      </div>

      {showStatusModal && nextStatus && (
        <Modal title="Update Status" onClose={() => setShowStatusModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            Move this job to <strong>{STATUS_LABELS[nextStatus]}</strong>?
            {nextStatus === 'JOB_COMPLETED' && !hasInvoice && (
              <span className="block mt-2 text-[#DC2626]">
                Attach an invoice before marking this job complete.
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
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">Upload PDF, JPG, or PNG. Max 10MB.</p>
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
    </>
  )
}
