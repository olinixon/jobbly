# Jobbly — Change Log 13
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are four changes in this session — database migrations, an encryption utility, two Stripe settings UIs, and API endpoints to verify and disconnect Stripe credentials. Complete all four in a single session in the order listed. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

This is the first of two changelogs building the Stripe invoicing feature. This session lays the foundation: the data model, encryption, and the settings UI that lets Admin and Client connect their Stripe accounts. The actual invoice sending and reminder emails are in Change Log 14.

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Locate the Prisma schema**
Find `prisma/schema.prisma`. Read it in full — you will be adding three new fields and one new model. Note the existing `ReconciliationBatch` model, the `User` model, and whether a `Campaign` relation already exists that the new `BillingProfile` model will reference.

**3. Locate the admin settings page**
Find the component and API routes that power the admin `/settings` page. Read the full component — you will be adding a new "Stripe & Invoicing" section to it. Note the existing section structure so the new section matches the visual pattern.

**4. Locate the client settings page**
Find the equivalent settings component for the Client role. Read it in full — you will be adding the same "Stripe & Invoicing" section here.

**5. Locate the reconciliation batch row and commission page**
Find the component that renders reconciled batches in the commission page (the Reconciled Batches tab). Read it in full — you will be adding a "Send Invoice" button per batch row in Change Log 14, but in this session you need to understand the batch data shape so you can build the preview API correctly.

**6. Confirm the Campaign model and its relation to users/roles**
Read the Prisma schema and confirm how Admin and Client users are associated with a `Campaign`. You will need this to correctly scope `BillingProfile` records per campaign and per role. If the relationship is ambiguous, stop and ask Oli before proceeding.

**7. Install the Stripe Node SDK**
Before building anything Stripe-related, install the package:
```bash
npm install stripe
```
Confirm the install succeeds before continuing. Flag to Oli if there are any peer dependency conflicts.

**8. Sync production database with current Prisma schema**
Before building anything, verify the production Supabase database is fully in sync. Run:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports everything is in sync — proceed normally.
If it reports changes were applied — note what changed and confirm the app loads correctly on production before continuing.
If it throws an error — stop and report the error to Oli before proceeding.

Only after all eight checks pass — begin building in the order listed below.

---

## Change 1 — Database Migration: BillingProfile, ReconciliationBatch, User

### Background

The Stripe invoicing feature requires three schema additions:

1. A new `BillingProfile` table — one record per role per campaign, storing each party's Stripe credentials (encrypted), their recipient's Stripe Customer ID, their GST Tax Rate ID, and a verified flag.
2. Three new fields on `ReconciliationBatch` — to record when and by whom a Stripe invoice was sent, and what the Stripe invoice ID is.
3. One new field on `User` — the day of the month the user wants to receive their invoice reminder email.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number (e.g. 1.23.2 → 1.24.0).

---

### Step 1 — Add BillingProfile model to schema

Add the following model to `prisma/schema.prisma`:

```prisma
model BillingProfile {
  id                    String    @id @default(uuid())
  campaign_id           String
  campaign              Campaign  @relation(fields: [campaign_id], references: [id])
  company_name          String
  billing_email         String
  billing_address       String?
  stripe_customer_id    String
  stripe_secret_key     String    // encrypted at rest — never stored plain text
  stripe_gst_rate_id    String    // the txr_... ID of the 15% GST tax rate in this user's Stripe account
  stripe_verified       Boolean   @default(false)
  stripe_verified_at    DateTime?
  role                  String    // "ADMIN" | "CLIENT"
  created_at            DateTime  @default(now())
}
```

Also add the reverse relation to the `Campaign` model:
```prisma
model Campaign {
  // ... existing fields
  billing_profiles      BillingProfile[]
}
```

---

### Step 2 — Add fields to ReconciliationBatch

Add the following three fields to the existing `ReconciliationBatch` model:

```prisma
model ReconciliationBatch {
  // ... existing fields
  stripe_invoice_id    String?   // populated once the Stripe invoice is created and sent
  invoice_sent_at      DateTime? // timestamp when the invoice was sent via Stripe
  invoice_sent_by      String?   // user ID of who pressed "Confirm & Send"
}
```

---

### Step 3 — Add field to User

Add the following field to the existing `User` model:

```prisma
model User {
  // ... existing fields
  invoice_reminder_day  Int?  // day of month (1–28) to receive reminder email; null = no reminder
}
```

---

### Step 4 — Run migration

Run the local migration:
```bash
npx prisma migrate dev --name add_stripe_billing_profile
```

Then push to production:
```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

Confirm both complete without errors before proceeding.

---

### Build order for Change 1

1. Add `BillingProfile` model to `prisma/schema.prisma`
2. Add reverse relation to `Campaign` model
3. Add `stripe_invoice_id`, `invoice_sent_at`, `invoice_sent_by` to `ReconciliationBatch`
4. Add `invoice_reminder_day` to `User`
5. Run `npx prisma migrate dev --name add_stripe_billing_profile`
6. Push migration to production DB
7. Confirm app loads correctly on production — check `/commission` and `/settings` pages still render
8. Apply MINOR version bump in `package.json`
9. Commit: `v[version] — add BillingProfile schema, ReconciliationBatch invoice fields, User reminder day`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

---

## Change 2 — Server-Side Encryption Utility

### Background

The `BillingProfile` table will store each user's Stripe Secret Key. This key must be encrypted before being written to the database and decrypted only at the moment it is used to make a Stripe API call. It must never be stored in plain text, logged, or returned to the frontend.

The encryption key itself (`ENCRYPTION_KEY`) lives in Vercel environment variables — it is never in the database or in the codebase. This key must be added to Vercel manually before this feature can be used.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number.

---

### Step 1 — Add ENCRYPTION_KEY to environment variable references

Add `ENCRYPTION_KEY` to `.env.example`:
```
ENCRYPTION_KEY=        # 32-character random string — used to encrypt Stripe secret keys at rest
```

Do not add a value — this is a template only.

---

### Step 2 — Create the encryption utility

Create `/lib/encryption.ts`:

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  if (Buffer.from(key).length !== KEY_LENGTH) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
  }
  return Buffer.from(key);
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted value format');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
```

---

### Step 3 — Create the Stripe client utility

Create `/lib/stripeClient.ts`:

```typescript
import Stripe from 'stripe';
import { decrypt } from '@/lib/encryption';

export function getStripeClient(encryptedSecretKey: string): Stripe {
  const decryptedKey = decrypt(encryptedSecretKey);
  return new Stripe(decryptedKey);
}
```

This function decrypts the stored key and returns a ready-to-use Stripe client. It is the only place in the codebase where decryption happens before a Stripe call — all invoice/verify routes must use this utility, never decrypt inline.

---

### Build order for Change 2

1. Add `ENCRYPTION_KEY` to `.env.example`
2. Create `/lib/encryption.ts`
3. Create `/lib/stripeClient.ts`
4. Run `npx tsc --noEmit` — confirm no TypeScript errors
5. Apply MINOR version bump in `package.json`
6. Commit: `v[version] — add AES-256 encryption utility and Stripe client factory`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 3 — Stripe Verify and Disconnect API Endpoints

### Background

Before Admin or Client can send invoices, they must connect their Stripe account through the in-app setup guide. Two API endpoints power this:

- `POST /api/settings/stripe/verify` — validates all three Stripe credentials (secret key, GST tax rate ID, customer ID) against the live Stripe API, then encrypts and saves them to `BillingProfile`.
- `DELETE /api/settings/stripe/disconnect` — clears all Stripe credentials from the user's `BillingProfile`, resetting `stripe_verified` to false. The Send Invoice button becomes disabled immediately.

Both endpoints are role-gated: Admin can only create/modify the ADMIN `BillingProfile`, Client can only create/modify the CLIENT `BillingProfile`. Neither can touch the other's record.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number.

---

### Step 1 — Build POST /api/settings/stripe/verify

Create `/app/api/settings/stripe/verify/route.ts`.

**Auth:** Require an active session. Identify the user's role (`ADMIN` or `CLIENT`) from their session.

**Request body:**
```typescript
{
  stripe_secret_key: string;
  stripe_gst_rate_id: string;
  stripe_customer_id: string;
  company_name: string;
  billing_email: string;
  billing_address?: string;
}
```

**Validation logic:**

Step A — Verify the secret key and customer ID:
```typescript
const stripe = new Stripe(stripe_secret_key); // use plain key here — not yet encrypted
const customer = await stripe.customers.retrieve(stripe_customer_id);
```
If the key is invalid (Stripe throws auth error) → return `400` with message: `"We couldn't connect to Stripe. Check your Secret Key and try again."`
If the customer doesn't exist → return `400` with message: `"Connected to Stripe, but we couldn't find that customer. Double-check the Customer ID."`

Step B — Verify the GST Tax Rate ID:
```typescript
const taxRate = await stripe.taxRates.retrieve(stripe_gst_rate_id);
```
If the tax rate doesn't exist → return `400` with message: `"Connected to Stripe, but we couldn't find that tax rate. Double-check the GST Tax Rate ID."`

Step C — All three pass → encrypt the secret key and upsert the `BillingProfile`:
```typescript
import { encrypt } from '@/lib/encryption';

const encryptedKey = encrypt(stripe_secret_key);

await prisma.billingProfile.upsert({
  where: { campaign_id_role: { campaign_id: campaignId, role: userRole } },
  create: {
    campaign_id: campaignId,
    role: userRole,
    company_name,
    billing_email,
    billing_address,
    stripe_customer_id,
    stripe_secret_key: encryptedKey,
    stripe_gst_rate_id,
    stripe_verified: true,
    stripe_verified_at: new Date(),
  },
  update: {
    company_name,
    billing_email,
    billing_address,
    stripe_customer_id,
    stripe_secret_key: encryptedKey,
    stripe_gst_rate_id,
    stripe_verified: true,
    stripe_verified_at: new Date(),
  },
});
```

If the `campaign_id_role` compound unique index doesn't exist in the schema, add it:
```prisma
model BillingProfile {
  // ... existing fields
  @@unique([campaign_id, role])
}
```
Run `npx prisma migrate dev --name add_billing_profile_unique_index` and push to production if this index needs to be added.

Return `200` with `{ verified: true }` on success.

**Important:** Never return the secret key (encrypted or plain) in any API response.

---

### Step 2 — Build DELETE /api/settings/stripe/disconnect

Create `/app/api/settings/stripe/disconnect/route.ts`.

**Auth:** Require an active session. Identify the user's role.

**Action:** Find the `BillingProfile` for this user's campaign and role. Delete it entirely:
```typescript
await prisma.billingProfile.delete({
  where: { campaign_id_role: { campaign_id: campaignId, role: userRole } },
});
```

If no profile exists (already disconnected) — return `200` silently. This is not an error.

Return `200` with `{ disconnected: true }` on success.

---

### Build order for Change 3

1. Add `@@unique([campaign_id, role])` to `BillingProfile` in schema if not already present
2. Run migration and push to production if schema changed
3. Create `/app/api/settings/stripe/verify/route.ts`
4. Create `/app/api/settings/stripe/disconnect/route.ts`
5. Run `npx tsc --noEmit` — confirm no TypeScript errors
6. Manual test: call verify endpoint with valid test credentials → confirm `BillingProfile` row created with encrypted key
7. Manual test: call disconnect endpoint → confirm row deleted
8. Apply MINOR version bump in `package.json`
9. Commit: `v[version] — add Stripe verify and disconnect API endpoints`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

---

## Change 4 — Stripe & Invoicing Settings UI (Admin and Client)

### Background

Both Admin and Client need a "Stripe & Invoicing" section in their respective settings pages. This section has two parts:

**Part A — Stripe Connection:** A 6-step guided checklist walking the user through setting up their Stripe account, creating a customer, creating a GST tax rate, and pasting their credentials into Jobbly. When all three credentials are verified (via the endpoint built in Change 3), the checklist collapses and a green "Connected" badge with a "Disconnect Stripe" button is shown instead. Disconnecting clears credentials and returns to the checklist state.

**Part B — Invoice Reminder:** A day-of-month picker letting the user choose when to receive their monthly "Time to send your invoice" reminder email. Separate save button. "Disable reminders" link to clear it.

The Send Invoice button (built in Change Log 14) must be disabled until `stripe_verified = true`. For now, add the disabled state and tooltip — the button itself is built next session.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number.

---

### Step 1 — Build the Stripe Connection component

Create a reusable component `/components/settings/StripeConnectionSetup.tsx`.

This component renders differently depending on connection state:

**State A — Not connected (`stripe_verified = false` or no BillingProfile):**

Show a vertical checklist with 6 expandable steps. Each step has a status indicator (grey circle = incomplete) and expands to show instructions when clicked. Completed steps (where the user has ticked them off or moved past them) show a green tick.

The steps are:

**Step 1 — Create or log in to your Stripe account**
- Go to stripe.com and create an account, or log in if you already have one
- Make sure the account is registered under **[company name]** — this is the name that will appear on invoices
- Ensure your account is in **New Zealand** and set to **NZD**

**Step 2 — Enable Invoicing in Stripe**
- In your Stripe dashboard, go to **Settings → Billing → Invoice settings**
- Set your default payment terms (e.g. "Due in 14 days")
- Add your business details: company name, address, email, logo (optional)

**Step 3 — Create a 15% GST Tax Rate**
- In Stripe, go to **Settings → Tax rates → New tax rate**
- Display name: `GST`, Percentage: `15`, Inclusive: `No`
- Save and copy the **Tax Rate ID** (starts with `txr_...`)

**Step 4 — Create a Customer for [recipient company name]**
- In Stripe, go to **Customers → Add customer**
- Name: `[recipient name]`, Email: `[recipient billing email]`
- Add their billing address, then save and copy the **Customer ID** (starts with `cus_...`)

**Step 5 — Connect Stripe to Jobbly**
Show a form with the following inputs:
- **Stripe Secret Key** (`sk_live_...` or `sk_test_...`)
- **GST Tax Rate ID** (`txr_...`)
- **[Recipient] Customer ID** (`cus_...`)
- **Company name** (the sender's company — pre-filled if known)
- **Billing email** (the sender's billing email)
- **Billing address** (optional)

And a **"Save & Verify"** button. On click:
1. Show a loading state
2. Call `POST /api/settings/stripe/verify` with the form values
3. On success → transition to State B (Connected)
4. On error → show the specific error message returned by the API below the form

**Step 6 — Set your invoice reminder day** *(shown in Part B — see Step 2 below)*

**State B — Connected (`stripe_verified = true`):**

Show a green "Connected" badge with:
- The connected company name
- Verified date (e.g. "Verified 3 April 2026")
- A **"Disconnect Stripe"** button

On "Disconnect Stripe" click:
1. Show a confirmation: "This will disable invoice sending until you reconnect. Are you sure?"
2. On confirm — call `DELETE /api/settings/stripe/disconnect`
3. On success — return to State A (Not connected), clear all form fields

**Props for StripeConnectionSetup:**
```typescript
{
  role: 'ADMIN' | 'CLIENT';
  senderCompanyName: string;      // e.g. "Omniside AI" or "Continuous Group"
  recipientCompanyName: string;   // e.g. "Continuous Group" or "Pro Water Blasting"
  initialProfile: BillingProfileSummary | null;  // null = not connected
}
```

Where `BillingProfileSummary` is a type containing only non-sensitive fields:
```typescript
type BillingProfileSummary = {
  company_name: string;
  billing_email: string;
  billing_address: string | null;
  stripe_verified: boolean;
  stripe_verified_at: Date | null;
}
```
**Never pass the encrypted secret key to the frontend.**

---

### Step 2 — Build the Invoice Reminder component

Create `/components/settings/InvoiceReminderSettings.tsx`.

**UI:**
- Label: "Send me an invoice reminder on the..."
- A day-of-month dropdown (values 1–28, displayed as "1st", "2nd", "3rd" etc.)
- Helper text: "You'll receive an email on this day each month with a link to send your invoice."
- A **"Save reminder"** button
- A **"Disable reminders"** link (only shown when a reminder day is currently set)

On save:
```typescript
// POST /api/settings/reminder
{ reminder_day: number | null }
```

Build this endpoint:

Create `/app/api/settings/reminder/route.ts`:
- Auth: require session
- Accept `{ reminder_day: number | null }`
- Validate: if not null, must be between 1 and 28
- Update `user.invoice_reminder_day` in the database
- Return `200` on success

---

### Step 3 — Add the "Stripe & Invoicing" section to admin settings

In the admin `/settings` page component, add a new section titled **"Stripe & Invoicing"** below the existing sections.

Structure:
```
## Stripe & Invoicing

### Stripe Connection
<StripeConnectionSetup
  role="ADMIN"
  senderCompanyName="Omniside AI"
  recipientCompanyName="Continuous Group"
  initialProfile={billingProfile}   // fetched server-side or via API
/>

### Invoice Reminder
<InvoiceReminderSettings initialDay={user.invoice_reminder_day} />
```

Fetch the admin's `BillingProfile` (ADMIN role) server-side to pass as `initialProfile`. If none exists, pass `null`.

---

### Step 4 — Add the "Stripe & Invoicing" section to client settings

In the client settings page, add the same section. The only difference is props:
```
<StripeConnectionSetup
  role="CLIENT"
  senderCompanyName="Continuous Group"
  recipientCompanyName="Pro Water Blasting"
  initialProfile={billingProfile}
/>
```

---

### Step 5 — Gate the Send Invoice button placeholder

On the Reconciled Batches tab of the commission page, add a **"Send Invoice"** button per batch row — disabled for now, with a tooltip. The full functionality is built in Change Log 14.

Button states:
- If `BillingProfile.stripe_verified = false` (or no profile): disabled, tooltip: `"Connect Stripe in Settings to enable invoicing"`
- If `ReconciliationBatch.stripe_invoice_id` is set: disabled, show `"Sent [date]"` indicator instead of button
- If connected and not yet sent: disabled with tooltip: `"Invoice sending coming soon"` — this state is removed in Change Log 14 when the actual send flow is built

**Do not wire up the button click handler yet.** That is Change Log 14.

On the client commission page, add the same button with the same disabled states for the client → subcontractor flow.

---

### Build order for Change 4

1. Create `/components/settings/StripeConnectionSetup.tsx` with both connection states
2. Create `/components/settings/InvoiceReminderSettings.tsx`
3. Create `POST /api/settings/reminder` route
4. Add `BillingProfile` fetch to admin settings page (server-side)
5. Add `BillingProfile` fetch to client settings page (server-side)
6. Add "Stripe & Invoicing" section to admin `/settings` page
7. Add "Stripe & Invoicing" section to client settings page
8. Add disabled "Send Invoice" button placeholder to Reconciled Batches tab (admin)
9. Add disabled "Send Invoice" button placeholder to client commission page
10. Run `npx tsc --noEmit` — confirm no TypeScript errors
11. Apply MINOR version bump in `package.json`
12. Commit: `v[version] — Stripe & Invoicing settings UI for admin and client, invoice reminder picker, Send Invoice button placeholder`
13. Push to GitHub: `git push origin main`
14. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — Database Migration**
- [ ] `BillingProfile` model added to `prisma/schema.prisma`
- [ ] Reverse relation `billing_profiles BillingProfile[]` added to `Campaign` model
- [ ] `stripe_invoice_id`, `invoice_sent_at`, `invoice_sent_by` added to `ReconciliationBatch`
- [ ] `invoice_reminder_day Int?` added to `User`
- [ ] `npx prisma migrate dev --name add_stripe_billing_profile` runs cleanly
- [ ] Migration pushed to production DB successfully
- [ ] Production app still loads — `/commission` and `/settings` render correctly
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 2 — Encryption Utility**
- [ ] `ENCRYPTION_KEY` added to `.env.example` (no value)
- [ ] `/lib/encryption.ts` created with `encrypt()` and `decrypt()` functions
- [ ] `/lib/stripeClient.ts` created — decrypts key and returns Stripe client
- [ ] Encryption utility throws clearly if `ENCRYPTION_KEY` env var is missing or wrong length
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 3 — Stripe Verify and Disconnect Endpoints**
- [ ] `@@unique([campaign_id, role])` compound index added to `BillingProfile` (migration applied if needed)
- [ ] `POST /api/settings/stripe/verify` validates secret key against Stripe
- [ ] `POST /api/settings/stripe/verify` validates customer ID against Stripe
- [ ] `POST /api/settings/stripe/verify` validates GST tax rate ID against Stripe
- [ ] Each validation failure returns a distinct, user-friendly error message
- [ ] All three must pass — partial credentials are never saved
- [ ] On success: secret key is encrypted before being written to `BillingProfile`
- [ ] On success: `stripe_verified = true` and `stripe_verified_at` set
- [ ] Encrypted secret key is never returned to the frontend in any response
- [ ] Admin can only modify the ADMIN `BillingProfile` — cannot touch CLIENT record
- [ ] Client can only modify the CLIENT `BillingProfile` — cannot touch ADMIN record
- [ ] `DELETE /api/settings/stripe/disconnect` deletes the `BillingProfile` row for the user's role
- [ ] Disconnect with no existing profile returns `200` silently — not an error
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 4 — Settings UI**
- [ ] `/components/settings/StripeConnectionSetup.tsx` renders "Not connected" state with 6-step checklist
- [ ] Steps are expandable — click to open, click again or move to next step to close
- [ ] "Save & Verify" calls `POST /api/settings/stripe/verify` with all form values
- [ ] Loading state shown while verify request is in flight
- [ ] Error message from API shown below form on failure
- [ ] On success: component transitions to "Connected" state without page reload
- [ ] "Connected" state shows company name, verified date, and "Disconnect Stripe" button
- [ ] "Disconnect Stripe" shows confirmation before calling `DELETE /api/settings/stripe/disconnect`
- [ ] On disconnect success: component returns to "Not connected" state, form fields cleared
- [ ] Encrypted secret key is never sent to or stored in the frontend
- [ ] `/components/settings/InvoiceReminderSettings.tsx` renders day selector (1–28)
- [ ] Days displayed with ordinal suffix (1st, 2nd, 3rd...)
- [ ] "Save reminder" calls `POST /api/settings/reminder`
- [ ] "Disable reminders" sends `null` to `POST /api/settings/reminder`
- [ ] "Disable reminders" link only shown when a reminder day is currently set
- [ ] "Stripe & Invoicing" section added to admin settings page
- [ ] "Stripe & Invoicing" section added to client settings page
- [ ] Both sections fetch and display the correct `BillingProfile` for their role
- [ ] Disabled "Send Invoice" button added to admin Reconciled Batches tab
- [ ] Disabled "Send Invoice" button added to client commission page
- [ ] Button tooltip reads "Connect Stripe in Settings to enable invoicing" when not verified
- [ ] When `stripe_invoice_id` is set on a batch, "Sent [date]" shown instead of button
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Final**
- [ ] Each change has its own commit, push, and Vibstr report
- [ ] All four changes are MINOR bumps — read current version from `package.json` and increment MINOR for each
- [ ] All commits use correct message format per CLAUDE.md
