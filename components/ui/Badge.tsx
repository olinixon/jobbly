type LeadStatus = 'LEAD_RECEIVED' | 'QUOTE_SENT' | 'JOB_BOOKED' | 'JOB_COMPLETED' | 'JOB_CANCELLED'
type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED'
type RoleType = 'ADMIN' | 'CLIENT' | 'SUBCONTRACTOR'

const leadStatusMap: Record<LeadStatus, { label: string; className: string }> = {
  LEAD_RECEIVED: { label: 'Lead Received', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  QUOTE_SENT: { label: 'Quote Sent', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  JOB_BOOKED: { label: 'Job Booked', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  JOB_COMPLETED: { label: 'Job Completed', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  JOB_CANCELLED: { label: 'Job Cancelled', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
}

const campaignStatusMap: Record<CampaignStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-700' },
  PAUSED: { label: 'Paused', className: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: 'Completed', className: 'bg-gray-100 text-gray-600' },
}

const roleMap: Record<RoleType, { label: string; className: string }> = {
  ADMIN: { label: 'Admin', className: 'bg-blue-100 text-blue-700' },
  CLIENT: { label: 'Client', className: 'bg-purple-100 text-purple-700' },
  SUBCONTRACTOR: { label: 'Subcontractor', className: 'bg-orange-100 text-orange-700' },
}

interface BadgeProps {
  status: string
  type?: 'lead' | 'campaign' | 'role'
}

export default function Badge({ status, type = 'lead' }: BadgeProps) {
  const map = type === 'campaign' ? campaignStatusMap : type === 'role' ? roleMap : leadStatusMap
  const config = (map as Record<string, { label: string; className: string }>)[status]
  if (!config) return <span className="text-sm text-[#6B7280]">{status}</span>

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
