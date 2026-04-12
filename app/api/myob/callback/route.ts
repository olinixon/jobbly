// Public route — MYOB redirects here after OAuth approval.
// No session on this route. campaignId is passed via OAuth state param.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const campaignId = searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!code || !campaignId) {
    console.error('[MYOB] Callback missing code or state:', { code: !!code, campaignId: !!campaignId })
    return NextResponse.redirect(`${appUrl}/client/settings?payment=error`)
  }

  // Validate campaign exists
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } })
  if (!campaign) {
    console.error('[MYOB] Campaign not found for state:', campaignId)
    return NextResponse.redirect(`${appUrl}/client/settings?payment=error`)
  }

  // Exchange auth code for tokens
  const tokenResponse = await fetch('https://secure.myob.com/oauth2/v1/authorize/accesstoken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MYOB_CLIENT_ID!,
      client_secret: process.env.MYOB_CLIENT_SECRET!,
      redirect_uri: process.env.MYOB_REDIRECT_URI!,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResponse.ok) {
    console.error('[MYOB] Token exchange failed:', tokenResponse.status, await tokenResponse.text())
    return NextResponse.redirect(`${appUrl}/client/settings?payment=error`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken: string = tokenData.access_token
  const refreshToken: string = tokenData.refresh_token
  const expiresIn: number = tokenData.expires_in

  // Fetch MYOB company file list
  const filesResponse = await fetch('https://api.myob.com/accountright/', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-myobapi-key': process.env.MYOB_CLIENT_ID!,
      'x-myobapi-version': 'v2',
    },
  })

  if (!filesResponse.ok) {
    console.error('[MYOB] Company files fetch failed:', filesResponse.status)
    return NextResponse.redirect(`${appUrl}/client/settings?payment=error`)
  }

  const files = await filesResponse.json()

  // Log available files so Oli can verify the correct one is selected
  console.log('[MYOB] Company files available:', JSON.stringify(
    (files ?? []).map((f: { Id: string; Name: string }) => ({ Id: f.Id, Name: f.Name }))
  ))

  const companyFile = files?.[0]
  if (!companyFile?.Id) {
    console.error('[MYOB] No company files found in account')
    return NextResponse.redirect(`${appUrl}/client/settings?payment=error`)
  }
  console.log(`[MYOB] Using company file: ${companyFile.Name} (${companyFile.Id})`)

  // Upsert CustomerPaymentProfile
  // Switching to MYOB clears all Stripe fields — only one platform active at a time
  await prisma.customerPaymentProfile.upsert({
    where: { campaign_id: campaignId },
    create: {
      campaign_id: campaignId,
      provider: 'MYOB',
      myob_company_file_id: companyFile.Id,
      myob_access_token: encrypt(accessToken),
      myob_refresh_token: encrypt(refreshToken),
      myob_token_expiry: new Date(Date.now() + expiresIn * 1000),
      verified: true,
      verified_at: new Date(),
    },
    update: {
      provider: 'MYOB',
      myob_company_file_id: companyFile.Id,
      myob_access_token: encrypt(accessToken),
      myob_refresh_token: encrypt(refreshToken),
      myob_token_expiry: new Date(Date.now() + expiresIn * 1000),
      verified: true,
      verified_at: new Date(),
      stripe_secret_key: null,
      stripe_webhook_secret: null,
      updated_at: new Date(),
    },
  })

  return NextResponse.redirect(`${appUrl}/client/settings?payment=connected&provider=myob`)
}
