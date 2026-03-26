import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaignId = session.user.campaignId
  const where: Record<string, unknown> = { status: 'JOB_COMPLETED', jobCompletedAt: { not: null } }
  if (campaignId) where.campaignId = campaignId

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      quoteNumber: true,
      customerName: true,
      propertyAddress: true,
      contractorRate: true,
      customerPrice: true,
      omnisideCommission: true,
      jobCompletedAt: true,
      reconciliationBatchId: true,
    },
    orderBy: { jobCompletedAt: 'asc' },
  })

  // Group by month
  const monthMap = new Map<string, {
    monthKey: string
    label: string
    leads: typeof leads
    batchId: string | null
  }>()

  for (const lead of leads) {
    const d = new Date(lead.jobCompletedAt!)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { monthKey, label, leads: [], batchId: lead.reconciliationBatchId })
    }
    monthMap.get(monthKey)!.leads.push(lead)
  }

  const months = Array.from(monthMap.values()).map(({ monthKey, label, leads: mLeads, batchId }) => {
    const totalContractorCost = mLeads.reduce((s, l) => s + (l.contractorRate ?? 0), 0)
    const totalCustomerRevenue = mLeads.reduce((s, l) => s + (l.customerPrice ?? 0), 0)
    const totalCommission = mLeads.reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)
    const isReconciled = mLeads.every(l => l.reconciliationBatchId != null)

    return {
      monthKey,
      label,
      jobCount: mLeads.length,
      totalContractorCost,
      totalCustomerRevenue,
      totalCommission,
      isReconciled,
      batchId: isReconciled ? batchId : null,
      leads: mLeads.map(l => ({
        quoteNumber: l.quoteNumber,
        customerName: l.customerName,
        propertyAddress: l.propertyAddress,
        contractorRate: l.contractorRate,
        customerPrice: l.customerPrice,
        omnisideCommission: l.omnisideCommission,
        jobCompletedAt: l.jobCompletedAt,
      })),
    }
  })

  return NextResponse.json(months)
}
