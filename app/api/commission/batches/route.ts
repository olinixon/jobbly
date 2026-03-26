import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaignId = session.user.campaignId
  const where = campaignId ? { campaignId } : {}

  const batches = await prisma.reconciliationBatch.findMany({
    where,
    orderBy: { reconciledAt: 'desc' },
  })

  return NextResponse.json(batches)
}
