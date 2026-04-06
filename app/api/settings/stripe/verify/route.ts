import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CLIENT')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRole = session.user.role
  const campaignId = session.user.campaignId
  if (!campaignId) {
    return NextResponse.json({ error: 'No campaign assigned.' }, { status: 400 })
  }

  const body = await request.json()
  const { stripe_secret_key, stripe_gst_rate_id, stripe_customer_id, company_name, billing_email, billing_address } = body

  if (!stripe_secret_key || !stripe_gst_rate_id || !stripe_customer_id || !company_name || !billing_email) {
    return NextResponse.json({ error: 'All fields except billing address are required.' }, { status: 400 })
  }

  // Step A — verify the secret key and customer ID
  const stripe = new Stripe(stripe_secret_key)
  try {
    const customer = await stripe.customers.retrieve(stripe_customer_id)
    if (!customer || customer.deleted) {
      return NextResponse.json(
        { error: "Connected to Stripe, but we couldn't find that customer. Double-check the Customer ID." },
        { status: 400 }
      )
    }
  } catch (err) {
    const stripeErr = err as InstanceType<typeof Stripe.errors.StripeError>
    if (stripeErr.type === 'StripeAuthenticationError') {
      return NextResponse.json(
        { error: "We couldn't connect to Stripe. Check your Secret Key and try again." },
        { status: 400 }
      )
    }
    if (stripeErr.code === 'resource_missing') {
      return NextResponse.json(
        { error: "Connected to Stripe, but we couldn't find that customer. Double-check the Customer ID." },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "We couldn't connect to Stripe. Check your Secret Key and try again." },
      { status: 400 }
    )
  }

  // Step B — verify the GST tax rate ID
  try {
    await stripe.taxRates.retrieve(stripe_gst_rate_id)
  } catch (err) {
    const stripeErr = err as InstanceType<typeof Stripe.errors.StripeError>
    if (stripeErr.code === 'resource_missing' || stripeErr.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: "Connected to Stripe, but we couldn't find that tax rate. Double-check the GST Tax Rate ID." },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Connected to Stripe, but we couldn't find that tax rate. Double-check the GST Tax Rate ID." },
      { status: 400 }
    )
  }

  // Step C — all three pass: encrypt key and upsert BillingProfile
  const encryptedKey = encrypt(stripe_secret_key)

  await prisma.billingProfile.upsert({
    where: { campaign_id_role: { campaign_id: campaignId, role: userRole } },
    create: {
      campaign_id: campaignId,
      role: userRole,
      company_name,
      billing_email,
      billing_address: billing_address ?? null,
      stripe_customer_id,
      stripe_secret_key: encryptedKey,
      stripe_gst_rate_id,
      stripe_verified: true,
      stripe_verified_at: new Date(),
    },
    update: {
      company_name,
      billing_email,
      billing_address: billing_address ?? null,
      stripe_customer_id,
      stripe_secret_key: encryptedKey,
      stripe_gst_rate_id,
      stripe_verified: true,
      stripe_verified_at: new Date(),
    },
  })

  return NextResponse.json({ verified: true })
}
