import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { batchId } = await params
  const batch = await prisma.reconciliationBatch.findUnique({
    where: { id: batchId },
    include: {
      campaign: { select: { name: true, clientCompanyName: true } },
      leads: {
        select: {
          quoteNumber: true,
          customerName: true,
          propertyAddress: true,
          contractorRate: true,
          customerPrice: true,
          omnisideCommission: true,
          jobCompletedAt: true,
        },
        orderBy: { jobCompletedAt: 'asc' },
      },
    },
  })

  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

  if (session.user.campaignId && batch.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  return NextResponse.json(batch)
}
