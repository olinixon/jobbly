import { encrypt, decrypt } from '@/lib/encryption';
import { prisma } from '@/lib/prisma';

export async function getMyobAccessToken(campaignId: string): Promise<string> {
  const profile = await prisma.customerPaymentProfile.findUnique({
    where: { campaign_id: campaignId },
  });

  if (!profile || profile.provider !== 'MYOB' || !profile.verified) {
    throw new Error('MYOB not connected for this campaign');
  }

  // Token still valid (5-minute buffer)
  if (
    profile.myob_token_expiry &&
    profile.myob_token_expiry > new Date(Date.now() + 5 * 60 * 1000) &&
    profile.myob_access_token
  ) {
    return decrypt(profile.myob_access_token);
  }

  // Token expired — refresh
  if (!profile.myob_refresh_token) {
    await prisma.customerPaymentProfile.update({
      where: { campaign_id: campaignId },
      data: { verified: false, updated_at: new Date() },
    });
    throw new Error('MYOB refresh token missing — reconnection required');
  }

  const refreshToken = decrypt(profile.myob_refresh_token);

  const response = await fetch('https://secure.myob.com/oauth2/v1/authorize/accesstoken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MYOB_CLIENT_ID!,
      client_secret: process.env.MYOB_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    // Mark as unverified so the settings UI prompts reconnection
    await prisma.customerPaymentProfile.update({
      where: { campaign_id: campaignId },
      data: { verified: false, updated_at: new Date() },
    });
    throw new Error(`MYOB token refresh failed: ${response.status}`);
  }

  const data = await response.json();

  await prisma.customerPaymentProfile.update({
    where: { campaign_id: campaignId },
    data: {
      myob_access_token: encrypt(data.access_token),
      myob_refresh_token: encrypt(data.refresh_token),
      myob_token_expiry: new Date(Date.now() + data.expires_in * 1000),
      updated_at: new Date(),
    },
  });

  return data.access_token;
}
