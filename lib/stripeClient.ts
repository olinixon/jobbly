import Stripe from 'stripe';
import { decrypt } from '@/lib/encryption';

export function getStripeClient(encryptedSecretKey: string): Stripe {
  const decryptedKey = decrypt(encryptedSecretKey);
  return new Stripe(decryptedKey);
}
