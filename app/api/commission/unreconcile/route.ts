import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { batchId } = await request.json()
  if (!batchId) return NextResponse.json({ error: 'batchId is required.' }, { status: 400 })

  const batch = await prisma.reconciliationBatch.findUnique({ where: { id: batchId } })
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

  if (session.user.campaignId && batch.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  await prisma.$transaction([
    prisma.lead.updateMany({
      where: { reconciliationBatchId: batchId },
      data: { reconciliationBatchId: null },
    }),
    prisma.reconciliationBatch.delete({ where: { id: batchId } }),
  ])

  return NextResponse.json({ success: true })
}
