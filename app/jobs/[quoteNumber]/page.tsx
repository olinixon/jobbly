import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import Badge from '@/components/ui/Badge'
import JobActions from '@/components/leads/JobActions'
import Link from 'next/link'

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
    include: { campaign: { select: { markupPercentage: true } } },
  })

  if (!job) notFound()
  if (job.campaignId !== session.user.campaignId) redirect('/jobs')

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
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{job.customerPhone}</dd>
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
              {job.propertyStoreys && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Storeys</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{job.propertyStoreys}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Quote Number</dt>
                <dd className="font-mono text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{job.quoteNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7280] dark:text-[#94A3B8]">Received</dt>
                <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">
                  {new Date(job.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                </dd>
              </div>
              {job.jobBookedDate && (
                <div className="flex justify-between">
                  <dt className="text-[#6B7280] dark:text-[#94A3B8]">Booked Date</dt>
                  <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">
                    {new Date(job.jobBookedDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="space-y-6">
          <JobActions
            quoteNumber={job.quoteNumber}
            currentStatus={job.status}
            hasInvoice={!!job.invoiceUrl}
            invoiceUrl={job.invoiceUrl}
            markupPercentage={job.campaign.markupPercentage}
          />
        </div>
      </div>
    </AppShell>
  )
}
