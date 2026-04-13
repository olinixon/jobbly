import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to query params required' }, { status: 400 })
  }

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) return NextResponse.json({ error: 'No active campaign' }, { status: 400 })

  const fromDate = new Date(from)
  const toDate = new Date(to)
  toDate.setHours(23, 59, 59, 999)

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: { in: ['JOB_BOOKED', 'JOB_COMPLETED'] },
      jobBookedDate: { gte: fromDate, lte: toDate },
    },
    select: {
      quoteNumber: true,
      customerName: true,
      jobBookedDate: true,
    },
    orderBy: { jobBookedDate: 'asc' },
  })

  // Group by date string (YYYY-MM-DD)
  const jobs: Record<string, { quoteNumber: string; customerName: string }[]> = {}
  for (const lead of leads) {
    if (!lead.jobBookedDate) continue
    const date = lead.jobBookedDate.toISOString().split('T')[0]
    if (!jobs[date]) jobs[date] = []
    jobs[date].push({ quoteNumber: lead.quoteNumber, customerName: lead.customerName })
  }

  return NextResponse.json({ jobs })
}
