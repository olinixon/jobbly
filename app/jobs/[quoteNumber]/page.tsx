import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import Badge from '@/components/ui/Badge'
import LeadStatusPipeline from '@/components/leads/LeadStatusPipeline'
import JobActions from '@/components/leads/JobActions'
import ManualQuoteOptions from '@/components/leads/ManualQuoteOptions'
import Link from 'next/link'
import { formatDateTime, formatDate } from '@/lib/formatDate'
import { generateCalendarLinks } from '@/lib/generateCalendarLinks'
import AddToCalendarDropdown from '@/components/leads/AddToCalendarDropdown'
import InternalNotesEditor from '@/components/leads/InternalNotesEditor'
import BookThisJobCard from '@/components/leads/BookThisJobCard'
import JobBookedActionsCard from '@/components/leads/JobBookedActionsCard'

interface QuoteOptionRow {
  sort_order: number
  name: string
  price_ex_gst: number | null
  price_incl_gst: number | null
  duration_minutes: number | null
  job_type_id: string | null
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ quoteNumber: string }>
}) {
  const session = await auth()
  if (!session || session.user.role !== 'SUBCONTRACTOR') redirect('/login')

  const { quoteNumber } = await params
  const job = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: {
      campaign: { select: { markupPercentage: true } },
      auditLogs: { orderBy: { createdAt: 'desc' } },
      booking: { include: { slot: true } },
      jobType: { select: { name: true } },
    },
  })

  if (!job) notFound()
  if (job.campaignId !== session.user.campaignId) redirect('/jobs')

  const jobTypes = await prisma.jobType.findMany({
    where: { campaignId: job.campaignId },
    orderBy: { sortOrder: 'asc' },
  })

  function fmt12h(t: string): string {
    const [h, m] = t.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
  }

  const booking = job.booking
  const slot = booking?.slot
  const slotDateNZ = slot
    ? slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
    : null
  const slotDateFormatted = slot
    ? slot.date.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const bookedDisplay = slotDateFormatted && booking
    ? `${slotDateFormatted} — ${fmt12h(booking.windowStart)} – ${fmt12h(booking.windowEnd)}`
    : job.jobBookedDate ? `${formatDate(job.jobBookedDate)} — —` : null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const calendarLinks = (booking && slot && job.bookingToken && slotDateNZ)
    ? generateCalendarLinks({
        bookingToken: job.bookingToken,
        bookingId: booking.id,
        windowStartNZ: booking.windowStart,
        windowEndNZ: booking.windowEnd,
        slotDateNZ,
        propertyAddress: job.propertyAddress,
        quoteNumber: job.quoteNumber,
        jobTypeName: job.jobType?.name ?? 'Gutter Clean',
        appUrl,
      })
    : null

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/jobs" className="text-sm text-[#6B7280] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#3B82F6]">
          ← My Jobs
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9]">{job.quoteNumber}</h1>
        <Badge status={job.status} />
      </div>

      {/* Status pipeline */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 mb-6 shadow-sm">
        <LeadStatusPipeline status={job.status} jobBookedDate={job.jobBookedDate} cancellationReason={job.cancellation_reason} notConvertedReason={job.not_converted_reason} />
      </div>

      {job.status === 'LEAD_RECEIVED' && (
        <BookThisJobCard quoteNumber={job.quoteNumber} />
      )}
      {job.status === 'JOB_BOOKED' && (
        <JobBookedActionsCard quoteNumber={job.quoteNumber} jobBookedDate={job.jobBookedDate} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Customer Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Name</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{job.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Phone</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">
                  {job.customerPhone
                    ? <a href={`tel:${job.customerPhone}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">{job.customerPhone}</a>
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Email</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">
                  {job.customerEmail
                    ? <a href={`mailto:${job.customerEmail}`} className="text-[#2563EB] dark:text-[#3B82F6] hover:underline">{job.customerEmail}</a>
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between items-start gap-4">
                <dt className="text-[#6B7280] dark:text-[#94A3B8] shrink-0">Address</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9] text-right">{job.propertyAddress}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Maps</dt>
                <dd>
                  <a href={job.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-[#2563EB] dark:text-[#3B82F6] hover:underline text-sm">
                    View on Google Maps →
                  </a>
                </dd>
              </div>
              {job.propertyPerimeterM && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Perimeter</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{job.propertyPerimeterM}m</dd>
                </div>
              )}
              {job.propertyAreaM2 && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Area</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{job.propertyAreaM2}m²</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Storeys</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{job.storey_count ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Gutter Guards</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{job.gutter_guards ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Quote Number</dt>
                <dd className="font-mono text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{job.quoteNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Received</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{formatDateTime(job.createdAt)}</dd>
              </div>
              {(job.status === 'JOB_BOOKED' || job.status === 'JOB_COMPLETED') && bookedDisplay && (
                <>
                  <div className="flex justify-between items-start gap-4">
                    <dt className="text-[#6B7280] dark:text-[#94A3B8] shrink-0">Booked</dt>
                    <dd className="font-medium text-[#111827] dark:text-[#F1F5F9] text-right">{bookedDisplay}</dd>
                  </div>
                  {calendarLinks && (
                    <div className="flex justify-end">
                      <AddToCalendarDropdown links={calendarLinks} />
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>

          {/* Quote Options — parsing badge + manual entry */}
          {job.quoteUrl && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Quote Options</h2>
              {(() => {
                const opts = Array.isArray(job.quoteOptions) ? (job.quoteOptions as unknown as QuoteOptionRow[]) : []
                const count = opts.length
                return (
                  <>
                    <div className="mb-3">
                      {count > 0 ? (
                        <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                          ✅ {count} {count === 1 ? 'option' : 'options'} parsed from quote
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                          ⚠️ Quote could not be parsed — customer will see all service options
                        </div>
                      )}
                    </div>
                    {count === 0 && jobTypes.length > 0 && (
                      <ManualQuoteOptions quoteNumber={job.quoteNumber} jobTypes={jobTypes} />
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {/* Call Notes (read-only, hidden if empty) */}
          {job.notes && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Call Notes</h2>
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {/* Internal Notes — editable by subcontractor */}
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Internal Notes</h2>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mb-3">Your own notes about this job.</p>
            <InternalNotesEditor quoteNumber={job.quoteNumber} initialValue={job.internal_notes ?? ''} />
          </div>
        </div>

        <div className="space-y-6">
          <JobActions
            quoteNumber={job.quoteNumber}
            currentStatus={job.status}
            hasInvoice={!!job.invoiceUrl}
            invoiceUrl={job.invoiceUrl}
            hasJobReport={!!job.jobReportUrl}
            jobReportUrl={job.jobReportUrl ?? null}
            jobReportFileName={job.jobReportUrl ? job.jobReportUrl.split('/').pop()?.split('?')[0] ?? null : null}
            markupPercentage={job.campaign.markupPercentage}
            jobTypes={jobTypes}
            customerName={job.customerName}
            propertyAddress={job.propertyAddress}
            customerEmail={job.customerEmail}
            customerPaidAt={job.customer_paid_at ? formatDateTime(job.customer_paid_at) : null}
            hasQuote={!!job.quoteUrl}
          />

          {/* Financials (subcontractor-restricted: no commission or margin) */}
          {(job.contractorRate != null || job.customerPrice != null || job.grossMarkup != null) && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Job Value</h2>
              <dl className="space-y-3 text-sm">
                {job.customerPrice != null && (
                  <div className="flex justify-between">
                    <dt className="text-[#6B7280] dark:text-[#94A3B8]">Customer Price <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                    <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">${job.customerPrice.toFixed(2)}</dd>
                  </div>
                )}
                {job.customerPrice != null && (
                  <div className="flex justify-between">
                    <dt className="text-[#6B7280] dark:text-[#94A3B8]">Customer Price <span className="text-xs text-[#9CA3AF]">(incl. GST)</span></dt>
                    <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">${(job.customerPrice * 1.15).toFixed(2)}</dd>
                  </div>
                )}
                {job.contractorRate != null && (
                  <div className="flex justify-between">
                    <dt className="text-[#6B7280] dark:text-[#94A3B8]">Contractor Rate <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                    <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">${job.contractorRate.toFixed(2)}</dd>
                  </div>
                )}
                {job.grossMarkup != null && (
                  <div className="flex justify-between">
                    <dt className="text-[#6B7280] dark:text-[#94A3B8]">Gross Markup <span className="text-xs text-[#9CA3AF]">(ex GST)</span></dt>
                    <dd className="font-semibold text-[#111827] dark:text-[#F1F5F9]">${job.grossMarkup.toFixed(2)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Activity log (collapsible, role-safe: shows role not name) */}
          {job.auditLogs.length > 0 && (
            <ActivityLog logs={job.auditLogs} />
          )}
        </div>
      </div>
    </AppShell>
  )
}

function ActivityLog({ logs }: { logs: { id: string; createdAt: Date; oldStatus: string; newStatus: string }[] }) {
  return (
    <details className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
      <summary className="px-6 py-4 font-semibold text-[#111827] dark:text-[#F1F5F9] cursor-pointer select-none">
        Show activity ({logs.length})
      </summary>
      <div className="px-6 pb-5 border-t border-[#F3F4F6] dark:border-[#334155] pt-4">
        <ol className="space-y-3">
          {logs.map((log) => (
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
  )
}
