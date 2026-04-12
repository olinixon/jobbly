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

  // Soft delete — do NOT delete the row. Set verified = false and null MYOB tokens.
  await prisma.customerPaymentProfile.updateMany({
    where: { campaign_id: campaignId, provider: 'MYOB' },
    data: {
      verified: false,
      myob_access_token: null,
      myob_refresh_token: null,
      myob_token_expiry: null,
      myob_company_file_id: null,
      updated_at: new Date(),
    },
  })
  // No profile exists: returns 200 silently

  return NextResponse.json({ disconnected: true })
}
