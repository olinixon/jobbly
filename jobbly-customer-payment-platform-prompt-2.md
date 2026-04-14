# Jobbly — Customer Payment Platform (Platform-Agnostic Homeowner Invoicing)
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are seven changes in this session. Complete all seven in the order listed. Do not mark the session complete until every item in the build checklist is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit.

---

## Scope — What This Session Builds and What It Does Not Touch

### What this session builds
A platform-agnostic customer payment system for the homeowner invoice flow — Continuous Group collecting payment from homeowners after a gutter clean. The client chooses which payment platform they use (MYOB or Stripe) in their Jobbly settings. Jobbly shows a step-by-step setup guide for whichever platform they choose, connects to it using their own credentials, and uses it to create and track all homeowner invoices going forward.

**Only one payment platform can be active at a time.** Connecting a new platform automatically replaces the previous one. The UI must warn the user before this happens and require explicit confirmation. The architecture must be extensible — adding a third platform in future should require no structural changes.

### What this session does NOT touch — confirm before every commit
- `BillingProfile` table and all associated endpoints (`/api/settings/stripe/verify`, `/api/settings/stripe/disconnect`) — powers existing B2B reconciliation batch invoicing (Admin to Client, Client to Subcontractor). Do not touch.
- The commission page, reconciliation batches, or Send Invoice button (CL13/14 functionality)
- Admin settings page
- Any `ADMIN` or `CLIENT` role BillingProfile records
- The `stripe_invoice_id`, `invoice_sent_at`, `invoice_sent_by` fields on `ReconciliationBatch`

### What this session gracefully retires
The hardcoded Stripe Checkout portal payment flow built in CL16 and patched in CL18-20. This code is made inert, not deleted. Existing leads with `stripe_checkout_url` set will continue to render their legacy payment state on the portal page without errors. No new leads will use the old Stripe Checkout path after this build.

---

## Pre-Flight Checks — Required Before Starting

**1. Read CLAUDE.md in full.**

**2. Read the following files completely before writing any code:**
- `prisma/schema.prisma` — understand `Lead`, `Campaign`, `BillingProfile`, `AuditLog`, and all existing fields. Read the AuditLog model fields carefully — the audit_log table is strictly for lead status changes only (fields: lead_id, campaign_id, changed_by_user_id, changed_by_name, old_status, new_status, created_at). There is no action or performed_by field. Do not write to audit_log for payment events. Note the exact field names for `stripe_checkout_url`, `customer_paid_at`, `stripe_payment_intent`, `customer_portal_token` on Lead.
- `POST /api/jobs/[quoteNumber]/complete` — the job completion endpoint. Currently creates a Stripe Checkout Session. You will modify this.
- `POST /api/portal/[token]/create-checkout` — currently creates Stripe Checkout on demand. You will retire this path for new jobs.
- `POST /api/webhooks/stripe` — currently marks `customer_paid_at` on `checkout.session.completed`. Read it completely — understand exactly how it verifies the Stripe webhook signature and which secret it uses. You will update this in Change 5.
- `/portal/[token]` page — the customer-facing portal. You will update the payment section.
- `/lib/encryption.ts` — the AES-256 encrypt/decrypt utility. Reuse this for all new credential storage.
- `/lib/stripeClient.ts` — check if this file exists from a previous changelog. If it does, use it when creating Stripe instances in new code rather than instantiating Stripe inline.
- The client settings page — you will add a new section here.

**3. Confirm the existing cron setup.** Check `vercel.json` and all existing cron endpoints. You will add MYOB payment polling to the daily cron or create one if none exists.

**4. Stripe npm package — already installed.** The `stripe` npm package was installed in Change Log 13. Do not run `npm install stripe` again. Confirm it exists in `package.json` before proceeding.

**5. Do not install any other packages without flagging to Oli first.** State the package name and reason. Wait for confirmation.

**6. Before starting Change 4, stop and confirm with Oli:**
- Is `customer_price` on the Lead model GST-inclusive or ex-GST?
- What is the GST tax code name in Continuous Group's MYOB file? (NZ MYOB default is `GST` — confirm before hardcoding)
Do not proceed with Change 4 until both are confirmed in writing.

---

## Background — Old Flow vs New Flow

### Old flow (being retired)
Job completes → Stripe Checkout Session created using CLIENT `BillingProfile` Stripe key → homeowner clicks Pay Invoice → Stripe Checkout → `checkout.session.completed` webhook → `customer_paid_at` set

### New flow
Client picks their payment platform once in Settings. Job completes → Jobbly creates a payment record using whichever platform is connected:

**If MYOB:** Creates a MYOB sales invoice → stores `myob_invoice_id` and `myob_invoice_url` → homeowner clicks "View and Pay Invoice" → MYOB hosted invoice page (card + bank transfer, configured by client in their MYOB) → daily cron polls MYOB → `customer_paid_at` set when invoice closes

**If Stripe:** Creates a Stripe Checkout Session using client's own Stripe credentials → stores `stripe_customer_payment_url` → homeowner clicks "Pay Invoice" → Stripe Checkout → webhook → `customer_paid_at` set

Old jobs with `stripe_checkout_url` — legacy Stripe button still renders. No breakage.

---

## Database Schema Changes

### New model — `CustomerPaymentProfile`

Entirely separate from the existing `BillingProfile` model. Do not modify `BillingProfile`.

```prisma
model CustomerPaymentProfile {
  id          String    @id @default(cuid())
  campaign_id String    @unique
  provider    String    // 'STRIPE' | 'MYOB' — string not enum for extensibility

  // Stripe fields (populated when provider = 'STRIPE', nulled when switching away)
  stripe_secret_key       String?   // AES-256 encrypted
  stripe_webhook_secret   String?   // AES-256 encrypted

  // MYOB fields (populated when provider = 'MYOB', nulled when switching away)
  myob_company_file_id    String?
  myob_access_token       String?   // AES-256 encrypted
  myob_refresh_token      String?   // AES-256 encrypted
  myob_token_expiry       DateTime?

  // Common
  verified      Boolean   @default(false)
  verified_at   DateTime?
  connected_at  DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  campaign      Campaign  @relation(fields: [campaign_id], references: [id])
}
```

**Soft delete on disconnect:** Disconnecting does NOT delete this row. It sets `verified = false` and nulls the provider-specific tokens. The row is retained so reconnection is easier and history is preserved.

### New fields on `Lead`

```prisma
myob_invoice_id             String?
myob_invoice_url            String?
myob_invoice_created_at     DateTime?
stripe_customer_payment_url String?   // new path, distinct from legacy stripe_checkout_url
```

Do not remove or rename `stripe_checkout_url`, `stripe_payment_intent`, or `customer_paid_at`. Used by legacy records and existing webhook.

### Reverse relation on Campaign

```prisma
model Campaign {
  // ... existing fields
  customer_payment_profile CustomerPaymentProfile?
}
```

### Migration — mandatory pre-flight, run before any code

```bash
DATABASE_URL="[production DATABASE_URL]" npx prisma db push
```

Confirm it completes without errors before writing any application code.

---

## Environment Variables

Add to `.env.example` (names only):

```
# MYOB Developer App credentials — registered at developer.myob.com by Oli
# These are Jobbly's app credentials, NOT the client's credentials
MYOB_CLIENT_ID=
MYOB_CLIENT_SECRET=
MYOB_REDIRECT_URI=
# Must be: https://jobbly.nz/api/myob/callback
```

`ENCRYPTION_KEY` and `CRON_SECRET` must already exist — confirm before starting.

**Manual step required before MYOB works end-to-end (Oli does this, not Claude Code):**
Register Jobbly at developer.myob.com. Set redirect URI to `https://jobbly.nz/api/myob/callback`. Add Client ID and Client Secret to Vercel env vars.

**MYOB sandbox for testing:** MYOB provides a developer sandbox. Use it during development to avoid creating real invoices in Continuous Group's live MYOB file. Ask Oli to confirm whether a sandbox company file is available before testing Change 4.

---

## Change 1 — Database Migration and MYOB Token Utility

This is a **MINOR bump**.

### Step 1 — Run migration
Run `prisma db push` against production. Confirm all new fields and `CustomerPaymentProfile` exist before writing any code.

### Step 2 — Build `/lib/myob/getMyobAccessToken.ts`

```typescript
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
```

### Build order for Change 1

1. Run DB migration — confirm `CustomerPaymentProfile` and new Lead fields exist in production
2. Add MYOB env var names to `.env.example`
3. Create `/lib/myob/getMyobAccessToken.ts`
4. Run `npx tsc --noEmit` — confirm no TypeScript errors
5. Apply MINOR version bump in `package.json`
6. Commit: `v[version] — CustomerPaymentProfile schema, Lead payment fields, MYOB token utility`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 2 — Payment Platform Connection APIs

**Only one platform can be active at a time.** Connecting a new platform clears the previous one at the data level. The UI handles the warning (Change 3). Seven endpoints in total.

This is a **MINOR bump**.

### Step 1 — GET /api/customer-payment/myob/connect

```typescript
// Auth: CLIENT role required
// Read campaignId from session

const authUrl = new URL('https://secure.myob.com/oauth2/v1/authorize');
authUrl.searchParams.set('client_id', process.env.MYOB_CLIENT_ID!);
authUrl.searchParams.set('redirect_uri', process.env.MYOB_REDIRECT_URI!);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'CompanyFile');
authUrl.searchParams.set('state', campaignId); // pass campaignId through OAuth state

return NextResponse.redirect(authUrl.toString());
```

### Step 2 — GET /api/myob/callback

Add `/api/myob/callback` to the public routes allowlist in middleware.

```typescript
// No session on this route — MYOB redirects here
// Read: ?code=... and ?state=... from query string
// state = campaignId — validate this campaign exists before proceeding

// Exchange auth code for tokens:
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
});
// Extract: access_token, refresh_token, expires_in

// Fetch MYOB company file list:
const filesResponse = await fetch('https://api.myob.com/accountright/', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'x-myobapi-key': process.env.MYOB_CLIENT_ID!,
    'x-myobapi-version': 'v2',
  },
});
const files = await filesResponse.json();

// Log available files so Oli can verify the correct one is selected
console.log('[MYOB] Company files available:', JSON.stringify(
  (files ?? []).map((f: any) => ({ Id: f.Id, Name: f.Name }))
));

const companyFile = files?.[0];
if (!companyFile?.Id) {
  console.error('[MYOB] No company files found in account');
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/client/settings?payment=error`);
}
console.log(`[MYOB] Using company file: ${companyFile.Name} (${companyFile.Id})`);

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
});

return NextResponse.redirect(
  `${process.env.NEXT_PUBLIC_APP_URL}/client/settings?payment=connected&provider=myob`
);
```

### Step 3 — POST /api/customer-payment/myob/disconnect

Soft delete — do NOT delete the row.

```typescript
// Auth: CLIENT role required
await prisma.customerPaymentProfile.updateMany({
  where: { campaign_id: campaignId, provider: 'MYOB' },
  data: {
    verified: false,
    myob_access_token: null,
    myob_refresh_token: null,
    myob_token_expiry: null,
    myob_company_file_id: null,
    updated_at: new Date(),
  },
});
// No profile exists: return 200 silently
return NextResponse.json({ disconnected: true });
```

### Step 4 — POST /api/customer-payment/myob/test-connection

```typescript
// Auth: CLIENT role required

const profile = await prisma.customerPaymentProfile.findUnique({
  where: { campaign_id: campaignId },
});

if (!profile || profile.provider !== 'MYOB' || !profile.verified) {
  return NextResponse.json({ status: 'not_connected' }, { status: 400 });
}

try {
  const accessToken = await getMyobAccessToken(campaignId);
  const response = await fetch(
    `https://api.myob.com/accountright/${profile.myob_company_file_id}/Company`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-myobapi-key': process.env.MYOB_CLIENT_ID!,
        'x-myobapi-version': 'v2',
      },
    }
  );

  if (response.ok) {
    const data = await response.json();
    return NextResponse.json({ status: 'connected', company_name: data.CompanyName ?? 'Connected' });
  } else {
    return NextResponse.json({ status: 'api_error', http_status: response.status });
  }
} catch (error) {
  return NextResponse.json({ status: 'error', message: String(error) });
}
```

### Step 5 — POST /api/customer-payment/stripe/verify

Entirely separate from the existing B2B BillingProfile Stripe connection. Do not modify BillingProfile.

```typescript
// Auth: CLIENT role required
// Body: { stripe_secret_key: string }

// Check if /lib/stripeClient.ts exists — use it if it does
// If not: const stripe = new Stripe(stripe_secret_key, { apiVersion: '2024-06-20' });

try {
  await stripe.balance.retrieve();
} catch {
  return NextResponse.json(
    { error: 'Invalid Stripe secret key. Check your key and try again.' },
    { status: 400 }
  );
}

// Upsert CustomerPaymentProfile
// Switching to Stripe clears all MYOB fields — only one platform active at a time
await prisma.customerPaymentProfile.upsert({
  where: { campaign_id: campaignId },
  create: {
    campaign_id: campaignId,
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
});

return NextResponse.json({ verified: true });
```

### Step 6 — POST /api/customer-payment/stripe/save-webhook

```typescript
// Auth: CLIENT role required
// Body: { webhook_secret: string }
// Validate: must start with 'whsec_' — return 400 if not

await prisma.customerPaymentProfile.update({
  where: { campaign_id: campaignId },
  data: { stripe_webhook_secret: encrypt(webhook_secret), updated_at: new Date() },
});
return NextResponse.json({ saved: true });
```

### Step 7 — POST /api/customer-payment/stripe/disconnect

Soft delete — do NOT delete the row.

```typescript
// Auth: CLIENT role required
await prisma.customerPaymentProfile.updateMany({
  where: { campaign_id: campaignId, provider: 'STRIPE' },
  data: {
    verified: false,
    stripe_secret_key: null,
    stripe_webhook_secret: null,
    updated_at: new Date(),
  },
});
return NextResponse.json({ disconnected: true });
```

### Build order for Change 2

1. Add `/api/myob/callback` to public routes allowlist in middleware
2. Create all seven endpoints in the order listed
3. Run `npx tsc --noEmit` — confirm no TypeScript errors
4. Apply MINOR version bump in `package.json`
5. Commit: `v[version] — MYOB and Stripe customer payment APIs, test connection, soft disconnect`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Change 3 — Payment Platform Settings UI (Client)

Only one platform can be active at a time. Switching platforms shows a confirmation warning before proceeding. After MYOB is connected, a Test Connection button verifies the integration is live.

This is a **MINOR bump**.

### Step 1 — Fetch CustomerPaymentProfile server-side

Fetch `CustomerPaymentProfile` for the current campaign server-side. Pass `provider`, `verified`, `verified_at`, last 8 chars of `myob_company_file_id`, and whether `stripe_webhook_secret` is set. Never pass encrypted tokens to the frontend.

### Step 2 — Build `/components/settings/CustomerPaymentPlatform.tsx`

**State A — No active platform (verified = false or no profile):**

```
Customer Payment Platform
─────────────────────────────────────────────────────────────

This controls how Jobbly collects payment from homeowners
after each completed gutter clean.
Only one platform can be active at a time.

Which platform does your business use?

  ◉  MYOB Business
  ○  Stripe

                              [▼ How to set this up]
```

When MYOB selected, guide expands:

```
Step 1  Log in to MYOB Business at myob.com

Step 2  Enable Online Invoice Payments
        Settings → Sales Settings → Payments tab
        Click "Set up online invoice payments" and follow the prompts
        This adds a Pay Now button to invoices for card payments (2.7% + $0.25 fee)

Step 3  Enable surcharging (recommended)
        Same Payments tab → select "Your customers pay the surcharge"
        The card fee is added to the invoice total — bank transfer stays free

Step 4  Add your bank account for direct deposit
        Same Payments tab → "Allow payments by direct deposit"
        Enter your bank account name and number
        This appears on every invoice so customers can bank transfer for free

Step 5  Come back here and click Connect MYOB
        You will approve access in MYOB — takes about 30 seconds

[  Connect MYOB  ]  ← GET /api/customer-payment/myob/connect
```

When Stripe selected, guide expands:

```
Step 1  Log in to Stripe at stripe.com
        Ensure your account is in New Zealand and set to NZD

Step 2  Get your Secret Key
        Stripe Dashboard → Developers → API keys
        Copy your Secret key (starts with sk_live_...)
        Use your live key, not the test key

Step 3  Set up your Webhook
        Stripe Dashboard → Developers → Webhooks → Add endpoint
        Endpoint URL: [NEXT_PUBLIC_APP_URL]/api/webhooks/stripe
        (URL shown dynamically — never hardcoded in this guide)
        Select event: checkout.session.completed
        Copy the Signing Secret (starts with whsec_...)

Step 4  Paste your credentials below

Secret Key (sk_live_...)
[________________________________]

[  Verify & Connect  ]  ← POST /api/customer-payment/stripe/verify

─── After connecting, add your Webhook Signing Secret: ───

Webhook Signing Secret (whsec_...)
[________________________________]

[  Save Webhook Secret  ]  ← POST /api/customer-payment/stripe/save-webhook
```

**State B — MYOB connected (provider = 'MYOB' and verified = true):**

```
Customer Payment Platform
─────────────────────────────────────────────────────────────

✅  MYOB Business — Connected
    Company file: ...XXXXXXXX  [last 8 chars of myob_company_file_id]
    Connected: [verified_at formatted date]

    Jobbly will automatically create a MYOB invoice for each completed
    job. Homeowners can pay by card (2.7% surcharge) or bank transfer (free).
    Payment status is checked and updated daily.

[  Test Connection  ]     [  Disconnect MYOB  ]

Test Connection:
  Loading: "Testing..."
  ✅ Connected — [company_name from MYOB API]
  ❌ Connection failed — [reason]. Try reconnecting.

Disconnect MYOB:
  Confirmation dialog: "Disconnecting MYOB will remove the payment
  link from all future customer invoices until a new platform is
  connected. Are you sure?"
  Confirm → POST /api/customer-payment/myob/disconnect
  On success → return to State A

─────────────────────────────────────────────────────────────

Want to switch to Stripe instead?

[  Switch to Stripe  ]  ← secondary outline button

When clicked → confirmation dialog:
"This will disconnect your MYOB connection and replace it with Stripe.
Future customer invoices will use Stripe instead. Continue?"

On confirm → show Stripe credential entry form (same as State A Stripe section)
On cancel → dismiss, stay in State B
```

**State C — Stripe connected (provider = 'STRIPE' and verified = true):**

```
Customer Payment Platform
─────────────────────────────────────────────────────────────

✅  Stripe — Connected
    Connected: [verified_at formatted date]

Webhook:
  ✅ Configured       ← if stripe_webhook_secret is set
  ⚠️ Not configured  ← if stripe_webhook_secret is null
                       (show inline whsec_ entry field here when not configured)

[  Disconnect Stripe  ]  ← confirmation dialog before calling disconnect

─────────────────────────────────────────────────────────────

Want to switch to MYOB instead?

[  Switch to MYOB  ]  ← secondary outline button

When clicked → confirmation dialog:
"This will disconnect your Stripe connection and replace it with MYOB.
Future customer invoices will use MYOB instead. Continue?"

On confirm → redirect to GET /api/customer-payment/myob/connect
On cancel → dismiss, stay in State C
```

**URL param banners (shown at top of settings page):**
- `?payment=connected&provider=myob` → green: "MYOB connected successfully."
- `?payment=connected&provider=stripe` → green: "Stripe connected successfully."
- `?payment=error` → red: "Connection failed. Please try again or contact Oli."
Remove query params from URL after displaying.

### Build order for Change 3

1. Read client settings page structure in full
2. Add `CustomerPaymentProfile` server-side fetch
3. Build `CustomerPaymentPlatform` component — all three states
4. Wire all buttons and endpoints
5. Build confirmation dialogs for disconnect and platform switch
6. Handle URL param banners
7. Run `npx tsc --noEmit` — confirm no TypeScript errors
8. Apply MINOR version bump in `package.json`
9. Commit: `v[version] — customer payment platform selector UI with switch warnings and test connection`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

---

## Change 4 — Job Completion: Create Payment Record on Connected Platform

**Stop before writing any code in this change. Confirm with Oli:**
- Is `customer_price` GST-inclusive or ex-GST?
- What is the GST tax code name in Continuous Group's MYOB?
Do not proceed until both are confirmed.

Payment platform failure must never block job completion. All errors are caught, appended to lead notes, and reported to Oli via alert email.

This is a **MINOR bump**.

### Step 1 — Build `/lib/myob/createMyobInvoice.ts`

```typescript
import { getMyobAccessToken } from './getMyobAccessToken';
import { prisma } from '@/lib/prisma';

export async function createMyobInvoice(params: {
  campaignId: string;
  quoteNumber: string;
  customerName: string;
  customerEmail: string;
  propertyAddress: string;
  amountInclGst: number; // confirm GST treatment with Oli before building
}) {
  const { campaignId, quoteNumber, customerName, customerEmail, propertyAddress, amountInclGst } = params;

  const profile = await prisma.customerPaymentProfile.findUnique({
    where: { campaign_id: campaignId },
  });
  if (!profile?.myob_company_file_id || !profile.verified) throw new Error('MYOB not connected');

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
  // IsTaxInclusive and TaxCode Code confirmed with Oli before build
  const createInvoice = await fetch(`${baseUrl}/Sale/Invoice/Service`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Number: quoteNumber,
      Date: new Date().toISOString().split('T')[0],
      Customer: { UID: myobCustomerUid },
      IsTaxInclusive: true,             // confirm with Oli
      Lines: [{
        Type: 'Transaction',
        Description: `Gutter clean — ${propertyAddress}`,
        Total: amountInclGst,
        TaxCode: { Code: 'GST' },       // confirm tax code name with Oli
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
  const myobInvoiceUrl = invoiceData.OnlineInvoiceUrl ?? null;

  if (!myobInvoiceUrl) {
    console.warn(`[MYOB] OnlineInvoiceUrl missing for ${quoteNumber}. Available keys:`, Object.keys(invoiceData));
  }

  return { myobInvoiceId, myobInvoiceUrl };
}
```

### Step 2 — Build `/lib/stripe/createCustomerPaymentCheckout.ts`

Check if `/lib/stripeClient.ts` exists. Use it if it does. If not, instantiate Stripe directly.

```typescript
import Stripe from 'stripe';
import { decrypt } from '@/lib/encryption';
import { prisma } from '@/lib/prisma';

export async function createCustomerPaymentCheckout(params: {
  campaignId: string;
  quoteNumber: string;
  propertyAddress: string;
  customerEmail: string;
  amountInclGst: number;
  portalToken: string;
}) {
  const { campaignId, quoteNumber, propertyAddress, customerEmail, amountInclGst, portalToken } = params;

  const profile = await prisma.customerPaymentProfile.findUnique({
    where: { campaign_id: campaignId },
  });
  if (!profile?.stripe_secret_key || !profile.verified) throw new Error('Stripe not connected');

  const secretKey = decrypt(profile.stripe_secret_key);
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

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
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/${portalToken}?paid=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/${portalToken}`,
    expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  });

  return { checkoutUrl: session.url };
}
```

### Step 3 — Update POST /api/jobs/[quoteNumber]/complete

Find the section that creates a Stripe Checkout Session. Replace with:

```typescript
// After generating customer_portal_token, BEFORE sending customer email:

const paymentProfile = await prisma.customerPaymentProfile.findUnique({
  where: { campaign_id: lead.campaign_id },
});

let myobInvoiceId: string | null = null;
let myobInvoiceUrl: string | null = null;
let stripeCustomerPaymentUrl: string | null = null;

if (paymentProfile?.verified) {
  try {
    if (paymentProfile.provider === 'MYOB') {
      const result = await createMyobInvoice({
        campaignId: lead.campaign_id,
        quoteNumber: lead.quote_number,
        customerName: lead.customer_name,
        customerEmail: lead.customer_email ?? '',
        propertyAddress: lead.property_address,
        amountInclGst: lead.customer_price,
      });
      myobInvoiceId = result.myobInvoiceId;
      myobInvoiceUrl = result.myobInvoiceUrl;

    } else if (paymentProfile.provider === 'STRIPE') {
      const result = await createCustomerPaymentCheckout({
        campaignId: lead.campaign_id,
        quoteNumber: lead.quote_number,
        propertyAddress: lead.property_address,
        customerEmail: lead.customer_email ?? '',
        amountInclGst: lead.customer_price,
        portalToken: customerPortalToken,
      });
      stripeCustomerPaymentUrl = result.checkoutUrl;
    }

  } catch (error) {
    // Log but do not throw — job completion must succeed regardless
    console.error(`[Payment] Failed for ${lead.quote_number}:`, error);

    // Append error to lead notes
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        notes: `${lead.notes ?? ''}\n[Payment Creation Error — ${new Date().toISOString()}] ${String(error)}`.trim(),
      },
    });

    // Alert Oli — homeowner will have no payment link
    // Use the existing Resend email helper already in the codebase
    try {
      await sendAlertEmail({
        to: process.env.EMAIL_OLI!,
        subject: `Payment link failed — ${lead.quote_number} — ${lead.customer_name}`,
        body: [
          'Hi Oli,',
          '',
          'A payment link could not be created for a completed job.',
          'The homeowner email was sent but the Pay Invoice button will not work.',
          '',
          `Quote:    ${lead.quote_number}`,
          `Customer: ${lead.customer_name}`,
          `Address:  ${lead.property_address}`,
          `Platform: ${paymentProfile.provider}`,
          `Error:    ${String(error)}`,
          '',
          `Portal link (share manually if needed):`,
          `${process.env.NEXT_PUBLIC_APP_URL}/portal/${customerPortalToken}`,
          '',
          'Please create the invoice manually and send the payment link to the customer.',
          '',
          'Jobbly by Omniside AI',
        ].join('\n'),
      });
    } catch (emailError) {
      console.error('[Payment] Failed to send Oli alert email:', emailError);
    }
  }
} else {
  console.warn(`[Payment] No verified payment platform for campaign ${lead.campaign_id}`);
}

// Save payment fields to lead
// Do NOT write to stripe_checkout_url — legacy field only
await prisma.lead.update({
  where: { id: lead.id },
  data: {
    myob_invoice_id: myobInvoiceId,
    myob_invoice_url: myobInvoiceUrl,
    myob_invoice_created_at: myobInvoiceId ? new Date() : null,
    stripe_customer_payment_url: stripeCustomerPaymentUrl,
  },
});

// Continue with customer email send as normal
```

**Note:** Use the existing Resend email helper (`sendAlertEmail` or equivalent) already in the codebase. Do not create a new email utility.

### Build order for Change 4

1. Stop — confirm GST treatment and MYOB tax code with Oli before writing any code
2. Create `/lib/myob/createMyobInvoice.ts`
3. Create `/lib/stripe/createCustomerPaymentCheckout.ts`
4. Update job completion endpoint
5. Run `npx tsc --noEmit` — confirm no TypeScript errors
6. Apply MINOR version bump in `package.json`
7. Commit: `v[version] — provider-agnostic payment creation on job completion, Oli alert on failure`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 5 — Portal Page and Stripe Webhook

Stripe Checkout Session expiry handled for the new path. Stripe webhook updated for dual-account signature verification.

This is a **MINOR bump**.

### Step 1 — Update the portal page payment section

Five states in strict priority order:

**Priority 1 — customer_paid_at is set:**
```
✅  Payment received — thank you!
    We'll be in touch to confirm.
```
Detected server-side. No URL params needed.

**Priority 2 — myob_invoice_url set:**
```
💳  Pay Your Invoice

[  View & Pay Invoice  ]
Opens your secure MYOB invoice in a new tab.

Pay by card (2.7% surcharge) or bank transfer (free).
Bank transfer details are shown on the invoice.
```

**Priority 3 — stripe_customer_payment_url set (new path):**
```
💳  Pay Your Invoice

[  Pay Invoice  ]
Secure payment via Stripe
```
With session expiry handling — see Step 2.

**Priority 4 — stripe_checkout_url set, no new fields (legacy):**
Existing behaviour completely unchanged including existing expiry handling from CL18.

**Priority 5 — Nothing:**
```
[  Payment link not yet available  ]  ← disabled

Payment is being set up. Contact auckland@continuous.co.nz
or reply to your original email to arrange payment.
```
Existing text unchanged.

### Step 2 — Session expiry for new Stripe path

Add to `POST /api/portal/[token]/create-checkout`:

```typescript
// Return new payment fields without creating a Stripe session
if (lead.myob_invoice_url) {
  return NextResponse.json({ myobInvoiceUrl: lead.myob_invoice_url });
}

if (lead.stripe_customer_payment_url) {
  // Check age — Stripe sessions expire after 24 hours
  const referenceDate = lead.myob_invoice_created_at ?? lead.job_completed_at;
  const isLikelyExpired = referenceDate &&
    (Date.now() - new Date(referenceDate).getTime()) > 23 * 60 * 60 * 1000;

  if (isLikelyExpired) {
    const paymentProfile = await prisma.customerPaymentProfile.findUnique({
      where: { campaign_id: lead.campaign_id },
    });
    if (paymentProfile?.stripe_secret_key && paymentProfile.verified) {
      try {
        const result = await createCustomerPaymentCheckout({
          campaignId: lead.campaign_id,
          quoteNumber: lead.quote_number,
          propertyAddress: lead.property_address,
          customerEmail: lead.customer_email ?? '',
          amountInclGst: lead.customer_price,
          portalToken: token,
        });
        await prisma.lead.update({
          where: { customer_portal_token: token },
          data: { stripe_customer_payment_url: result.checkoutUrl },
        });
        return NextResponse.json({ checkoutUrl: result.checkoutUrl });
      } catch (error) {
        console.error('[Portal] Stripe session refresh failed:', error);
      }
    }
  }
  return NextResponse.json({ checkoutUrl: lead.stripe_customer_payment_url });
}

// Fall through to existing legacy Stripe Checkout logic — unchanged below this point
```

### Step 3 — Update POST /api/webhooks/stripe for dual-account verification

Read the existing Stripe webhook handler completely before modifying. Understand exactly how it currently verifies the signature and which secret it uses.

The current handler uses `BillingProfile.stripe_webhook_secret`. The new `CustomerPaymentProfile.stripe_webhook_secret` may be a different Stripe account. Both must be tried.

```typescript
// Add before existing signature verification:

const rawBody = await request.text();
const sig = request.headers.get('stripe-signature');

let event: Stripe.Event | null = null;

// Attempt 1: Try CustomerPaymentProfile Stripe webhook secrets (new path)
const customerProfiles = await prisma.customerPaymentProfile.findMany({
  where: { provider: 'STRIPE', verified: true, stripe_webhook_secret: { not: null } },
  select: { stripe_webhook_secret: true },
});

for (const profile of customerProfiles) {
  try {
    const secret = decrypt(profile.stripe_webhook_secret!);
    // Use your existing Stripe instance or create one for verification only
    event = Stripe.webhooks.constructEvent(rawBody, sig!, secret);
    break; // verified
  } catch {
    // Try next secret
  }
}

// Attempt 2: Try BillingProfile webhook secret (legacy path) if not yet verified
if (!event) {
  // Keep existing BillingProfile verification logic here exactly as it is
  // If it succeeds: event is set
}

if (!event) {
  return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
}

// All business logic after this point — lead lookup by client_reference_id,
// setting customer_paid_at — is unchanged. The payload structure is identical
// for both old and new Stripe payment paths.
```

### Build order for Change 5

1. Read portal page payment section in full
2. Update payment section with all five states and correct priority order
3. Update `create-checkout` with new field guards and expiry logic for new Stripe path
4. Read Stripe webhook handler completely — understand current verification
5. Update webhook to try CustomerPaymentProfile secrets before BillingProfile secret
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply MINOR version bump in `package.json`
8. Commit: `v[version] — portal multi-platform states, Stripe expiry, dual-account webhook`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 6 — MYOB Payment Polling Cron Job

MYOB does not fire webhooks for invoice payments. Jobbly polls daily. Payment events are appended to lead notes — NOT written to the audit_log (which is strictly for lead status changes).

This is a **MINOR bump**.

### Step 1 — Build `/lib/myob/checkMyobInvoiceStatus.ts`

```typescript
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
```

### Step 2 — Add to daily cron

Check if a daily cron already exists. Add to it if so. Create `/app/api/cron/daily/route.ts` if not.

```typescript
// Protect with CRON_SECRET — confirm already in place
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// ─── MYOB payment polling ────────────────────────────────────────

const myobUnpaidLeads = await prisma.lead.findMany({
  where: {
    myob_invoice_id: { not: null },
    customer_paid_at: null,
    job_completed_at: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
  },
  select: { id: true, quote_number: true, myob_invoice_id: true, campaign_id: true, notes: true },
});

console.log(`[MYOB Cron] Checking ${myobUnpaidLeads.length} unpaid invoices`);

for (const lead of myobUnpaidLeads) {
  try {
    const { isPaid } = await checkMyobInvoiceStatus(lead.campaign_id, lead.myob_invoice_id!);

    if (isPaid) {
      const paidAt = new Date();
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          customer_paid_at: paidAt,
          // Append to notes — do NOT write to audit_log (status-changes only)
          notes: `${lead.notes ?? ''}\n[Payment confirmed via MYOB — ${paidAt.toISOString()}]`.trim(),
        },
      });
      console.log(`[MYOB Cron] Confirmed paid: ${lead.quote_number}`);
    }
  } catch (error) {
    // Log but do not throw — one failure must not block others
    console.error(`[MYOB Cron] Failed: ${lead.quote_number}`, error);
  }
}
```

Add to `vercel.json` if a daily cron does not already exist. Do not duplicate:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 20 * * *"
    }
  ]
}
```

`0 20 * * *` = 8:00 AM NZST. Confirm with Oli if NZDT offset adjustment is needed.

### Step 3 — Update admin lead detail payment status

| Condition | Label |
|---|---|
| `customer_paid_at` set + `myob_invoice_id` set | ✅ Paid via MYOB — [date] |
| `customer_paid_at` set + `stripe_payment_intent` or `stripe_customer_payment_url` set | ✅ Paid via Stripe — [date] |
| `customer_paid_at` set (no other info) | ✅ Paid — [date] |
| `myob_invoice_id` set, not paid | ⏳ Awaiting payment — MYOB invoice sent |
| `stripe_customer_payment_url` set, not paid | ⏳ Awaiting payment — Stripe link active |
| `stripe_checkout_url` set, not paid | ⏳ Awaiting payment — Stripe link active (legacy) |
| Nothing set | ⚠️ No payment method configured |

### Build order for Change 6

1. Check existing cron setup
2. Create `/lib/myob/checkMyobInvoiceStatus.ts`
3. Add MYOB polling to existing cron or create `/api/cron/daily/route.ts`
4. Add cron to `vercel.json` if not already present — do not duplicate
5. Update admin lead detail payment status
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply MINOR version bump in `package.json`
8. Commit: `v[version] — MYOB payment polling cron, lead notes confirmation, admin status`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 7 — Admin Lead Detail Payment Diagnostic

Oli needs visibility into the payment platform status and invoice creation result for any given lead.

This is a **PATCH bump**.

### Step 1 — Add payment diagnostic to admin lead detail

In the Customer Portal section of the admin lead detail page, add a diagnostic row below the Copy Link and Resend Email buttons:

```
Payment Platform

MYOB — invoice created ✅
Invoice ID: ...XXXXXXXX  [last 8 chars]
[View Invoice]  ← links to myob_invoice_url, new tab

or:

Stripe — payment link active ✅

or:

Stripe — payment link missing ⚠️
Check lead notes for error details. Invoice may need to be created manually.

or:

No payment platform configured ⚠️
Continuous Group has not connected a payment platform in Settings.
```

Admin-only. Not visible on client or subcontractor views.

### Build order for Change 7

1. Read admin lead detail page in full
2. Add payment diagnostic section to Customer Portal area
3. Run `npx tsc --noEmit` — confirm no TypeScript errors
4. Apply PATCH version bump in `package.json`
5. Commit: `v[version] — admin lead detail payment platform diagnostic`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Full Build Checklist

**Pre-flight**
- [ ] CLAUDE.md read in full
- [ ] All listed files read — including Stripe webhook handler and AuditLog schema
- [ ] AuditLog confirmed: status changes only, no action or performed_by fields — payment events go to lead.notes not audit_log
- [ ] Existing cron setup checked
- [ ] `stripe` npm package confirmed already installed — not reinstalled
- [ ] `/lib/stripeClient.ts` checked — used if exists, instantiated inline if not
- [ ] `ENCRYPTION_KEY` and `CRON_SECRET` confirmed present in Vercel env
- [ ] GST treatment and MYOB tax code confirmed with Oli before Change 4

**Change 1**
- [ ] DB migration run — `CustomerPaymentProfile` and new Lead fields live in production
- [ ] MYOB env var names in `.env.example`
- [ ] `getMyobAccessToken` handles valid token, expired token, and refresh failure
- [ ] On refresh failure: `verified` set to false — settings UI will prompt reconnection
- [ ] `BillingProfile` and B2B flows untouched
- [ ] No TypeScript errors

**Change 2**
- [ ] `/api/myob/callback` on public allowlist in middleware
- [ ] `GET /api/customer-payment/myob/connect` redirects with OAuth params + state
- [ ] `GET /api/myob/callback` exchanges code, logs company files, selects first, upserts `provider = 'MYOB'`
- [ ] `GET /api/myob/callback` clears Stripe fields on upsert
- [ ] `GET /api/myob/callback` handles empty file list — redirects to error
- [ ] `POST /api/customer-payment/myob/test-connection` calls Company endpoint, returns status + company name
- [ ] `POST /api/customer-payment/myob/disconnect` soft delete — `verified = false`, MYOB fields nulled, row kept
- [ ] `POST /api/customer-payment/stripe/verify` validates via balance retrieval, upserts `provider = 'STRIPE'`, clears MYOB fields
- [ ] `POST /api/customer-payment/stripe/save-webhook` saves encrypted webhook secret
- [ ] `POST /api/customer-payment/stripe/disconnect` soft delete — `verified = false`, Stripe fields nulled, row kept
- [ ] All credentials encrypted — never returned to frontend
- [ ] Existing `/api/settings/stripe/verify` and `/api/settings/stripe/disconnect` untouched
- [ ] No TypeScript errors

**Change 3**
- [ ] Platform selector renders MYOB and Stripe radio options
- [ ] MYOB guide: 5 steps correct
- [ ] Stripe guide: 4 steps correct, webhook URL dynamic not hardcoded
- [ ] Connected MYOB state: masked file ID, connected date, Test Connection, Disconnect
- [ ] Test Connection calls test-connection endpoint, shows company name or error
- [ ] Connected Stripe state: connected date, webhook status, Disconnect
- [ ] Missing webhook secret shows inline entry field in State C
- [ ] Disconnect dialogs explain consequences before proceeding
- [ ] "Switch to MYOB" warns Stripe will be disconnected, requires confirmation
- [ ] "Switch to Stripe" warns MYOB will be disconnected, requires confirmation
- [ ] URL param banners show correctly
- [ ] `CustomerPaymentProfile` fetched server-side — no tokens to frontend
- [ ] No TypeScript errors

**Change 4**
- [ ] GST and tax code confirmed with Oli — documented in code comment
- [ ] `createMyobInvoice` finds or creates contact, creates invoice
- [ ] Contact UID extracted from Location header — throws if empty
- [ ] Invoice ID extracted from Location header — throws if empty
- [ ] Full invoice response logged in development for field name verification
- [ ] Warning logged if `OnlineInvoiceUrl` is null
- [ ] `createCustomerPaymentCheckout` creates Stripe session with `client_reference_id = portalToken`
- [ ] Job completion routes to correct provider
- [ ] Payment failure: job completes, error in lead.notes, Oli alert email sent
- [ ] No payment platform: job completes, warning logged
- [ ] `myob_invoice_id`, `myob_invoice_url`, `myob_invoice_created_at` saved
- [ ] `stripe_customer_payment_url` saved
- [ ] `stripe_checkout_url` NOT written to for new jobs
- [ ] Oli alert email uses existing Resend helper — no new email utility
- [ ] No TypeScript errors

**Change 5**
- [ ] Portal priority order: paid → MYOB → new Stripe → legacy Stripe → nothing
- [ ] State 1 (paid): server-side detection via `customer_paid_at`
- [ ] State 2 (MYOB): View and Pay Invoice → `myob_invoice_url`, new tab, card/bank text
- [ ] State 3 (new Stripe): Pay Invoice with age-based expiry check and regeneration
- [ ] State 4 (legacy): completely unchanged including existing expiry handling
- [ ] State 5 (nothing): unchanged
- [ ] `create-checkout` guards MYOB and new Stripe before old Stripe logic
- [ ] Stripe webhook read completely before modification
- [ ] Webhook tries CustomerPaymentProfile secrets then BillingProfile secret
- [ ] Webhook business logic unchanged — lead lookup by `client_reference_id`
- [ ] No TypeScript errors

**Change 6**
- [ ] `checkMyobInvoiceStatus` polls MYOB correctly
- [ ] Cron finds unpaid MYOB invoices within 90 days
- [ ] On payment: `customer_paid_at` set + note appended to `lead.notes`
- [ ] Audit_log NOT written to for payment events
- [ ] Individual failures logged, do not block others
- [ ] Cron protected by `CRON_SECRET`
- [ ] Cron in `vercel.json` — not duplicated
- [ ] Admin lead detail shows all seven payment states
- [ ] No TypeScript errors

**Change 7**
- [ ] Admin lead detail payment diagnostic shows platform, invoice creation status, and link
- [ ] Missing payment link state references lead notes for error detail
- [ ] Admin-only — not on client or subcontractor views
- [ ] No TypeScript errors

**Final**
- [ ] Seven changes — seven commits, seven pushes, seven Vibstr reports
- [ ] Changes 1–6: MINOR bumps. Change 7: PATCH bump
- [ ] All commits use correct message format per CLAUDE.md
- [ ] `npx tsc --noEmit` passes with zero errors after every change
- [ ] `BillingProfile`, B2B invoicing, CL13/14 functionality confirmed untouched throughout

---

## What Oli Needs to Do Manually Before This Runs End-to-End

1. Register Jobbly at developer.myob.com
   - Redirect URI: `https://jobbly.nz/api/myob/callback`
   - Copy Client ID and Client Secret into Vercel env vars

2. Add to Vercel:
   - `MYOB_CLIENT_ID`
   - `MYOB_CLIENT_SECRET`
   - `MYOB_REDIRECT_URI` = `https://jobbly.nz/api/myob/callback`

3. In Continuous Group's MYOB before connecting:
   - Online invoice payments enabled
   - Surcharging enabled
   - Direct deposit bank account added

4. Test using your own MYOB or Stripe account before switching Continuous Group over.

5. After connecting MYOB, click Test Connection to confirm the API reaches the correct company file. Check Vercel logs for the company file list.

6. After the first real job completes, check Vercel logs to confirm `OnlineInvoiceUrl` is present in the MYOB invoice response. If it is null or absent, the field name differs in Continuous Group's MYOB plan — report back and the utility can be updated.
