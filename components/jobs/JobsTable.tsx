'use client'

import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'

interface Job {
  id: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  status: string
  createdAt: Date
}

export default function JobsTable({ jobs }: { jobs: Job[] }) {
  const router = useRouter()

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
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
                <td className="px-4 py-3 font-mono text-xs text-[#374151] dark:text-[#CBD5E1]">{job.quoteNumber}</td>
                <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">{job.customerName}</td>
                <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] max-w-48 truncate">{job.propertyAddress}</td>
                <td className="px-4 py-3"><Badge status={job.status} /></td>
                <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] whitespace-nowrap">
                  {new Date(job.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
