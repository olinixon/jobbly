'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
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

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024

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
  customerPaidAt?: string | null
  hasQuote: boolean
}

type QuoteUploadStep = 'idle' | 'uploading' | 'mismatch' | 'error' | 'success'

interface QuoteMismatch {
  extracted_address: string | null
  extracted_quote_number: string | null
  expected_address: string
  expected_quote_number: string
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function validateFile(f: File): string {
  if (!ALLOWED_TYPES.includes(f.type)) return 'Only PDF, JPG, or PNG files are allowed.'
  if (f.size > MAX_SIZE) return 'File must be under 10MB.'
  return ''
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
  customerPaidAt,
  hasQuote,
}: JobActionsProps) {
  const router = useRouter()
  const quoteFileInputRef = useRef<HTMLInputElement>(null)

  const [showRevertModal, setShowRevertModal] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertError, setRevertError] = useState('')
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Quote upload state
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [quoteFile, setQuoteFile] = useState<File | null>(null)
  const [quoteFileError, setQuoteFileError] = useState('')
  const [quoteUploadStep, setQuoteUploadStep] = useState<QuoteUploadStep>('idle')
  const [quoteDragOver, setQuoteDragOver] = useState(false)
  const [quoteMismatch, setQuoteMismatch] = useState<QuoteMismatch | null>(null)

  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  const previousStatus = currentIdx > 0 ? STATUS_ORDER[currentIdx - 1] : null

  function openQuoteModal() {
    setQuoteFile(null)
    setQuoteFileError('')
    setQuoteUploadStep('idle')
    setQuoteMismatch(null)
    setShowQuoteModal(true)
  }

  function closeQuoteModal() {
    setShowQuoteModal(false)
    setQuoteFile(null)
    setQuoteFileError('')
    setQuoteUploadStep('idle')
    setQuoteMismatch(null)
  }

  function handleQuoteFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setQuoteFileError(err); return }
    setQuoteFileError('')
    setQuoteFile(f)
  }

  function handleQuoteDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setQuoteDragOver(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setQuoteFileError(err); return }
    setQuoteFileError('')
    setQuoteFile(f)
  }

  async function uploadQuote(overrideValidation = false) {
    if (!quoteFile) return
    setQuoteUploadStep('uploading')
    setQuoteFileError('')
    const fd = new FormData()
    fd.append('file', quoteFile)
    if (overrideValidation) fd.append('overrideValidation', 'true')
    const res = await fetch(`/api/leads/${quoteNumber}/upload-quote`, { method: 'POST', body: fd })
    const data = await res.json()
    if (res.status === 422 && data.error === 'quote_mismatch') {
      setQuoteMismatch({
        extracted_address: data.extracted_address,
        extracted_quote_number: data.extracted_quote_number,
        expected_address: data.expected_address,
        expected_quote_number: data.expected_quote_number,
      })
      setQuoteUploadStep('mismatch')
      return
    }
    if (!res.ok) {
      setQuoteFileError(data.error ?? 'Upload failed.')
      setQuoteUploadStep('error')
      return
    }
    setQuoteUploadStep('success')
    setTimeout(() => {
      closeQuoteModal()
      router.refresh()
    }, 1500)
  }

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

  const quoteModal = showQuoteModal && (
    <Modal title="Upload Quote" onClose={closeQuoteModal}>
      {quoteUploadStep === 'idle' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setQuoteDragOver(true) }}
            onDragLeave={() => setQuoteDragOver(false)}
            onDrop={handleQuoteDrop}
            className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${quoteDragOver ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30' : 'border-[#D1D5DB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A]'}`}
            onClick={() => quoteFileInputRef.current?.click()}
          >
            <input
              ref={quoteFileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleQuoteFileChange}
            />
            {quoteFile ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{quoteFile.name}</p>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{fmtBytes(quoteFile.size)}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-[#9CA3AF] dark:text-[#475569]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <div>
                  <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">Drag and drop your quote here</p>
                  <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-1">PDF, JPG, or PNG — max 10MB</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); quoteFileInputRef.current?.click() }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#D1D5DB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors"
                >
                  Choose File
                </button>
              </div>
            )}
          </div>
          {quoteFileError && <p className="text-sm text-[#DC2626]">{quoteFileError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={closeQuoteModal}>Cancel</Button>
            <Button onClick={() => uploadQuote()} disabled={!quoteFile}>Upload</Button>
          </div>
        </div>
      )}

      {quoteUploadStep === 'uploading' && (
        <div className="py-12 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#E5E7EB] dark:border-[#334155] border-t-[#2563EB] rounded-full animate-spin" />
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Uploading and checking your quote…</p>
        </div>
      )}

      {quoteUploadStep === 'success' && (
        <div className="py-8 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">Quote uploaded successfully.</p>
        </div>
      )}

      {quoteUploadStep === 'mismatch' && quoteMismatch && (
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Quote details don&apos;t match</p>
            <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">The document appears to reference:</p>
            <div className="text-sm text-[#374151] dark:text-[#CBD5E1] space-y-1 pl-3">
              <p>Address: &quot;{quoteMismatch.extracted_address ?? 'Not found'}&quot;</p>
              <p>Quote number: &quot;{quoteMismatch.extracted_quote_number ?? 'Not found'}&quot;</p>
            </div>
            <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Expected:</p>
            <div className="text-sm text-[#374151] dark:text-[#CBD5E1] space-y-1 pl-3">
              <p>Address: {quoteMismatch.expected_address}</p>
              <p>Quote number: {quoteMismatch.expected_quote_number}</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setQuoteFile(null); setQuoteMismatch(null); setQuoteUploadStep('idle') }}>
              Try Again
            </Button>
            <button
              onClick={() => uploadQuote(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[#D1D5DB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors"
            >
              Upload Anyway
            </button>
          </div>
        </div>
      )}

      {quoteUploadStep === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-[#DC2626]">{quoteFileError || 'Something went wrong. Please try again.'}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setQuoteFile(null); setQuoteUploadStep('idle') }}>Try Again</Button>
          </div>
        </div>
      )}
    </Modal>
  )

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
            <div className="flex items-center justify-between text-sm pt-1 border-t border-[#F3F4F6] dark:border-[#334155]">
              <span className="text-[#6B7280] dark:text-[#94A3B8]">Payment</span>
              {customerPaidAt
                ? <span className="text-green-600 dark:text-green-400 font-medium">✅ Received — {customerPaidAt}</span>
                : <span className="text-[#9CA3AF] dark:text-[#475569]">⏳ Awaiting</span>}
            </div>
          </div>
          <div className="pt-4 border-t border-[#F3F4F6] dark:border-[#334155] flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={openQuoteModal}>
              {hasQuote ? 'Replace Quote' : 'Upload Quote'}
            </Button>
            {customerEmail && (
              <>
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
              </>
            )}
          </div>
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
        {quoteModal}
      </>
    )
  }

  // JOB_BOOKED — delegate to CompleteJobSection + Upload Quote
  if (currentStatus === 'JOB_BOOKED') {
    return (
      <>
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={openQuoteModal}>
              {hasQuote ? 'Replace Quote' : 'Upload Quote'}
            </Button>
          </div>
        </div>
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
        {quoteModal}
      </>
    )
  }

  // LEAD_RECEIVED or QUOTE_SENT — status card + Upload Quote
  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={openQuoteModal}>
            {hasQuote ? 'Replace Quote' : 'Upload Quote'}
          </Button>
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
      {quoteModal}
    </>
  )
}
