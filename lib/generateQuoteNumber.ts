import { prisma } from './prisma'

export async function generateQuoteNumber(campaignId: string): Promise<string> {
  // Use a transaction to prevent race conditions
  return prisma.$transaction(async (tx) => {
    const count = await tx.lead.count({ where: { campaignId } })
    const next = count + 1
    return `JBL-${String(next).padStart(5, '0')}`
  })
}
