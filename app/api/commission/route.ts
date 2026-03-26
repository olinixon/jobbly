import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const reconciled = url.searchParams.get('reconciled')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const campaignId = session.user.campaignId

  const where: Record<string, unknown> = { status: 'JOB_COMPLETED' }
  if (campaignId) where.campaignId = campaignId
  if (reconciled === 'true') where.reconciliationBatchId = { not: null }
  if (reconciled === 'false') where.reconciliationBatchId = null
  if (from || to) {
    where.updatedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(leads)
}
