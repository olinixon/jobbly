import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET(_request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = session.user.campaignId
  if (!campaignId) return NextResponse.json({ error: 'No campaign' }, { status: 400 })

  const authUrl = new URL('https://secure.myob.com/oauth2/v1/authorize')
  authUrl.searchParams.set('client_id', process.env.MYOB_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', process.env.MYOB_REDIRECT_URI!)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'CompanyFile')
  authUrl.searchParams.set('state', campaignId) // pass campaignId through OAuth state

  return NextResponse.redirect(authUrl.toString())
}
