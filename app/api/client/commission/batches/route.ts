import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign assigned.' }, { status: 400 })

  const batches = await prisma.reconciliationBatch.findMany({
    where: { campaignId },
    include: {
      leads: { select: { grossMarkup: true } },
    },
    orderBy: { reconciledAt: 'desc' },
  })

  const result = batches.map(batch => ({
    id: batch.id,
    label: batch.label,
    reconciledAt: batch.reconciledAt,
    totalJobs: batch.totalJobs,
    totalGrossMarkup: batch.leads.reduce((s, l) => s + (l.grossMarkup ?? 0), 0),
    monthKeys: batch.monthKeys,
    client_stripe_invoice_id: batch.client_stripe_invoice_id,
    client_invoice_sent_at: batch.client_invoice_sent_at,
  }))

  return NextResponse.json(result)
}
