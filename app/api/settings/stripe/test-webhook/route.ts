import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'

export async function POST(_request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign' }, { status: 400 })

  const billingProfile = await prisma.billingProfile.findUnique({
    where: { campaign_id_role: { campaign_id: campaignId, role: 'CLIENT' } },
    select: { stripe_webhook_secret: true },
  })

  if (!billingProfile?.stripe_webhook_secret) {
    return NextResponse.json(
      { error: 'No webhook secret saved. Please complete the setup first.' },
      { status: 400 }
    )
  }

  // Decrypt and validate format — the real test happens when the first payment fires
  let decrypted: string
  try {
    decrypted = decrypt(billingProfile.stripe_webhook_secret)
  } catch {
    return NextResponse.json({ status: 'error', message: 'Could not decrypt secret — please save it again.' })
  }

  if (!decrypted.startsWith('whsec_')) {
    return NextResponse.json({ status: 'error', message: 'Saved secret has an unexpected format.' })
  }

  return NextResponse.json({ status: 'connected' })
}
