export type UrgencyLevel = 'HIGH' | 'MEDIUM' | null

const DAY_MS = 24 * 60 * 60 * 1000

export function computeUrgency(lead: {
  status: string
  createdAt: Date | string
  jobBookedDate?: Date | string | null
  invoiceUrl?: string | null
}): UrgencyLevel {
  const now = Date.now()

  // CL16: A lead needs action only when it is in LEAD_RECEIVED status.
  // The green dot disappears when the lead moves to JOB_BOOKED.
  if (lead.status === 'LEAD_RECEIVED') {
    const ageDays = (now - new Date(lead.createdAt).getTime()) / DAY_MS
    if (ageDays >= 3) return 'HIGH'
    if (ageDays >= 1) return 'MEDIUM'
    return null
  }

  return null
}
