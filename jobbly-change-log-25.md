# jobbly-change-log-25.md
### Jobbly — Change Log 25

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are six changes in this session. Complete them in order. Each change gets its own commit, GitHub push, and Vibstr build report before moving to the next. Do not batch commits.

---

## Pre-Flight Check — Required Before Starting

1. **Read CLAUDE.md** — versioning rules, coding standards, and the Vibstr reporting command
2. **Read the current Prisma schema in full** — you are modifying `CustomerPaymentProfile`, `Lead`, and `Campaign` models
3. **Read the current `/users` page and user management components in full** — you are adding to the edit user modal and the users table
4. **Read the current lead detail page in full** — you are adding a button to the Actions card and a new upload modal
5. **Read the dashboard page component in full** — you are adding the sandbox toggle to the header
6. **Check for any existing quote upload logic** — search the codebase for `quote_url`, `validateQuotePdf`, and any R2 upload utilities. Read them in full. If they exist, extend them rather than duplicating.
7. **Read all email-sending utilities in full** — every place that calls Resend must be identified before Change 3. List them all before touching any.
8. **Read the job completion handler (`POST /api/jobs/[quoteNumber]/complete`) in full** — you are updating the payment profile lookup in Change 1 and adding payment suppression in Change 3
9. **Read all lead-fetching API routes** — identify every Prisma lead query across the codebase. List them all before touching any. You will be adding `is_test: false` filters to all non-admin queries in Change 3.
10. **Read the client Settings page component in full** — you are rebuilding the Customer Payment Platform section and removing the B2B Invoicing card in Change 4. Do not touch the admin Settings page.
11. **Confirm `ANTHROPIC_API_KEY` is present in Vercel environment variables** — required for AI validation in Change 2
12. **Read the customer portal page (`/portal/[token]`) and `createCustomerPaymentCheckout.ts` in full** — you are modifying both in Change 6
13. **Sync production database before starting:**

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports anything other than "already in sync" — stop and tell Oli what changed before proceeding.

Only after all thirteen checks pass — begin building in the order listed below.

---

## Change 1 — Active Invoicing Account Per Client User

### Context

Currently, `CustomerPaymentProfile` is unique per campaign — there is one payment profile and whoever configures it last is the one that fires. This causes a problem when multiple client users exist for the same campaign: Oli's test account credentials and the real client's credentials can overwrite each other, and there is no way to control which one is used.

This change restructures the payment profile to be per-user rather than per-campaign, adds an "active" flag to designate which client user's credentials the system uses for payment, and surfaces that control in the admin User Management UI.

This is a **MINOR bump**.

---

### Step 1 — Update the Prisma schema

Modify `CustomerPaymentProfile` — remove the `@unique` constraint from `campaign_id` and add two new fields:

```prisma
model CustomerPaymentProfile {
  id          String    @id @default(cuid())
  campaign_id String                          // no longer @unique
  user_id     String?                         // which client user owns this profile
  is_active   Boolean   @default(false)       // only one per campaign can be true at any time

  // ... all existing fields remain unchanged

  campaign    Campaign  @relation(fields: [campaign_id], references: [id])
  user        User?     @relation(fields: [user_id], references: [id])
}
```

Add reverse relation to the `User` model:

```prisma
model User {
  // ... existing fields
  customer_payment_profile  CustomerPaymentProfile?
}
```

Run migration then push to production:

```bash
npx prisma migrate dev --name add_active_invoicing_account
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

**Data migration for existing records:** Run this in the Supabase SQL editor to ensure existing profiles don't break:

```sql
UPDATE "CustomerPaymentProfile" SET is_active = true WHERE verified = true;
```

Confirm the number of rows affected before continuing.

---

### Step 2 — Update all payment profile lookups

Replace every `customerPaymentProfile.findUnique` lookup by `campaign_id` with `findFirst` and add the `is_active` filter:

```typescript
// Before
const profile = await prisma.customerPaymentProfile.findUnique({
  where: { campaign_id: lead.campaign_id },
});

// After
const profile = await prisma.customerPaymentProfile.findFirst({
  where: { campaign_id: lead.campaign_id, is_active: true, verified: true },
});
```

Search exhaustively — do not miss the webhook handler, cron job, portal payment endpoint, or job completion handler.

---

### Step 3 — Update the CustomerPaymentProfile connection flow

In both the Stripe verify endpoint (`POST /api/customer-payment/stripe/verify`) and the MYOB callback (`GET /api/myob/callback`), include `user_id: session.user.id` when upserting the profile.

When a client connects a platform, only set `is_active = true` automatically if no other active profile already exists for the campaign — otherwise leave `is_active` untouched so the admin controls it:

```typescript
const existingActive = await prisma.customerPaymentProfile.findFirst({
  where: { campaign_id, is_active: true },
});
const shouldSetActive = !existingActive;

await prisma.customerPaymentProfile.upsert({
  where: { /* existing key */ },
  create: { campaign_id, user_id, is_active: shouldSetActive, /* ...other fields */ },
  update: { user_id, /* ...other fields — do not touch is_active on update */ },
});
```

---

### Step 4 — Active invoicing toggle in the edit user modal

In the edit user modal on `/users`, add a section below existing fields — visible only for CLIENT role users:

```
Invoicing

[ toggle ] Active invoicing account
           This client's payment credentials will be used for all invoicing on this campaign.
```

Green toggle when on, grey when off. If the user has no `CustomerPaymentProfile` yet, the toggle is visible but disabled with a note: `This user has not connected a payment platform yet.`

Only one CLIENT user per campaign can have this on at a time — enforced server-side, not just UI.

---

### Step 5 — API endpoint

Create `PATCH /api/users/[userId]/active-invoicing` (ADMIN only):

```typescript
// Body: { active: boolean }
// If active true:  set is_active = true on this user's profile,
//                 set is_active = false on all other profiles for same campaign
//                 return 400 if user has no profile
// If active false: set is_active = false, warn if no active profile remains
// Response: { success: true } | { success: true, warning: "..." } | { success: false, error: "..." }
```

---

### Step 6 — Active badge on the Users table

Add an **Active** badge (solid green, text only) next to the name of whichever CLIENT user has `is_active = true` on their payment profile. Badge appears for CLIENT role users only — never for Admin or Subcontractor.

---

### Step 7 — Verify

- [ ] Migration applied in dev and production
- [ ] SQL update run — existing verified profiles set to `is_active = true`
- [ ] Payment flow works end-to-end using the active profile
- [ ] Toggling active on User A deactivates all others in same campaign (server-side)
- [ ] Toggle disabled with note if no payment platform connected
- [ ] Active badge correct on Users table, CLIENT role only
- [ ] No TypeScript errors

---

### Build order for Change 1

1. Update `CustomerPaymentProfile` schema — remove `@unique`, add `user_id` and `is_active`
2. Add reverse relation to `User`
3. Run dev migration, push to production
4. Run SQL update in Supabase — confirm rows affected
5. Update all payment profile lookups to `findFirst` with `is_active: true`
6. Update Stripe verify and MYOB callback to include `user_id`
7. Create `PATCH /api/users/[userId]/active-invoicing`
8. Add active invoicing toggle to edit user modal (CLIENT only)
9. Add Active badge to Users table
10. `npx tsc --noEmit`
11. MINOR version bump
12. Commit: `vX.X.0 — active invoicing account per client user`
13. Push + Vibstr report

---

## Change 2 — Quote Upload on Lead Detail Page

### Context

Admin and subcontractor users need to upload a quote PDF from the lead detail page. The file is AI-validated against the lead's property address and quote number. High-confidence mismatches show an error with override options. File is stored in R2 and shown as a download link to all users.

This is a **MINOR bump**.

---

### Step 1 — Schema update

Check whether these fields already exist on `Lead` before adding:

```prisma
model Lead {
  // ... existing fields
  quote_url                    String?
  quote_uploaded_at            DateTime?
  quote_uploaded_by            String?
  quote_validation_overridden  Boolean?  @default(false)
}
```

Run migration and push to production:

```bash
npx prisma migrate dev --name add_quote_upload_fields
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

---

### Step 2 — Upload API endpoint

Create `POST /api/leads/[quoteNumber]/upload-quote` (ADMIN and SUBCONTRACTOR only):

- Accept `multipart/form-data`, single `file` field. Types: PDF, JPEG, PNG. Max 10MB.
- Upload to R2 first: `quotes/{quoteNumber}/{timestamp}-{originalFilename}`
- Fetch lead, confirm it exists and belongs to the user's campaign
- Run AI validation (Step 3)
- If valid or low confidence or override flag present — save and return success
- If mismatch and high confidence — return 422 with mismatch data, keep the R2 file
- On success: update lead with `quote_url`, `quote_uploaded_at`, `quote_uploaded_by`
- If override: also set `quote_validation_overridden = true`
- If Anthropic call fails: log it, treat as low confidence, proceed

**Error responses:**
```typescript
{ success: false, error: 'invalid_file' }
{ success: false, error: 'quote_mismatch', extracted_address, extracted_quote_number, expected_address, expected_quote_number }
{ success: false, error: 'lead_not_found' }
{ success: true, quote_url: string }
```

---

### Step 3 — AI validation

Check for existing `validateQuotePdf` — extend it if found, create `/lib/validateQuotePdf.ts` if not.

Prompt:

```
You are a document validator. Extract the property address and quote/reference number from the attached document.

Compare them to:
- Expected property address: [property_address]
- Expected quote number: [quote_number]

Return ONLY a valid JSON object:
{
  "valid": true or false,
  "confidence": "high" or "low",
  "mismatch_reason": null or plain-English description,
  "extracted_address": string or null,
  "extracted_quote_number": string or null
}

Rules:
- valid is true if BOTH fields are a reasonable match (allow minor formatting differences)
- valid is false only if address OR quote number clearly differs
- confidence is "low" if document is unclear or fields cannot be found — default valid to true
- Return raw JSON only, no backticks or preamble
```

Normalise quote numbers before comparing:
```typescript
function normaliseQuoteNumber(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
```

Block only when: `valid === false` AND `confidence === "high"` AND no override flag.

---

### Step 4 — Upload Quote button in the Actions card

Add **Upload Quote** as a second button inside the Actions card, inline next to existing buttons. Two buttons side by side — nothing more, no extra wrappers.

| Role | Visible | Usable |
|---|---|---|
| ADMIN | All statuses | Yes |
| SUBCONTRACTOR | All statuses | Yes |
| CLIENT | Never | Never |

Label changes to **Replace Quote** if a quote is already uploaded.

---

### Step 5 — Upload modal

Modal title: **Upload Quote**

**Idle:** Dashed drag-and-drop zone, styled Choose File button (hidden native input), disabled Upload button until file selected.

**Uploading:** Spinner + "Uploading and checking your quote..."

**Success:** "Quote uploaded successfully." Auto-close after 1.5s.

**Mismatch error:**
```
Quote details don't match

The document appears to reference:
Address: "[extracted_address]"
Quote number: "[extracted_quote_number]"

Expected:
Address: [property_address]
Quote number: [quote_number]

[ Try Again ]  [ Upload Anyway ]
```
Try Again clears and returns to idle. Upload Anyway re-submits with `overrideValidation: true` — styled as secondary/outline.

**Generic error:** "Something went wrong. Please try again." + Try Again button.

---

### Step 6 — Quote download link

After upload, show a download link to all roles below the Actions card or in a Documents section:

```
Quote
[ Download quote ]  ← opens quote_url in new tab
```

If `quote_validation_overridden` is true, show an amber "Validation overridden" label below — Admin only.

---

### Step 7 — Verify

- [ ] Migration applied in dev and production
- [ ] Upload Quote button correct per role and status
- [ ] File validation rejects invalid types/sizes
- [ ] File uploads to R2
- [ ] Matching file passes silently
- [ ] High confidence mismatch shows correct error state
- [ ] Try Again resets, Upload Anyway saves with override flag set
- [ ] AI failure does not block upload
- [ ] Download link visible to all roles
- [ ] Validation overridden label Admin-only
- [ ] Replace Quote label after first upload
- [ ] No TypeScript errors

---

### Build order for Change 2

1. Check for existing quote upload code — extend if found
2. Add quote fields to Lead schema, migrate, push
3. Create or update `/lib/validateQuotePdf.ts`
4. Create `POST /api/leads/[quoteNumber]/upload-quote`
5. Add Upload Quote button to Actions card
6. Build upload modal — all states
7. Add download link and validation overridden label
8. `npx tsc --noEmit`
9. MINOR version bump
10. Commit: `vX.X.0 — quote upload with AI validation on lead detail page`
11. Push + Vibstr report

---

## Change 3 — Sandbox Mode

### Context

Oli needs to test the full lead workflow without triggering real emails or payments. A sandbox toggle on the dashboard generates a single fake test lead visible only to the admin. All emails from that lead redirect to oli@omnisideai.com with a [SANDBOX] subject prefix. All payment creation is suppressed. Real leads are completely unaffected. CLIENT and SUBCONTRACTOR users never see the test lead.

This is a **MINOR bump**.

---

### Step 1 — Schema changes

```prisma
model Lead {
  // ... existing fields
  is_test  Boolean  @default(false)
}

model Campaign {
  // ... existing fields
  sandbox_active  Boolean  @default(false)
}
```

Run migration and push to production:

```bash
npx prisma migrate dev --name add_sandbox_mode
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

---

### Step 2 — Sandbox API endpoints

**`POST /api/sandbox/enable`** (ADMIN only):

1. Hard-delete any existing `is_test = true` lead for this campaign
2. Create a fresh test lead with `is_test = true`:
   - customer_name: "Test Customer"
   - customer_email: "test@example.com"
   - customer_phone: "021 000 0000"
   - property_address: "1 Test Street, Auckland 1010"
   - quote_number: auto-generated via normal utility
   - status: LEAD_RECEIVED
   - contractor_rate: 200.00 / customer_price: 250.00 / gross_markup: 50.00 / omniside_commission: 20.00 / client_margin: 30.00
   - notes: "This is a sandbox test lead. No real emails or payments will be processed."
3. Set `campaign.sandbox_active = true`
4. Return `{ success: true, lead: { quoteNumber } }`

**`POST /api/sandbox/disable`** (ADMIN only):

1. Hard-delete any `is_test = true` lead for this campaign
2. Set `campaign.sandbox_active = false`
3. Return `{ success: true }`

---

### Step 3 — Filter test leads from non-admin queries

Search for every `prisma.lead.findMany`, `findFirst`, `findUnique` in the codebase. List them all before modifying any. For every query running in CLIENT or SUBCONTRACTOR context, add `is_test: false` to the where clause.

Covers: lead list, lead detail, job queue, commission, financials, notifications, audit log joins, cron jobs, webhooks. ADMIN queries do not need this filter.

---

### Step 4 — Email redirect

At every Resend call site, check `lead.is_test`. If true:

```typescript
const recipients = lead.is_test ? ['oli@omnisideai.com'] : [actualEmail];
const subject = lead.is_test ? `[SANDBOX] ${normalSubject}` : normalSubject;
```

Apply to all `to`, `cc`, and `bcc` fields. If a centralised email helper exists, add the check there.

---

### Step 5 — Payment suppression

In `POST /api/jobs/[quoteNumber]/complete`, after fetching the lead:

```typescript
if (lead.is_test) {
  console.log(`[Sandbox] Payment suppressed for test lead ${lead.quote_number}`);
  // Skip all Stripe, MYOB, and invoice creation
  // Status update, audit log, and other non-payment side effects still run
}
```

Add `is_test: false` to any cron or MYOB polling queries too.

---

### Step 6 — Dashboard sandbox toggle UI

Add a **Sandbox** toggle to the dashboard header, **left of "+ Add Lead Manually"**. Plain text label, no icon, no emoji. Green when on, grey when off. Initial state read server-side from `campaign.sandbox_active`.

**Toggle ON:** Call `POST /api/sandbox/enable`, refresh lead list, show amber banner:

```
Sandbox mode is on. A test lead has been added. Emails are redirected to oli@omnisideai.com. Payments are suppressed. No other users are affected.
```

Banner is dismissible (×) but reappears on page reload while sandbox is active.

**Toggle OFF:** Show inline confirmation first — not a full modal:

```
Turn off sandbox? The test lead will be removed.
[ Cancel ]  [ Turn off ]
```

On confirm: call `POST /api/sandbox/disable`, refresh lead list, dismiss banner.

**Loading state:** Disable toggle and show spinner while API call is in flight. Prevent double-clicks.

---

### Step 7 — Test lead UI

In the admin lead table, add a **TEST** badge (amber, text only) to the test lead row — same position as status badges.

On the test lead detail page, show a banner at the top (admin only):

```
TEST LEAD — This is a sandbox lead. Emails are redirected. Payments are suppressed.
```

All buttons and status transitions work normally on the test lead — only payment creation and real email delivery are suppressed.

---

### Step 8 — Verify

- [ ] Migration applied in dev and production
- [ ] Toggle ON: fresh test lead at LEAD_RECEIVED, correct pre-filled data
- [ ] Toggle ON again: old test lead deleted, new one created
- [ ] Toggle OFF: test lead deleted, dashboard normal
- [ ] CLIENT — test lead never visible in any view
- [ ] SUBCONTRACTOR — test lead never in job queue
- [ ] All non-admin lead queries have `is_test: false` — none missed
- [ ] All emails from test lead go to oli@omnisideai.com with [SANDBOX] prefix
- [ ] No real recipients receive anything from a test lead
- [ ] Payment creation fully suppressed on test lead
- [ ] Real leads while sandbox on: processed and emailed normally
- [ ] Admin can move test lead through full pipeline
- [ ] TEST badge on test lead row in dashboard
- [ ] TEST banner on test lead detail page (admin only)
- [ ] Amber banner on dashboard while sandbox active
- [ ] Toggle reflects correct state on page reload
- [ ] Inline confirmation before disabling
- [ ] No TypeScript errors

---

### Build order for Change 3

1. List all Resend call sites and all Prisma lead queries before touching any
2. Add `is_test` to Lead and `sandbox_active` to Campaign
3. Run dev migration, push to production
4. Create `POST /api/sandbox/enable`
5. Create `POST /api/sandbox/disable`
6. Add `is_test: false` to all non-admin lead queries
7. Add email redirect at every Resend call site — [SANDBOX] prefix
8. Add payment suppression in job completion handler
9. Add `is_test: false` to cron/MYOB polling
10. Add sandbox toggle to dashboard header
11. Add amber banner
12. Add inline confirmation for toggle OFF
13. Add TEST badge to lead table row
14. Add TEST banner to lead detail page (admin only)
15. `npx tsc --noEmit`
16. MINOR version bump
17. Commit: `vX.X.0 — sandbox mode with test lead, email redirect, payment suppression`
18. Push + Vibstr report

---

## Full Build Checklist

**Pre-flight**
- [ ] CLAUDE.md read in full
- [ ] Prisma schema read in full
- [ ] `/users` page and edit modal read in full
- [ ] Lead detail page read in full
- [ ] Dashboard page component read in full
- [ ] All Resend email call sites identified and listed
- [ ] All Prisma lead queries identified and listed
- [ ] Existing quote upload logic checked
- [ ] `ANTHROPIC_API_KEY` confirmed in Vercel env
- [ ] `POST /api/jobs/[quoteNumber]/complete` read in full
- [ ] Production DB confirmed in sync

**Change 1**
- [ ] `CustomerPaymentProfile` `@unique` removed from `campaign_id`
- [ ] `user_id` and `is_active` added
- [ ] Reverse relation on `User`
- [ ] Migration applied in dev and production
- [ ] SQL update run — existing verified profiles set to `is_active = true`
- [ ] All payment profile lookups updated to `findFirst` with `is_active: true`
- [ ] Stripe verify and MYOB callback include `user_id`
- [ ] `PATCH /api/users/[userId]/active-invoicing` built
- [ ] Invoicing toggle in edit modal (CLIENT only), disabled if no profile
- [ ] Setting active on one user deactivates others (server-side)
- [ ] Active badge on Users table (CLIENT only)
- [ ] No TypeScript errors

**Change 2**
- [ ] Quote fields added to Lead model
- [ ] Migration applied in dev and production
- [ ] `validateQuotePdf` checks address and quote number
- [ ] Upload endpoint saves to R2 before AI call
- [ ] 422 returned with mismatch data on high-confidence mismatch
- [ ] R2 file kept on mismatch
- [ ] Override flag bypasses validation
- [ ] AI failure does not block upload
- [ ] Upload Quote button — Admin and Subcontractor only, all statuses
- [ ] Replace Quote label after first upload
- [ ] All modal states implemented
- [ ] Upload Anyway styled secondary
- [ ] Download link visible to all roles
- [ ] Validation overridden label Admin-only
- [ ] No TypeScript errors

**Change 3**
- [ ] `is_test` on Lead, `sandbox_active` on Campaign
- [ ] Migration applied in dev and production
- [ ] `POST /api/sandbox/enable` — fresh test lead, sandbox_active = true
- [ ] `POST /api/sandbox/disable` — test lead deleted, sandbox_active = false
- [ ] Both endpoints ADMIN only
- [ ] `is_test: false` on all non-admin queries — none missed
- [ ] Email redirect to oli@omnisideai.com with [SANDBOX] prefix — all to/cc/bcc
- [ ] Payment suppressed in job completion handler
- [ ] Cron/MYOB polling excludes test leads
- [ ] Sandbox toggle in dashboard header, left of "+ Add Lead Manually"
- [ ] Green/grey toggle, loading state, no double-clicks
- [ ] Amber banner while sandbox active, dismissible, returns on reload
- [ ] Inline confirmation before disabling
- [ ] TEST badge on test lead row
- [ ] TEST banner on test lead detail page (admin only)
- [ ] Real leads unaffected while sandbox on
- [ ] CLIENT and SUBCONTRACTOR see zero test leads
- [ ] No TypeScript errors

**Change 4**
- [ ] Client Settings page read in full before touching anything
- [ ] Admin Settings page untouched
- [ ] Subcontractor untouched
- [ ] Stripe B2B Invoicing card removed from client Settings page
- [ ] Customer Payment Platform section rebuilt to match admin card style
- [ ] Stripe option — fully functional, connected state shows correctly
- [ ] Connected state shows email, verified date, and Disconnect button
- [ ] MYOB option — Coming soon, setup instructions expandable, connect button absent
- [ ] Xero option — Coming soon, setup instructions expandable, connect button absent
- [ ] Stripe setup instructions expandable with correct credentials listed
- [ ] Stripe backend connection logic untouched — UI reskin only
- [ ] No TypeScript errors

**Change 5**
- [ ] `/profile` page read in full before touching
- [ ] Role row removed for SUBCONTRACTOR only
- [ ] Campaign row removed for SUBCONTRACTOR only
- [ ] Admin and client profile views unchanged
- [ ] No TypeScript errors

**Change 6**
- [ ] Customer portal page read in full before touching
- [ ] `createCustomerPaymentCheckout.ts` read in full before touching
- [ ] `customer_payment_method` field added to Lead model
- [ ] Migration applied in dev and production
- [ ] `createCustomerPaymentCheckout` handles card (with surcharge) and bank transfer (no surcharge) separately
- [ ] Portal checkout endpoint validates `paymentMethod` and saves it on lead
- [ ] Two-card payment choice UI on portal page — side by side desktop, stacked mobile
- [ ] Correct totals displayed for each option before customer clicks
- [ ] Loading state and double-click prevention implemented
- [ ] nz_bank_account failure caught — does not break card flow
- [ ] No other flows affected
- [ ] No TypeScript errors

---

## Change 4 — Rebuild Client Settings Page — Customer Payment Platform

### Context

The client Settings page currently has two separate sections: a Customer Payment Platform selector and a Stripe B2B Invoicing card. The B2B Invoicing card is being removed entirely — it was for Omniside invoicing Continuous Group as a business, which is no longer the model. The Customer Payment Platform section is being rebuilt to match the clean card style of the admin Settings page, with three platform options (Stripe, MYOB, Xero), proper connected state UI, and expandable setup instructions for each platform.

**This change touches the client Settings page only. The admin Settings page and subcontractor views are not modified in any way.**

This is a **MINOR bump**.

---

### Step 1 — Read the client Settings page in full

Before writing a single line of code, read the entire client Settings page component. Understand the current structure — what sections exist, what components are used, how the Stripe connection state is fetched and displayed. Do not begin building until this is complete.

---

### Step 2 — Remove the Stripe B2B Invoicing card

Find the card or section on the client Settings page labelled "Stripe — B2B Invoicing" (or similar). Remove it entirely, including any sub-components, API calls, or state that exist solely to support it.

Do not remove the Customer Payment Platform section — only the B2B card.

---

### Step 3 — Rebuild the Customer Payment Platform section

Replace the existing Customer Payment Platform UI with a new section that matches the visual style and layout of the admin Invoicing card (as seen in the reference screenshots). The section heading is **Customer Payment Platform**.

**Three platform options displayed as selectable cards:**

**Stripe** — active and selectable. When selected, shows the Stripe connection UI below (Step 4).

**MYOB** — "Coming soon" label. Non-interactive — cannot be selected or connected. When clicked, nothing happens. The platform card is visually present but greyed out or muted to indicate it is not yet available.

**Xero** — identical treatment to MYOB. "Coming soon", non-interactive.

The selected platform (Stripe, while it is the only live one) is indicated with the same selected state style as the admin card — highlighted border and radio indicator.

---

### Step 4 — Stripe connected state and setup instructions

When Stripe is selected (it will always be selected as the only live platform), show the Stripe connection UI below the platform selector. This UI has two states:

**Connected state:**
```
Stripe Connection

• Connected    [billing email address]
Verified [date]

[ Disconnect Stripe ]
```

- Green dot + "Connected" badge
- Email address used to verify the Stripe account
- Verified date formatted as "Verified 12 April 2026"
- Disconnect button — triggers the existing disconnect flow with a confirmation dialog

**Not connected state:**
```
Stripe Connection

[ Connect Stripe ]

How to set this up  ▼
  ↳ Expandable instructions:
     1. Log in to your Stripe account at stripe.com
     2. Go to Developers → API Keys
     3. Copy your Secret Key (starts with sk_live_...)
     4. Paste it in the field below and click Connect

Secret Key
[ sk_live_...                              ]
[ Connect Stripe ]

Webhook Signing Secret
So Jobbly can confirm when customers have paid, register the
Jobbly webhook URL in Stripe and paste the signing secret here.

How to set this up — takes 2 minutes  ▼
  ↳ Expandable instructions:
     1. In Stripe, go to Developers → Webhooks
     2. Click "Add endpoint"
     3. Enter this URL: [NEXT_PUBLIC_APP_URL]/api/webhooks/stripe
     4. Select the event: checkout.session.completed
     5. Copy the Signing Secret (starts with whsec_...)
     6. Paste it below and click Save

[ whsec_...                                ]
[ Save Webhook Secret ]
```

The Stripe backend connection logic is unchanged — this is a UI reskin only. Reuse the existing API endpoints for connecting, disconnecting, and saving the webhook secret.

---

### Step 5 — MYOB setup instructions (coming soon)

When the MYOB card is shown (non-interactive, coming soon), display an expandable "How to set this up" section below it so the client can read and prepare in advance:

```
MYOB Business  — Coming soon

How to set this up  ▼
  ↳ When MYOB is available, you will need:
     • Your MYOB API Client ID and Client Secret
       (found in my.myob.com → Developer → Apps)
     • Access to your MYOB company file
     Jobbly will guide you through the connection
     process when MYOB support launches.
```

The expand/collapse works normally. No connect button, no input fields — read-only information only.

---

### Step 6 — Xero setup instructions (coming soon)

Identical treatment to MYOB:

```
Xero  — Coming soon

How to set this up  ▼
  ↳ When Xero is available, you will need:
     • A Xero account with invoicing enabled
     • To authorise Jobbly via Xero's OAuth connection
       (no manual API keys required — Jobbly will
       redirect you to Xero to approve access)
     Jobbly will guide you through the connection
     process when Xero support launches.
```

---

### Step 7 — Verify

- [ ] Admin Settings page is completely unchanged — verify visually after building
- [ ] Stripe B2B Invoicing card is gone from client Settings page
- [ ] Customer Payment Platform section matches admin card visual style
- [ ] Stripe shows as selected with highlighted card style
- [ ] MYOB and Xero show as Coming soon, non-interactive
- [ ] Clicking MYOB or Xero does nothing
- [ ] Stripe connected state shows: green badge, email, verified date, Disconnect button
- [ ] Stripe not-connected state shows: Secret Key input, Connect button, webhook section
- [ ] Disconnect button triggers confirmation dialog before disconnecting
- [ ] MYOB expandable setup instructions are visible and readable
- [ ] Xero expandable setup instructions are visible and readable
- [ ] Stripe backend connection logic is unchanged — existing endpoints still used
- [ ] No TypeScript errors

---

### Build order for Change 4

1. Read client Settings page component in full — understand all current sections and state
2. Remove Stripe B2B Invoicing card and any components/API calls used only by it
3. Rebuild Customer Payment Platform section with three platform cards (Stripe, MYOB, Xero)
4. Build Stripe connected state — email, verified date, Disconnect button
5. Build Stripe not-connected state — Secret Key input, Connect, webhook section
6. Add MYOB expandable coming soon instructions
7. Add Xero expandable coming soon instructions
8. Verify admin Settings page is visually unchanged
9. Run `npx tsc --noEmit` — confirm no TypeScript errors
10. Apply MINOR version bump in `package.json`
11. Commit: `vX.X.0 — rebuild client settings payment platform UI, remove B2B invoicing card`
12. Push to GitHub: `git push origin main`
13. Run Vibstr build report per CLAUDE.md

---

## Change 5 — Remove Role and Campaign from Subcontractor Profile Page

### Context

The subcontractor profile page currently shows four fields in the Account Details card: Full name, Email, Role, and Campaign. The subcontractor does not need to see their role or campaign — those are internal details. Only Full name and Email should remain visible.

**This change touches the SUBCONTRACTOR profile view only. Admin and client profile views are not modified.**

This is a **PATCH bump**.

---

### Step 1 — Update the profile page

Find the Account Details card on the `/profile` page. For the SUBCONTRACTOR role, remove the **Role** and **Campaign** rows. Only these two rows should remain visible to a subcontractor:

- Full name
- Email

Admin and client profile views are unchanged — if they show Role and Campaign, leave them exactly as they are.

---

### Step 2 — Verify

- [ ] Subcontractor profile shows Full name and Email only
- [ ] Role row not visible to subcontractor
- [ ] Campaign row not visible to subcontractor
- [ ] Admin profile view unchanged
- [ ] Client profile view unchanged
- [ ] No TypeScript errors

---

### Build order for Change 5

1. Read `/profile` page component in full
2. Remove Role and Campaign rows for SUBCONTRACTOR role only
3. Run `npx tsc --noEmit` — confirm no TypeScript errors
4. Apply PATCH version bump in `package.json`
5. Commit: `vX.X.X — remove role and campaign from subcontractor profile`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Change 6 — Card Surcharge + Bank Transfer Payment Choice on Customer Portal

### Context

Customer invoices currently only offer card payment via a single Stripe Checkout Session. This change adds a payment method choice screen on the Jobbly customer portal page — before the customer reaches Stripe — where they can choose to pay by card (with a 2.65% surcharge clearly shown) or by bank transfer (free). Each option creates a separate Stripe Checkout Session with the correct amount and payment method. The choice and the amounts are displayed clearly upfront so customers know exactly what they will pay before clicking through.

This change only affects the customer-facing portal page and the Checkout Session creation logic. No other flows are touched — not the B2B invoicing, not the admin flow, not the subcontractor flow.

This is a **MINOR bump**.

---

### Step 1 — Read the customer portal page in full

Before writing any code, read the customer portal page (`/portal/[token]`) in full. Understand how the current "Pay Invoice" button works, how the Checkout Session is created, and what state the page currently holds. Do not begin building until this is complete.

Also read `createCustomerPaymentCheckout.ts` (or equivalent) in full — you are modifying this function.

---

### Step 2 — Update the Checkout Session creation utility

In `createCustomerPaymentCheckout.ts` (or wherever the Stripe Checkout Session is created for customer payments), add a `paymentMethod` parameter that accepts either `'card'` or `'bank_transfer'`.

**For card payment:**
- Calculate the surcharge: `Math.round(amountInclGst * 0.0265 * 100)` (in cents)
- Add it to the base amount: total = base amount + surcharge
- Create the Checkout Session with `payment_method_types: ['card']` and the surcharge-inclusive total
- Single line item combining base + surcharge, or two line items if cleaner — Claude Code's judgement

**For bank transfer:**
- No surcharge — use the base `amountInclGst` amount as-is
- Create the Checkout Session with `payment_method_types: ['nz_bank_account']`
- Same amount, no surcharge added

```typescript
export async function createCustomerPaymentCheckout(params: {
  campaignId: string;
  quoteNumber: string;
  propertyAddress: string;
  customerEmail: string;
  amountInclGst: number;
  portalToken: string;
  paymentMethod: 'card' | 'bank_transfer'; // new parameter
}) {
  const { paymentMethod, amountInclGst, ...rest } = params;

  const surcharge = paymentMethod === 'card'
    ? Math.round(amountInclGst * 0.0265 * 100)
    : 0;

  const baseAmountCents = Math.round(amountInclGst * 100);
  const totalCents = baseAmountCents + surcharge;

  const paymentMethodTypes = paymentMethod === 'card'
    ? ['card']
    : ['nz_bank_account'];

  // ... rest of session creation using totalCents and paymentMethodTypes
}
```

If `nz_bank_account` is not available on the connected Stripe account (i.e. the session creation throws an error for that payment method type), catch the error, log it clearly, and fall back to card-only. Do not let a bank transfer configuration error break the entire payment flow.

---

### Step 3 — Update the portal API endpoint

Find the API endpoint that creates the Checkout Session for the portal (e.g. `POST /api/portal/[token]/create-checkout` or equivalent).

Add a `paymentMethod` field to the request body — accepted values: `'card'` or `'bank_transfer'`. Validate it server-side — reject with 400 if any other value is passed.

Pass `paymentMethod` through to `createCustomerPaymentCheckout`.

Store which method was chosen on the lead record for reference — add an optional field:

```prisma
model Lead {
  // ... existing fields
  customer_payment_method  String?  // 'card' | 'bank_transfer' — set when checkout is created
}
```

Run migration:

```bash
npx prisma migrate dev --name add_customer_payment_method
```

Push to production:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

---

### Step 4 — Replace the "Pay Invoice" button with a payment choice UI on the portal page

On the customer portal page, find where the "Pay Invoice" button currently lives. Replace it with a two-option payment choice layout.

**UI — payment choice section:**

```
How would you like to pay?

┌─────────────────────────────┐   ┌─────────────────────────────┐
│       Pay by card           │   │   Pay by bank transfer      │
│                             │   │                             │
│   2.65% surcharge applies   │   │     Free — no fees          │
│                             │   │                             │
│   Total: $[surcharge total] │   │   Total: $[base amount]     │
│                             │   │                             │
│   [ Pay by card ]           │   │   [ Pay by bank transfer ]  │
└─────────────────────────────┘   └─────────────────────────────┘
```

- Both cards sit side by side on desktop, stacked on mobile
- Each card shows the payment method name, a one-line description, and the exact total the customer will pay
- Surcharge total is calculated client-side from the lead's `customer_price` × 1.15 (GST-inclusive) × 1.0265, rounded to 2 decimal places — display as NZD with $ sign
- Bank transfer total is the base `customer_price` × 1.15 (GST-inclusive), no surcharge
- Each card has its own clearly labelled button — "Pay by card" and "Pay by bank transfer"
- Clicking either button calls the portal checkout endpoint with the appropriate `paymentMethod` value, then redirects the customer to the returned Stripe Checkout URL

**Loading state:** When a button is clicked, disable both buttons and show a small spinner on the clicked button. Prevent double-clicks.

**If the lead already has a `stripe_customer_payment_url` or `stripe_checkout_url` set** (i.e. a session was already created): show the payment choice UI regardless — do not skip straight to an existing URL. The customer may want to choose a different method or the previous session may have expired.

---

### Step 5 — Verify

- [ ] Schema migration applied cleanly in dev and production
- [ ] Portal page shows two payment option cards side by side
- [ ] Card option shows correct surcharge-inclusive total
- [ ] Bank transfer option shows correct base total (no surcharge)
- [ ] Clicking "Pay by card" → Stripe Checkout with card only and surcharge-inclusive amount
- [ ] Clicking "Pay by bank transfer" → Stripe Checkout with nz_bank_account and base amount
- [ ] Both totals are correctly calculated and displayed in NZD
- [ ] Loading state fires correctly — both buttons disabled, spinner on clicked button
- [ ] Double-click prevented
- [ ] `customer_payment_method` saved on lead record after checkout session created
- [ ] If nz_bank_account fails on the Stripe account, error is caught and logged — card flow unaffected
- [ ] No other payment flows affected — B2B invoicing, admin flow, subcontractor flow all unchanged
- [ ] No TypeScript errors

---

### Build order for Change 6

1. Read customer portal page in full
2. Read `createCustomerPaymentCheckout.ts` in full
3. Add `customer_payment_method` field to Lead schema
4. Run dev migration, push to production
5. Update `createCustomerPaymentCheckout` to accept `paymentMethod` parameter — handle card surcharge and bank transfer separately
6. Update portal checkout API endpoint to accept and validate `paymentMethod`, pass it through, save it on the lead
7. Replace "Pay Invoice" button with two-card payment choice UI on portal page
8. Wire each button to call the checkout endpoint with the correct `paymentMethod` value
9. Add loading state and double-click prevention
10. Run `npx tsc --noEmit` — confirm no TypeScript errors
11. Apply MINOR version bump in `package.json`
12. Commit: `vX.X.0 — card surcharge and bank transfer payment choice on customer portal`
13. Push to GitHub: `git push origin main`
14. Run Vibstr build report per CLAUDE.md

