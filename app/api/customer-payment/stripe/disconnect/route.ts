import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign' }, { status: 400 })

  // Soft delete — do NOT delete the row. Set verified = false and null Stripe tokens.
  await prisma.customerPaymentProfile.updateMany({
    where: { user_id: session.user.id, provider: 'STRIPE' },
    data: {
      verified: false,
      is_active: false,
      stripe_secret_key: null,
      stripe_webhook_secret: null,
      updated_at: new Date(),
    },
  })

  return NextResponse.json({ disconnected: true })
}
