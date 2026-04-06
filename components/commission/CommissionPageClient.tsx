'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatDateTime, formatDate } from '@/lib/formatDate'

interface MonthLead {
  quoteNumber: string
  customerName: string
  propertyAddress: string
  contractorRate: number | null
  customerPrice: number | null
  omnisideCommission: number | null
  jobCompletedAt: string
}

interface MonthData {
  monthKey: string
  label: string
  jobCount: number
  totalContractorCost: number
  totalCustomerRevenue: number
  totalCommission: number
  isReconciled: boolean
  batchId: string | null
  leads: MonthLead[]
}

interface BatchData {
  id: string
  label: string
  reconciledAt: string
  totalJobs: number
  totalCommission: number
  monthKeys: string
  stripe_invoice_id: string | null
  invoice_sent_at: string | null
}

interface InvoiceBatch {
  id: string
  label: string
  createdAt: string
  campaign: { name: string; clientCompanyName: string }
  leads: MonthLead[]
  totalCommission: number
}

const fmt = (n: number | null | undefined) => (n != null ? `$${n.toFixed(2)}` : '—')

export default function CommissionPageClient({ stripeVerified = false }: { stripeVerified?: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<'months' | 'batches'>('months')
  const [months, setMonths] = useState<MonthData[]>([])
  const [batches, setBatches] = useState<BatchData[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showReconcileModal, setShowReconcileModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showUnreconcileModal, setShowUnreconcileModal] = useState<BatchData | null>(null)
  const [invoiceData, setInvoiceData] = useState<InvoiceBatch | null>(null)
  const [reconciling, setReconciling] = useState(false)
  const [reconcileError, setReconcileError] = useState('')
  const [unreconciling, setUnreconciling] = useState(false)
  const [unreconcileError, setUnreconcileError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [mRes, bRes] = await Promise.all([
      fetch('/api/commission/months'),
      fetch('/api/commission/batches'),
    ])
    if (mRes.ok) setMonths(await mRes.json())
    if (bRes.ok) setBatches(await bRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const unreconciled = months.filter(m => !m.isReconciled)
  const reconciled = months.filter(m => m.isReconciled)
  const selectedMonths = unreconciled.filter(m => selected.has(m.monthKey))
  const totalSelectedJobs = selectedMonths.reduce((s, m) => s + m.jobCount, 0)
  const totalSelectedRevenue = selectedMonths.reduce((s, m) => s + m.totalCustomerRevenue, 0)
  const totalSelectedCommission = selectedMonths.reduce((s, m) => s + m.totalCommission, 0)
  const selectedLabel = selectedMonths.map(m => m.label).join(' + ')

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function openInvoiceFromMonths() {
    // Build invoice preview from selected months' leads
    const leads = selectedMonths.flatMap(m => m.leads)
    setInvoiceData({
      id: '',
      label: selectedLabel,
      createdAt: new Date().toISOString(),
      campaign: { name: '', clientCompanyName: '' },
      leads,
      totalCommission: totalSelectedCommission,
    })
    setShowInvoiceModal(true)
  }

  async function openInvoiceFromBatch(batchId: string) {
    const res = await fetch(`/api/commission/invoice/${batchId}`)
    if (res.ok) {
      const data = await res.json()
      setInvoiceData({
        ...data,
        totalCommission: data.totalCommission,
      })
      setShowInvoiceModal(true)
    }
  }

  function exportPdfFromMonth(month: MonthData) {
    setInvoiceData({
      id: month.batchId ?? '__export__',
      label: month.label,
      createdAt: new Date().toISOString(),
      campaign: { name: '', clientCompanyName: '' },
      leads: month.leads,
      totalCommission: month.totalCommission,
    })
    setShowInvoiceModal(true)
    setTimeout(() => window.print(), 300)
  }

  async function exportPdfFromBatch(batchId: string) {
    const res = await fetch(`/api/commission/invoice/${batchId}`)
    if (res.ok) {
      const data = await res.json()
      setInvoiceData({ ...data, totalCommission: data.totalCommission })
      setShowInvoiceModal(true)
      setTimeout(() => window.print(), 300)
    }
  }

  async function reconcile() {
    setReconciling(true)
    setReconcileError('')
    const monthKeys = selectedMonths.map(m => m.monthKey)
    const res = await fetch('/api/commission/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthKeys, label: selectedLabel }),
    })
    setReconciling(false)
    if (!res.ok) {
      const d = await res.json()
      setReconcileError(d.error ?? 'Reconciliation failed. Please try again.')
      return
    }
    setSelected(new Set())
    setShowReconcileModal(false)
    setShowInvoiceModal(false)
    router.refresh()
    loadData()
  }

  async function unreconcileBatch(batchId: string) {
    setUnreconciling(true)
    setUnreconcileError('')
    const res = await fetch('/api/commission/unreconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId }),
    })
    setUnreconciling(false)
    if (!res.ok) {
      const d = await res.json()
      setUnreconcileError(d.error ?? 'Unreconcile failed. Please try again.')
      return
    }
    setShowUnreconcileModal(null)
    router.refresh()
    loadData()
  }

  if (loading) {
    return <div className="text-sm text-[#6B7280] dark:text-[#94A3B8] py-8 text-center">Loading…</div>
  }

  return (
    <div className="relative pb-24">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#F3F4F6] dark:bg-[#0F172A] rounded-lg p-1 w-fit">
        {(['months', 'batches'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t
                ? 'bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] shadow-sm'
                : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#111827] dark:hover:text-[#F1F5F9]'
            }`}
          >
            {t === 'months' ? 'By Month' : 'Reconciled Batches'}
          </button>
        ))}
      </div>

      {tab === 'months' && (
        <div className="space-y-4">
          {unreconciled.length === 0 && (
            <div className="text-center py-16 text-[#6B7280] dark:text-[#94A3B8]">
              <p className="text-lg font-medium mb-1">All done — no unreconciled jobs.</p>
              <p className="text-sm">Every completed job has been reconciled.</p>
            </div>
          )}
          {unreconciled.map(month => (
            <div key={month.monthKey} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <input
                  type="checkbox"
                  checked={selected.has(month.monthKey)}
                  onChange={() => toggleSelect(month.monthKey)}
                  className="w-4 h-4 accent-[#2563EB] cursor-pointer flex-shrink-0"
                />
                <button
                  onClick={() => toggleExpand(month.monthKey)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">{month.label}</h3>
                    <span className="text-[#6B7280] dark:text-[#94A3B8] text-sm">{expanded.has(month.monthKey) ? '▲' : '▼'}</span>
                  </div>
                  <div className="flex gap-4 mt-1 text-sm text-[#6B7280] dark:text-[#94A3B8]">
                    <span>{month.jobCount} jobs</span>
                    <span>Revenue: {fmt(month.totalCustomerRevenue)}</span>
                    <span>Commission: <span className="font-semibold text-[#16A34A]">{fmt(month.totalCommission)}</span></span>
                  </div>
                </button>
                <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); exportPdfFromMonth(month) }}>
                  Export PDF
                </Button>
              </div>

              {expanded.has(month.monthKey) && (
                <div className="border-t border-[#E5E7EB] dark:border-[#334155] overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F9FAFB] dark:bg-[#0F172A]">
                        <th className="text-left px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Quote #</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Customer</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Address</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Contractor Rate</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Customer Price</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {month.leads.map(lead => (
                        <tr key={lead.quoteNumber} className="border-t border-[#F3F4F6] dark:border-[#1E293B]">
                          <td className="px-4 py-2 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{lead.quoteNumber}</td>
                          <td className="px-4 py-2 text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</td>
                          <td className="px-4 py-2 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{lead.propertyAddress}</td>
                          <td className="px-4 py-2 text-right text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.contractorRate)}</td>
                          <td className="px-4 py-2 text-right text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.customerPrice)}</td>
                          <td className="px-4 py-2 text-right font-semibold text-[#16A34A]">{fmt(lead.omnisideCommission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Reconciled months (display only) */}
          {reconciled.map(month => (
            <div key={month.monthKey} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden opacity-75">
              <div className="flex items-center gap-4 p-5">
                <div className="w-4 h-4 flex-shrink-0" />
                <button
                  onClick={() => toggleExpand(month.monthKey)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">{month.label}</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Reconciled</span>
                    </div>
                    <span className="text-[#6B7280] dark:text-[#94A3B8] text-sm">{expanded.has(month.monthKey) ? '▲' : '▼'}</span>
                  </div>
                  <div className="flex gap-4 mt-1 text-sm text-[#6B7280] dark:text-[#94A3B8]">
                    <span>{month.jobCount} jobs</span>
                    <span>Commission: {fmt(month.totalCommission)}</span>
                  </div>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'batches' && (
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
          {batches.length === 0 ? (
            <div className="text-center py-16 text-[#6B7280] dark:text-[#94A3B8]">
              <p>No reconciled batches yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Batch</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Date Reconciled</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Jobs</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase">Commission</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(batch => (
                    <tr key={batch.id} className="border-b border-[#F3F4F6] dark:border-[#0F172A]">
                      <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{batch.label}</td>
                      <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8]">
                        {formatDateTime(batch.reconciledAt)}
                      </td>
                      <td className="px-4 py-3 text-center text-[#111827] dark:text-[#F1F5F9]">{batch.totalJobs}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#16A34A]">{fmt(batch.totalCommission)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end flex-wrap">
                          {batch.stripe_invoice_id ? (
                            <span className="px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                              Sent {batch.invoice_sent_at ? new Date(batch.invoice_sent_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                            </span>
                          ) : (
                            <div className="relative group">
                              <Button size="sm" variant="secondary" disabled>
                                Send Invoice
                              </Button>
                              <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-10 w-56">
                                <div className="bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] text-xs rounded-lg px-3 py-2 text-center shadow-lg">
                                  {stripeVerified
                                    ? 'Invoice sending coming soon'
                                    : 'Connect Stripe in Settings to enable invoicing'}
                                </div>
                              </div>
                            </div>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => openInvoiceFromBatch(batch.id)}>
                            View Invoice
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => exportPdfFromBatch(batch.id)}>
                            Export PDF
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setShowUnreconcileModal(batch)}>
                            Unreconcile
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Multi-select action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 no-print z-30 bg-white dark:bg-[#1E293B] border-t border-[#E5E7EB] dark:border-[#334155] shadow-lg px-6 py-4 md:left-56">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap gap-2 flex-1">
              {selectedMonths.map(m => (
                <span
                  key={m.monthKey}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-[#EFF6FF] dark:bg-[#1e3a5f] text-[#2563EB] dark:text-[#3B82F6] rounded-full"
                >
                  {m.label}
                  <button onClick={() => toggleSelect(m.monthKey)} className="hover:text-[#1D4ED8]">×</button>
                </span>
              ))}
            </div>
            <div className="text-sm text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
              {totalSelectedJobs} jobs · Revenue: {fmt(totalSelectedRevenue)} · Commission: <span className="font-semibold text-[#16A34A]">{fmt(totalSelectedCommission)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={openInvoiceFromMonths}>Generate Invoice</Button>
              <Button onClick={() => setShowReconcileModal(true)}>Mark Reconciled</Button>
            </div>
          </div>
        </div>
      )}

      {/* Reconcile confirmation modal */}
      {showReconcileModal && (
        <Modal title={`Reconcile ${selectedLabel}?`} onClose={() => { setShowReconcileModal(false); setReconcileError('') }}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-6">
            This will mark <strong>{totalSelectedJobs} jobs</strong> as reconciled with a total commission of <strong>{fmt(totalSelectedCommission)}</strong>. This action can be undone from the Reconciled Batches tab.
          </p>
          {reconcileError && <p className="text-sm text-[#DC2626] mb-4">{reconcileError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setShowReconcileModal(false); setReconcileError('') }}>Cancel</Button>
            <Button onClick={reconcile} disabled={reconciling}>
              {reconciling ? 'Reconciling…' : 'Confirm Reconciliation'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Unreconcile confirmation modal */}
      {showUnreconcileModal && (
        <Modal title="Unreconcile this batch?" onClose={() => { setShowUnreconcileModal(null); setUnreconcileError('') }}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-6">
            This will remove the reconciliation status from <strong>{showUnreconcileModal.totalJobs} jobs</strong> in <strong>{showUnreconcileModal.label}</strong>. They will return to the unreconciled pool.
          </p>
          {unreconcileError && <p className="text-sm text-[#DC2626] mb-4">{unreconcileError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setShowUnreconcileModal(null); setUnreconcileError('') }}>Cancel</Button>
            <Button variant="danger" onClick={() => unreconcileBatch(showUnreconcileModal.id)} disabled={unreconciling}>
              {unreconciling ? 'Unreconciling…' : 'Unreconcile'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Invoice preview modal */}
      {showInvoiceModal && invoiceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 no-print" onClick={() => setShowInvoiceModal(false)} />
          <div className="relative bg-white dark:bg-[#1E293B] rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-10">
            {/* Invoice content */}
            <div id="invoice-content" className="p-8 font-mono text-sm">
              <div className="border-b-2 border-[#111827] dark:border-[#F1F5F9] pb-4 mb-4">
                <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9] mb-1">JOBBLY — COMMISSION INVOICE SUMMARY</h1>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[#111827] dark:text-[#F1F5F9] mb-6">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Generated:</dt>
                <dd>{formatDate(new Date())}</dd>
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Period:</dt>
                <dd>{invoiceData.label}</dd>
                {invoiceData.campaign?.name && (
                  <>
                    <dt className="text-[#6B7280] dark:text-[#94A3B8]">Campaign:</dt>
                    <dd>{invoiceData.campaign.name}</dd>
                  </>
                )}
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Prepared by:</dt>
                <dd>Omniside AI</dd>
              </dl>

              <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-4 mb-4">
                <div className="grid grid-cols-[auto_1fr_auto] gap-x-6 text-xs text-[#6B7280] dark:text-[#94A3B8] mb-2 font-bold uppercase">
                  <span>Quote #</span>
                  <span>Customer Name</span>
                  <span>Commission (ex GST)</span>
                </div>
                {invoiceData.leads.map(lead => (
                  <div key={lead.quoteNumber} className="grid grid-cols-[auto_1fr_auto] gap-x-6 text-sm py-1 border-b border-[#F3F4F6] dark:border-[#1E293B]">
                    <span className="text-[#374151] dark:text-[#CBD5E1]">{lead.quoteNumber}</span>
                    <span className="text-[#111827] dark:text-[#F1F5F9] truncate">{lead.customerName}</span>
                    <span className="font-semibold text-[#16A34A]">{fmt(lead.omnisideCommission)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-[#111827] dark:border-[#F1F5F9] pt-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280] dark:text-[#94A3B8]">Total jobs:</span>
                  <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{invoiceData.leads.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280] dark:text-[#94A3B8]">Subtotal (ex GST):</span>
                  <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(invoiceData.totalCommission)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280] dark:text-[#94A3B8]">GST (15%):</span>
                  <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(invoiceData.totalCommission * 0.15)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-[#E5E7EB] dark:border-[#334155] pt-2 mt-1">
                  <span className="text-[#111827] dark:text-[#F1F5F9]">Total (incl. GST):</span>
                  <span className="text-[#16A34A]">{fmt(invoiceData.totalCommission * 1.15)}</span>
                </div>
              </div>

              <p className="mt-8 text-xs text-[#6B7280] dark:text-[#94A3B8]">Jobbly by Omniside AI</p>
            </div>

            {/* Modal buttons */}
            <div className="flex gap-3 justify-end px-8 pb-6 no-print">
              <Button variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button>
              {invoiceData.id === '' && (
                <Button onClick={() => { setShowInvoiceModal(false); setShowReconcileModal(true) }}>
                  Mark Reconciled
                </Button>
              )}
              <Button variant="secondary" onClick={() => setShowInvoiceModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
