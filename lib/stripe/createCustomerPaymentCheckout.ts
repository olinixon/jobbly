// Uses /lib/stripeClient.ts (getStripeClient) which exists in this codebase.
// customer_price is ex-GST — amountInclGst must be customer_price * 1.15
// (or invoiceTotalGstInclusive if AI-extracted).

import Stripe from 'stripe';
import { decrypt } from '@/lib/encryption';
import { prisma } from '@/lib/prisma';

export async function createCustomerPaymentCheckout(params: {
  campaignId: string;
  quoteNumber: string;
  propertyAddress: string;
  customerEmail: string;
  amountInclGst: number; // GST-inclusive — caller must pass customerPrice * 1.15 (or invoiceTotalGstInclusive)
  portalToken: string;
}) {
  const { campaignId, quoteNumber, propertyAddress, customerEmail, amountInclGst, portalToken } = params;

  const profile = await prisma.customerPaymentProfile.findFirst({
    where: { campaign_id: campaignId, is_active: true, verified: true },
  });
  if (!profile?.stripe_secret_key) throw new Error('Stripe not connected');

  const secretKey = decrypt(profile.stripe_secret_key);
  const stripe = new Stripe(secretKey);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'nzd',
        product_data: {
          name: `Gutter Clean — ${propertyAddress}`,
          description: `Invoice ref: ${quoteNumber}`,
        },
        unit_amount: Math.round(amountInclGst * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    customer_email: customerEmail,
    client_reference_id: portalToken,
    success_url: `${appUrl}/portal/${portalToken}?paid=true`,
    cancel_url: `${appUrl}/portal/${portalToken}`,
    expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  });

  return { checkoutUrl: session.url };
}
