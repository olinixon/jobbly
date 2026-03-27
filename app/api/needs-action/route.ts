import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'
import { computeUrgency } from '@/lib/urgency'

export async function GET() {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUBCONTRACTOR')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) return NextResponse.json({ error: 'No campaign assigned.' }, { status: 400 })

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: { not: 'JOB_COMPLETED' },
    },
    select: {
      id: true,
      quoteNumber: true,
      customerName: true,
      propertyAddress: true,
      status: true,
      createdAt: true,
      jobBookedDate: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const urgent = leads
    .map(l => ({ ...l, urgencyLevel: computeUrgency(l) }))
    .filter(l => l.urgencyLevel !== null)
    .sort((a, b) => {
      // HIGH before MEDIUM, then oldest first
      if (a.urgencyLevel === b.urgencyLevel) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return a.urgencyLevel === 'HIGH' ? -1 : 1
    })

  return NextResponse.json(urgent)
}
