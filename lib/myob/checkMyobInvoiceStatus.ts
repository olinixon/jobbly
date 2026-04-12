import { getMyobAccessToken } from './getMyobAccessToken';
import { prisma } from '@/lib/prisma';

export async function checkMyobInvoiceStatus(
  campaignId: string,
  myobInvoiceId: string
): Promise<{ isPaid: boolean }> {
  const profile = await prisma.customerPaymentProfile.findUnique({
    where: { campaign_id: campaignId },
  });
  if (!profile?.myob_company_file_id || !profile.verified) {
    throw new Error('MYOB profile not found or not verified');
  }

  const accessToken = await getMyobAccessToken(campaignId);

  const response = await fetch(
    `https://api.myob.com/accountright/${profile.myob_company_file_id}/Sale/Invoice/Service/${myobInvoiceId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-myobapi-key': process.env.MYOB_CLIENT_ID!,
        'x-myobapi-version': 'v2',
      },
    }
  );

  if (!response.ok) throw new Error(`MYOB invoice fetch failed: ${response.status}`);

  const data = await response.json();
  const isPaid = data.Status === 'CLOSED' || data.BalanceDueAmount === 0;

  return { isPaid };
}
