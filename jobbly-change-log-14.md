# Jobbly — Change Log 14
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are four changes in this session — the invoice preview API, the invoice send API, the invoice modal and Send Invoice button wiring, and the invoice reminder cron job with email templates. Complete all four in a single session in the order listed. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

This is the second of two changelogs building the Stripe invoicing feature. Change Log 13 (which must be fully deployed before this session begins) laid the foundation: the database schema, the encryption utility, and the settings UIs. This session builds the actual invoice sending flow and the reminder system.

**Do not begin this session until Change Log 13 is fully deployed and the production database has the `BillingProfile` table.**

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Confirm Change Log 13 is deployed**
Check that the following exist:
- `BillingProfile` table in the Prisma schema and in production
- `/lib/encryption.ts` and `/lib/stripeClient.ts`
- `POST /api/settings/stripe/verify` and `DELETE /api/settings/stripe/disconnect`
- `stripe_invoice_id`, `invoice_sent_at`, `invoice_sent_by` on `ReconciliationBatch`

If any of these are missing — stop and tell Oli. Do not proceed until Change Log 13 is complete.

**3. Locate the invoice preview modal**
Find the existing invoice preview modal — the one that shows the breakdown for a reconciled batch (period label, line items, subtotal ex GST, GST, total incl. GST). Read the full component. You will be extending this modal with recipient details and a "Confirm & Send via Stripe" button.

**4. Locate the ReconciliationBatch API routes**
Find the API routes related to reconciliation batches — particularly any `GET` route that returns batch details including line items. Read these fully — you will be building a new `/api/invoices/preview/[batchId]` endpoint that extends this data shape with Stripe recipient details.

**5. Locate the commission page and Reconciled Batches tab**
Find the component rendering the Reconciled Batches tab and the disabled "Send Invoice" button added in Change Log 13. Read it fully — you will be wiring up the button click in Change 3 of this session.

**6. Locate the Resend email utility**
Find where Resend is used in the codebase — likely a utility in `/lib` or an existing email route. Read the pattern used for sending emails. You will be creating two new email templates using the same pattern.

**7. Confirm vercel.json exists or is accessible**
Locate `vercel.json` in the project root. If it doesn't exist, you will create it. You will be adding a cron job configuration to it.

**8. Sync production database with current Prisma schema**
Run:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports everything is in sync — proceed normally.
If it reports changes were applied — note what changed and confirm the app loads correctly on production before continuing.
If it throws an error — stop and report the error to Oli before proceeding.

Only after all eight checks pass — begin building in the order listed below.

---

## Change 1 — Invoice Preview API Endpoint

### Background

The invoice preview modal needs a dedicated API endpoint to fetch all the data required to display a preview before sending — including the batch period, all line items (one per job), the calculated totals, and the recipient's billing details pulled from the `BillingProfile`. The existing batch/commission data is already in the database; this endpoint assembles it into a single, preview-ready response.

The line item amount for each job is the **commission or margin cut for that job only** — not the full job value. For the admin flow, this is Oli's commission cut. For the client flow, this is Continuous Group's margin cut. Do not use any other financial field. If the correct field name is unclear, stop and ask Oli before proceeding.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number.

---

### Step 1 — Build GET /api/invoices/preview/[batchId]

Create `/app/api/invoices/preview/[batchId]/route.ts`.

**Auth:** Require an active session. Identify the user's role.

**Action:**
1. Fetch the `ReconciliationBatch` by `batchId`, including all associated leads
2. Fetch the `BillingProfile` for this user's campaign and role
3. If no verified `BillingProfile` exists → return `403` with message: `"Stripe not connected. Complete Stripe setup in Settings before sending invoices."`
4. If the batch already has a `stripe_invoice_id` → return `409` with message: `"An invoice has already been sent for this batch."`

**Response shape:**
```typescript
{
  batch_id: string;
  period_label: string;           // e.g. "March 2025"
  recipient: {
    company_name: string;         // from BillingProfile
    billing_email: string;        // from BillingProfile
    billing_address: string | null;
  };
  line_items: Array<{
    quote_number: string;
    customer_name: string;
    amount_ex_gst: number;        // the cut amount for this job, excluding GST
  }>;
  subtotal_ex_gst: number;        // sum of all line item amounts
  gst_amount: number;             // subtotal_ex_gst * 0.15
  total_incl_gst: number;         // subtotal_ex_gst + gst_amount
  already_sent: boolean;          // true if stripe_invoice_id is set
  invoice_sent_at: string | null; // ISO timestamp if already sent
}
```

**Do not return any Stripe credentials in this response.**

---

### Build order for Change 1

1. Create `/app/api/invoices/preview/[batchId]/route.ts`
2. Confirm the correct commission/cut field name per lead — ask Oli if unclear
3. Run `npx tsc --noEmit` — confirm no TypeScript errors
4. Manual test: hit the endpoint for a known reconciled batch — confirm line items and totals are correct
5. Apply MINOR version bump in `package.json`
6. Commit: `v[version] — add invoice preview API endpoint`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 2 — Invoice Send API Endpoint

### Background

This is the core of the Stripe invoicing feature. When the user clicks "Confirm & Send via Stripe" in the invoice preview modal, this endpoint:

1. Fetches the batch and its line items
2. Decrypts the user's stored Stripe secret key
3. Creates a Stripe Invoice for the stored customer
4. Adds one line item per job at the cut amount (ex GST)
5. Applies the stored GST Tax Rate ID to each line item
6. Finalises and sends the invoice via Stripe
7. Saves the returned Stripe invoice ID back to the `ReconciliationBatch` record

Once sent, the batch is permanently marked as invoiced and cannot be re-invoiced.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number.

---

### Step 1 — Build POST /api/invoices/send

Create `/app/api/invoices/send/route.ts`.

**Auth:** Require an active session. Identify the user's role.

**Request body:**
```typescript
{
  batch_id: string;
  flow: 'admin_to_client' | 'client_to_subcontractor';
}
```

**Validation:**
- Confirm the session role matches the flow (ADMIN → admin_to_client; CLIENT → client_to_subcontractor). Return `403` if mismatched.
- Fetch the `ReconciliationBatch`. If `stripe_invoice_id` is already set → return `409`: `"An invoice has already been sent for this batch."`
- Fetch the `BillingProfile` for this user's campaign and role. If `stripe_verified = false` or no profile → return `403`: `"Stripe not connected."`

**Invoice creation:**
```typescript
import { getStripeClient } from '@/lib/stripeClient';

const stripe = getStripeClient(billingProfile.stripe_secret_key); // decrypts key internally

// Create the invoice (do not auto-advance — we control when it sends)
const invoice = await stripe.invoices.create({
  customer: billingProfile.stripe_customer_id,
  auto_advance: false,
  collection_method: 'send_invoice',
  days_until_due: 14,
});

// Add one line item per lead at the cut amount (not the full job value)
for (const lead of leads) {
  await stripe.invoiceItems.create({
    customer: billingProfile.stripe_customer_id,
    invoice: invoice.id,
    description: `${lead.quote_number} — ${lead.customer_name}`,
    amount: Math.round(cutAmount * 100), // Stripe uses cents — multiply by 100
    currency: 'nzd',
    tax_rates: [billingProfile.stripe_gst_rate_id],
  });
}

// Finalise and send
await stripe.invoices.finalizeInvoice(invoice.id);
const sentInvoice = await stripe.invoices.sendInvoice(invoice.id);
```

**After successful send:**
```typescript
await prisma.reconciliationBatch.update({
  where: { id: batch_id },
  data: {
    stripe_invoice_id: sentInvoice.id,
    invoice_sent_at: new Date(),
    invoice_sent_by: session.user.id,
  },
});
```

**Response:**
```typescript
{
  success: true;
  stripe_invoice_id: string;
  stripe_invoice_url: string | null; // sentInvoice.hosted_invoice_url if available
  invoice_sent_at: string;           // ISO timestamp
}
```

**Error handling:**
- If any Stripe API call fails — catch the error, log it server-side, and return `500`: `"Invoice sending failed. The invoice was not sent — please try again."` Do not partially update the database if Stripe fails.
- Wrap the entire Stripe sequence in a try/catch. Only write to the database if all Stripe calls succeed.

---

### Build order for Change 2

1. Create `/app/api/invoices/send/route.ts`
2. Confirm the cut amount field name used per lead (same field as in Change 1 preview endpoint — must be consistent)
3. Confirm `cutAmount * 100` produces an integer for all realistic values (no decimal issues in NZD cents)
4. Run `npx tsc --noEmit` — confirm no TypeScript errors
5. Manual test with Stripe test credentials: send against a real reconciled batch → confirm Stripe invoice created, `stripe_invoice_id` written to `ReconciliationBatch`
6. Apply MINOR version bump in `package.json`
7. Commit: `v[version] — add invoice send API endpoint with Stripe integration`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 3 — Invoice Preview Modal Updates + Send Invoice Button Wiring

### Background

The invoice preview modal already exists and shows the financial breakdown. It needs:
- A recipient details section at the top (company, email, address)
- A Stripe invoice number field (shown after sending)
- A **"Confirm & Send via Stripe"** button alongside the existing "Mark Reconciled" button — not replacing it

The "Send Invoice" button placeholder added in Change Log 13 now needs to be wired up to open this modal.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number.

---

### Step 1 — Update the invoice preview modal

Find the existing invoice preview modal component. Extend it as follows:

**Add to the top of the modal (above existing line items):**
```
Recipient
[Company name]
[Billing email]
[Billing address — if available]
```
These values come from the `/api/invoices/preview/[batchId]` response.

**Add below the Total incl. GST line:**
```
Invoice number: [Generated by Stripe — shown after send]
```
Before sending, this line is hidden. After a successful send, show the Stripe invoice number.

**Add to the modal footer (alongside existing "Mark Reconciled" button):**
- **"Confirm & Send via Stripe"** — primary button, calls `POST /api/invoices/send`
- **"Cancel"** — closes modal

**Button states within the modal:**
- Default: "Confirm & Send via Stripe" enabled
- Loading: button disabled, shows "Sending..." while API call is in flight
- Success: button replaced with a green "Invoice sent ✓" confirmation. Show the Stripe invoice number. Show a "Close" button.
- Error: show the error message from the API response below the button. Button returns to enabled so the user can try again.

**The "Mark Reconciled" button behaviour is completely unchanged.** It still exists and works independently of the Stripe flow.

---

### Step 2 — Wire up the Send Invoice button on commission pages

In the Reconciled Batches tab (admin commission page), wire up the disabled "Send Invoice" placeholder button added in Change Log 13:

- On click: call `GET /api/invoices/preview/[batchId]` to fetch preview data
- Show a loading state while fetching
- On success: open the invoice preview modal with the fetched data pre-loaded
- On error: show an inline error message

Apply the same wiring to the "Send Invoice" button on the client commission page.

**Button visibility rules (enforced in UI — also enforced server-side in the API):**
- If `BillingProfile.stripe_verified = false` (or no profile): button disabled, tooltip: `"Connect Stripe in Settings to enable invoicing"`
- If `ReconciliationBatch.stripe_invoice_id` is set: button replaced with `"Sent [formatted date]"` label (not a button)
- All other reconciled batches: button enabled

---

### Build order for Change 3

1. Update invoice preview modal — add recipient section, Stripe invoice number field, "Confirm & Send" button, and all button states
2. Wire "Send Invoice" button on admin Reconciled Batches tab — opens modal with preview data
3. Wire "Send Invoice" button on client commission page — same flow
4. Confirm "Mark Reconciled" button is completely unaffected
5. Confirm already-sent batches show "Sent [date]" label instead of button
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply MINOR version bump in `package.json`
8. Commit: `v[version] — invoice preview modal with Stripe send button, commission page wired up`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 4 — Invoice Reminder Cron Job and Email Templates

### Background

A daily cron job fires at 8am NZST (8pm UTC) and checks which users have today set as their invoice reminder day. For each match, it sends a Resend email with a direct link to their invoice-sending page in Jobbly.

The cron endpoint must be protected by a secret header check using `CRON_SECRET` from Vercel environment variables.

Add `CRON_SECRET` to `.env.example` if not already there.

This change is a **MINOR bump**. Read the current version from `package.json` and increment the MINOR number.

---

### Step 1 — Add CRON_SECRET to environment variable references

Add to `.env.example` if not already present:
```
CRON_SECRET=    # Random secret to protect the cron endpoint from public calls
```

---

### Step 2 — Build the cron endpoint

Create `/app/api/cron/invoice-reminders/route.ts`.

**Auth:** Check the `Authorization` header before doing anything else:
```typescript
if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Logic:**
1. Get today's day of month: `new Date().getDate()`
2. Query all users where `invoice_reminder_day` equals today's day of month
3. For each user:
   - Determine their role
   - Fetch their campaign
   - Send the appropriate reminder email (see Step 3)
4. Return `200` with a summary of how many reminders were sent

**Error handling:** If sending an email fails for one user, log the error and continue processing other users — do not abort the entire job.

---

### Step 3 — Build the reminder email templates

Using the existing Resend email utility pattern in the codebase, create two email templates:

**Admin reminder email (sent to Oli):**
```
Subject: Time to send your invoice — [Month] [Year]

Hey Oli,

It's that time of the month. Your commission invoice for [Month] is ready to send to Continuous Group.

[View & Send Invoice →]  (links to /commission in Jobbly)

Jobbly by Omniside AI
```

**Client reminder email (sent to Continuous Group contact):**
```
Subject: Time to send your invoice — [Month] [Year]

Hi [Client first name],

Your invoice for [Month] is ready to send to Pro Water Blasting.

[View & Send Invoice →]  (links to the client commission page in Jobbly)

Jobbly
```

Replace `[Month] [Year]` with the current month and year (e.g. "April 2026"). The link should be a full URL — use the production domain.

Match the HTML/styling pattern of existing Resend emails already in the codebase.

---

### Step 4 — Add cron configuration to vercel.json

Add or update `vercel.json` in the project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/invoice-reminders",
      "schedule": "0 20 * * *"
    }
  ]
}
```

`0 20 * * *` = 8:00 PM UTC daily = **8:00 AM NZST**. In NZDT (October–April, UTC+13) this lands at 9:00 AM — still appropriate.

If `vercel.json` already exists with other configuration, add the `crons` key without removing existing content.

---

### Build order for Change 4

1. Add `CRON_SECRET` to `.env.example` if not already present
2. Create `/app/api/cron/invoice-reminders/route.ts` with auth check, day matching, email dispatch, error handling
3. Create admin reminder email template using existing Resend pattern
4. Create client reminder email template using existing Resend pattern
5. Add or update `vercel.json` with cron schedule
6. Manual test: call the cron endpoint directly with the correct `Authorization: Bearer [CRON_SECRET]` header — confirm emails fire for users with today's day set
7. Confirm calling the endpoint without the correct header returns `401`
8. Run `npx tsc --noEmit` — confirm no TypeScript errors
9. Apply MINOR version bump in `package.json`
10. Commit: `v[version] — invoice reminder cron job, email templates, vercel.json cron config`
11. Push to GitHub: `git push origin main`
12. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — Invoice Preview API**
- [ ] `GET /api/invoices/preview/[batchId]` returns period label, recipient details, line items, and totals
- [ ] Line item amounts are the cut per job — not the full job value
- [ ] `subtotal_ex_gst`, `gst_amount` (15%), and `total_incl_gst` are calculated correctly
- [ ] Recipient details come from `BillingProfile` — not hardcoded
- [ ] Returns `403` if no verified `BillingProfile` exists for this user's role
- [ ] Returns `409` if batch already has a `stripe_invoice_id`
- [ ] No Stripe credentials returned in the response
- [ ] Admin role returns ADMIN billing profile; Client role returns CLIENT billing profile
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 2 — Invoice Send API**
- [ ] `POST /api/invoices/send` validates flow matches session role — returns `403` if mismatched
- [ ] Returns `409` if `stripe_invoice_id` already set on the batch
- [ ] Returns `403` if `BillingProfile.stripe_verified = false`
- [ ] Uses `getStripeClient()` from `/lib/stripeClient.ts` — decryption happens there, not inline
- [ ] Stripe Invoice created with `auto_advance: false` and `collection_method: 'send_invoice'`
- [ ] One `InvoiceItem` per lead — description is `[Quote #] — [Customer Name]`
- [ ] `amount` passed to Stripe is in cents (multiply by 100) and is an integer
- [ ] `tax_rates` uses the stored `stripe_gst_rate_id` from `BillingProfile`
- [ ] Invoice is finalised then sent via `stripe.invoices.sendInvoice()`
- [ ] `stripe_invoice_id`, `invoice_sent_at`, `invoice_sent_by` written to `ReconciliationBatch` on success
- [ ] Database is only updated after all Stripe calls succeed — not partially
- [ ] On Stripe failure: returns `500` with user-friendly message; database not updated
- [ ] `stripe_invoice_url` returned in response if available
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 3 — Modal Updates + Button Wiring**
- [ ] Invoice preview modal shows recipient company name, email, and billing address
- [ ] Recipient details sourced from `GET /api/invoices/preview/[batchId]` response
- [ ] "Confirm & Send via Stripe" button added alongside "Mark Reconciled" — not replacing it
- [ ] "Mark Reconciled" button and its existing behaviour completely unchanged
- [ ] Loading state shown while API call is in flight — button disabled during load
- [ ] On success: "Invoice sent ✓" shown, Stripe invoice number displayed, "Close" button shown
- [ ] On error: error message shown below button; button returns to enabled for retry
- [ ] "Send Invoice" button on admin Reconciled Batches tab now opens preview modal
- [ ] "Send Invoice" button on client commission page now opens preview modal
- [ ] Button disabled with tooltip when `stripe_verified = false`
- [ ] Already-sent batches show "Sent [formatted date]" — not a button
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 4 — Cron Job and Reminders**
- [ ] `CRON_SECRET` added to `.env.example`
- [ ] `/api/cron/invoice-reminders` returns `401` without correct `Authorization: Bearer [CRON_SECRET]` header
- [ ] Cron queries users where `invoice_reminder_day = today's day of month`
- [ ] Admin reminder email sent to correct address with correct month/year in subject and body
- [ ] Client reminder email sent to correct address with correct month/year in subject and body
- [ ] Links in emails point to correct pages in production Jobbly
- [ ] Email failure for one user does not abort sending to other users
- [ ] `vercel.json` includes cron at `0 20 * * *` — no other config removed
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Final**
- [ ] Each change has its own commit, push, and Vibstr report
- [ ] All four changes are MINOR bumps — read current version from `package.json` and increment MINOR for each
- [ ] All commits use correct message format per CLAUDE.md
- [ ] End-to-end manual test completed: Stripe setup → reminder fired manually → clicked link → previewed invoice → sent → batch shows "Sent [date]" and button disabled
