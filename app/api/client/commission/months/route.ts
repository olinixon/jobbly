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

  const where: Record<string, unknown> = {
    campaignId,
    status: 'JOB_COMPLETED',
    jobCompletedAt: { not: null },
  }
  if (from || to) {
    where.jobCompletedAt = {
      not: null,
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + 'T23:59:59') } : {}),
    }
  }

  const leads = await prisma.lead.findMany({
    where,
    select: {
      quoteNumber: true,
      customerName: true,
      propertyAddress: true,
      grossMarkup: true,
      jobCompletedAt: true,
    },
    orderBy: { jobCompletedAt: 'asc' },
  })

  // Group by month of jobCompletedAt
  const monthMap = new Map<string, {
    monthKey: string
    label: string
    leads: typeof leads
  }>()

  for (const lead of leads) {
    const d = new Date(lead.jobCompletedAt!)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { monthKey, label, leads: [] })
    }
    monthMap.get(monthKey)!.leads.push(lead)
  }

  const months = Array.from(monthMap.values()).map(({ monthKey, label, leads: mLeads }) => ({
    monthKey,
    label,
    jobCount: mLeads.length,
    totalGrossMarkup: mLeads.reduce((s, l) => s + (l.grossMarkup ?? 0), 0),
    leads: mLeads.map(l => ({
      quoteNumber: l.quoteNumber,
      customerName: l.customerName,
      propertyAddress: l.propertyAddress,
      grossMarkup: l.grossMarkup,
    })),
  }))

  return NextResponse.json(months)
}
