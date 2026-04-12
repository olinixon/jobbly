import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getMyobAccessToken } from '@/lib/myob/getMyobAccessToken'

export async function POST(_request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign' }, { status: 400 })

  const profile = await prisma.customerPaymentProfile.findUnique({
    where: { campaign_id: campaignId },
  })

  if (!profile || profile.provider !== 'MYOB' || !profile.verified) {
    return NextResponse.json({ status: 'not_connected' }, { status: 400 })
  }

  try {
    const accessToken = await getMyobAccessToken(campaignId)
    const response = await fetch(
      `https://api.myob.com/accountright/${profile.myob_company_file_id}/Company`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-myobapi-key': process.env.MYOB_CLIENT_ID!,
          'x-myobapi-version': 'v2',
        },
      }
    )

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({ status: 'connected', company_name: data.CompanyName ?? 'Connected' })
    } else {
      return NextResponse.json({ status: 'api_error', http_status: response.status })
    }
  } catch (error) {
    return NextResponse.json({ status: 'error', message: String(error) })
  }
}
