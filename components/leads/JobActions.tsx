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
  markupPercentage: number
  jobTypes: JobType[]
  customerName?: string
  propertyAddress?: string
}

type UploadStep = 'drop' | 'uploading' | 'confirm' | 'fallback' | 'invoice_quote_mismatch'

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

export default function JobActions({ quoteNumber, currentStatus, hasInvoice, invoiceUrl, markupPercentage, jobTypes: _jobTypes, customerName: _customerName, propertyAddress: _propertyAddress }: JobActionsProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showRevertModal, setShowRevertModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertError, setRevertError] = useState('')

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
  const [successMsg, setSuccessMsg] = useState('')
  const [invoiceMismatch, setInvoiceMismatch] = useState<{ extracted_quote_number: string; expected_quote_number: string; fileUrl: string } | null>(null)

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

  async function uploadFile(overrideQuoteMismatch = false) {
    if (!selectedFile) return
    setUploadStep('uploading')
    setFileError('')
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('quoteNumber', quoteNumber)
    if (overrideQuoteMismatch) fd.append('override_quote_mismatch', 'true')
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.status === 422 && data.error === 'invoice_quote_mismatch') {
      setInvoiceMismatch({ extracted_quote_number: data.extracted_quote_number, expected_quote_number: data.expected_quote_number, fileUrl: data.fileUrl })
      setUploadStep('invoice_quote_mismatch')
      return
    }
    if (!res.ok) { setFileError(data.error ?? 'Upload failed.'); setUploadStep('drop'); return }
    if (data.fallback) {
      setFallbackMsg(data.fallbackReason ?? "We couldn't read a total from this invoice.")
      setFallbackFileInfo({ fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType, fileSizeBytes: data.fileSizeBytes, markupPercentage: data.markupPercentage, commissionPercentage: data.commissionPercentage })
      setUploadStep('fallback')
    } else {
      setParsedResult(data)
      setEditValues({ customerPrice: data.customerPrice.toFixed(2), contractorRate: data.contractorRate.toFixed(2), grossMarkup: data.grossMarkup.toFixed(2), omnisideCommission: data.omnisideCommission.toFixed(2), clientMargin: data.clientMargin.toFixed(2) })
      setUploadStep('confirm')
    }
  }

  function applyManualPrice() {
    const price = parseFloat(manualPrice)
    if (!price || price <= 0 || !fallbackFileInfo) return
    const calc = calculateCommissionFromCustomerPrice({ customerPrice: price, markupPercentage: fallbackFileInfo.markupPercentage, commissionPercentage: fallbackFileInfo.commissionPercentage })
    setParsedResult({ ...fallbackFileInfo, ...calc })
    setEditValues({ customerPrice: calc.customerPrice.toFixed(2), contractorRate: calc.contractorRate.toFixed(2), grossMarkup: calc.grossMarkup.toFixed(2), omnisideCommission: calc.omnisideCommission.toFixed(2), clientMargin: calc.clientMargin.toFixed(2) })
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
      body: JSON.stringify({ quoteNumber, fileUrl: parsedResult.fileUrl, fileName: parsedResult.fileName, fileType: parsedResult.fileType, fileSizeBytes: parsedResult.fileSizeBytes, ...values }),
    })
    setConfirming(false)
    if (!res.ok) { const d = await res.json(); setFileError(d.error ?? 'Save failed.'); return }
    const resData = await res.json()
    if (resData.autoCompleted) {
      setFileError('')
      setSuccessMsg('Invoice uploaded and job marked as completed.')
      setTimeout(() => { closeInvoiceModal(); router.refresh() }, 1500)
      return
    }
    closeInvoiceModal()
    router.refresh()
  }

  function closeInvoiceModal() {
    setShowInvoiceModal(false)
    setUploadStep('drop')
    setSelectedFile(null)
    setFileError('')
    setSuccessMsg('')
    setParsedResult(null)
    setFallbackMsg('')
    setFallbackFileInfo(null)
    setManualPrice('')
    setEditMode(false)
    setInvoiceMismatch(null)
  }

  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-2">Current Status</h2>
        <div className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9] mb-4">{currentStatus.replace(/_/g, ' ')}</div>
        <div className="flex flex-wrap gap-3">
          {(currentStatus === 'JOB_BOOKED' || currentStatus === 'JOB_COMPLETED') && (
            <Button onClick={() => { closeInvoiceModal(); setShowInvoiceModal(true) }}>
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

      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Invoice</h2>
        {hasInvoice && invoiceUrl ? (
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">Invoice attached ✓</p>
            <a href={invoiceUrl} download className="text-sm text-[#2563EB] dark:text-[#3B82F6] hover:underline">Download</a>
          </div>
        ) : (
          <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">No invoice yet. Attach an invoice before marking the job complete.</p>
        )}
      </div>

      {/* Revert modal */}
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

      {/* Invoice modal */}
      {showInvoiceModal && (
        <Modal title="Attach Invoice" onClose={closeInvoiceModal}>
          {uploadStep === 'drop' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${dragOver ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30' : 'border-[#D1D5DB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A]'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
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
                    <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }} className="px-4 py-2 text-sm font-medium rounded-lg border border-[#D1D5DB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors">
                      Choose File
                    </button>
                  </div>
                )}
              </div>
              {fileError && <p className="text-sm text-[#DC2626]">{fileError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeInvoiceModal}>Cancel</Button>
                <Button onClick={() => uploadFile()} disabled={!selectedFile}>Upload</Button>
              </div>
            </div>
          )}

          {uploadStep === 'uploading' && (
            <div className="py-12 flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[#E5E7EB] dark:border-[#334155] border-t-[#2563EB] rounded-full animate-spin" />
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Uploading and reading invoice…</p>
            </div>
          )}

          {uploadStep === 'invoice_quote_mismatch' && invoiceMismatch && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
                <span className="text-lg leading-none mt-0.5">❌</span>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Quote number doesn&apos;t match</p>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                    The invoice appears to reference quote number &quot;{invoiceMismatch.extracted_quote_number}&quot;,
                    but this job is for quote number {invoiceMismatch.expected_quote_number}.
                  </p>
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Please check you&apos;ve uploaded the correct invoice.</p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setUploadStep('drop'); setSelectedFile(null); setInvoiceMismatch(null) }}>
                  Try again
                </Button>
                <button
                  onClick={() => uploadFile(true)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                >
                  Upload anyway
                </button>
              </div>
            </div>
          )}

          {uploadStep === 'fallback' && (
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

          {uploadStep === 'confirm' && parsedResult && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Invoice uploaded —</p>
              <div className="bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Extracted from invoice</p>
                {editMode ? (
                  <div className="space-y-2">
                    {([ ['customerPrice', 'Customer price (ex GST)'], ['contractorRate', 'Contractor rate'], ['grossMarkup', 'Gross markup'] ] as [keyof typeof editValues, string][]).map(([key, label]) => (
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
              {successMsg && <p className="text-sm text-[#16A34A]">{successMsg}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setEditMode(!editMode)}>{editMode ? 'Show preview' : 'Edit manually'}</Button>
                <Button onClick={confirmUpload} disabled={confirming || !!successMsg}>{confirming ? 'Saving…' : 'Confirm & Close'}</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
