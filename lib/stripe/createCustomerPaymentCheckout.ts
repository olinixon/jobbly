// Uses /lib/stripeClient.ts (getStripeClient) which exists in this codebase.
// customer_price is ex-GST — amountInclGst must be customer_price * 1.15
// (or invoiceTotalGstInclusive if AI-extracted).

import Stripe from 'stripe';
import { decrypt } from '@/lib/encryption';
import { prisma } from '@/lib/prisma';

const CARD_SURCHARGE_RATE = 0.0265; // 2.65%

export async function createCustomerPaymentCheckout(params: {
  campaignId: string;
  quoteNumber: string;
  propertyAddress: string;
  customerEmail: string;
  amountInclGst: number; // GST-inclusive — caller must pass customerPrice * 1.15 (or invoiceTotalGstInclusive)
  portalToken: string;
  paymentMethod?: 'card' | 'bank_transfer'; // defaults to 'card' for backwards compatibility
}) {
  const {
    campaignId,
    quoteNumber,
    propertyAddress,
    customerEmail,
    amountInclGst,
    portalToken,
    paymentMethod = 'card',
  } = params;

  const profile = await prisma.customerPaymentProfile.findFirst({
    where: { campaign_id: campaignId, is_active: true, verified: true },
  });
  if (!profile?.stripe_secret_key) throw new Error('Stripe not connected');

  const secretKey = decrypt(profile.stripe_secret_key);
  const stripe = new Stripe(secretKey);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const baseAmountCents = Math.round(amountInclGst * 100);

  if (paymentMethod === 'bank_transfer') {
    // Bank transfer — no surcharge, nz_bank_account payment method
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['nz_bank_account'] as Stripe.Checkout.SessionCreateParams['payment_method_types'],
        line_items: [{
          price_data: {
            currency: 'nzd',
            product_data: {
              name: `Gutter Clean — ${propertyAddress}`,
              description: `Invoice ref: ${quoteNumber}`,
            },
            unit_amount: baseAmountCents,
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
    } catch (error) {
      // nz_bank_account may not be available on all Stripe accounts — fall back to card
      console.error('[createCustomerPaymentCheckout] nz_bank_account failed, falling back to card:', error);
      // Fall through to card payment below
    }
  }

  // Card payment (default or fallback from bank transfer failure)
  const surchargeCents = Math.round(baseAmountCents * CARD_SURCHARGE_RATE);
  const totalCents = baseAmountCents + surchargeCents;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'nzd',
        product_data: {
          name: `Gutter Clean — ${propertyAddress}`,
          description: `Invoice ref: ${quoteNumber} (incl. 2.65% card surcharge)`,
        },
        unit_amount: totalCents,
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
