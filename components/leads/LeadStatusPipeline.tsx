import { formatDate } from '@/lib/formatDate'

// CL16: QUOTE_SENT removed from display steps. Legacy leads at QUOTE_SENT are treated
// as "in progress" between Lead Received and Job Booked.
const STEPS = ['LEAD_RECEIVED', 'JOB_BOOKED', 'JOB_COMPLETED']
const LABELS: Record<string, string> = {
  LEAD_RECEIVED: 'Lead Received',
  JOB_BOOKED: 'Job Booked',
  JOB_COMPLETED: 'Job Completed',
}

interface LeadStatusPipelineProps {
  status: string
  jobBookedDate?: Date | null
  cancellationReason?: string | null
}

export default function LeadStatusPipeline({ status, jobBookedDate, cancellationReason }: LeadStatusPipelineProps) {
  // JOB_CANCELLED is an exit state — replace pipeline with a simple badge
  if (status === 'JOB_CANCELLED') {
    return (
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
            Job Cancelled
          </span>
        </div>
        {cancellationReason && (
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{cancellationReason}</p>
        )}
      </div>
    )
  }

  // Map legacy QUOTE_SENT to the same index as LEAD_RECEIVED so it renders between step 0 and 1
  const effectiveStatus = status === 'QUOTE_SENT' ? 'LEAD_RECEIVED' : status
  const currentIdx = STEPS.indexOf(effectiveStatus)

  const bookedDateStr = jobBookedDate ? formatDate(jobBookedDate) : null

  return (
    <div className="flex items-start gap-0">
      {STEPS.map((step, idx) => {
        const done = idx <= currentIdx
        const active = idx === currentIdx
        return (
          <div key={step} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 ${
                  done
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : 'bg-white dark:bg-[#1E293B] border-[#D1D5DB] dark:border-[#334155] text-[#9CA3AF]'
                } ${active ? 'ring-2 ring-[#2563EB]/30' : ''}`}
              >
                {done ? '✓' : idx + 1}
              </div>
              <span
                className={`mt-1 text-xs text-center leading-tight ${
                  active
                    ? 'font-semibold text-[#2563EB] dark:text-[#3B82F6]'
                    : done
                    ? 'text-[#374151] dark:text-[#CBD5E1]'
                    : 'text-[#9CA3AF] dark:text-[#475569]'
                }`}
              >
                {LABELS[step]}
              </span>
              {step === 'JOB_BOOKED' && bookedDateStr && (
                <span className="mt-0.5 text-xs text-[#6B7280] dark:text-[#94A3B8] text-center">
                  {bookedDateStr}
                </span>
              )}
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 mt-3.5 ${
                  idx < currentIdx ? 'bg-[#2563EB]' : 'bg-[#E5E7EB] dark:bg-[#334155]'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
