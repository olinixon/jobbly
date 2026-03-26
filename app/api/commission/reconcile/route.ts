import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { monthKeys, label } = await request.json()
  if (!monthKeys || !Array.isArray(monthKeys) || monthKeys.length === 0 || !label) {
    return NextResponse.json({ error: 'monthKeys and label are required.' }, { status: 400 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign assigned.' }, { status: 400 })

  // Find all JOB_COMPLETED leads in these months for this campaign
  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: 'JOB_COMPLETED',
      jobCompletedAt: { not: null },
      reconciliationBatchId: null,
    },
    select: {
      id: true,
      contractorRate: true,
      customerPrice: true,
      omnisideCommission: true,
      jobCompletedAt: true,
    },
  })

  // Filter to only leads in the requested months
  const leadsInMonths = leads.filter(l => {
    const d = new Date(l.jobCompletedAt!)
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return monthKeys.includes(mk)
  })

  if (leadsInMonths.length === 0) {
    return NextResponse.json({ error: 'No unreconciled leads found in the selected months.' }, { status: 400 })
  }

  const totalContractorCost = leadsInMonths.reduce((s, l) => s + (l.contractorRate ?? 0), 0)
  const totalCustomerRevenue = leadsInMonths.reduce((s, l) => s + (l.customerPrice ?? 0), 0)
  const totalCommission = leadsInMonths.reduce((s, l) => s + (l.omnisideCommission ?? 0), 0)

  const batch = await prisma.$transaction(async (tx) => {
    const newBatch = await tx.reconciliationBatch.create({
      data: {
        campaignId,
        label,
        monthKeys: monthKeys.join(','),
        totalJobs: leadsInMonths.length,
        totalContractorCost,
        totalCustomerRevenue,
        totalCommission,
        reconciled: true,
        reconciledAt: new Date(),
      },
    })
    await tx.lead.updateMany({
      where: { id: { in: leadsInMonths.map(l => l.id) } },
      data: { reconciliationBatchId: newBatch.id },
    })
    return newBatch
  })

  return NextResponse.json(batch)
}
