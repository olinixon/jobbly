export type UrgencyLevel = 'HIGH' | 'MEDIUM' | null

const DAY_MS = 24 * 60 * 60 * 1000

export function computeUrgency(lead: {
  status: string
  createdAt: Date | string
  jobBookedDate?: Date | string | null
}): UrgencyLevel {
  const now = Date.now()

  if (lead.status === 'LEAD_RECEIVED') {
    const ageDays = (now - new Date(lead.createdAt).getTime()) / DAY_MS
    if (ageDays >= 3) return 'HIGH'
    if (ageDays >= 1) return 'MEDIUM'
    return null
  }

  if (lead.status === 'JOB_BOOKED' && lead.jobBookedDate) {
    const daysUntil = (new Date(lead.jobBookedDate).getTime() - now) / DAY_MS
    if (daysUntil <= 2) return 'HIGH'
  }

  return null
}
