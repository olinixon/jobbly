import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign assigned.' }, { status: 400 })

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const dateFilter = from || to
    ? {
        jobCompletedAt: {
          not: null as null,
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to + 'T23:59:59') } : {}),
        },
      }
    : { jobCompletedAt: { not: null as null } }

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: 'JOB_COMPLETED',
      ...dateFilter,
    },
    select: {
      quoteNumber: true,
      customerName: true,
      grossMarkup: true,
      jobCompletedAt: true,
      reconciliationBatch: {
        select: {
          invoice_sent_at: true,
          stripe_invoice_id: true,
        },
      },
    },
    orderBy: { jobCompletedAt: 'desc' },
  })

  const result = leads.map(l => ({
    quoteNumber: l.quoteNumber,
    customerName: l.customerName,
    grossMarkup: l.grossMarkup,
    sentAt: l.reconciliationBatch?.invoice_sent_at?.toISOString() ?? null,
    paidAt: l.reconciliationBatch?.stripe_invoice_id ? (l.reconciliationBatch?.invoice_sent_at?.toISOString() ?? null) : null,
    isPaid: !!l.reconciliationBatch?.stripe_invoice_id,
    isSent: !!l.reconciliationBatch?.invoice_sent_at,
  }))

  return NextResponse.json(result)
}
