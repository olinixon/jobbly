# Jobbly — Change Log 20
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Starter Prompt

Open the Jobbly project at `/Users/oliver/Claude Code/jobbly` and read this changelog in full before writing a single line of code. There are five changes in this session. Complete them in order. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

---

## Context

Two related changes: a payment follow-up email system for unpaid invoices, and a notification preference toggle for the admin. Changes 1 and 2 are quick UI fixes. Change 3 requires a database migration. Change 4 is a UI addition to the admin profile page. Change 5 simplifies the admin Stripe setup and fixes the GST line item breakdown on invoices.

---

## Pre-Flight Check — Required Before Starting

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Read the current version**
Open `package.json` and note the current version. Changes 1, 2, and 4 are **PATCH bumps**. Change 3 is a **MINOR bump**. Change 5 is a **PATCH bump**.

**3. Locate and read these files before starting**

- The customer portal page: `app/portal/[token]/page.tsx`
- The admin settings page: `app/settings/page.tsx`
- The `StripeConnectionSetup` component — read in full
- The `POST /api/invoices/send` or equivalent Stripe invoice send endpoint — read in full
- The client settings page: `app/client/settings/page.tsx`
- The existing cron job handler — wherever it lives (likely `app/api/cron/...`)
- The `buildCustomerNotificationEmail.ts` helper — read in full
- The admin profile page — `app/profile/page.tsx` or equivalent
- The `users` table Prisma model — check existing notification preference fields
- `vercel.json` — check existing cron configuration

**4. Sync production database**

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports any errors — stop and report to Oli before proceeding.

Only after all four checks pass — begin building in the order listed below.

---

---

## Change 1 — Widen Portal Page Document Cards

### Background

The invoice and job report cards on the customer portal page are currently too narrow — the PDFs are hard to read without downloading. This change widens the page container and increases the iframe height so documents are clearly legible at a glance.

This is a **PATCH bump**.

---

### What to change

On the customer portal page (`app/portal/[token]/page.tsx`):

- Increase the main content container max-width to `max-w-6xl` or equivalent — the current container is too narrow
- Increase the PDF iframe height to `600px` on desktop so more of each document is visible without scrolling
- Mobile layout unchanged — iframes still show as download buttons only on small screens
- No other changes to layout, links, button behaviour, or payment state

---

### Build order for Change 1

1. Open the portal page component
2. Increase container max-width to `max-w-6xl`
3. Increase PDF iframe height to 600px on desktop
4. Confirm mobile layout unaffected
5. Run `npx tsc --noEmit` — confirm no TypeScript errors
6. Apply PATCH version bump in `package.json`
7. Commit: `v[version] — widen portal page container and increase PDF iframe height`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 2 — Remove Invoice Reminder from Client Settings

### Background

The invoice reminder section on the client settings page was built for a previous billing flow where Continuous Group invoiced the subcontractor. That flow has been replaced — customers now pay Continuous Group directly via Stripe. The invoice reminder is no longer needed on the client side and should be removed to keep the settings page clean.

This is a **PATCH bump**.

---

### What to change

On the client settings page (`app/client/settings/page.tsx`):

- Remove the "Invoice Reminder" section entirely — the day-of-month picker, the save button, the helper text, and any surrounding UI
- Do not touch the admin settings page — the invoice reminder stays on the admin side
- Do not delete the underlying API endpoint (`POST /api/settings/reminder`) or the database field — just remove the UI from the client view
- Do not change anything else on the client settings page

---

### Build order for Change 2

1. Open the client settings page
2. Remove the Invoice Reminder section from the UI
3. Confirm the admin settings page still shows the invoice reminder — unchanged
4. Run `npx tsc --noEmit` — confirm no TypeScript errors
5. Apply PATCH version bump in `package.json`
6. Commit: `v[version] — remove invoice reminder from client settings`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

## Change 3 — Payment Follow-Up Email System

### Background

When a job is completed and the customer notification email is sent, there is currently no follow-up if the customer doesn't pay. This change adds two automated follow-up actions:

- **Day 5:** If payment has not been received, send the customer a reminder email with the portal link and both documents attached again
- **Day 7:** If payment still has not been received, send an alert email to Oli so he can follow up manually

Both are controlled by a daily cron job. If `customer_paid_at` is set on the lead at any point, no further emails are sent — the sequence stops automatically.

This is a **MINOR bump**.

---

### Step 1 — Database migration

Add the following fields to the `leads` table in `schema.prisma`:

```prisma
payment_reminder_sent_at    DateTime?   // Timestamp when the Day 5 reminder was sent to the customer
payment_overdue_alerted_at  DateTime?   // Timestamp when the Day 7 alert was sent to Oli
```

Run the migration:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

Confirm both fields exist in production before proceeding.

---

### Step 2 — Day 5 customer payment reminder email

Build the email template for the Day 5 reminder. This is a separate function from `buildCustomerNotificationEmail` — create `buildPaymentReminderEmail.ts` in `/lib`.

**Subject:** `Friendly reminder — your invoice is ready to pay`

**Body (styled HTML — match existing Jobbly email templates):**

```
Hi [customer_name],

Just a friendly reminder that your invoice for the gutter clean
at [property_address] is still outstanding.

Your invoice and job report are attached to this email again
for your reference. You can pay securely online by clicking
the button below.

[  View Invoice & Pay Now  ]    ← full-width button

Paid securely through Stripe.   ← small centred text, subdued

If you've already arranged payment, please disregard this email.
If you have any questions, please don't hesitate to get in touch.

Thank you,
The [client_company_name] Team
```

- Button URL: `https://[NEXT_PUBLIC_APP_URL]/portal/[customer_portal_token]`
- Attach both the invoice PDF and the job report PDF — same logic as `buildCustomerNotificationEmail` (fetch from R2, attach as files, handle fetch failures gracefully without blocking the send)
- If email send fails: log the error, append note to lead: `[Payment Reminder Error — {date}] Failed to send Day 5 reminder.`

---

### Step 3 — Day 7 admin alert email

When 7 days have passed since `customer_email_sent_at` and payment is still not received, send an alert email to Oli.

**To:** `EMAIL_OLI` (environment variable)
**Subject:** `Payment overdue — [quote_number] — [customer_name]`

**Body:**

```
Hi Oli,

A customer invoice is now 7 days overdue and has not been paid.

Quote number:     [quote_number]
Customer name:    [customer_name]
Property address: [property_address]
Customer email:   [customer_email]
Invoice sent:     [customer_email_sent_at — formatted date]
Amount:           $[customer_price] (incl. GST)

Portal link (send to customer if needed):
[full portal URL]

Please follow up with the customer directly.

Jobbly by Omniside AI
```

- If this email fails to send: log the error, do not crash the cron job, still mark `payment_overdue_alerted_at`

---

### Step 4 — Cron job for payment follow-ups

Check whether an existing daily cron job exists in the codebase. If one exists (e.g. the invoice reminder cron), add the payment follow-up logic to it rather than creating a separate endpoint. If no daily cron exists, create one.

**Cron endpoint:** `POST /api/cron/payment-followup`

**Schedule:** Daily at 8am NZST (8pm UTC) — add to `vercel.json`:
```json
{
  "path": "/api/cron/payment-followup",
  "schedule": "0 20 * * *"
}
```

**Logic:**

```typescript
// Auth: CRON_SECRET header check — same pattern as existing cron endpoints
// If secret missing or wrong: return 401

// Find all leads where ALL of the following are true:
// - status = JOB_COMPLETED
// - customer_email is not null
// - customer_email_sent_at is not null
// - customer_paid_at IS null (not yet paid)
// - customer_portal_token is not null

// For each lead:

// DAY 5 REMINDER — send if:
// - now() >= customer_email_sent_at + 5 days
// - payment_reminder_sent_at IS null (not already sent)
// - notify_payment_reminder = true on any ADMIN user (check preference — see Change 4)
// Action: send Day 5 reminder email to customer, set payment_reminder_sent_at = now()

// DAY 7 ALERT — send if:
// - now() >= customer_email_sent_at + 7 days
// - payment_overdue_alerted_at IS null (not already sent)
// - notify_payment_overdue = true on any ADMIN user (check preference — see Change 4)
// Action: send Day 7 alert email to Oli, set payment_overdue_alerted_at = now()

// Both checks run independently — a lead can trigger both on the same day
// (e.g. if the cron wasn't running for a few days)

// Return 200 with a summary: { reminders_sent: N, alerts_sent: N }
```

**Important:** The Day 5 and Day 7 checks are independent. If for any reason the cron didn't run on Day 5, and it runs on Day 7, both the customer reminder and the Oli alert will fire on the same run. This is acceptable behaviour — do not try to prevent it.

---

### Build order for Change 1

1. Run DB migration — confirm new fields exist in production
2. Create `lib/buildPaymentReminderEmail.ts`
3. Build `POST /api/cron/payment-followup` endpoint with CRON_SECRET auth
4. Add schedule to `vercel.json`
5. Wire Day 5 reminder logic — send email, update `payment_reminder_sent_at`
6. Wire Day 7 alert logic — send email to Oli, update `payment_overdue_alerted_at`
7. Confirm paid leads (`customer_paid_at` is set) are completely excluded from both checks
8. Run `npx tsc --noEmit` — confirm no TypeScript errors
9. Apply MINOR version bump in `package.json`
10. Commit: `v[version] — payment follow-up cron: Day 5 customer reminder, Day 7 admin alert`
11. Push to GitHub: `git push origin main`
12. Run Vibstr build report per CLAUDE.md

---

## Change 4 — Admin Notification Preferences: Payment Follow-Up Toggles

### Background

The admin (Oli) needs to be able to toggle the Day 5 customer reminder and Day 7 overdue alert on or off from his profile page. Both default to on. The cron job in Change 1 checks these preferences before sending each email.

This is a **PATCH bump**.

---

### Step 1 — Database migration

Check the `users` table in `schema.prisma`. It already has `notify_new_lead` and `notify_job_completed` fields. Add two more:

```prisma
notify_payment_reminder   Boolean  @default(true)   // Day 5 customer reminder
notify_payment_overdue    Boolean  @default(true)   // Day 7 admin overdue alert
```

Run the migration:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

---

### Step 2 — Add toggles to the admin profile page

On the admin profile page, in the existing notification preferences section, add two new toggles below the existing ones:

```
Notification Preferences
─────────────────────────────────────────────────────

[toggle] New lead received
[toggle] Job completed

[toggle] Send customer payment reminder (5 days after invoice)
         Automatically sends the customer a reminder email if their
         invoice hasn't been paid after 5 days.

[toggle] Payment overdue alert (7 days after invoice)
         Sends you an alert email if a customer still hasn't paid
         after 7 days, so you can follow up manually.
```

- Both new toggles default to on
- Toggling saves immediately via the existing `PATCH /api/profile/notifications` endpoint
- Update that endpoint to also accept and save `notify_payment_reminder` and `notify_payment_overdue`
- Helper text beneath each toggle explains what it does — keeps it clear without being verbose
- ADMIN only — these toggles do not appear for CLIENT or SUBCONTRACTOR

---

### Step 3 — Wire preferences into the cron job

In `POST /api/cron/payment-followup` (built in Change 1), before sending either email, check the admin notification preferences:

```typescript
// Find all ADMIN users
// For Day 5 reminder: only send if at least one ADMIN has notify_payment_reminder = true
// For Day 7 alert: only send if at least one ADMIN has notify_payment_overdue = true
// If the relevant preference is false for all admins: skip that send silently
```

This ensures the cron respects the toggle without needing to pass preferences into the email functions.

---

### Build order for Change 2

1. Run DB migration — confirm `notify_payment_reminder` and `notify_payment_overdue` exist on users table
2. Update `PATCH /api/profile/notifications` to accept and save both new fields
3. Add the two new toggles to the admin profile page notification preferences section
4. Update the cron job from Change 1 to check these preferences before sending
5. Confirm CLIENT and SUBCONTRACTOR profile pages do not show the new toggles
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply PATCH version bump in `package.json`
8. Commit: `v[version] — payment follow-up notification toggles on admin profile`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

---

## Change 5 — Simplify Admin Stripe Setup + Fix GST Line Items on Invoice

### Background

The admin Stripe setup currently has too many steps — several of which are unnecessary. The "Enable invoicing" and "Create a 15% GST tax rate in Stripe" steps can be removed entirely because Jobbly calculates the GST itself and passes all three figures (subtotal ex GST, GST amount, total incl. GST) directly to Stripe as separate line items. Stripe doesn't need its own tax rate configured.

The "Create a customer" step stays but needs clearer instructions — the customer being created in Stripe is Continuous Group (the client), not the admin. The billing email is Continuous Group's email address, not Oli's.

This is a **PATCH bump**.

---

### Step 1 — Remove unnecessary steps from admin Stripe setup

In the `StripeConnectionSetup` component, when rendered in admin mode (`mode="invoicing"` or equivalent), remove the following steps:

- **"Enable invoicing"** — remove entirely
- **"Create a 15% GST tax rate"** — remove entirely

**Keep these steps:**
1. Create or log in to your Stripe account at stripe.com
2. Go to Developers → API Keys, copy your Secret Key
3. Create a customer in Stripe for Continuous Group — copy the Customer ID
4. Paste your Secret Key, Customer ID, and billing email into Jobbly → Save & Verify

Update the step instructions to make the customer creation step crystal clear:

```
Step 3 — Create a customer in Stripe for your client

In your Stripe dashboard, go to Customers → + Add customer.
Fill in:
  Name:   Continuous Group
  Email:  [Continuous Group's billing email — e.g. accounts@continuous.co.nz]

Save the customer. Copy the Customer ID shown (it starts with cus_...).

This is who Stripe will address your invoices to.
```

---

### Step 2 — Fix the Stripe invoice line items to show GST breakdown

Find the code that creates the Stripe invoice when Oli clicks "Confirm & Send via Stripe" on the commission page. Currently it likely passes a single GST-inclusive amount as one line item. Replace this with three line items so the invoice clearly shows the full breakdown.

The commission amount (`subtotal`) comes from the reconciled batch total — this is the ex-GST figure.

```typescript
// Calculate the three figures:
const subtotalExGst = commissionAmount;                        // e.g. 400.00
const gstAmount = Math.round(subtotalExGst * 0.15 * 100) / 100; // e.g. 60.00
const totalInclGst = Math.round(subtotalExGst * 1.15 * 100) / 100; // e.g. 460.00

// Create Stripe invoice with three line items:
await stripe.invoiceItems.create({
  customer: customerId,
  amount: Math.round(subtotalExGst * 100), // in cents
  currency: 'nzd',
  description: `Commission — ${periodLabel} (ex GST)`,
  invoice: invoice.id,
});

await stripe.invoiceItems.create({
  customer: customerId,
  amount: Math.round(gstAmount * 100), // in cents
  currency: 'nzd',
  description: 'GST (15%)',
  invoice: invoice.id,
});

// Note: The two line items above sum to the total incl. GST.
// Stripe automatically shows the total. No third line item needed —
// the total is calculated by Stripe from the line items.
```

**The resulting Stripe invoice will show:**
```
Commission — March 2025 (ex GST)    $400.00
GST (15%)                            $60.00
─────────────────────────────────────────────
Total                                $460.00
```

This is clear, professional, and correct — no Stripe-side tax rate configuration needed.

---

### Step 3 — Update the invoice preview modal

The invoice preview modal shown in Jobbly before the admin clicks "Confirm & Send" should also show this three-line breakdown — it already does for the most part, but confirm it shows:

- Subtotal ex GST
- GST (15%) as a calculated line
- Total incl. GST

If any of these are missing or calculated incorrectly in the preview, fix them to match the actual Stripe invoice output.

---

### Step 4 — Update the billing email field label and helper text

In the admin `StripeConnectionSetup`, the "Billing Email" field label is ambiguous. Update the label and helper text to make it clear this is the client's email:

**Label:** `Client Billing Email`
**Helper text:** `The email address invoices will be sent to — this is Continuous Group's billing email, not yours.`

---

### Build order for Change 5

1. Read the `StripeConnectionSetup` component in full — identify which steps exist in admin mode
2. Remove "Enable invoicing" step from admin setup
3. Remove "Create a 15% GST tax rate" step from admin setup
4. Update Step 3 instructions — customer creation with clear explanation of who the customer is
5. Update "Billing Email" label and helper text
6. Find the Stripe invoice creation code — replace single amount with three line items (subtotal, GST, total logic)
7. Confirm the invoice preview modal in Jobbly shows the same three-line breakdown
8. Run `npx tsc --noEmit` — confirm no TypeScript errors
9. Apply PATCH version bump in `package.json`
10. Commit: `v[version] — simplify admin Stripe setup, fix GST line items on invoice`
11. Push to GitHub: `git push origin main`
12. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 5 — Admin Stripe setup simplification + GST line items**
- [ ] "Enable invoicing" step removed from admin Stripe setup
- [ ] "Create a 15% GST tax rate" step removed from admin Stripe setup
- [ ] Step 3 (create customer) has clear instructions explaining customer = Continuous Group
- [ ] Step 3 instructions include name, email, and Customer ID copy steps
- [ ] "Billing Email" field label updated to "Client Billing Email"
- [ ] Billing email helper text clarifies it is Continuous Group's email, not Oli's
- [ ] Stripe invoice creation uses two line items: subtotal ex GST + GST (15%)
- [ ] Subtotal ex GST calculated correctly from commission amount
- [ ] GST calculated as `subtotal × 0.15` rounded to 2 decimal places
- [ ] Stripe invoice total matches `subtotal × 1.15`
- [ ] Invoice preview modal in Jobbly shows subtotal ex GST, GST line, and total incl. GST
- [ ] Admin settings page admin Stripe setup renders correctly with updated steps
- [ ] Client settings page completely unaffected
- [ ] No TypeScript errors

**Change 1 — Widen portal document cards**
- [ ] Portal page container max-width increased to `max-w-6xl`
- [ ] PDF iframe height increased to 600px on desktop
- [ ] Mobile layout unchanged — download buttons only on small screens
- [ ] No changes to links, buttons, or payment state
- [ ] No TypeScript errors

**Change 2 — Remove invoice reminder from client settings**
- [ ] Invoice Reminder section removed from client settings page
- [ ] Admin settings page invoice reminder completely unchanged
- [ ] Underlying API endpoint and database field untouched
- [ ] No other changes to client settings page
- [ ] No TypeScript errors

**Change 3 — Payment follow-up cron**
- [ ] DB migration complete — `payment_reminder_sent_at` and `payment_overdue_alerted_at` exist on leads
- [ ] `lib/buildPaymentReminderEmail.ts` created
- [ ] Day 5 reminder email subject correct: "Friendly reminder — your invoice is ready to pay"
- [ ] Day 5 email body matches spec — warm, concise
- [ ] Day 5 email has full-width button linking to portal URL
- [ ] Day 5 email has "Paid securely through Stripe." line below button
- [ ] Day 5 email attaches invoice and job report PDFs from R2
- [ ] Attachment fetch failures handled gracefully — email still sends without attachment
- [ ] `POST /api/cron/payment-followup` endpoint exists
- [ ] Endpoint protected by CRON_SECRET header — returns 401 if missing/wrong
- [ ] Cron scheduled at 8pm UTC daily in `vercel.json`
- [ ] Day 5 check: sends when `now() >= customer_email_sent_at + 5 days` AND `payment_reminder_sent_at` is null
- [ ] Day 5 send: sets `payment_reminder_sent_at = now()` after sending
- [ ] Day 7 check: sends when `now() >= customer_email_sent_at + 7 days` AND `payment_overdue_alerted_at` is null
- [ ] Day 7 alert email sent to `EMAIL_OLI` with correct content
- [ ] Day 7 send: sets `payment_overdue_alerted_at = now()` after sending
- [ ] Leads with `customer_paid_at` set are completely excluded from both checks
- [ ] Leads with null `customer_email` excluded from Day 5 customer reminder
- [ ] Both checks run independently on each cron run
- [ ] Cron returns 200 with summary: `{ reminders_sent: N, alerts_sent: N }`
- [ ] No TypeScript errors

**Change 4 — Admin notification toggles**
- [ ] DB migration complete — `notify_payment_reminder` and `notify_payment_overdue` on users table, both default true
- [ ] `PATCH /api/profile/notifications` accepts and saves both new fields
- [ ] Two new toggles appear on admin profile page — below existing notification preferences
- [ ] "Send customer payment reminder" toggle with helper text
- [ ] "Payment overdue alert" toggle with helper text
- [ ] Both toggles default to on
- [ ] Toggling saves immediately — no separate save button needed
- [ ] CLIENT and SUBCONTRACTOR profile pages do not show the new toggles
- [ ] Cron job checks `notify_payment_reminder` before sending Day 5 email
- [ ] Cron job checks `notify_payment_overdue` before sending Day 7 alert
- [ ] No TypeScript errors

**Final**
- [ ] Change 1 has its own commit, push, and Vibstr report — PATCH bump
- [ ] Change 2 has its own commit, push, and Vibstr report — PATCH bump
- [ ] Change 3 has its own commit, push, and Vibstr report — MINOR bump
- [ ] Change 4 has its own commit, push, and Vibstr report — PATCH bump
- [ ] Change 5 has its own commit, push, and Vibstr report — PATCH bump
- [ ] Commit messages follow format in CLAUDE.md
- [ ] Vibstr build report run after every commit per CLAUDE.md
