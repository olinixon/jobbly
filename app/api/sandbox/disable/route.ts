import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'

export async function POST(_request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) return NextResponse.json({ error: 'No active campaign' }, { status: 400 })

  await prisma.lead.deleteMany({ where: { campaignId, is_test: true } })
  await prisma.campaign.update({ where: { id: campaignId }, data: { sandbox_active: false } })

  return NextResponse.json({ success: true })
}
