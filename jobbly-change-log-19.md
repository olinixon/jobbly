# Jobbly — Change Log 19
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Starter Prompt

Open the Jobbly project at `/Users/oliver/Claude Code/jobbly` and read this changelog in full before writing a single line of code. There are five changes in this session. Complete them in order. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

---

## Context

Five improvements following live testing. Changes 1 and 2 are UI only. Change 3 is a PATCH bump with an expiry check. Change 4 requires a database migration and a Stripe webhook handler. Change 5 adds the webhook secret setup UI to client Settings. Read all five changes before starting.

---

## Pre-Flight Check — Required Before Starting

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Read the current version**
Open `package.json` and note the current version. Changes 1, 2, and 3 are PATCH bumps. Changes 4 and 5 are MINOR bumps.

**3. Locate and read these files before starting**

- The customer portal page: `app/portal/[token]/page.tsx`
- The customer notification email template: `lib/buildCustomerNotificationEmail.ts`
- The client settings page: `app/client/settings/page.tsx`
- The BillingProfile model and AES-256 encrypt/decrypt utility (built in CL13)

**4. Sync production database**

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports any errors — stop and report to Oli before proceeding.

Only after all four checks pass — begin building in the order listed below.

---

## Change 1 — Portal Page Layout: Invoice and Job Report Side by Side

### Background

On the customer portal page (`/portal/[token]`), the invoice and job report cards currently stack vertically one on top of the other. They should sit side by side on desktop — two columns — with the "Pay Your Invoice" section sitting below both. On mobile they remain stacked. This makes better use of the space and presents both documents at the same level of importance.

This is a **PATCH bump**.

---

### What to change

**Desktop layout (md breakpoint and above):**

```
┌─────────────────────────────────────────────────┐
│  ✓ Your Gutter Clean Is Complete                │
│  [customer_name]  ·  [property_address]         │
└─────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│  📄 Invoice          │  │  📋 Job Report        │
│                      │  │                       │
│  [PDF iframe]        │  │  [PDF iframe]         │
│                      │  │                       │
│  [Download Invoice]  │  │  [Download Job Report]│
└──────────────────────┘  └──────────────────────┘

┌─────────────────────────────────────────────────┐
│  💳 Pay Your Invoice                            │
│  [Pay Invoice button / disabled state]          │
│  [helper text if disabled]                      │
└─────────────────────────────────────────────────┘
```

**Mobile layout (below md breakpoint):**
- Invoice card full width
- Job report card full width below it
- Pay Your Invoice section below that
- Unchanged from current behaviour

**Implementation:**
- Wrap the two document cards in a two-column CSS grid: `grid grid-cols-1 md:grid-cols-2 gap-6`
- Each card (invoice and job report) sits in one column of the grid
- The PDF iframes inside each card should be the same height — use a fixed height (e.g. `h-96` or `400px`) so both cards are equal height on desktop regardless of document length
- The "Pay Your Invoice" section sits outside and below the grid — full width, unchanged
- The header card ("Your Gutter Clean Is Complete") sits above the grid — full width, unchanged

**Do not change** any download links, iframe sources, button behaviour, or the disabled payment state — only the layout.

---

### Build order for Change 1

1. Locate the portal page component
2. Wrap invoice and job report cards in a two-column grid
3. Set equal iframe heights on both cards
4. Confirm Pay Your Invoice section is full width below the grid
5. Confirm mobile layout stacks correctly to single column
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply PATCH version bump in `package.json`
8. Commit: `v[version] — portal page layout: invoice and job report side by side`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 2 — Shorten and Clean Up Customer Notification Email

### Background

The customer notification email is currently too long — particularly the bullet point list explaining what the button does. This reads as cluttered on mobile. The email needs to be trimmed to its essentials: a warm greeting, confirmation the job is done, a reference to the attachments, a clear full-width button, a short trust line beneath it, and a brief sign-off. Everything else is removed.

This is a **PATCH bump**.

---

### What to change

In `lib/buildCustomerNotificationEmail.ts`, replace the current email HTML body with the following structure.

**Subject line:** unchanged — `Your gutter clean is complete — [property_address]`

**New email body:**

```
Hi [customer_name],

Your gutter clean at [property_address] is now complete. We hope 
everything went smoothly and you're happy with the service.

Your invoice and job report are attached to this email for your 
reference. You can also view them online and pay your invoice 
securely by clicking the button below.

[  View Job Report & Pay Invoice  ]   ← full-width button

Paid securely through Stripe.         ← small centred text, subdued

If you have any questions about the work carried out or your 
invoice, please don't hesitate to get in touch.

Thank you for choosing [client_company_name]. We look forward to 
helping you again in the future.

Warm regards,
The [client_company_name] Team
```

**Specific changes from current version:**
- Remove the bullet point list entirely ("Clicking the button takes you to a secure page where you can: ...")
- Button label changes from "View Documents & Pay Invoice" to "View Job Report & Pay Invoice"
- Button is full width — spans the full width of the email content area, not left-aligned
- Add one small centred line directly below the button: "Paid securely through Stripe." — subdued colour, small font size
- All other copy remains the same
- Sign-off ("Warm regards, The [client_company_name] Team") unchanged

**Button styling:**
- Full width: `width: 100%` on the button/anchor element
- Keep the existing button colour and style — just make it full width

**The "Paid securely through Stripe." line:**
- Centred below the button
- Small font (e.g. 12–13px)
- Subdued colour (light grey — same as the footer text style)
- No link — plain text only

---

### Build order for Change 2

1. Open `lib/buildCustomerNotificationEmail.ts`
2. Remove the bullet point list section from the HTML template
3. Update button label to "View Job Report & Pay Invoice"
4. Make button full width
5. Add "Paid securely through Stripe." line below button — centred, small, subdued
6. Confirm all other copy is unchanged
7. Run `npx tsc --noEmit` — confirm no TypeScript errors
8. Apply PATCH version bump in `package.json`
9. Commit: `v[version] — shorten customer email, full-width button, Stripe trust line`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — Portal page layout**
- [ ] Invoice and job report cards sit side by side on desktop (md and above)
- [ ] Both cards are equal height — fixed iframe height applied to both
- [ ] "Pay Your Invoice" section is full width below the two-column grid
- [ ] Header card ("Your Gutter Clean Is Complete") is full width above the grid
- [ ] Mobile layout: cards stack vertically — invoice first, job report below
- [ ] No changes to download links, iframe sources, button behaviour, or payment state
- [ ] No TypeScript errors

**Change 2 — Customer email cleanup**
- [ ] Bullet point list removed from email body
- [ ] Button label reads "View Job Report & Pay Invoice"
- [ ] Button is full width across the email content area
- [ ] "Paid securely through Stripe." line appears below button — centred, small, subdued
- [ ] Opening paragraph unchanged: greeting + address + hope it went smoothly
- [ ] Attachment reference paragraph unchanged
- [ ] "If you have any questions..." paragraph unchanged
- [ ] "Thank you for choosing [client_company_name]..." sign-off unchanged
- [ ] "Warm regards, The [client_company_name] Team" unchanged
- [ ] Subject line unchanged
- [ ] No TypeScript errors

**Change 3 — Portal link expiry**
- [ ] Portal links expire 90 days after `job_completed_at`
- [ ] Expired links show the expiry page — not a 404 or blank page
- [ ] Expiry page shows "This Link Has Expired" heading
- [ ] Expiry page shows auckland@continuous.co.nz as mailto link
- [ ] Expiry page shows continuous.co.nz/jobs as external link opening in new tab
- [ ] Expiry page shows Jobbly wordmark and footer — same shell as active portal
- [ ] No invoice, job report, or payment details shown on expiry page
- [ ] Active portal links (under 90 days) completely unaffected
- [ ] Invalid tokens still show existing "link invalid" error — separate from expiry
- [ ] If job_completed_at is null: link treated as active — no expiry applied
- [ ] No TypeScript errors

**Change 4 — Stripe webhook + payment indicator**
- [ ] DB migration complete — `customer_paid_at` and `stripe_payment_intent` exist in production
- [ ] `POST /api/portal/[token]/create-checkout` includes `client_reference_id: token`
- [ ] `/api/webhooks/stripe` added to public allowlist in `proxy.ts`
- [ ] `POST /api/webhooks/stripe` endpoint exists and is public
- [ ] Stripe webhook signature verified using `STRIPE_WEBHOOK_SECRET` — unverified requests return 400
- [ ] `checkout.session.completed` event updates lead: `customer_paid_at` and `stripe_payment_intent`
- [ ] Lead looked up via `client_reference_id` matching `customer_portal_token`
- [ ] Audit log row written: action = "Payment received via Stripe"
- [ ] All other Stripe event types return 200 and are ignored
- [ ] `STRIPE_WEBHOOK_SECRET` added to `.env.example`
- [ ] Setup comment added at top of webhook endpoint
- [ ] Admin lead detail shows ✅ Payment received + date when `customer_paid_at` is set
- [ ] Admin lead detail shows ⏳ Awaiting payment when portal token exists but not paid
- [ ] Admin lead detail shows nothing when no portal token exists
- [ ] Client lead detail shows payment status indicator — same two states
- [ ] Subcontractor job detail at JOB_COMPLETED shows payment status beneath download links
- [ ] Portal page checks `customer_paid_at` on load — shows permanent success state if paid
- [ ] Portal page no longer shows Pay Invoice button when `customer_paid_at` is set
- [ ] No TypeScript errors

---

## Change 5 — Client Webhook Secret Setup in Settings

### Background

The Stripe webhook secret is unique per client and per campaign — it cannot be hardcoded. Each client must register Jobbly's webhook URL in their own Stripe dashboard and paste the signing secret into Jobbly. This change adds a self-serve setup section to the client Settings page, stores the secret encrypted in the BillingProfile, and provides a one-click connection test so the client knows immediately whether it's working.

The webhook URL displayed in the setup guide must be dynamic — read from `NEXT_PUBLIC_APP_URL` so it automatically updates when the domain changes. Never hardcode the URL.

This is a **MINOR bump**.

---

### Step 1 — Database migration

Add one field to the `BillingProfile` model in `schema.prisma`:

```prisma
stripe_webhook_secret   String?   // AES-256 encrypted — same pattern as stripe_secret_key
```

Run the migration:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

Confirm the field exists in production before proceeding.

---

### Step 2 — Save webhook secret endpoint

Create `POST /api/settings/stripe/webhook-secret`:

```typescript
// Auth: CLIENT only (read role from session)
// Body: { webhook_secret: string }
// Validate: webhook_secret must be present and start with 'whsec_'
// If invalid: return 400 — "Webhook secret must start with whsec_"

// Encrypt the webhook_secret using the existing AES-256 encrypt utility
// Upsert the BillingProfile for this campaign + CLIENT role:
//   → Set stripe_webhook_secret to the encrypted value
// Return 200 on success
```

---

### Step 3 — Test connection endpoint

Create `POST /api/settings/stripe/test-webhook`:

```typescript
// Auth: CLIENT only
// No body required

// Look up the CLIENT BillingProfile for session.campaignId
// If not found or stripe_webhook_secret is null: return 400 —
//   "No webhook secret saved. Please complete the setup first."

// Decrypt the stripe_webhook_secret
// Decrypt the stripe_secret_key (existing field)

// Use the Stripe SDK to retrieve webhook endpoints for this account:
const stripe = new Stripe(decryptedSecretKey);
const webhooks = await stripe.webhookEndpoints.list();

// Find the endpoint whose URL matches NEXT_PUBLIC_APP_URL + '/api/webhooks/stripe'
// If found: verify the secret matches by attempting constructEvent on a dummy payload
//   → If verification passes: return 200 { status: 'connected' }
//   → If verification fails: return 200 { status: 'secret_mismatch' }
// If not found: return 200 { status: 'endpoint_not_registered' }

// Note: Stripe does not expose the raw signing secret via API after creation —
// verification is done by attempting to use it, not by comparing values directly.
// A simpler and reliable approach: just confirm the secret decrypts without error
// and starts with 'whsec_' — then return connected. The real test happens when
// the first live payment fires.
// Use this simpler approach: decrypt → validate format → return { status: 'connected' }
```

---

### Step 4 — Add the webhook setup section to client Settings

In the client settings page (`app/client/settings/page.tsx`), below the existing Stripe Connection section, add a new section: **"Webhook Setup"**.

**UI spec:**

```
Webhook Setup
─────────────────────────────────────────────────────

So Jobbly can confirm when customers have paid, register
your webhook URL in Stripe and paste the signing secret below.

How to set this up — takes 2 minutes         [▼ expand]
────────────────────────────────────────────────────

  Step 1  In your Stripe dashboard, go to Developers → Webhooks

  Step 2  Click "Add endpoint"

  Step 3  Paste this URL:
          https://[NEXT_PUBLIC_APP_URL]/api/webhooks/stripe
          [Copy URL]  ← one-click copy button

  Step 4  Under "Select events", choose:
          checkout.session.completed

  Step 5  Click "Add endpoint", then copy the Signing Secret shown

  Step 6  Paste it in the field below and click Save

────────────────────────────────────────────────────

Webhook Signing Secret
[whsec_________________________]

[  Save Webhook Secret  ]

─────────────────────────────────────────────────────

WHEN secret is saved — show test button:

[  Test Connection  ]

AFTER test — show result:
  ✅  Connected — Jobbly will be notified when customers pay
  ❌  Could not verify — please check the secret and try again
```

**Behaviour details:**
- The "How to set this up" guide is collapsible — collapsed by default, expanded on first visit or if no secret is saved yet
- The webhook URL in Step 3 reads from `process.env.NEXT_PUBLIC_APP_URL` — never hardcoded
- "Copy URL" button copies the full webhook URL to clipboard, briefly shows "Copied ✓"
- The signing secret input: placeholder text `whsec_...`, type `password` so the value is masked
- "Save Webhook Secret" calls `POST /api/settings/stripe/webhook-secret`
- On save success: show inline "Saved ✓" confirmation, reveal the "Test Connection" button
- "Test Connection" calls `POST /api/settings/stripe/test-webhook`
- During test: show loading state on the button — "Testing..."
- On `connected`: show ✅ Connected message
- On any failure: show ❌ message with the specific reason
- The test result persists until the user saves a new secret or refreshes

**This section only appears if the client's Stripe connection is already verified** (i.e. `stripe_verified: true` on their BillingProfile). If they haven't connected Stripe yet, this section is hidden with a note: "Complete your Stripe connection above before setting up webhooks."

---

### Build order for Change 5

1. Run DB migration — confirm `stripe_webhook_secret` exists on BillingProfile in production
2. Build `POST /api/settings/stripe/webhook-secret` endpoint
3. Build `POST /api/settings/stripe/test-webhook` endpoint
4. Add Webhook Setup section to client settings page
5. Confirm webhook URL in the guide reads from `NEXT_PUBLIC_APP_URL` — not hardcoded
6. Confirm "Copy URL" button works correctly
7. Confirm section hidden when Stripe not yet connected
8. Run `npx tsc --noEmit` — confirm no TypeScript errors
9. Apply MINOR version bump in `package.json`
10. Commit: `v[version] — client webhook secret setup, test connection, dynamic webhook URL`
11. Push to GitHub: `git push origin main`
12. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 5 — Client webhook secret setup**
- [ ] DB migration complete — `stripe_webhook_secret` exists on BillingProfile in production
- [ ] `POST /api/settings/stripe/webhook-secret` endpoint exists — CLIENT only
- [ ] Endpoint validates secret starts with `whsec_` — returns 400 if not
- [ ] Secret encrypted with AES-256 before saving — same pattern as stripe_secret_key
- [ ] `POST /api/settings/stripe/test-webhook` endpoint exists — CLIENT only
- [ ] Test endpoint returns `{ status: 'connected' }` when secret decrypts and validates correctly
- [ ] Test endpoint returns clear error when no secret is saved
- [ ] Webhook Setup section appears on client settings page below Stripe Connection
- [ ] Section hidden when `stripe_verified` is false — shows note to complete Stripe connection first
- [ ] "How to set this up" guide is collapsible
- [ ] Webhook URL in Step 3 reads from `NEXT_PUBLIC_APP_URL` — not hardcoded
- [ ] "Copy URL" button copies full webhook URL to clipboard — shows "Copied ✓" briefly
- [ ] Signing secret input is masked (type="password")
- [ ] "Save Webhook Secret" calls save endpoint and shows inline "Saved ✓" on success
- [ ] "Test Connection" button appears after secret is saved
- [ ] Loading state shown during test: "Testing..."
- [ ] ✅ Connected message shown on success
- [ ] ❌ Error message shown on failure with reason
- [ ] No TypeScript errors

**Final**
- [ ] Each of the five changes has its own commit, GitHub push, and Vibstr report
- [ ] Changes 1, 2, 3 are PATCH bumps — Changes 4 and 5 are MINOR bumps
- [ ] Commit messages follow format in CLAUDE.md
- [ ] Vibstr build report run after every commit per CLAUDE.md
