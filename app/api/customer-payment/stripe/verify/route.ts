// Entirely separate from the existing B2B BillingProfile Stripe connection.
// Do not modify BillingProfile.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
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
  const { stripe_secret_key } = body as { stripe_secret_key: string }

  if (!stripe_secret_key || typeof stripe_secret_key !== 'string') {
    return NextResponse.json({ error: 'stripe_secret_key is required' }, { status: 400 })
  }

  // Verify key by attempting a balance retrieval
  const stripe = new Stripe(stripe_secret_key)
  try {
    await stripe.balance.retrieve()
  } catch {
    return NextResponse.json(
      { error: 'Invalid Stripe secret key. Check your key and try again.' },
      { status: 400 }
    )
  }

  // Only auto-activate if no other profile is already active for this campaign
  const existingActive = await prisma.customerPaymentProfile.findFirst({
    where: { campaign_id: campaignId, is_active: true },
  })
  const shouldSetActive = !existingActive

  // Upsert CustomerPaymentProfile by user_id — one profile per user
  // Switching to Stripe clears all MYOB fields — only one platform active at a time
  await prisma.customerPaymentProfile.upsert({
    where: { user_id: session.user.id },
    create: {
      campaign_id: campaignId,
      user_id: session.user.id,
      is_active: shouldSetActive,
      provider: 'STRIPE',
      stripe_secret_key: encrypt(stripe_secret_key),
      verified: true,
      verified_at: new Date(),
    },
    update: {
      provider: 'STRIPE',
      stripe_secret_key: encrypt(stripe_secret_key),
      verified: true,
      verified_at: new Date(),
      myob_company_file_id: null,
      myob_access_token: null,
      myob_refresh_token: null,
      myob_token_expiry: null,
      updated_at: new Date(),
    },
  })

  return NextResponse.json({ verified: true })
}
