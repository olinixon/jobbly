'use client'

import { useRouter } from 'next/navigation'

function formatBookedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

interface JobBooked {
  id: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  bookedDateStr: string | null
  daysUntil: string | null
}

export default function JobsBookedTable({ jobs }: { jobs: JobBooked[] }) {
  const router = useRouter()

  if (jobs.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-12 text-center shadow-sm">
        <p className="text-[#6B7280] dark:text-[#94A3B8] text-sm">
          No jobs are currently booked. Use the Job Booked action on a job to log a booked date.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
            <th className="text-left px-4 py-3 font-medium text-[#6B7280] dark:text-[#94A3B8] w-8"></th>
            <th className="text-left px-4 py-3 font-medium text-[#6B7280] dark:text-[#94A3B8]">Quote #</th>
            <th className="text-left px-4 py-3 font-medium text-[#6B7280] dark:text-[#94A3B8]">Customer</th>
            <th className="text-left px-4 py-3 font-medium text-[#6B7280] dark:text-[#94A3B8] hidden md:table-cell">Address</th>
            <th className="text-left px-4 py-3 font-medium text-[#6B7280] dark:text-[#94A3B8]">Booked Date</th>
            <th className="text-left px-4 py-3 font-medium text-[#6B7280] dark:text-[#94A3B8]">Days Until</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              onClick={() => router.push(`/jobs/${job.quoteNumber}`)}
              className="border-b border-[#F3F4F6] dark:border-[#334155] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] cursor-pointer transition-colors last:border-b-0"
            >
              <td className="px-4 py-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
              </td>
              <td className="px-4 py-3 font-mono font-medium text-[#111827] dark:text-[#F1F5F9]">
                {job.quoteNumber}
              </td>
              <td className="px-4 py-3 text-[#111827] dark:text-[#F1F5F9]">{job.customerName}</td>
              <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] hidden md:table-cell">
                {job.propertyAddress}
              </td>
              <td className="px-4 py-3 text-[#111827] dark:text-[#F1F5F9]">
                {job.bookedDateStr ? formatBookedDate(job.bookedDateStr) : '—'}
              </td>
              <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8]">{job.daysUntil ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
