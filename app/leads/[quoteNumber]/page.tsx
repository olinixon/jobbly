import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import Badge from '@/components/ui/Badge'
import LeadStatusPipeline from '@/components/leads/LeadStatusPipeline'
import LeadActions from '@/components/leads/LeadActions'
import InternalNotesEditor from '@/components/leads/InternalNotesEditor'
import ManualQuoteOptions from '@/components/leads/ManualQuoteOptions'
import Link from 'next/link'
import { formatDateTime, formatDate } from '@/lib/formatDate'
import DeleteLeadButton from '@/components/leads/DeleteLeadButton'
import DuplicateWarningBanner from '@/components/leads/DuplicateWarningBanner'
import CustomerPortalActions from '@/components/leads/CustomerPortalActions'
import BookThisJobCard from '@/components/leads/BookThisJobCard'
import CompleteJobSection from '@/components/leads/CompleteJobSection'
import JobBookedActionsCard from '@/components/leads/JobBookedActionsCard'

interface QuoteOptionRow {
  sort_order: number
  name: string
  price_ex_gst: number
  price_incl_gst: number
  duration_minutes: number | null
  job_type_id: string | null
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteNumber: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const sp = await searchParams
  const fromCommission = sp.from === 'commission'

  const { quoteNumber } = await params
  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: {
      auditLogs: { orderBy: { createdAt: 'asc' } },
      attachments: { orderBy: { createdAt: 'desc' }, take: 1 },
      campaign: { select: { markupPercentage: true, clientCompanyName: true } },
      booking: { include: { slot: true } },
      jobType: { select: { name: true } },
    },
  })

  if (!lead) notFound()

  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    redirect('/dashboard')
  }

  const isAdmin = session.user.role === 'ADMIN'
  const isClient = session.user.role === 'CLIENT'
  const fmt = (n: number | null | undefined) => (n != null ? `$${n.toFixed(2)}` : '—')

  const jobTypes = isAdmin
    ? await prisma.jobType.findMany({
        where: { campaignId: lead.campaignId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, sortOrder: true, durationMinutes: true },
      })
    : []

  // CL16: Booked date sourced from job_booked_date; fall back to booking slot for legacy leads
  const booking = lead.booking
  const slot = booking?.slot
  const bookedDisplay = lead.jobBookedDate
    ? formatDate(lead.jobBookedDate)
    : slot
    ? slot.date.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  // Fetch CLIENT BillingProfile for Stripe status indicator (admin + portal token only)
  const clientBillingProfile = (isAdmin && lead.customerPortalToken)
    ? await prisma.billingProfile.findUnique({
        where: { campaign_id_role: { campaign_id: lead.campaignId, role: 'CLIENT' } },
        select: { stripe_verified: true },
      })
    : null
  const stripeConnected = clientBillingProfile?.stripe_verified === true

  // Fetch CustomerPaymentProfile for payment platform diagnostic (admin only)
  const customerPaymentProfile = isAdmin
    ? await prisma.customerPaymentProfile.findFirst({
        where: { campaign_id: lead.campaignId, is_active: true },
        select: { provider: true, verified: true },
      })
    : null

  // Fetch matched duplicate lead details if warning is active
  const matchedDuplicateLead = (lead.duplicate_confidence && !lead.duplicate_dismissed && lead.duplicate_lead_id)
    ? await prisma.lead.findUnique({
        where: { quoteNumber: lead.duplicate_lead_id },
        select: { customerName: true },
      })
    : null

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href={fromCommission ? '/commission' : '/dashboard'}
          className="text-sm text-[#6B7280] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#3B82F6] transition-colors"
        >
          {fromCommission ? '← Back to Commission' : '← Leads'}
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9]">{lead.quoteNumber}</h1>
        <Badge status={lead.status} />
        {lead.needsReview && (
          <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">Needs Review</span>
        )}
      </div>

      {/* Sandbox test banner (admin only) */}
      {isAdmin && lead.is_test && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-amber-800 dark:text-amber-200 text-sm">
          <strong>This is a sandbox test lead.</strong> No real emails or payments will be processed. Emails are redirected to Oli.
        </div>
      )}

      {/* Duplicate warning banner */}
      {lead.duplicate_confidence && !lead.duplicate_dismissed && lead.duplicate_lead_id && (
        <DuplicateWarningBanner
          quoteNumber={lead.quoteNumber}
          confidence={lead.duplicate_confidence}
          reason={lead.duplicate_reason ?? ''}
          matchedQuoteNumber={lead.duplicate_lead_id}
          matchedCustomerName={matchedDuplicateLead?.customerName ?? ''}
          isAdmin={isAdmin}
        />
      )}

      {/* Status pipeline */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 mb-6 shadow-sm">
        <LeadStatusPipeline status={lead.status} jobBookedDate={lead.jobBookedDate} cancellationReason={lead.cancellation_reason} notConvertedReason={lead.not_converted_reason} />
      </div>

      {/* Book This Job — admin and client at LEAD_RECEIVED */}
      {(isAdmin || isClient) && lead.status === 'LEAD_RECEIVED' && (
        <BookThisJobCard quoteNumber={lead.quoteNumber} showNotConverted={isAdmin} />
      )}

      {/* Job Booked Actions — admin full (rebook/unbook/cancel), client read-only */}
      {(isAdmin || isClient) && lead.status === 'JOB_BOOKED' && (
        <JobBookedActionsCard
          quoteNumber={lead.quoteNumber}
          jobBookedDate={lead.jobBookedDate}
          readOnly={isClient}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Customer & Property */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Customer Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Name</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Phone</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">
                  {lead.customerPhone
                    ? <a href={`tel:${lead.customerPhone}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">{lead.customerPhone}</a>
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Email</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">
                  {lead.customerEmail
                    ? <a href={`mailto:${lead.customerEmail}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">{lead.customerEmail}</a>
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between items-start gap-4">
                <dt className="text-[#6B7280] dark:text-[#94A3B8] shrink-0">Address</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9] text-right">{lead.propertyAddress}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Maps</dt>
                <dd>
                  <a
                    href={lead.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2563EB] dark:text-[#3B82F6] hover:underline text-sm"
                  >
                    View on Google Maps →
                  </a>
                </dd>
              </div>
              {lead.propertyPerimeterM && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Perimeter</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.propertyPerimeterM}m</dd>
                </div>
              )}
              {lead.propertyAreaM2 && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Area</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.propertyAreaM2}m²</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Storeys</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.storey_count ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Gutter Guards</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.gutter_guards ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Source</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.source}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Received</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">
                  {formatDateTime(lead.createdAt)}
                </dd>
              </div>
              {(lead.status === 'JOB_BOOKED' || lead.status === 'JOB_COMPLETED') && (
                <div className="flex justify-between items-start gap-4">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8] shrink-0">Booked Job Date</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9] text-right">{bookedDisplay ?? '—'}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Quote Options */}
          {lead.quoteUrl && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Quote Options</h2>
              {/* Parsing status badge */}
              {(() => {
                const opts = Array.isArray(lead.quoteOptions) ? (lead.quoteOptions as unknown as QuoteOptionRow[]) : []
                const count = opts.length
                return (
                  <div className="mb-3 space-y-2">
                    {count > 0 ? (
                      <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                        ✅ {count} {count === 1 ? 'option' : 'options'} parsed from quote
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                        ⚠️ Quote could not be parsed — customer will see all service options
                      </div>
                    )}
                    {(isAdmin || isClient) && lead.quoteValidationOverridden && (
                      <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium ml-2">
                        ⚠ Quote validation was overridden
                      </div>
                    )}
                  </div>
                )
              })()}
              {Array.isArray(lead.quoteOptions) && (lead.quoteOptions as unknown as QuoteOptionRow[]).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                        <th className="text-left py-2 text-[#6B7280] dark:text-[#94A3B8] font-normal">#</th>
                        <th className="text-left py-2 text-[#6B7280] dark:text-[#94A3B8] font-normal">Service</th>
                        <th className="text-right py-2 text-[#6B7280] dark:text-[#94A3B8] font-normal">Ex GST</th>
                        <th className="text-right py-2 text-[#6B7280] dark:text-[#94A3B8] font-normal">Incl. GST</th>
                        <th className="text-right py-2 text-[#6B7280] dark:text-[#94A3B8] font-normal">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lead.quoteOptions as unknown as QuoteOptionRow[]).map((opt) => {
                        const isSelected = lead.jobTypeId === opt.job_type_id
                        return (
                          <tr key={opt.sort_order} className={`border-b border-[#F3F4F6] dark:border-[#1E293B] ${isSelected ? 'bg-green-50 dark:bg-green-900/10' : ''}`}>
                            <td className="py-2 text-[#6B7280] dark:text-[#94A3B8]">{opt.sort_order}</td>
                            <td className="py-2 font-medium text-[#111827] dark:text-[#F1F5F9]">
                              {opt.name}
                              {isSelected && <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-normal">Customer selected</span>}
                            </td>
                            <td className="py-2 text-right text-[#111827] dark:text-[#F1F5F9]">${opt.price_ex_gst.toFixed(2)}</td>
                            <td className="py-2 text-right text-[#111827] dark:text-[#F1F5F9]">${opt.price_incl_gst.toFixed(2)}</td>
                            <td className="py-2 text-right text-[#6B7280] dark:text-[#94A3B8]">
                              {opt.duration_minutes ? `${Math.floor(opt.duration_minutes / 60)} hrs` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : isAdmin && jobTypes.length > 0 ? (
                <div className="mt-3">
                  <p className="text-sm text-[#9CA3AF] dark:text-[#475569] mb-3">No options parsed from quote.</p>
                  <details>
                    <summary className="text-sm text-[#2563EB] dark:text-[#3B82F6] cursor-pointer hover:underline">Enter manually</summary>
                    <div className="mt-3">
                      <ManualQuoteOptions quoteNumber={lead.quoteNumber} jobTypes={jobTypes} />
                    </div>
                  </details>
                </div>
              ) : (
                <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">Quote not yet parsed.</p>
              )}
            </div>
          )}

          {/* Notes */}
          {isAdmin && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm space-y-5">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9]">Notes</h2>
              <div>
                <p className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-1">Call Notes</p>
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] whitespace-pre-wrap min-h-8">
                  {lead.notes ?? <span className="text-[#9CA3AF] dark:text-[#475569] italic">None</span>}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-1">Internal Notes</p>
                <InternalNotesEditor quoteNumber={lead.quoteNumber} initialValue={lead.internal_notes ?? ''} />
              </div>
            </div>
          )}
          {isClient && lead.notes && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Call Notes</h2>
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Financials + Invoice + Audit + Actions */}
        <div className="space-y-6">
          {/* Actions — admin all statuses; subcontractor all statuses (upload quote) */}
          {(isAdmin || session.user.role === 'SUBCONTRACTOR') && (
            <LeadActions
              quoteNumber={lead.quoteNumber}
              currentStatus={lead.status}
              hasInvoice={!!lead.invoiceUrl}
              hasQuote={!!lead.quoteUrl}
              markupPercentage={lead.campaign.markupPercentage}
              customerName={lead.customerName}
              propertyAddress={lead.propertyAddress}
              role={session.user.role}
            />
          )}

          {/* Quote download — all roles, shown when quote is uploaded */}
          {lead.quoteUrl && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Quote</h2>
              <a
                href={lead.quoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#2563EB] dark:text-[#3B82F6] hover:underline"
              >
                Download quote →
              </a>
              {isAdmin && lead.quoteValidationOverridden && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Validation overridden</p>
              )}
            </div>
          )}

          {/* Complete Job section — admin full access, client read-only */}
          {(isAdmin || isClient) && lead.status === 'JOB_BOOKED' && (
            <CompleteJobSection
              quoteNumber={lead.quoteNumber}
              initialHasInvoice={!!lead.invoiceUrl}
              initialInvoiceUrl={lead.invoiceUrl ?? null}
              initialInvoiceFileName={lead.invoiceUrl ? lead.invoiceUrl.split('/').pop()?.split('?')[0] ?? null : null}
              initialHasJobReport={!!lead.jobReportUrl}
              initialJobReportUrl={lead.jobReportUrl ?? null}
              initialJobReportFileName={lead.jobReportUrl ? lead.jobReportUrl.split('/').pop()?.split('?')[0] ?? null : null}
              markupPercentage={lead.campaign.markupPercentage}
              readOnly={isClient}
              customerEmail={lead.customerEmail ?? null}
            />
          )}

          {/* Financials (admin only) */}
          {isAdmin && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Financials</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Contractor Rate <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                  <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.contractorRate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Customer Price <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                  <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.customerPrice)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Gross Markup <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                  <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.grossMarkup)}</dd>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] dark:border-[#334155] pt-3">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Omniside Commission <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                  <dd className="font-bold text-[#16A34A]">{fmt(lead.omnisideCommission)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Client Margin <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                  <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.clientMargin)}</dd>
                </div>
                {lead.customerPrice != null && (
                  <div className="flex justify-between border-t border-[#E5E7EB] dark:border-[#334155] pt-3">
                    <dt className="text-[#6B7280] dark:text-[#94A3B8]">Customer Price <span className="text-xs text-[#9CA3AF]">(incl. GST)</span></dt>
                    <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.customerPrice * 1.15)}</dd>
                  </div>
                )}
                {lead.reconciliationBatchId && (
                  <div className="flex justify-between items-center border-t border-[#E5E7EB] dark:border-[#334155] pt-3">
                    <dt className="text-[#6B7280] dark:text-[#94A3B8]">Commission</dt>
                    <dd>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Reconciled
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Financials (client only) */}
          {isClient && lead.grossMarkup != null && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Financials</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Your Margin <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                  <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.grossMarkup)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Your Margin <span className="text-xs text-[#9CA3AF]">(incl. GST)</span></dt>
                  <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{fmt(lead.grossMarkup * 1.15)}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Invoice */}
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Invoice</h2>
            {lead.invoiceUrl ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">Invoice attached</p>
                  {lead.invoiceUploadedAt && (
                    <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">
                      Uploaded {formatDateTime(lead.invoiceUploadedAt)}
                    </p>
                  )}
                </div>
                <a
                  href={lead.invoiceUrl}
                  download
                  className="text-sm text-[#2563EB] dark:text-[#3B82F6] hover:underline"
                >
                  Download
                </a>
              </div>
            ) : (
              <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">
                No invoice attached yet.
              </p>
            )}
          </div>

          {/* Customer Portal — admin only, shown once portal token is set */}
          {isAdmin && lead.customerPortalToken && (() => {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
            const portalUrl = `${appUrl}/portal/${lead.customerPortalToken}`
            return (
              <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
                <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Customer Portal</h2>
                {lead.customerEmailSentAt && (
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mb-3">
                    Email sent {formatDateTime(lead.customerEmailSentAt)}
                  </p>
                )}
                <CustomerPortalActions
                  portalUrl={portalUrl}
                  quoteNumber={lead.quoteNumber}
                  customerEmail={lead.customerEmail ?? null}
                />
                {/* Payment status — all seven states */}
                <div className="mt-3 space-y-2 text-sm">
                  {lead.customer_paid_at ? (
                    <div className="flex items-center gap-2">
                      <span>✅</span>
                      <span className="text-[#374151] dark:text-[#CBD5E1]">
                        {lead.myob_invoice_id
                          ? `Paid via MYOB — ${formatDateTime(lead.customer_paid_at)}`
                          : (lead.stripe_payment_intent || lead.stripe_customer_payment_url)
                          ? `Paid via Stripe — ${formatDateTime(lead.customer_paid_at)}`
                          : `Paid — ${formatDateTime(lead.customer_paid_at)}`}
                      </span>
                    </div>
                  ) : lead.myob_invoice_id ? (
                    <div className="flex items-center gap-2">
                      <span>⏳</span>
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">Awaiting payment — MYOB invoice sent</span>
                    </div>
                  ) : lead.stripe_customer_payment_url ? (
                    <div className="flex items-center gap-2">
                      <span>⏳</span>
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">Awaiting payment — Stripe link active</span>
                    </div>
                  ) : lead.stripeCheckoutUrl ? (
                    <div className="flex items-center gap-2">
                      <span>⏳</span>
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">Awaiting payment — Stripe link active (legacy)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>⚠️</span>
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">No payment method configured</span>
                    </div>
                  )}
                </div>

                {/* Payment Platform diagnostic — admin only */}
                <div className="mt-4 pt-4 border-t border-[#F3F4F6] dark:border-[#334155]">
                  <p className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide mb-2">Payment Platform</p>
                  {lead.myob_invoice_id ? (
                    <div className="space-y-1 text-sm">
                      <p className="text-[#374151] dark:text-[#CBD5E1]">MYOB — invoice created ✅</p>
                      <p className="text-[#6B7280] dark:text-[#94A3B8]">
                        Invoice ID: ...{lead.myob_invoice_id.slice(-8)}
                      </p>
                      {lead.myob_invoice_url && (
                        <a
                          href={lead.myob_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2563EB] dark:text-[#3B82F6] hover:underline"
                        >
                          View Invoice →
                        </a>
                      )}
                    </div>
                  ) : lead.stripe_customer_payment_url ? (
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Stripe — payment link active ✅</p>
                  ) : lead.stripeCheckoutUrl ? (
                    <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">Stripe — payment link active ✅ (legacy)</p>
                  ) : customerPaymentProfile?.verified ? (
                    <div className="space-y-1 text-sm">
                      <p className="text-amber-600 dark:text-amber-400">
                        {customerPaymentProfile.provider} — payment link missing ⚠️
                      </p>
                      <p className="text-[#6B7280] dark:text-[#94A3B8] text-xs">
                        Check lead notes for error details. Invoice may need to be created manually.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1 text-sm">
                      <p className="text-amber-600 dark:text-amber-400">No payment platform configured ⚠️</p>
                      <p className="text-[#6B7280] dark:text-[#94A3B8] text-xs">
                        Continuous Group has not connected a payment platform in Settings.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Payment status — client only, shown when portal token exists */}
          {isClient && lead.customerPortalToken && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Customer Payment</h2>
              <div className="flex items-center gap-2 text-sm">
                {lead.customer_paid_at ? (
                  <>
                    <span>✅</span>
                    <span className="text-[#374151] dark:text-[#CBD5E1]">
                      Payment received — {formatDateTime(lead.customer_paid_at)}
                    </span>
                  </>
                ) : (
                  <>
                    <span>⏳</span>
                    <span className="text-[#6B7280] dark:text-[#94A3B8]">Awaiting payment</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Audit log — admin sees inline with names; client sees collapsible with "Jobbly" */}
          {isAdmin && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Activity</h2>
              {lead.auditLogs.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">No status changes yet.</p>
              ) : (
                <ol className="space-y-3">
                  {lead.auditLogs.map((log) => (
                    <li key={log.id} className="text-sm">
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">
                        {formatDateTime(log.createdAt)}
                      </span>
                      {' · '}
                      <span className="font-medium text-[#111827] dark:text-[#F1F5F9]">{log.changedByName}</span>
                      {' moved to '}
                      <Badge status={log.newStatus} />
                      {log.newStatus === 'JOB_BOOKED' && bookedDisplay && (
                        <span className="ml-1 text-[#6B7280] dark:text-[#94A3B8]">
                          — Booked: {bookedDisplay}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {isClient && lead.auditLogs.length > 0 && (
            <details className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
              <summary className="px-6 py-4 font-semibold text-[#111827] dark:text-[#F1F5F9] cursor-pointer select-none">
                Show activity ({lead.auditLogs.length})
              </summary>
              <div className="px-6 pb-5 border-t border-[#F3F4F6] dark:border-[#334155] pt-4">
                <ol className="space-y-3">
                  {lead.auditLogs.map((log) => (
                    <li key={log.id} className="text-sm">
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">{formatDateTime(log.createdAt)}</span>
                      {' · '}
                      <span className="font-medium text-[#111827] dark:text-[#F1F5F9]">Jobbly</span>
                      {' moved to '}
                      <Badge status={log.newStatus} />
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-8 pt-6 border-t border-[#F3F4F6] dark:border-[#334155] flex justify-end">
          <DeleteLeadButton quoteNumber={lead.quoteNumber} customerName={lead.customerName} />
        </div>
      )}
    </AppShell>
  )
}
