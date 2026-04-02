'use client'

import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/lib/formatDate'

interface Job {
  id: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  status: string
  createdAt: Date
  urgencyLevel?: 'HIGH' | 'MEDIUM' | null
}

export default function JobsTable({ jobs }: { jobs: Job[] }) {
  const router = useRouter()

  return (
    <>
      {/* Mobile card layout */}
      <div className="block md:hidden space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            onClick={() => router.push(`/jobs/${job.quoteNumber}`)}
            className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-4 shadow-sm cursor-pointer active:opacity-80 transition-opacity"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                {job.urgencyLevel === 'HIGH' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Urgent" />}
                {job.urgencyLevel === 'MEDIUM' && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Needs attention" />}
                {job.status === 'LEAD_RECEIVED' && !job.urgencyLevel && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="New lead" />}
                <span className="font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{job.quoteNumber}</span>
              </div>
              <Badge status={job.status} />
            </div>
            <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{job.customerName}</p>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] truncate">{job.propertyAddress}</p>
            <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-1">{formatDateTime(job.createdAt)}</p>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Quote #</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Address</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => router.push(`/jobs/${job.quoteNumber}`)}
                  className="border-b border-[#F3F4F6] dark:border-[#0F172A] hover:bg-[#F0F7FF] dark:hover:bg-[#1e3a5f]/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">
                    <div className="flex items-center gap-1.5">
                      {job.urgencyLevel === 'HIGH' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Urgent" />}
                      {job.urgencyLevel === 'MEDIUM' && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Needs attention" />}
                      {job.status === 'LEAD_RECEIVED' && !job.urgencyLevel && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="New lead" />}
                      {job.quoteNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{job.customerName}</td>
                  <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{job.propertyAddress}</td>
                  <td className="px-4 py-3"><Badge status={job.status} /></td>
                  <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                    {formatDateTime(job.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
