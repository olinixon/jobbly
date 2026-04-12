import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign' }, { status: 400 })

  const body = await request.json()
  const webhookSecret: string | undefined = body.webhook_secret

  if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
    return NextResponse.json(
      { error: 'Webhook secret must start with whsec_' },
      { status: 400 }
    )
  }

  const encrypted = encrypt(webhookSecret)

  await prisma.billingProfile.update({
    where: { campaign_id_role: { campaign_id: campaignId, role: 'CLIENT' } },
    data: { stripe_webhook_secret: encrypted },
  })

  return NextResponse.json({ success: true })
}
