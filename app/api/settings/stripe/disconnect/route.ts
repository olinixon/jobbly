import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'

export async function DELETE() {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CLIENT')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRole = session.user.role
  let campaignId = await getActiveCampaignId(session.user.campaignId, userRole)

  // ADMIN fallback: auto-detect from DB if no campaign in session or cookie
  if (!campaignId && userRole === 'ADMIN') {
    const campaigns = await prisma.campaign.findMany({ select: { id: true }, orderBy: { createdAt: 'desc' } })
    if (campaigns.length === 1) {
      campaignId = campaigns[0].id
    } else if (campaigns.length > 1) {
      return NextResponse.json(
        { error: 'Multiple campaigns found — please select a campaign first.' },
        { status: 400 }
      )
    }
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'No campaign assigned.' }, { status: 400 })
  }

  try {
    await prisma.billingProfile.delete({
      where: { campaign_id_role: { campaign_id: campaignId, role: userRole } },
    })
  } catch {
    // Record not found — already disconnected, treat as success
  }

  return NextResponse.json({ disconnected: true })
}
