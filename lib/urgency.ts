export type UrgencyLevel = 'HIGH' | 'MEDIUM' | null

const DAY_MS = 24 * 60 * 60 * 1000

export function computeUrgency(lead: {
  status: string
  createdAt: Date | string
  jobBookedDate?: Date | string | null
  invoiceUrl?: string | null
}): UrgencyLevel {
  const now = Date.now()

  if (lead.status === 'LEAD_RECEIVED') {
    const ageDays = (now - new Date(lead.createdAt).getTime()) / DAY_MS
    if (ageDays >= 3) return 'HIGH'
    if (ageDays >= 1) return 'MEDIUM'
    return null
  }

  if (lead.status === 'JOB_BOOKED' && lead.jobBookedDate) {
    // Invoice uploaded — no action required
    if (lead.invoiceUrl != null) return null
    const daysSince = (now - new Date(lead.jobBookedDate).getTime()) / DAY_MS
    if (daysSince >= 21) return 'HIGH'
    if (daysSince >= 10) return 'MEDIUM'
    return null
  }

  return null
}
