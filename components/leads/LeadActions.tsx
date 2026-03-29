'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { calculateCommissionFromCustomerPrice } from '@/lib/calculateCommission'

const STATUS_ORDER = ['LEAD_RECEIVED', 'QUOTE_SENT', 'JOB_BOOKED', 'JOB_COMPLETED']
const STATUS_LABELS: Record<string, string> = {
  LEAD_RECEIVED: 'Lead Received',
  QUOTE_SENT: 'Quote Sent',
  JOB_BOOKED: 'Job Booked',
  JOB_COMPLETED: 'Job Completed',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const CURRENT_YEAR = new Date().getFullYear()
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024

interface LeadActionsProps {
  quoteNumber: string
  currentStatus: string
  hasInvoice: boolean
  markupPercentage: number
  customerName?: string
  propertyAddress?: string
}

type UploadStep = 'drop' | 'uploading' | 'confirm' | 'fallback' | 'manual'
type QuoteUploadStep = 'drop' | 'uploading' | 'mismatch' | 'success'

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

export default function LeadActions({
  quoteNumber, currentStatus, hasInvoice, markupPercentage, customerName, propertyAddress,
}: LeadActionsProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const quoteFileInputRef = useRef<HTMLInputElement>(null)

  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showRevertModal, setShowRevertModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showReplaceQuoteModal, setShowReplaceQuoteModal] = useState(false)
  const [quoteModalIsReplace, setQuoteModalIsReplace] = useState(true)
  const [quoteFile, setQuoteFile] = useState<File | null>(null)
  const [quoteDragOver, setQuoteDragOver] = useState(false)
  const [quoteFileError, setQuoteFileError] = useState('')
  const [quoteUploading, setQuoteUploading] = useState(false)
  const [quoteSuccess, setQuoteSuccess] = useState('')
  const [quoteUploadStep, setQuoteUploadStep] = useState<QuoteUploadStep>('drop')
  const [parsedOptionsCount, setParsedOptionsCount] = useState<number | null>(null)
  const [quoteMismatch, setQuoteMismatch] = useState<{ extracted_name: string | null; extracted_address: string | null; extracted_quote_number: string | null } | null>(null)
  const [reverting, setReverting] = useState(false)
  const [revertError, setRevertError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Job booked date
  const [bookedDay, setBookedDay] = useState('')
  const [bookedMonth, setBookedMonth] = useState('')
  const [bookedYear, setBookedYear] = useState('')
  const [dateError, setDateError] = useState('')

  // Invoice upload state
  const [uploadStep, setUploadStep] = useState<UploadStep>('drop')
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

  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  const nextStatus = currentIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIdx + 1] : null
  const previousStatus = currentIdx > 0 ? STATUS_ORDER[currentIdx - 1] : null
  const isBookingStep = nextStatus === 'JOB_BOOKED'

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

  function validateBookedDate(): Date | null {
    if (!bookedDay || !bookedMonth || !bookedYear) return null
    const d = new Date(parseInt(bookedYear), parseInt(bookedMonth) - 1, parseInt(bookedDay))
    if (d.getFullYear() !== parseInt(bookedYear) || d.getMonth() !== parseInt(bookedMonth) - 1 || d.getDate() !== parseInt(bookedDay)) return null
    return d
  }

  const bookedDateFilled = !!(bookedDay && bookedMonth && bookedYear)
  const bookedDateValid = bookedDateFilled ? validateBookedDate() !== null : true

  async function updateStatus() {
    if (isBookingStep) {
      const d = validateBookedDate()
      if (!d) { setDateError('Please select a valid date.'); return }
      setDateError('')
    }
    if (!nextStatus) return
    setSaving(true)
    setError('')
    const body: Record<string, unknown> = { status: nextStatus }
    if (isBookingStep) body.jobBookedDate = validateBookedDate()!.toISOString()
    const res = await fetch(`/api/leads/${quoteNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Something went wrong.'); return }
    setShowStatusModal(false)
    router.refresh()
  }

  function validateFile(f: File): string | null {
    if (!ALLOWED_TYPES.includes(f.type)) return 'Only PDF, JPG, and PNG files are accepted.'
    if (f.size > MAX_SIZE) return 'File must be under 10MB.'
    return null
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setFileError(err); return }
    setFileError('')
    setSelectedFile(f)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setFileError(err); return }
    setFileError('')
    setSelectedFile(f)
  }

  async function uploadFile() {
    if (!selectedFile) return
    setUploadStep('uploading')
    setFileError('')
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('quoteNumber', quoteNumber)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) {
      setFileError(data.error ?? 'Upload failed.')
      setUploadStep('drop')
      return
    }
    if (data.fallback) {
      setFallbackMsg(data.fallbackReason ?? "We couldn't read a total from this invoice.")
      setFallbackFileInfo({ fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType, fileSizeBytes: data.fileSizeBytes, markupPercentage: data.markupPercentage, commissionPercentage: data.commissionPercentage })
      setUploadStep('fallback')
    } else {
      setParsedResult(data)
      setEditValues({
        customerPrice: data.customerPrice.toFixed(2),
        contractorRate: data.contractorRate.toFixed(2),
        grossMarkup: data.grossMarkup.toFixed(2),
        omnisideCommission: data.omnisideCommission.toFixed(2),
        clientMargin: data.clientMargin.toFixed(2),
      })
      setUploadStep('confirm')
    }
  }

  function applyManualPrice() {
    const price = parseFloat(manualPrice)
    if (!price || price <= 0 || !fallbackFileInfo) return
    const calc = calculateCommissionFromCustomerPrice({
      customerPrice: price,
      markupPercentage: fallbackFileInfo.markupPercentage,
      commissionPercentage: fallbackFileInfo.commissionPercentage,
    })
    setParsedResult({ ...fallbackFileInfo, ...calc })
    setEditValues({
      customerPrice: calc.customerPrice.toFixed(2),
      contractorRate: calc.contractorRate.toFixed(2),
      grossMarkup: calc.grossMarkup.toFixed(2),
      omnisideCommission: calc.omnisideCommission.toFixed(2),
      clientMargin: calc.clientMargin.toFixed(2),
    })
    setUploadStep('confirm')
  }

  async function confirmUpload() {
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
      body: JSON.stringify({
        quoteNumber,
        fileUrl: parsedResult.fileUrl,
        fileName: parsedResult.fileName,
        fileType: parsedResult.fileType,
        fileSizeBytes: parsedResult.fileSizeBytes,
        ...values,
      }),
    })
    setConfirming(false)
    if (!res.ok) { const d = await res.json(); setFileError(d.error ?? 'Save failed.'); return }
    closeInvoiceModal()
    router.refresh()
  }

  function handleQuoteFileDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setQuoteDragOver(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    if (f.type !== 'application/pdf') { setQuoteFileError('Only PDF files are accepted.'); return }
    if (f.size > MAX_SIZE) { setQuoteFileError('File must be under 10MB.'); return }
    setQuoteFileError('')
    setQuoteFile(f)
  }

  function handleQuoteFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') { setQuoteFileError('Only PDF files are accepted.'); return }
    if (f.size > MAX_SIZE) { setQuoteFileError('File must be under 10MB.'); return }
    setQuoteFileError('')
    setQuoteFile(f)
  }

  async function uploadReplaceQuote(skipValidation = false) {
    if (!quoteFile) return
    setQuoteUploading(true)
    setQuoteUploadStep('uploading')
    setQuoteFileError('')
    setQuoteMismatch(null)
    const fd = new FormData()
    fd.append('file', quoteFile)
    fd.append('quoteNumber', quoteNumber)
    if (quoteModalIsReplace) fd.append('replace', 'true')
    if (skipValidation) fd.append('skip_validation', 'true')
    const res = await fetch('/api/upload/quote', { method: 'POST', body: fd })
    setQuoteUploading(false)
    if (res.status === 422) {
      const d = await res.json()
      if (d.error === 'quote_mismatch') {
        setQuoteMismatch({ extracted_name: d.extracted_name ?? null, extracted_address: d.extracted_address ?? null, extracted_quote_number: d.extracted_quote_number ?? null })
        setQuoteUploadStep('mismatch')
        return
      }
    }
    if (!res.ok) {
      const d = await res.json()
      setQuoteFileError(d.error ?? 'Upload failed.')
      setQuoteUploadStep('drop')
      return
    }
    if (quoteModalIsReplace) {
      setQuoteSuccess("Quote replaced successfully. The customer's booking link now points to the updated quote.")
      setTimeout(() => { closeReplaceQuoteModal(); router.refresh() }, 2000)
    } else {
      const d = await res.json()
      setParsedOptionsCount(typeof d.parsedOptionsCount === 'number' ? d.parsedOptionsCount : null)
      setQuoteUploadStep('success')
      setTimeout(() => { closeReplaceQuoteModal(); router.refresh() }, 2000)
    }
  }

  function closeReplaceQuoteModal() {
    setShowReplaceQuoteModal(false)
    setQuoteFile(null)
    setQuoteFileError('')
    setQuoteUploading(false)
    setQuoteSuccess('')
    setQuoteUploadStep('drop')
    setQuoteMismatch(null)
    setParsedOptionsCount(null)
  }

  function closeInvoiceModal() {
    setShowInvoiceModal(false)
    setUploadStep('drop')
    setSelectedFile(null)
    setFileError('')
    setParsedResult(null)
    setFallbackMsg('')
    setFallbackFileInfo(null)
    setManualPrice('')
    setEditMode(false)
  }

  const confirmDisabled = saving || (nextStatus === 'JOB_COMPLETED' && !hasInvoice) || (isBookingStep && bookedDateFilled && !bookedDateValid)

  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {currentStatus === 'LEAD_RECEIVED' ? (
            <Button onClick={() => { setQuoteModalIsReplace(false); setQuoteFileError(''); setQuoteUploadStep('drop'); setQuoteFile(null); setQuoteSuccess(''); setShowReplaceQuoteModal(true) }}>
              Upload Quote
            </Button>
          ) : currentStatus === 'JOB_BOOKED' ? (
            <Button onClick={() => { closeInvoiceModal(); setShowInvoiceModal(true) }}>
              {hasInvoice ? 'Replace Invoice' : 'Attach Invoice'}
            </Button>
          ) : nextStatus && nextStatus !== 'JOB_BOOKED' && (
            <Button onClick={() => { setError(''); setDateError(''); setShowStatusModal(true) }}>
              Move to {STATUS_LABELS[nextStatus]}
            </Button>
          )}
          {(currentStatus === 'QUOTE_SENT' || currentStatus === 'JOB_BOOKED') && (
            <Button variant="secondary" onClick={() => { setQuoteModalIsReplace(true); setQuoteFileError(''); setQuoteUploadStep('drop'); setQuoteFile(null); setQuoteSuccess(''); setShowReplaceQuoteModal(true) }}>
              Replace Quote
            </Button>
          )}
          {currentStatus === 'JOB_COMPLETED' && (
            <Button variant="secondary" onClick={() => { closeInvoiceModal(); setShowInvoiceModal(true) }}>
              {hasInvoice ? 'Replace Invoice' : 'Attach Invoice'}
            </Button>
          )}
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

      {/* Status modal */}
      {showStatusModal && nextStatus && (
        <Modal title="Update Status" onClose={() => setShowStatusModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            Move this lead to <strong>{STATUS_LABELS[nextStatus]}</strong>?
            {nextStatus === 'JOB_COMPLETED' && !hasInvoice && (
              <span className="block mt-2 text-[#DC2626]">You must attach an invoice before marking this job complete.</span>
            )}
          </p>
          {isBookingStep && (
            <div className="mb-4">
              <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-2">Job booked date</p>
              <div className="flex gap-2">
                <select value={bookedDay} onChange={(e) => { setBookedDay(e.target.value); setDateError('') }} className="flex-1 px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]">
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={bookedMonth} onChange={(e) => { setBookedMonth(e.target.value); setDateError('') }} className="flex-[2] px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]">
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={bookedYear} onChange={(e) => { setBookedYear(e.target.value); setDateError('') }} className="flex-1 px-2 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]">
                  <option value="">Year</option>
                  <option value={CURRENT_YEAR}>{CURRENT_YEAR}</option>
                  <option value={CURRENT_YEAR + 1}>{CURRENT_YEAR + 1}</option>
                </select>
                <button
                  type="button"
                  onClick={() => { const t = new Date(); setBookedDay(String(t.getDate())); setBookedMonth(String(t.getMonth() + 1)); setBookedYear(String(t.getFullYear())); setDateError('') }}
                  className="px-3 py-2 text-xs font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors whitespace-nowrap"
                >
                  Today
                </button>
              </div>
              {dateError && <p className="mt-1 text-xs text-[#DC2626]">{dateError}</p>}
              {bookedDateFilled && !bookedDateValid && <p className="mt-1 text-xs text-[#DC2626]">Please select a valid date.</p>}
            </div>
          )}
          {error && <p className="text-sm text-[#DC2626] mb-3">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button onClick={updateStatus} disabled={confirmDisabled || (isBookingStep && !bookedDateFilled)}>
              {saving ? 'Saving…' : `Confirm — Move to ${STATUS_LABELS[nextStatus]}`}
            </Button>
          </div>
        </Modal>
      )}

      {/* Invoice modal */}
      {showInvoiceModal && (
        <Modal title="Attach Invoice" onClose={closeInvoiceModal}>
          {/* STEP: drop */}
          {uploadStep === 'drop' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${dragOver ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30' : 'border-[#D1D5DB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A]'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileChange}
                />
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
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                      className="px-4 py-2 text-sm font-medium rounded-lg border border-[#D1D5DB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors"
                    >
                      Choose File
                    </button>
                  </div>
                )}
              </div>
              {fileError && <p className="text-sm text-[#DC2626]">{fileError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeInvoiceModal}>Cancel</Button>
                <Button onClick={uploadFile} disabled={!selectedFile}>Upload</Button>
              </div>
            </div>
          )}

          {/* STEP: uploading */}
          {uploadStep === 'uploading' && (
            <div className="py-12 flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[#E5E7EB] dark:border-[#334155] border-t-[#2563EB] rounded-full animate-spin" />
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Uploading and reading invoice…</p>
            </div>
          )}

          {/* STEP: fallback */}
          {uploadStep === 'fallback' && (
            <div className="space-y-4">
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{fallbackMsg}</p>
              <div>
                <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">Customer price (ex GST)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder="e.g. 250.00"
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              {fileError && <p className="text-sm text-[#DC2626]">{fileError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeInvoiceModal}>Cancel</Button>
                <Button onClick={applyManualPrice} disabled={!manualPrice || parseFloat(manualPrice) <= 0}>Calculate & Review</Button>
              </div>
            </div>
          )}

          {/* STEP: confirm */}
          {uploadStep === 'confirm' && parsedResult && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Invoice uploaded —</p>
              <div className="bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Extracted from invoice</p>
                {editMode ? (
                  <div className="space-y-2">
                    {([ ['customerPrice', 'Customer price (ex GST)'], ['contractorRate', 'Contractor rate'], ['grossMarkup', 'Gross markup'], ['omnisideCommission', 'Omniside commission'], ['clientMargin', 'Client margin'] ] as [keyof typeof editValues, string][]).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-[#374151] dark:text-[#CBD5E1] w-40">{label}</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editValues[key]}
                          onChange={(e) => setEditValues(v => ({ ...v, [key]: e.target.value }))}
                          className="w-32 px-2 py-1 text-sm text-right border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Customer price (ex GST)</span><span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(parsedResult.customerPrice)}</span></div>
                    <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-2 space-y-1">
                      <p className="text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-1">Calculated</p>
                      <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Contractor rate</span><span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(parsedResult.contractorRate)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Gross markup</span><span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(parsedResult.grossMarkup)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Omniside commission</span><span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(parsedResult.omnisideCommission)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-[#374151] dark:text-[#CBD5E1]">Client margin</span><span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(parsedResult.clientMargin)}</span></div>
                    </div>
                    <p className="text-xs text-[#9CA3AF] dark:text-[#475569] pt-1">Based on {parsedResult.markupPercentage}% markup and {parsedResult.commissionPercentage}% commission from campaign settings.</p>
                  </div>
                )}
              </div>
              {fileError && <p className="text-sm text-[#DC2626]">{fileError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setEditMode(!editMode)}>
                  {editMode ? 'Show preview' : 'Edit manually'}
                </Button>
                <Button onClick={confirmUpload} disabled={confirming}>
                  {confirming ? 'Saving…' : 'Confirm & Close'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Revert modal */}
      {showRevertModal && previousStatus && (
        <Modal title="Revert status?" onClose={() => setShowRevertModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            This will move this lead back from <strong>{STATUS_LABELS[currentStatus]}</strong> to <strong>{STATUS_LABELS[previousStatus]}</strong>. This action will be logged.
          </p>
          {revertError && <p className="text-sm text-[#DC2626] mb-3">{revertError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowRevertModal(false)}>Cancel</Button>
            <Button onClick={revertStatus} disabled={reverting}>{reverting ? 'Reverting…' : 'Confirm Revert'}</Button>
          </div>
        </Modal>
      )}

      {/* Replace Quote modal */}
      {showReplaceQuoteModal && (
        <Modal title={quoteModalIsReplace ? 'Replace Quote' : 'Upload Quote'} onClose={closeReplaceQuoteModal}>
          {quoteUploadStep === 'uploading' && (
            <div className="py-12 flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[#E5E7EB] dark:border-[#334155] border-t-[#2563EB] rounded-full animate-spin" />
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Uploading and validating quote…</p>
            </div>
          )}

          {quoteUploadStep === 'success' && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-lg font-semibold text-green-700 dark:text-green-400">Quote approved</p>
              <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">The quote details match this customer.</p>
              {parsedOptionsCount !== null && parsedOptionsCount > 0 ? (
                <>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">{parsedOptionsCount} pricing option{parsedOptionsCount !== 1 ? 's' : ''} found.</p>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">The quote has been sent to the customer.</p>
                </>
              ) : (
                <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Quote sent to customer — pricing options could not be read automatically.</p>
              )}
            </div>
          )}

          {quoteUploadStep === 'mismatch' && quoteMismatch && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
                <span className="text-lg leading-none mt-0.5">❌</span>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Quote details don&apos;t match</p>
                  <div>
                    <p className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-1">Found in document</p>
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Name: &quot;{quoteMismatch.extracted_name ?? 'unknown'}&quot;</p>
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Address: &quot;{quoteMismatch.extracted_address ?? 'unknown'}&quot;</p>
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Quote number: &quot;{quoteMismatch.extracted_quote_number ?? 'unknown'}&quot;</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-1">Expected</p>
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Name: {customerName}</p>
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Address: {propertyAddress}</p>
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Quote number: {quoteNumber}</p>
                  </div>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Please check you have uploaded the correct quote file.</p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setQuoteUploadStep('drop'); setQuoteFile(null); setQuoteMismatch(null) }}>
                  Try again
                </Button>
                <button
                  onClick={() => uploadReplaceQuote(true)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                >
                  Upload anyway
                </button>
              </div>
            </div>
          )}

          {quoteUploadStep === 'drop' && (
            <div className="space-y-4">
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                {quoteModalIsReplace
                  ? "Upload a replacement quote PDF. The customer's booking link will point to the updated quote. No new email will be sent."
                  : 'Upload the quote PDF for this lead. The customer will be emailed with their quote and a link to book.'}
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setQuoteDragOver(true) }}
                onDragLeave={() => setQuoteDragOver(false)}
                onDrop={handleQuoteFileDrop}
                onClick={() => quoteFileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${quoteDragOver ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30' : 'border-[#D1D5DB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A]'}`}
              >
                <input ref={quoteFileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleQuoteFileChange} />
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
                      <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">Drag and drop your quote PDF here</p>
                      <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-1">PDF only — max 10MB</p>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); quoteFileInputRef.current?.click() }} className="px-4 py-2 text-sm font-medium rounded-lg border border-[#D1D5DB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors">
                      Choose File
                    </button>
                  </div>
                )}
              </div>
              {quoteFileError && <p className="text-sm text-[#DC2626]">{quoteFileError}</p>}
              {quoteSuccess && <p className="text-sm text-[#16A34A]">{quoteSuccess}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeReplaceQuoteModal}>Cancel</Button>
                <Button onClick={() => uploadReplaceQuote()} disabled={!quoteFile || quoteUploading || !!quoteSuccess}>
                  {quoteUploading ? 'Uploading…' : quoteModalIsReplace ? 'Replace Quote' : 'Upload Quote'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
