'use client'

import { useState, useRef, DragEvent, ChangeEvent, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { calculateCommissionFromCustomerPrice } from '@/lib/calculateCommission'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

interface CompleteJobSectionProps {
  quoteNumber: string
  initialHasInvoice: boolean
  initialInvoiceUrl: string | null
  initialInvoiceFileName: string | null
  initialHasJobReport: boolean
  initialJobReportUrl: string | null
  initialJobReportFileName: string | null
  markupPercentage: number
  readOnly?: boolean
  customerEmail?: string | null
}

type InvoiceStep = 'drop' | 'uploading' | 'confirm' | 'fallback' | 'invoice_quote_mismatch'

interface ParsedResult {
  fileUrl: string
  fileName: string
  fileType: string
  fileSizeBytes: number
  markupPercentage: number
  commissionPercentage: number
  customerPrice: number
  contractorRate: number
  grossMarkup: number
  omnisideCommission: number
  clientMargin: number
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function validateFile(f: File): string | null {
  if (!ALLOWED_TYPES.includes(f.type)) {
    const ext = f.name.split('.').pop() ?? 'unknown'
    return `This file type (.${ext}) is not supported. Please upload a PDF, JPG, or PNG.`
  }
  if (f.size > MAX_SIZE) {
    const mb = (f.size / (1024 * 1024)).toFixed(1)
    return `This file is ${mb}MB. The maximum allowed size is 10MB. Please compress or reduce the file and try again.`
  }
  return null
}

function StatusBadge({ uploaded }: { uploaded: boolean }) {
  return uploaded ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
      ✅ Uploaded
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      ⚪ Needed
    </span>
  )
}

function ErrorPopup({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full px-4">
      <div className="bg-red-600 text-white text-sm rounded-xl px-4 py-3 shadow-lg flex items-start gap-3">
        <span className="shrink-0 mt-0.5">❌</span>
        <p className="flex-1">{message}</p>
        <button onClick={onDismiss} className="shrink-0 text-white/70 hover:text-white ml-2 font-bold">✕</button>
      </div>
    </div>
  )
}

export default function CompleteJobSection({
  quoteNumber,
  initialHasInvoice,
  initialInvoiceUrl,
  initialInvoiceFileName,
  initialHasJobReport,
  initialJobReportUrl,
  initialJobReportFileName,
  markupPercentage,
  readOnly = false,
  customerEmail,
}: CompleteJobSectionProps) {
  const router = useRouter()
  const invoiceFileInputRef = useRef<HTMLInputElement>(null)
  const jobReportFileInputRef = useRef<HTMLInputElement>(null)
  const multiFileInputRef = useRef<HTMLInputElement>(null)

  // Document state
  const [hasInvoice, setHasInvoice] = useState(initialHasInvoice)
  const [invoiceUrl, setInvoiceUrl] = useState(initialInvoiceUrl)
  const [invoiceFileName, setInvoiceFileName] = useState(initialInvoiceFileName)
  const [hasJobReport, setHasJobReport] = useState(initialHasJobReport)
  const [jobReportUrl, setJobReportUrl] = useState(initialJobReportUrl)
  const [jobReportFileName, setJobReportFileName] = useState(initialJobReportFileName)

  // Invoice modal state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceStep, setInvoiceStep] = useState<InvoiceStep>('drop')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null)
  const [fallbackMsg, setFallbackMsg] = useState('')
  const [fallbackFileInfo, setFallbackFileInfo] = useState<{ fileUrl: string; fileName: string; fileType: string; fileSizeBytes: number; markupPercentage: number; commissionPercentage: number } | null>(null)
  const [manualPrice, setManualPrice] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState({ customerPrice: '', contractorRate: '', grossMarkup: '', omnisideCommission: '', clientMargin: '' })
  const [confirming, setConfirming] = useState(false)
  const [invoiceMismatch, setInvoiceMismatch] = useState<{ extracted_quote_number: string; expected_quote_number: string; fileUrl: string } | null>(null)

  // Job report modal state
  const [showJobReportModal, setShowJobReportModal] = useState(false)
  const [jobReportUploadFile, setJobReportUploadFile] = useState<File | null>(null)
  const [jobReportUploading, setJobReportUploading] = useState(false)
  const [jobReportError, setJobReportError] = useState('')

  // Multi-upload state
  const [multiUploading, setMultiUploading] = useState(false)
  const [showMultiConfirmModal, setShowMultiConfirmModal] = useState(false)
  const [pendingMultiFiles, setPendingMultiFiles] = useState<File[] | null>(null)

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitHasEmail, setSubmitHasEmail] = useState(true)

  // Error popup state
  const [popupError, setPopupError] = useState('')

  const bothReady = hasInvoice && hasJobReport

  // ── Helper text ──────────────────────────────────────────────────────────────
  function getHelperText() {
    if (!hasInvoice && !hasJobReport) return 'Upload the invoice and job report to complete this job.'
    if (hasInvoice && !hasJobReport) return 'Invoice received ✓ — job report still needed before you can submit.'
    if (!hasInvoice && hasJobReport) return 'Job report received ✓ — invoice still needed before you can submit.'
    return 'Both documents received. Ready to submit.'
  }

  // ── Invoice modal helpers ────────────────────────────────────────────────────
  function closeInvoiceModal() {
    setShowInvoiceModal(false)
    setInvoiceStep('drop')
    setSelectedFile(null)
    setFileError('')
    setParsedResult(null)
    setFallbackMsg('')
    setFallbackFileInfo(null)
    setManualPrice('')
    setEditMode(false)
    setInvoiceMismatch(null)
  }

  function handleInvoiceDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setPopupError(err); return }
    setSelectedFile(f)
  }

  function handleInvoiceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setPopupError(err); return }
    setSelectedFile(f)
  }

  async function uploadInvoice(overrideQuoteMismatch = false) {
    if (!selectedFile) return
    setInvoiceStep('uploading')
    setFileError('')
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('quoteNumber', quoteNumber)
    if (overrideQuoteMismatch) fd.append('override_quote_mismatch', 'true')
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.status === 422 && data.error === 'invoice_quote_mismatch') {
      setInvoiceMismatch({ extracted_quote_number: data.extracted_quote_number, expected_quote_number: data.expected_quote_number, fileUrl: data.fileUrl })
      setInvoiceStep('invoice_quote_mismatch')
      return
    }
    if (!res.ok) { setFileError(data.error ?? 'Upload failed.'); setInvoiceStep('drop'); return }
    if (data.fallback) {
      setFallbackMsg(data.fallbackReason ?? "We couldn't read a total from this invoice.")
      setFallbackFileInfo({ fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType, fileSizeBytes: data.fileSizeBytes, markupPercentage: data.markupPercentage, commissionPercentage: data.commissionPercentage })
      setInvoiceStep('fallback')
    } else {
      setParsedResult(data)
      setEditValues({ customerPrice: data.customerPrice.toFixed(2), contractorRate: data.contractorRate.toFixed(2), grossMarkup: data.grossMarkup.toFixed(2), omnisideCommission: data.omnisideCommission.toFixed(2), clientMargin: data.clientMargin.toFixed(2) })
      setInvoiceStep('confirm')
    }
  }

  function applyManualPrice() {
    const price = parseFloat(manualPrice)
    if (!price || price <= 0 || !fallbackFileInfo) return
    const calc = calculateCommissionFromCustomerPrice({ customerPrice: price, markupPercentage: fallbackFileInfo.markupPercentage, commissionPercentage: fallbackFileInfo.commissionPercentage })
    setParsedResult({ ...fallbackFileInfo, ...calc })
    setEditValues({ customerPrice: calc.customerPrice.toFixed(2), contractorRate: calc.contractorRate.toFixed(2), grossMarkup: calc.grossMarkup.toFixed(2), omnisideCommission: calc.omnisideCommission.toFixed(2), clientMargin: calc.clientMargin.toFixed(2) })
    setInvoiceStep('confirm')
  }

  async function confirmInvoiceUpload() {
    if (!parsedResult) return
    setConfirming(true)
    const values = editMode ? {
      customerPrice: parseFloat(editValues.customerPrice),
      contractorRate: parseFloat(editValues.contractorRate),
      grossMarkup: parseFloat(editValues.grossMarkup),
      omnisideCommission: parseFloat(editValues.omnisideCommission),
      clientMargin: parseFloat(editValues.clientMargin),
    } : {
      customerPrice: parsedResult.customerPrice,
      contractorRate: parsedResult.contractorRate,
      grossMarkup: parsedResult.grossMarkup,
      omnisideCommission: parsedResult.omnisideCommission,
      clientMargin: parsedResult.clientMargin,
    }
    const res = await fetch('/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteNumber, fileUrl: parsedResult.fileUrl, fileName: parsedResult.fileName, fileType: parsedResult.fileType, fileSizeBytes: parsedResult.fileSizeBytes, ...values }),
    })
    setConfirming(false)
    if (!res.ok) { const d = await res.json(); setFileError(d.error ?? 'Save failed.'); return }
    setHasInvoice(true)
    setInvoiceUrl(parsedResult.fileUrl)
    setInvoiceFileName(parsedResult.fileName)
    closeInvoiceModal()
  }

  // ── Job report upload ────────────────────────────────────────────────────────
  function handleJobReportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setPopupError(err); return }
    setJobReportUploadFile(f)
  }

  async function uploadJobReport() {
    if (!jobReportUploadFile) return
    setJobReportUploading(true)
    setJobReportError('')
    const fd = new FormData()
    fd.append('file', jobReportUploadFile)
    fd.append('quoteNumber', quoteNumber)
    const res = await fetch('/api/upload/job-report', { method: 'POST', body: fd })
    const data = await res.json()
    setJobReportUploading(false)
    if (!res.ok) { setJobReportError(data.error ?? 'Upload failed.'); return }
    setHasJobReport(true)
    setJobReportUrl(data.fileUrl)
    setJobReportFileName(data.fileName)
    setShowJobReportModal(false)
    setJobReportUploadFile(null)
  }

  // ── Multi-upload ─────────────────────────────────────────────────────────────
  const handleMultiFileSelect = useCallback((files: FileList) => {
    const arr = Array.from(files)
    if (arr.length < 2) { setPopupError('Please select two files — one invoice and one job report.'); return }
    if (arr.length > 2) { setPopupError('Please select exactly two files.'); return }

    // Individual file validation
    for (const f of arr) {
      const err = validateFile(f)
      if (err) { setPopupError(err); return }
    }

    // Identical file check
    if (arr[0].name === arr[1].name && arr[0].size === arr[1].size) {
      setPopupError('Both files appear to be the same. Please select two different documents.')
      return
    }

    // Check if replacing existing
    if (hasInvoice || hasJobReport) {
      setPendingMultiFiles(arr)
      setShowMultiConfirmModal(true)
    } else {
      void runMultiUpload(arr)
    }
  }, [hasInvoice, hasJobReport]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runMultiUpload(files: File[]) {
    setShowMultiConfirmModal(false)
    setPendingMultiFiles(null)
    setMultiUploading(true)
    setPopupError('')

    const fd = new FormData()
    fd.append('file1', files[0])
    fd.append('file2', files[1])

    const res = await fetch(`/api/jobs/${quoteNumber}/classify-documents`, { method: 'POST', body: fd })
    const data = await res.json()
    setMultiUploading(false)

    if (res.status === 422) { setPopupError(data.error ?? 'Classification failed.'); return }
    if (res.status === 400) { setPopupError(data.error ?? 'File validation failed.'); return }
    if (!res.ok) { setPopupError('Something went wrong. Please try uploading the files individually.'); return }

    setHasInvoice(true)
    setInvoiceUrl(data.invoiceUrl)
    setInvoiceFileName(data.invoiceFileName)
    setHasJobReport(true)
    setJobReportUrl(data.jobReportUrl)
    setJobReportFileName(data.jobReportFileName)

    // Reset file input
    if (multiFileInputRef.current) multiFileInputRef.current.value = ''
  }

  function getMultiConfirmText() {
    if (hasInvoice && hasJobReport) return 'This will replace your existing invoice and job report.'
    if (hasInvoice) return 'This will replace your existing invoice.'
    return 'This will replace your existing job report.'
  }

  // ── Submit Job ───────────────────────────────────────────────────────────────
  async function submitJob() {
    setSubmitting(true)
    setSubmitError('')
    const res = await fetch(`/api/jobs/${quoteNumber}/complete`, { method: 'POST' })
    setSubmitting(false)
    if (!res.ok) {
      const d = await res.json()
      setSubmitError(d.error ?? 'Failed to submit job. Please try again.')
      return
    }
    const d = await res.json()
    setSubmitHasEmail(d.hasCustomerEmail !== false)
    setSubmitSuccess(true)
    setTimeout(() => router.refresh(), 1500)
  }

  // ── Read-only view ───────────────────────────────────────────────────────────
  if (readOnly) {
    return (
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9]">Documents</h2>

        {/* Invoice slot */}
        <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">📄 Invoice</span>
            <StatusBadge uploaded={hasInvoice} />
          </div>
          {hasInvoice && invoiceUrl && (
            <div className="flex items-center gap-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
              <span className="truncate">{invoiceFileName ?? 'Invoice'}</span>
              <a href={invoiceUrl} download className="shrink-0 text-[#2563EB] dark:text-[#3B82F6] hover:underline font-medium">Download</a>
            </div>
          )}
        </div>

        {/* Job Report slot */}
        <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">📋 Job Report</span>
            <StatusBadge uploaded={hasJobReport} />
          </div>
          {hasJobReport && jobReportUrl && (
            <div className="flex items-center gap-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
              <span className="truncate">{jobReportFileName ?? 'Job Report'}</span>
              <a href={jobReportUrl} download className="shrink-0 text-[#2563EB] dark:text-[#3B82F6] hover:underline font-medium">Download</a>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Upload view (admin + subcontractor) ──────────────────────────────────────
  return (
    <>
      {/* Error popup */}
      {popupError && <ErrorPopup message={popupError} onDismiss={() => setPopupError('')} />}

      {/* Submit success popup */}
      {submitSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full px-4">
          <div className="bg-green-600 text-white text-sm rounded-xl px-4 py-3 shadow-lg flex items-start gap-2">
            {submitHasEmail
              ? '✅  Done! Your invoice and job report has been sent to the customer.'
              : '✅  Job completed. No customer email on file — Oli has been notified to send the portal link manually.'}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9]">Complete This Job</h2>

        {/* Invoice slot */}
        <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">📄 Invoice</span>
            <StatusBadge uploaded={hasInvoice} />
          </div>
          {hasInvoice && invoiceUrl ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[#6B7280] dark:text-[#94A3B8] truncate flex-1">{invoiceFileName ?? 'Invoice'}</span>
              <a href={invoiceUrl} download className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">Download</a>
              <button
                onClick={() => { closeInvoiceModal(); setShowInvoiceModal(true) }}
                className="text-xs text-[#9CA3AF] dark:text-[#475569] hover:text-[#6B7280] underline"
              >
                Replace
              </button>
            </div>
          ) : (
            <Button onClick={() => { closeInvoiceModal(); setShowInvoiceModal(true) }}>
              Attach Invoice
            </Button>
          )}
        </div>

        {/* Job Report slot */}
        <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">📋 Job Report</span>
            <StatusBadge uploaded={hasJobReport} />
          </div>
          {hasJobReport && jobReportUrl ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[#6B7280] dark:text-[#94A3B8] truncate flex-1">{jobReportFileName ?? 'Job Report'}</span>
              <a href={jobReportUrl} download className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">Download</a>
              <button
                onClick={() => { setJobReportError(''); setJobReportUploadFile(null); setShowJobReportModal(true) }}
                className="text-xs text-[#9CA3AF] dark:text-[#475569] hover:text-[#6B7280] underline"
              >
                Replace
              </button>
            </div>
          ) : (
            <Button onClick={() => { setJobReportError(''); setJobReportUploadFile(null); setShowJobReportModal(true) }}>
              Attach Job Report
            </Button>
          )}
        </div>

        {/* Helper text */}
        <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{getHelperText()}</p>

        {/* Divider + multi-upload */}
        <div className="flex flex-col items-center gap-2 py-1">
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#334155]" />
            <span className="text-xs text-[#9CA3AF] dark:text-[#475569]">or</span>
            <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#334155]" />
          </div>
          <input
            ref={multiFileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => { if (e.target.files) handleMultiFileSelect(e.target.files) }}
          />
          <button
            onClick={() => multiFileInputRef.current?.click()}
            disabled={multiUploading}
            className="w-full px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] disabled:opacity-60 transition-colors"
          >
            {multiUploading
              ? 'Analysing documents…'
              : <>
                  <span className="md:hidden">Upload Both</span>
                  <span className="hidden md:inline">Upload Both Documents</span>
                </>}
          </button>
          <p className="text-xs text-[#9CA3AF] dark:text-[#475569] text-center">
            Jobbly will automatically work out which file is the invoice and which is the job report.
          </p>
        </div>

        {/* Submit Job */}
        <div className="pt-2 border-t border-[#F3F4F6] dark:border-[#334155]">
          {submitError && <p className="text-sm text-[#DC2626] mb-3">{submitError}</p>}
          <Button
            onClick={submitJob}
            disabled={!bothReady || submitting || submitSuccess}
            className="w-full"
          >
            {submitting ? 'Submitting…' : submitSuccess ? 'Submitted ✓' : 'Submit Job'}
          </Button>
        </div>
      </div>

      {/* Multi-upload replace confirmation */}
      {showMultiConfirmModal && (
        <Modal title="Replace existing documents?" onClose={() => { setShowMultiConfirmModal(false); setPendingMultiFiles(null) }}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            {getMultiConfirmText()} Are you sure?
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setShowMultiConfirmModal(false); setPendingMultiFiles(null) }}>Cancel</Button>
            <Button onClick={() => { if (pendingMultiFiles) void runMultiUpload(pendingMultiFiles) }}>Yes, replace</Button>
          </div>
        </Modal>
      )}

      {/* Invoice modal */}
      {showInvoiceModal && (
        <Modal title="Attach Invoice" onClose={closeInvoiceModal}>
          {invoiceStep === 'drop' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleInvoiceDrop}
                className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${dragOver ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30' : 'border-[#D1D5DB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A]'}`}
                onClick={() => invoiceFileInputRef.current?.click()}
              >
                <input ref={invoiceFileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleInvoiceFileChange} />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{selectedFile.name}</p>
                    <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{fmtBytes(selectedFile.size)}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <svg className="w-8 h-8 text-[#9CA3AF] dark:text-[#475569]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <div>
                      <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">Drag and drop your invoice here</p>
                      <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-1">PDF, JPG, or PNG — max 10MB</p>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); invoiceFileInputRef.current?.click() }} className="px-4 py-2 text-sm font-medium rounded-lg border border-[#D1D5DB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors">
                      Choose File
                    </button>
                  </div>
                )}
              </div>
              {fileError && <p className="text-sm text-[#DC2626]">{fileError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeInvoiceModal}>Cancel</Button>
                <Button onClick={() => uploadInvoice()} disabled={!selectedFile}>Upload</Button>
              </div>
            </div>
          )}

          {invoiceStep === 'uploading' && (
            <div className="py-12 flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[#E5E7EB] dark:border-[#334155] border-t-[#2563EB] rounded-full animate-spin" />
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Uploading and reading invoice…</p>
            </div>
          )}

          {invoiceStep === 'invoice_quote_mismatch' && invoiceMismatch && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
                <span className="text-lg leading-none mt-0.5">❌</span>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Quote number doesn&apos;t match</p>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                    The invoice appears to reference quote number &quot;{invoiceMismatch.extracted_quote_number}&quot;, but this job is for quote number {invoiceMismatch.expected_quote_number}.
                  </p>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Please check you&apos;ve uploaded the correct invoice.</p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setInvoiceStep('drop'); setSelectedFile(null); setInvoiceMismatch(null) }}>Try again</Button>
                <button onClick={() => uploadInvoice(true)} className="px-4 py-2 text-sm font-medium rounded-lg border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 transition-colors">Upload anyway</button>
              </div>
            </div>
          )}

          {invoiceStep === 'fallback' && (
            <div className="space-y-4">
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{fallbackMsg}</p>
              <div>
                <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">Customer price (ex GST)</label>
                <input type="number" min="0" step="0.01" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="e.g. 250.00" className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
              </div>
              {fileError && <p className="text-sm text-[#DC2626]">{fileError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeInvoiceModal}>Cancel</Button>
                <Button onClick={applyManualPrice} disabled={!manualPrice || parseFloat(manualPrice) <= 0}>Calculate & Review</Button>
              </div>
            </div>
          )}

          {invoiceStep === 'confirm' && parsedResult && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Invoice uploaded —</p>
              <div className="bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Extracted from invoice</p>
                {editMode ? (
                  <div className="space-y-2">
                    {([['customerPrice', 'Customer price (ex GST)'], ['contractorRate', 'Contractor rate'], ['grossMarkup', 'Gross markup']] as [keyof typeof editValues, string][]).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-[#374151] dark:text-[#CBD5E1] w-40">{label}</span>
                        <input type="number" step="0.01" value={editValues[key]} onChange={(e) => setEditValues(v => ({ ...v, [key]: e.target.value }))} className="w-32 px-2 py-1 text-sm text-right border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Customer price (ex GST)</span><span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(parsedResult.customerPrice)}</span></div>
                    <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-2 space-y-1">
                      <p className="text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-1">Calculated</p>
                      <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Contractor rate</span><span className="font-semibold">{fmt(parsedResult.contractorRate)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Gross markup</span><span className="font-semibold">{fmt(parsedResult.grossMarkup)}</span></div>
                    </div>
                    <p className="text-xs text-[#9CA3AF] dark:text-[#475569] pt-1">Based on {parsedResult.markupPercentage}% markup from campaign settings.</p>
                  </div>
                )}
              </div>
              {fileError && <p className="text-sm text-[#DC2626]">{fileError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setEditMode(!editMode)}>{editMode ? 'Show preview' : 'Edit manually'}</Button>
                <Button onClick={confirmInvoiceUpload} disabled={confirming}>{confirming ? 'Saving…' : 'Confirm & Close'}</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Job report modal */}
      {showJobReportModal && (
        <Modal title="Attach Job Report" onClose={() => { setShowJobReportModal(false); setJobReportUploadFile(null); setJobReportError('') }}>
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-[#D1D5DB] dark:border-[#334155] rounded-xl p-8 text-center cursor-pointer hover:border-[#2563EB] transition-colors bg-[#F9FAFB] dark:bg-[#0F172A]"
              onClick={() => jobReportFileInputRef.current?.click()}
            >
              <input ref={jobReportFileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleJobReportFileChange} />
              {jobReportUploadFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{jobReportUploadFile.name}</p>
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{fmtBytes(jobReportUploadFile.size)}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-7 h-7 text-[#9CA3AF] dark:text-[#475569]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Drag and drop or <span className="text-[#2563EB]">choose file</span></p>
                  <p className="text-xs text-[#9CA3AF] dark:text-[#475569]">PDF, JPG, or PNG — max 10MB</p>
                </div>
              )}
            </div>
            {jobReportError && <p className="text-sm text-[#DC2626]">{jobReportError}</p>}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setShowJobReportModal(false); setJobReportUploadFile(null); setJobReportError('') }}>Cancel</Button>
              <Button onClick={uploadJobReport} disabled={!jobReportUploadFile || jobReportUploading}>{jobReportUploading ? 'Uploading…' : 'Upload'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
