import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import Badge from '@/components/ui/Badge'
import LeadStatusPipeline from '@/components/leads/LeadStatusPipeline'
import LeadActions from '@/components/leads/LeadActions'
import Link from 'next/link'
import { formatDateTime, formatDate } from '@/lib/formatDate'

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
      campaign: { select: { markupPercentage: true } },
    },
  })

  if (!lead) notFound()

  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    redirect('/dashboard')
  }

  const isAdmin = session.user.role === 'ADMIN'
  const isClient = session.user.role === 'CLIENT'
  const fmt = (n: number | null | undefined) => (n != null ? `$${n.toFixed(2)}` : '—')

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

      {/* Status pipeline */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 mb-6 shadow-sm">
        <LeadStatusPipeline status={lead.status} jobBookedDate={lead.jobBookedDate} />
      </div>

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
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerPhone}</dd>
              </div>
              {lead.customerEmail && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Email</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.customerEmail}</dd>
                </div>
              )}
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
              {lead.propertyStoreys && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Storeys</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{lead.propertyStoreys}</dd>
                </div>
              )}
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
            </dl>
          </div>

          {/* Notes */}
          {isAdmin && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Notes</h2>
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] whitespace-pre-wrap min-h-12">
                {lead.notes ?? 'No notes yet.'}
              </p>
            </div>
          )}
          {isClient && lead.notes && (
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Notes</h2>
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Financials + Invoice + Audit + Actions */}
        <div className="space-y-6">
          {/* Actions */}
          {isAdmin && (
            <LeadActions
              quoteNumber={lead.quoteNumber}
              currentStatus={lead.status}
              hasInvoice={!!lead.invoiceUrl}
              notes={lead.notes ?? ''}
              markupPercentage={lead.campaign.markupPercentage}
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
                      {log.newStatus === 'JOB_BOOKED' && lead.jobBookedDate && (
                        <span className="ml-1 text-[#6B7280] dark:text-[#94A3B8]">
                          — Booked: {formatDate(lead.jobBookedDate)}
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
    </AppShell>
  )
}
