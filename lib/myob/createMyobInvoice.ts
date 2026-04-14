// GST treatment confirmed by Oli (written confirmation 2026-04-13):
//   customer_price is ex-GST. IsTaxInclusive: false — MYOB adds GST on top.
//   Tax code 'GST' is the standard NZ MYOB default and correct for Continuous Group.

import { getMyobAccessToken } from './getMyobAccessToken';
import { prisma } from '@/lib/prisma';

export async function createMyobInvoice(params: {
  campaignId: string;
  quoteNumber: string;
  customerName: string;
  customerEmail: string;
  propertyAddress: string;
  amountExGst: number; // ex-GST confirmed by Oli — MYOB calculates GST on top
}) {
  const { campaignId, quoteNumber, customerName, customerEmail, propertyAddress, amountExGst } = params;

  const profile = await prisma.customerPaymentProfile.findFirst({
    where: { campaign_id: campaignId, is_active: true, verified: true },
  });
  if (!profile?.myob_company_file_id) throw new Error('MYOB not connected');

  const accessToken = await getMyobAccessToken(campaignId);
  const baseUrl = `https://api.myob.com/accountright/${profile.myob_company_file_id}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'x-myobapi-key': process.env.MYOB_CLIENT_ID!,
    'x-myobapi-version': 'v2',
    'Content-Type': 'application/json',
  };

  // Find or create customer contact
  const contactSearch = await fetch(
    `${baseUrl}/Contact/Customer?$filter=EmailAddress eq '${customerEmail}'`,
    { headers }
  );
  const contactData = await contactSearch.json();

  let myobCustomerUid: string;

  if (contactData.Items?.length > 0) {
    myobCustomerUid = contactData.Items[0].UID;
    console.log(`[MYOB] Using existing contact: ${myobCustomerUid}`);
  } else {
    const nameParts = customerName.trim().split(' ');
    const createContact = await fetch(`${baseUrl}/Contact/Customer`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        IsIndividual: true,
        FirstName: nameParts[0] ?? customerName,
        LastName: nameParts.slice(1).join(' ') || '',
        Addresses: [{ Street: propertyAddress }],
        EmailAddress: customerEmail,
      }),
    });
    if (!createContact.ok) throw new Error(`Failed to create MYOB contact: ${await createContact.text()}`);

    const location = createContact.headers.get('Location') ?? '';
    myobCustomerUid = location.split('/').pop() ?? '';
    if (!myobCustomerUid) throw new Error('MYOB contact created but UID not found in Location header');
    console.log(`[MYOB] Created contact: ${myobCustomerUid}`);
  }

  // Create sales invoice
  // IsTaxInclusive: false — customer_price is ex-GST, MYOB adds GST on top
  // TaxCode 'GST' confirmed correct for Continuous Group's NZ MYOB file
  const createInvoice = await fetch(`${baseUrl}/Sale/Invoice/Service`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Number: quoteNumber,
      Date: new Date().toISOString().split('T')[0],
      Customer: { UID: myobCustomerUid },
      IsTaxInclusive: false,
      Lines: [{
        Type: 'Transaction',
        Description: `Gutter clean — ${propertyAddress}`,
        Total: amountExGst,
        TaxCode: { Code: 'GST' },
      }],
      Comment: `Quote reference: ${quoteNumber}`,
      OnlinePaymentMethod: 'All',
    }),
  });

  if (!createInvoice.ok) throw new Error(`Failed to create MYOB invoice: ${await createInvoice.text()}`);

  const invoiceLocation = createInvoice.headers.get('Location') ?? '';
  const myobInvoiceId = invoiceLocation.split('/').pop() ?? '';
  if (!myobInvoiceId) throw new Error('MYOB invoice created but ID not found in Location header');

  // Fetch invoice to get hosted URL
  const getInvoice = await fetch(`${baseUrl}/Sale/Invoice/Service/${myobInvoiceId}`, { headers });
  const invoiceData = await getInvoice.json();

  // Log full response in development so Oli can verify field names
  if (process.env.NODE_ENV === 'development') {
    console.log('[MYOB] Invoice response keys:', Object.keys(invoiceData));
    console.log('[MYOB] OnlineInvoiceUrl:', invoiceData.OnlineInvoiceUrl);
  }

  // OnlineInvoiceUrl is the expected MYOB API v2 field name
  // If this is null after deployment, check Vercel logs for the response keys logged above
  const myobInvoiceUrl: string | null = invoiceData.OnlineInvoiceUrl ?? null;

  if (!myobInvoiceUrl) {
    console.warn(`[MYOB] OnlineInvoiceUrl missing for ${quoteNumber}. Available keys:`, Object.keys(invoiceData));
  }

  return { myobInvoiceId, myobInvoiceUrl };
}
