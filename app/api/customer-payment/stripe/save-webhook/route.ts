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
  const { webhook_secret } = body as { webhook_secret: string }

  if (!webhook_secret || typeof webhook_secret !== 'string') {
    return NextResponse.json({ error: 'webhook_secret is required' }, { status: 400 })
  }

  if (!webhook_secret.startsWith('whsec_')) {
    return NextResponse.json(
      { error: 'Webhook secret must start with whsec_' },
      { status: 400 }
    )
  }

  await prisma.customerPaymentProfile.updateMany({
    where: { user_id: session.user.id },
    data: { stripe_webhook_secret: encrypt(webhook_secret), updated_at: new Date() },
  })

  return NextResponse.json({ saved: true })
}
