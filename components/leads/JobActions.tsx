'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import CompleteJobSection from '@/components/leads/CompleteJobSection'

const STATUS_ORDER = ['LEAD_RECEIVED', 'QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED']
const STATUS_LABELS: Record<string, string> = {
  LEAD_RECEIVED: 'Lead Received',
  QUOTE_SENT: 'Quote Sent',
  JOB_BOOKED: 'Job Booked',
  JOB_COMPLETED: 'Job Completed',
}

interface JobType {
  id: string
  name: string
  durationMinutes: number
}

interface JobActionsProps {
  quoteNumber: string
  currentStatus: string
  hasInvoice: boolean
  invoiceUrl: string | null
  hasJobReport: boolean
  jobReportUrl: string | null
  jobReportFileName: string | null
  markupPercentage: number
  jobTypes: JobType[]
  customerName?: string
  propertyAddress?: string
  customerEmail?: string | null
}

export default function JobActions({
  quoteNumber,
  currentStatus,
  hasInvoice,
  invoiceUrl,
  hasJobReport,
  jobReportUrl,
  jobReportFileName,
  markupPercentage,
  jobTypes: _jobTypes,
  customerName: _customerName,
  propertyAddress: _propertyAddress,
  customerEmail,
}: JobActionsProps) {
  const router = useRouter()
  const [showRevertModal, setShowRevertModal] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertError, setRevertError] = useState('')
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  const previousStatus = currentIdx > 0 ? STATUS_ORDER[currentIdx - 1] : null

  async function revertStatus() {
    setReverting(true)
    setRevertError('')
    const res = await fetch(`/api/leads/${quoteNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revert: true }),
    })
    setReverting(false)
    if (!res.ok) { const d = await res.json(); setRevertError(d.error ?? 'Revert failed.'); return }
    setShowRevertModal(false)
    router.refresh()
  }

  async function handleResend() {
    setResending(true)
    setResendStatus('idle')
    const res = await fetch(`/api/leads/${quoteNumber}/resend-customer-email`, { method: 'POST' })
    setResending(false)
    setResendStatus(res.ok ? 'success' : 'error')
  }

  // JOB_COMPLETED — read-only documents + resend email + revert
  if (currentStatus === 'JOB_COMPLETED') {
    return (
      <>
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9]">Documents Submitted</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6B7280] dark:text-[#94A3B8]">Invoice</span>
              {invoiceUrl
                ? <a href={invoiceUrl} download className="text-[#2563EB] dark:text-[#3B82F6] hover:underline font-medium">Download</a>
                : <span className="text-[#9CA3AF]">—</span>}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6B7280] dark:text-[#94A3B8]">Job Report</span>
              {jobReportUrl
                ? <a href={jobReportUrl} download className="text-[#2563EB] dark:text-[#3B82F6] hover:underline font-medium">Download</a>
                : <span className="text-[#9CA3AF]">—</span>}
            </div>
          </div>
          {customerEmail && (
            <div className="pt-4 border-t border-[#F3F4F6] dark:border-[#334155] flex items-center gap-3">
              <button
                onClick={handleResend}
                disabled={resending}
                className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] disabled:opacity-60 transition-colors"
              >
                {resending ? 'Sending…' : 'Resend Email'}
              </button>
              {resendStatus === 'success' && (
                <span className="text-sm text-green-600 dark:text-green-400">Email resent ✓</span>
              )}
              {resendStatus === 'error' && (
                <span className="text-sm text-[#DC2626]">Failed to send. Try again.</span>
              )}
            </div>
          )}
          {previousStatus && (
            <div className="pt-4 border-t border-[#F3F4F6] dark:border-[#334155]">
              <button
                onClick={() => { setRevertError(''); setShowRevertModal(true) }}
                className="text-xs text-[#9CA3AF] dark:text-[#475569] hover:text-[#6B7280] dark:hover:text-[#94A3B8] transition-colors underline"
              >
                Revert status
              </button>
            </div>
          )}
        </div>
        {showRevertModal && previousStatus && (
          <Modal title="Revert status?" onClose={() => setShowRevertModal(false)}>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
              This will move this job back from <strong>{STATUS_LABELS[currentStatus]}</strong> to <strong>{STATUS_LABELS[previousStatus]}</strong>. This action will be logged.
            </p>
            {revertError && <p className="text-sm text-[#DC2626] mb-3">{revertError}</p>}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowRevertModal(false)}>Cancel</Button>
              <Button onClick={revertStatus} disabled={reverting}>{reverting ? 'Reverting…' : 'Confirm Revert'}</Button>
            </div>
          </Modal>
        )}
      </>
    )
  }

  // JOB_BOOKED — delegate to CompleteJobSection
  if (currentStatus === 'JOB_BOOKED') {
    return (
      <CompleteJobSection
        quoteNumber={quoteNumber}
        initialHasInvoice={hasInvoice}
        initialInvoiceUrl={invoiceUrl}
        initialInvoiceFileName={invoiceUrl ? invoiceUrl.split('/').pop()?.split('?')[0] ?? null : null}
        initialHasJobReport={hasJobReport}
        initialJobReportUrl={jobReportUrl}
        initialJobReportFileName={jobReportFileName}
        markupPercentage={markupPercentage}
      />
    )
  }

  // LEAD_RECEIVED or QUOTE_SENT — simple status card
  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-2">Current Status</h2>
        <div className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9] mb-4">
          {STATUS_LABELS[currentStatus] ?? currentStatus.replace(/_/g, ' ')}
        </div>
        {previousStatus && (
          <div className="mt-4 pt-4 border-t border-[#F3F4F6] dark:border-[#334155]">
            <button
              onClick={() => { setRevertError(''); setShowRevertModal(true) }}
              className="text-xs text-[#9CA3AF] dark:text-[#475569] hover:text-[#6B7280] dark:hover:text-[#94A3B8] transition-colors underline"
            >
              Revert status
            </button>
          </div>
        )}
      </div>
      {showRevertModal && previousStatus && (
        <Modal title="Revert status?" onClose={() => setShowRevertModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            This will move this job back from <strong>{STATUS_LABELS[currentStatus]}</strong> to <strong>{STATUS_LABELS[previousStatus]}</strong>. This action will be logged.
          </p>
          {revertError && <p className="text-sm text-[#DC2626] mb-3">{revertError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowRevertModal(false)}>Cancel</Button>
            <Button onClick={revertStatus} disabled={reverting}>{reverting ? 'Reverting…' : 'Confirm Revert'}</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
