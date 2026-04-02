import { prisma } from '@/lib/prisma'
import { normalisePhone } from '@/lib/normalisePhone'

export interface DuplicateMatch {
  confidence: 'high' | 'medium'
  reason: string
  matched_lead_id: string
  matched_quote_number: string
  matched_customer_name: string
}

export async function detectDuplicate(
  phone: string,
  address: string,
  excludeLeadId?: string
): Promise<DuplicateMatch | null> {
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)
  const normalisedPhone = normalisePhone(phone) ?? phone

  // 1. Same phone AND same address — high confidence
  const match = await prisma.lead.findFirst({
    where: {
      AND: [
        { customerPhone: { contains: normalisedPhone, mode: 'insensitive' } },
        { propertyAddress: { contains: address, mode: 'insensitive' } },
        { createdAt: { gte: sixMonthsAgo } },
        ...(excludeLeadId ? [{ id: { not: excludeLeadId } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (match) {
    return {
      confidence: 'high',
      reason: 'Same phone number and address',
      matched_lead_id: match.id,
      matched_quote_number: match.quoteNumber,
      matched_customer_name: match.customerName,
    }
  }

  // 2. Same phone number only — medium confidence
  const phoneOnlyMatch = await prisma.lead.findFirst({
    where: {
      AND: [
        { customerPhone: { contains: normalisedPhone, mode: 'insensitive' } },
        { createdAt: { gte: sixMonthsAgo } },
        ...(excludeLeadId ? [{ id: { not: excludeLeadId } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (phoneOnlyMatch) {
    return {
      confidence: 'medium',
      reason: 'Same phone number',
      matched_lead_id: phoneOnlyMatch.id,
      matched_quote_number: phoneOnlyMatch.quoteNumber,
      matched_customer_name: phoneOnlyMatch.customerName,
    }
  }

  return null
}
