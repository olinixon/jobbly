# Jobbly — Change Log 16
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Starter Prompt

Open the Jobbly project at `/Users/oliver/Claude Code/jobbly` and read this changelog in full before writing a single line of code. There are four changes in this session. Complete them in order. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

---

## Context — What This Change Log Is About

This changelog implements a major workflow simplification agreed in a client meeting. The entire quote upload and customer online-booking flow is being removed. In its place, a minimal "Job Booked" action gives the subcontractor one tap to log a booked date. When the subcontractor uploads both the invoice and job report and taps "Submit Job", Jobbly AI-analyses the invoice, then immediately emails the customer a link to a hosted portal page where they can view both documents and pay the invoice directly via Stripe (using the client's connected Stripe account). This replaces the old booking calendar email entirely.

There are four distinct changes below. Read all of them before starting Change 1.

---

## Pre-Flight Check — Required Before Starting

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Read the current version**
Open `package.json` and note the current version number. All four changes in this session are **MINOR bumps** — increment the MINOR number for each change.

**3. Locate and read these files before starting**

- `app/jobs/[quoteNumber]/page.tsx` — subcontractor job detail
- `app/leads/[quoteNumber]/page.tsx` — admin lead detail
- `app/client/leads/[quoteNumber]/page.tsx` — client lead detail
- The invoice upload component/handler — wherever it lives
- The status pipeline diagram component — wherever it lives
- The dashboard stat card components for all three roles
- The Needs Action badge query — wherever the sidebar badge count is calculated
- The `/jobs-booked` page and its API (`GET /api/jobs-booked`) — read both files fully
- `app/settings/page.tsx` — admin settings page
- `app/client/settings/page.tsx` — client settings page
- The BillingProfile model and AES-256 decrypt utility (built in CL13)
- All email-sending utility files (Resend helpers)
- `middleware.ts` — to understand current public and protected routes

**4. Confirm `job_completed_at` field status**
Check `schema.prisma` now. If `job_completed_at` does not exist on the `leads` table, add it to the migration in Step 1 of Change 1 — do not add it separately later. All schema changes go in one push at the start of the session.

**5. Confirm GST treatment of `customer_price`**
Before building the Stripe Checkout Session in Change 2 Step 5, stop and confirm with Oli: is `customer_price` stored in the database as a GST-inclusive figure, or ex-GST?

- If GST-inclusive: use `customer_price` directly as the Stripe amount (convert to cents)
- If ex-GST: multiply `customer_price × 1.15` before converting to cents

Do not proceed with the Stripe Checkout Session build until this is confirmed. All other steps in Change 2 can be built while waiting for this answer.

**6. Sync production database**

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports any errors — stop and report to Oli before proceeding.

Only after all six checks pass — begin building in the order listed below.

---

## Change 1 — Workflow Simplification: Remove Quote Flow, Add Job Booked Action, Fix Related UI

### Background

The entire quote upload and customer booking link flow is removed. The new subcontractor journey is:

1. Lead received → Jobbly sends notification email to Frank
2. Frank calls the customer, quotes the job, and books it directly into his own calendar
3. Frank returns to Jobbly, taps "Job Booked", selects the date, hits submit
4. Lead moves directly from `LEAD_RECEIVED` to `JOB_BOOKED` — `QUOTE_SENT` is skipped entirely

**Important:** Do not remove `QUOTE_SENT` from the `LeadStatus` enum in `schema.prisma`. Legacy leads may hold this value and removing it will corrupt existing records. The status is simply no longer used going forward — it stays in the schema silently.

The "Quotes Sent" stat card is **not removed** from admin and client dashboards. Its query logic is updated to remain accurate without relying on `QUOTE_SENT` status.

This is a **MINOR bump**.

---

### Step 1 — Database migrations

Add the following fields to the `leads` table in `schema.prisma`. Also add `job_completed_at` if it does not already exist (check first — do not duplicate):

```prisma
job_booked_date          DateTime?   // Date the job is booked for — set via Job Booked action
job_completed_at         DateTime?   // Timestamp when lead advanced to JOB_COMPLETED (add only if missing)
job_report_url           String?     // R2 URL of uploaded job report
job_report_uploaded_at   DateTime?
job_report_uploaded_by   String?     // user ID
customer_portal_token    String?     @unique  // Token for the public customer portal page
customer_email_sent_at   DateTime?   // Timestamp when customer notification email was fired
stripe_checkout_url      String?     // Stripe Checkout Session URL — generated when portal is first accessed
```

Also update the `attachment_type` enum to include `JOB_REPORT`:

```prisma
enum AttachmentType {
  INVOICE
  JOB_REPORT
}
```

Run the migration:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

Confirm all new fields exist in the production database before moving to Step 2.

---

### Step 2 — Remove quote upload flow from all views

**Subcontractor job detail (`/jobs/[quoteNumber]`):**
- Remove the "Upload Quote" button and its modal at `LEAD_RECEIVED` status
- Remove the "Replace Quote" button at any status where it appears
- Remove any quote file display (quote URL, quote uploaded at, etc.)
- Remove any reference to `QUOTE_SENT` status logic in this component

**Admin lead detail (`/leads/[quoteNumber]`):**
- Remove the "Upload Quote" button and modal if present
- Remove any "Move to Quote Sent" button if present
- If a `quote_url` exists on the lead (legacy data), retain a read-only download link — do not delete historical files or hide existing data

**Client lead detail (`/client/leads/[quoteNumber]`):**
- Same as admin — remove upload actions, retain read-only display of existing quote data if present

**Booking emails:**
- Find any code that sends a customer booking link email. Remove the send call. Do not delete the email template function itself — comment it out with the note: `// Removed CL16 — booking link emails no longer used`.
- Find any code that generates `booking_token` values on quote upload. Remove that generation step.

**Scheduled emails:**
- If there is any code scheduling quote follow-up or booking reminder emails to customers, remove those scheduling calls. Do not delete the underlying cron handler — just stop scheduling those email types.

---

### Step 3 — Add the "Job Booked" action to subcontractor job detail

On the subcontractor job detail page (`/jobs/[quoteNumber]`), at `LEAD_RECEIVED` status, add the following section below the current status badge:

**UI spec:**

```
┌──────────────────────────────────────────────────┐
│  Book This Job                                    │
│                                                   │
│  Booked Job Date                                  │
│  [Date picker input]          [Today]             │
│                                                   │
│  [  Job Booked  ]                                 │
└──────────────────────────────────────────────────┘
```

- Section header: "Book This Job"
- Date picker: `<input type="date">` styled to match the Jobbly input style
- "Today" button: sits inline to the right of the date picker. On click, sets the date picker value to today's date in the correct format. Style as a small secondary button (outline, not filled).
- "Job Booked" button: primary action — filled, brand colour
- If no date is selected on submit: show inline validation error — "Please select the booked job date before submitting."
- On submit: call the API (Step 4), show a loading state on the button

**On success:** Show a small pop-up banner — "Well done on getting the job booked! 🎉" — hold for 4 seconds then auto-dismiss. Do not redirect. Stay on the same page. The page should refresh its lead data so the status badge updates to `JOB_BOOKED` and the "Book This Job" section is replaced by the "Complete This Job" upload section (built in Change 2).

**Mobile:** Date picker full width, "Today" button below it on smaller screens if needed.

---

### Step 4 — Build the Job Booked API endpoint

Create or update `PATCH /api/jobs/[quoteNumber]/book`:

```typescript
// Request body
{ job_booked_date: string }  // ISO date string e.g. "2025-08-14"

// Auth: SUBCONTRACTOR only (read role from session)
// Scope: lead must belong to the subcontractor's campaign

// Validation:
// - job_booked_date must be present and a valid date
// - Lead must currently be in LEAD_RECEIVED status
// - If not: return 400 — "This lead is not in the correct status to be booked."

// On success:
// 1. Update lead: status → JOB_BOOKED, job_booked_date → parsed date
// 2. Write to audit_log: old_status = LEAD_RECEIVED, new_status = JOB_BOOKED, changed_by = session user
// 3. Return 200 with updated lead
```

---

### Step 5 — Update status pipeline diagram

The horizontal status pipeline diagram currently shows four steps:

```
Lead Received → Quote Sent → Job Booked → Job Completed
```

Update it to three steps:

```
Lead Received → Job Booked → Job Completed
```

Remove the `Quote Sent` step from the diagram component wherever it is defined — this affects admin, client, and subcontractor views.

For any existing leads currently in `QUOTE_SENT` status (legacy data), treat the status as falling between Lead Received and Job Booked in the new pipeline — show the lead as "in progress" between those two steps. Handle this gracefully; do not crash.

---

### Step 6 — Update the `/jobs-booked` page and its API

The `/jobs-booked` page (subcontractor only) and its API endpoint (`GET /api/jobs-booked`) currently join with the `Booking` table to get the job date and time. New leads booked via the new "Job Booked" action will not have a `Booking` record — they store the date in `leads.job_booked_date` instead. This will cause the page to return empty results or crash for new leads.

**Update `GET /api/jobs-booked`:**
- Remove the join with the `Booking` table for the job date
- Use `leads.job_booked_date` as the booked date value for all leads
- Sort results by `job_booked_date` ascending
- For any legacy leads that do have a `Booking` record but no `job_booked_date`, fall back to the `Booking` slot date for display

**Update the `/jobs-booked` page UI:**
- Replace any column that previously showed slot time (from the `Booking` table) with a simple "Booked Date" column reading from `job_booked_date`
- Remove any time window display (e.g. "9:00am – 11:00am") — this no longer exists in the new flow
- "Days until job" calculation: use `job_booked_date` instead of the booking slot date

---

### Step 7 — Update admin and client lead detail to show booked date at JOB_BOOKED status

On the admin lead detail page (`/leads/[quoteNumber]`) and the client lead detail page (`/client/leads/[quoteNumber]`), at `JOB_BOOKED` status, the pages currently show booking details sourced from the `Booking` table (slot date, time window, calendar links). These will be absent for new leads.

Replace that section with a simple display:

```
Booked Job Date
[formatted job_booked_date value]
```

If `job_booked_date` is null (legacy leads that reached JOB_BOOKED via the old booking flow), fall back to showing the booking slot date from the `Booking` table if available. If neither exists, show "—".

Remove any calendar add links or time window displays — these are no longer relevant.

---

### Step 8 — Update "Quotes Sent" stat query logic

The "Quotes Sent" stat card currently counts leads in `QUOTE_SENT` status. Since that status is no longer used going forward, update the query so the number stays accurate.

**New logic:** A lead counts as "quoted" once it reaches `JOB_BOOKED` — because booking means the quote was accepted.

Update the Quotes Sent query to count leads where:
```
status IN ('JOB_BOOKED', 'JOB_COMPLETED')
```

Apply this to all API endpoints and stat card queries that calculate the Quotes Sent figure — admin dashboard, client dashboard, and any commission or reporting pages that reference this count.

Remove the "Quotes Sent" stat card from the **subcontractor dashboard only**. Keep it on admin and client.

Do not rename the card. It still reads "Quotes Sent" in the UI.

---

### Step 9 — Update Needs Action badge logic

The sidebar "Needs Action" badge (the count shown on the badge in the nav) almost certainly references `QUOTE_SENT` logic somewhere. Find the query or function that calculates this count and remove any reference to `QUOTE_SENT`.

**New Needs Action logic:** A lead needs action if it is in `LEAD_RECEIVED` status with no `job_booked_date` set. Confirm this is consistent with how the badge was previously calculated and update accordingly.

Also update the green dot logic on lead rows: the green dot should disappear when the lead moves to `JOB_BOOKED` — not `QUOTE_SENT` as it was previously.

---

### Build order for Change 1

1. Run DB migration — confirm all new fields exist in production
2. Remove quote upload flow from subcontractor job detail
3. Remove quote upload flow from admin and client lead detail
4. Remove booking token generation and booking link email send calls
5. Remove scheduled quote follow-up email scheduling calls
6. Build `PATCH /api/jobs/[quoteNumber]/book` endpoint
7. Add Job Booked UI section to subcontractor job detail at LEAD_RECEIVED
8. Update status pipeline diagram — three steps, remove Quote Sent
9. Update `/jobs-booked` page and API to use `job_booked_date`
10. Update admin and client lead detail to show `job_booked_date` at JOB_BOOKED status
11. Remove Quotes Sent stat card from subcontractor dashboard
12. Update Quotes Sent query on admin and client dashboards
13. Update Needs Action badge logic — remove QUOTE_SENT references
14. Update green dot logic — disappears at JOB_BOOKED not QUOTE_SENT
15. Run `npx tsc --noEmit` — confirm no TypeScript errors
16. Apply MINOR version bump in `package.json`
17. Commit: `v[version] — remove quote flow, add Job Booked action, update pipeline and stats`
18. Push to GitHub: `git push origin main`
19. Run Vibstr build report per CLAUDE.md

---

## Change 2 — Job Report Upload + Automatic Customer Email + Portal Page with Stripe Payment

### Background

When the subcontractor uploads both the invoice and the job report and taps "Submit Job", Jobbly:
1. AI-analyses the invoice using the existing Claude API integration
2. Generates a unique customer portal token
3. Immediately fires an email to the customer with a link to a hosted portal page
4. The portal page shows the invoice, the job report, and a live "Pay Invoice" button via Stripe
5. The lead auto-advances to `JOB_COMPLETED`

The email fires synchronously in the API handler — not via a cron job.

**How Stripe payment works:** Continuous Group's Stripe secret key is stored encrypted in the `BillingProfile` table (built in CL13/14). When the customer portal page is accessed, Jobbly decrypts Continuous's key and creates a Stripe Checkout Session for the invoice amount. The customer clicks "Pay Invoice" and is taken to Stripe's hosted checkout — payment goes directly into Continuous Group's Stripe account. If Continuous hasn't connected their Stripe account yet, the button shows as disabled.

**GST confirmation required:** Stop before building the Stripe Checkout Session (Step 5) and confirm with Oli whether `customer_price` is GST-inclusive or ex-GST. Do not guess.

This is a **MINOR bump**.

---

### Step 1 — Add job report upload to subcontractor job detail

On the subcontractor job detail page (`/jobs/[quoteNumber]`), at `JOB_BOOKED` status, update the upload section to require both files before the job can be submitted.

**Updated upload section UI spec:**

```
┌──────────────────────────────────────────────────┐
│  Complete This Job                                │
│                                                   │
│  Invoice                                          │
│  [Attach Invoice]  ← existing button, unchanged  │
│  filename.pdf ✓    ← shown once uploaded          │
│  [Replace]         ← small secondary link        │
│                                                   │
│  Job Report                                       │
│  [Attach Job Report]                              │
│  filename.pdf ✓    ← shown once uploaded          │
│  [Replace]         ← small secondary link        │
│                                                   │
│  [  Submit Job  ]  ← primary; only enabled when  │
│                       BOTH files are uploaded     │
└──────────────────────────────────────────────────┘
```

- "Attach Invoice" and its replace/download behaviour: completely unchanged from existing implementation
- "Attach Job Report": new button, same UX as invoice — tap opens file picker, accepted formats: PDF, JPG, PNG, max 10MB
- "Submit Job": primary button, disabled with tooltip "Upload both the invoice and job report to submit" until both files are present. Once both are uploaded, button becomes active.

**File storage for job report:**
- Upload to Cloudflare R2 (`jobbly-files` bucket)
- Path pattern: `job-reports/[campaign_id]/[quoteNumber]-report.[ext]`
- Store the R2 public URL in `leads.job_report_url`
- Store metadata in `leads.job_report_uploaded_at` and `leads.job_report_uploaded_by`
- Write a row to the `attachments` table with `attachment_type: JOB_REPORT`

**On Submit Job success:**
Show a full-width success banner at the top of the page:
```
✅  Job submitted. The customer has been notified.
```
Do not redirect. Stay on the same page. Refresh the lead data so:
- The status badge updates to `JOB_COMPLETED`
- The "Complete This Job" upload section is hidden
- The uploaded invoice and job report files remain visible as read-only download links so the subcontractor can still access them:

```
  Documents Submitted
  ─────────────────────────────────────────
  Invoice         [Download]
  Job Report      [Download]
```

---

### Step 2 — Build the Submit Job API endpoint

Create `POST /api/jobs/[quoteNumber]/complete`:

```typescript
// Auth: SUBCONTRACTOR only
// Scope: lead must belong to subcontractor's campaign
// Lead must be in JOB_BOOKED status
// Both invoice_url and job_report_url must be non-null

// On call:
// 1. Validate lead is JOB_BOOKED and both files exist — return 400 if not
// 2. Run AI invoice analysis (Step 3 below)
// 3. Generate customer portal token: crypto.randomUUID()
// 4. Save customer_portal_token to lead record
// 5. If customer_email is present on the lead:
//    → Send customer notification email (Step 4 below)
//    → Set customer_email_sent_at to now()
// 6. If customer_email is null:
//    → Skip sending email
//    → Send alert email to Oli (Step 4b below)
//    → Log console warning
// 7. Advance lead status to JOB_COMPLETED
// 8. Set job_completed_at to now()
// 9. Write to audit_log: old_status = JOB_BOOKED, new_status = JOB_COMPLETED, changed_by = session user
// 10. Return 200 with updated lead
```

---

### Step 3 — AI invoice analysis (existing integration, now automated)

The Claude API invoice analysis already exists in the codebase. Find it and call it from within `POST /api/jobs/[quoteNumber]/complete`, before sending the customer email.

- Pass the invoice file (from `invoice_url`) to the existing analysis function
- If the analysis returns a concern: append a note to the lead's `notes` field with the prefix `[AI Invoice Review — {date}] ` — then **still proceed** with sending the email and completing the job. Do not block completion.
- If the analysis passes: proceed normally, no note added
- Do not change the existing analysis logic — only call it from this new endpoint

---

### Step 4 — Customer notification email

Send immediately via Resend when Submit Job fires.

**To:** `lead.customer_email`
**From:** Existing Resend sender domain (`@omnisideai.com`)
**Subject:** `Your gutter clean is complete — invoice and job report ready`

**Body (styled HTML — match existing Jobbly email templates):**

```
Hi [customer_name],

Your gutter clean at [property_address] is now complete.

Your invoice and job report are ready to view, and you can pay your invoice securely online.

[  View Invoice & Pay  ]   ← links to /portal/[customer_portal_token]

If you have any questions, reply to this email or contact us directly.

Thank you for choosing [client_company_name].

— The [client_company_name] Team
```

- Button URL: `https://[NEXT_PUBLIC_BASE_URL]/portal/[customer_portal_token]`
- Add `NEXT_PUBLIC_BASE_URL` to `.env.example` if not already present
- On email send failure: log the error, do not crash the endpoint, still complete the job, and append to the lead's notes: `[Email Error — {date}] Customer notification failed to send. Share the portal link manually.`

---

### Step 4b — Alert email to Oli when customer email is missing

If `lead.customer_email` is null or empty, send an alert email to Oli immediately after the job completes.

**To:** `EMAIL_OLI` (from environment variables)
**From:** Existing Resend sender domain
**Subject:** `Action needed — missing customer email for [quote_number]`

**Body:**

```
Hi Oli,

A job has just been completed but the customer's email address is missing,
so the invoice notification could not be sent automatically.

Quote number:     [quote_number]
Customer name:    [customer_name]
Property address: [property_address]

The customer portal link is ready — share it with the customer manually:
[full portal URL: https://[NEXT_PUBLIC_BASE_URL]/portal/[customer_portal_token]]

Log in to Jobbly to view the full job details.

Jobbly by Omniside AI
```

This email fires instead of (not in addition to) the customer notification.

---

### Step 5 — Build the Stripe Checkout Session API route

**Stop here and confirm the GST question with Oli before building this step.**

Once confirmed, create `POST /api/portal/[token]/create-checkout`:

```typescript
// No auth required — token is the only access control
// Look up lead by customer_portal_token
// If not found: return 404

// Look up the CLIENT BillingProfile for lead.campaign_id:
// - Find BillingProfile where campaign_id = lead.campaign_id AND role = 'CLIENT'
// - If not found OR stripe_verified = false:
//   → return 200 with { checkoutUrl: null }

// If leads.stripe_checkout_url already exists:
//   → Attempt to retrieve the existing session from Stripe to verify it hasn't expired
//   → If session is still valid: return 200 with { checkoutUrl: lead.stripe_checkout_url }
//   → If session has expired (Stripe returns error): clear stripe_checkout_url, generate new session

// Decrypt the client Stripe secret key using the existing AES-256 decrypt utility

// Determine amount:
// - If customer_price is GST-inclusive: unit_amount = Math.round(customer_price * 100)
// - If customer_price is ex-GST: unit_amount = Math.round(customer_price * 1.15 * 100)
// (Use whichever Oli confirms)

// Create Stripe Checkout Session:
const stripe = new Stripe(decryptedClientKey, { apiVersion: '2024-06-20' });
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'nzd',
      product_data: {
        name: `Gutter Clean — ${lead.property_address}`,
        description: `Invoice ref: ${lead.quote_number}`,
      },
      unit_amount: amount, // in cents, as determined above
    },
    quantity: 1,
  }],
  mode: 'payment',
  success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/portal/${token}?paid=true`,
  cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/portal/${token}`,
  customer_email: lead.customer_email ?? undefined,
});

// Save checkout URL to lead for reuse:
await prisma.lead.update({
  where: { customer_portal_token: token },
  data: { stripe_checkout_url: session.url }
});

// Return: { checkoutUrl: session.url }
```

**Package:** Install `stripe` npm package if not already present. Flag this to Oli before installing — wait for confirmation.

**Session expiry:** Stripe sessions expire after 24 hours. On each portal page load, attempt to retrieve the session from Stripe before returning the stored URL. If Stripe returns a `session_expired` or equivalent error, clear `stripe_checkout_url` on the lead and generate a new session. Add this check to the endpoint so customers who return after 24 hours still get a working pay button.

---

### Step 6 — Build the public customer portal page

Create a public route: `/portal/[token]`

**Middleware:** Add `/portal` to the public routes allowlist — no authentication required.

**Page data (server-side):**
1. Look up lead by `customer_portal_token` matching `[token]`
2. If not found: show error page — "This link is invalid or has expired. Please contact us."
3. Call `POST /api/portal/[token]/create-checkout` server-side to get (or create) the Stripe Checkout URL
4. Render the portal page

**Portal page UI spec:**

```
[Jobbly wordmark — top left]

────────────────────────────────────────────────────
  ✓  Your Gutter Clean Is Complete
     [customer_name]  ·  [property_address]
────────────────────────────────────────────────────

  📄  Invoice
  ──────────────────────────────────────────────────
  [Mobile: Download Invoice button — large, full width, primary]
  [Desktop: PDF iframe — full width, ~500px tall]
  [Download Invoice — secondary link below iframe on desktop]

  📋  Job Report
  ──────────────────────────────────────────────────
  [Mobile: Download Job Report button — large, full width, primary]
  [Desktop: PDF iframe — full width, ~500px tall]
  [Download Job Report — secondary link below iframe on desktop]

  💳  Pay Your Invoice
  ──────────────────────────────────────────────────

  WHEN checkoutUrl is present:
  [  Pay Invoice  ]  ← primary button, full width on mobile
                        links to Stripe Checkout URL, same tab

  WHEN checkoutUrl is null (Stripe not connected):
  [  Payment link not yet available  ]  ← disabled, greyed out

  WHEN ?paid=true in URL (Stripe success redirect):
  ✅  Payment received — thank you!
      We'll be in touch to confirm.

────────────────────────────────────────────────────
Powered by Jobbly  ← footer, small
```

**Mobile-first PDF handling:**
- On mobile screens (breakpoint: `md` and below): show only the download button — do not render the PDF iframe. Iframes rendering PDFs are unreliable on iOS Safari and Android browsers.
- On desktop (breakpoint: `md` and above): render the PDF iframe with a download link below as fallback.
- If the file is a JPG or PNG (not a PDF): render as `<img>` on all screen sizes with a download link below.
- Use Tailwind responsive classes to control which element is visible at each breakpoint.

**?paid=true handling:** Detect this query param on load. Replace the Pay Invoice section with the success confirmation. Do not make any API call on payment success — Stripe webhooks handle payment confirmation and are out of scope for this build.

**Data safety:** The portal exposes customer name, property address, invoice file, job report file, and the Stripe payment button only. Do not expose: quote number, contractor rate, commission, margin, or any internal financial data.

---

### Step 7 — Add customer portal link to admin lead detail page

On the admin lead detail page (`/leads/[quoteNumber]`), once `customer_portal_token` is set on the lead (i.e. the job has been completed and the portal has been generated), show a "Customer Portal" row in the lead detail:

```
Customer Portal
[Copy Link]  ← button that copies the full portal URL to clipboard
             URL: https://[NEXT_PUBLIC_BASE_URL]/portal/[customer_portal_token]
```

- Only show this row when `customer_portal_token` is non-null
- "Copy Link" button copies the full URL to clipboard and briefly changes label to "Copied ✓" for 2 seconds
- This allows Oli to manually share the portal link if the customer email failed or was missing

---

### Step 8 — Add "Resend Customer Email" button to admin lead detail page

On the admin lead detail page (`/leads/[quoteNumber]`), once `customer_portal_token` is set and `customer_email` is present on the lead, show a "Resend Customer Email" button alongside the Customer Portal row:

```
Customer Portal
[Copy Link]    [Resend Email]
```

- "Resend Email" is a secondary button (outline style)
- On click: call `POST /api/leads/[quoteNumber]/resend-customer-email`
- Show a loading state on the button while the request is in flight
- On success: show inline confirmation — "Email resent to [customer_email] ✓"
- On failure: show inline error — "Failed to send. Try again."
- Do not show this button if `customer_email` is null on the lead

**Build `POST /api/leads/[quoteNumber]/resend-customer-email`:**
- Auth: ADMIN only
- Look up lead by quote number, scoped to session campaign
- Validate that `customer_portal_token` is set — return 400 if not
- Re-fire the same customer notification email (same template as Step 4) using the existing `customer_portal_token`
- Update `customer_email_sent_at` to now()
- Return 200 on success

---

### Build order for Change 2

1. Add job report upload UI and R2 upload handler to subcontractor job detail at JOB_BOOKED
2. Build `POST /api/jobs/[quoteNumber]/complete` endpoint
3. Wire AI invoice analysis into the complete endpoint
4. Build customer notification email template and wire into complete endpoint
5. Build Oli alert email for missing customer email and wire into complete endpoint
6. **Confirm GST treatment with Oli — do not proceed to step 7 until confirmed**
7. Flag `stripe` npm package to Oli — install once confirmed
8. Build `POST /api/portal/[token]/create-checkout` endpoint with session expiry handling
9. Add `/portal` to middleware public allowlist
10. Build the `/portal/[token]` page — mobile-first PDF handling
11. Add Customer Portal link (copy button) to admin lead detail
12. Build `POST /api/leads/[quoteNumber]/resend-customer-email` endpoint
13. Add Resend Customer Email button to admin lead detail
14. Wire "Submit Job" button to complete endpoint — loading state, then success banner and page refresh
15. Run `npx tsc --noEmit` — confirm no TypeScript errors
16. Apply MINOR version bump in `package.json`
17. Commit: `v[version] — job report upload, auto customer email, portal page, Stripe payment, resend email`
18. Push to GitHub: `git push origin main`
19. Run Vibstr build report per CLAUDE.md

---

## Change 3 — Customer Email and Phone Visible on All Role Views

### Background

The subcontractor now calls the customer directly. They need to see both phone number and email address from the job detail page. Currently at least the phone number (and possibly email) is hidden from the subcontractor view.

This is a **MINOR bump**.

---

### Step 1 — Subcontractor job detail

On `/jobs/[quoteNumber]`, in the customer details section, display both `customer_phone` and `customer_email`. If either field is null, show `—`.

**Customer details section must show:**
- Customer name
- Customer phone ← restore if previously removed
- Customer email ← restore if previously hidden
- Property address
- Google Maps link

---

### Step 2 — Admin and client lead detail pages

Read the actual files — do not assume. Confirm that both `customer_phone` and `customer_email` are visible on the admin lead detail and client lead detail pages. Add either field if it is missing. Both roles must always see both fields.

---

### Build order for Change 3

1. Restore `customer_phone` on subcontractor job detail
2. Restore `customer_email` on subcontractor job detail
3. Confirm both fields on admin lead detail — add if missing
4. Confirm both fields on client lead detail — add if missing
5. Run `npx tsc --noEmit` — confirm no TypeScript errors
6. Apply MINOR version bump in `package.json`
7. Commit: `v[version] — restore customer email and phone on all role views`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 4 — Simplify Client Stripe Setup + Remove Client Send Invoice Button

### Background

The client (Continuous Group) no longer needs B2B invoicing through Jobbly. Their Stripe connection now has one purpose: enabling customer payment checkout on the portal page. The multi-step invoicing setup needs to be replaced with a simple three-step payment connection flow, and the "Send Invoice" button they no longer need is removed.

This is a **MINOR bump**.

---

### Step 1 — Remove "Send Invoice" button from client commission page

On the client commission page (Reconciled Batches tab), remove:
- The "Send Invoice" button added in CL14
- The "Sent [date]" label that replaces it after an invoice has been sent

The "Mark Reconciled" button and all reconciliation functionality is completely unchanged — leave it exactly as-is.

The admin commission page is **not touched** — Oli still uses Stripe to send invoices to Continuous Group via that flow.

---

### Step 2 — Simplify the client Stripe setup in Settings

Locate the `StripeConnectionSetup` component as rendered on the client settings page.

**If the admin and client share a single component driven by props** (likely, given CL13/14 architecture): add a prop — e.g. `mode="payment_only"` — that controls which steps are rendered for the client. The admin's full invoicing flow must render exactly as before when `mode` is not `"payment_only"`. Do not change any admin-facing behaviour.

**Remove these steps entirely from the client setup:**
- Enable invoicing in Stripe
- Set up GST tax rate (15%)
- Create a customer record in Stripe
- Enter a Customer ID
- Enter a Company Name (use `campaign.client_company_name` from the session — do not ask the user to re-enter it)
- Enter a Billing Address

**Replace the client setup with these three steps only:**

```
Step 1 — Create or connect your Stripe account
  Go to stripe.com and log in, or create a free account if you don't have one.
  [Open Stripe →]  ← external link, opens in new tab

Step 2 — Copy your Secret Key
  In your Stripe dashboard, go to Developers → API Keys.
  Copy your Secret Key. It starts with sk_live_...
  Keep this key private — do not share it with anyone.

Step 3 — Connect to Jobbly
  Paste your Secret Key and billing email below, then click Save & Verify.
  Your billing email is where Stripe sends payout notifications and receipts.

  Secret Key      [________________________]
  Billing Email   [________________________]

  [  Save & Verify  ]
```

- "Save & Verify" calls the existing `POST /api/settings/stripe/verify` endpoint — no changes to the endpoint needed
- The verify step confirms the key is valid via a test Stripe API call (existing behaviour — unchanged)
- Once verified: show the existing connected state with the disconnect option (unchanged)
- Disconnect flow: unchanged — disconnecting will disable the "Pay Invoice" button on the portal until reconnected

**Update the Settings section heading and description** for the client:

```
Stripe — Customer Payments

Connect your Stripe account so customers can pay their invoices online.
This is a one-time setup. Once connected, all customer payments go directly into your Stripe account.
```

---

### Step 3 — Confirm admin Stripe setup is untouched

Read `app/settings/page.tsx` in full. Confirm the admin `StripeConnectionSetup` renders all its original steps completely unchanged. Do not modify anything on the admin settings page.

---

### Build order for Change 4

1. Remove "Send Invoice" button and "Sent [date]" label from client commission page
2. Confirm "Mark Reconciled" is completely unaffected
3. Simplify the client `StripeConnectionSetup` to three steps — Secret Key + Billing Email only
4. Remove company name and billing address fields from client BillingProfile form
5. Update section heading and description on client settings page
6. Confirm admin Stripe setup renders identically to before — read the file, do not assume
7. Run `npx tsc --noEmit` — confirm no TypeScript errors
8. Apply MINOR version bump in `package.json`
9. Commit: `v[version] — simplify client Stripe setup, remove client Send Invoice button`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — Workflow simplification**
- [ ] DB migration complete — all new fields exist on leads table in production
- [ ] `job_completed_at` confirmed present on leads table (added if missing)
- [ ] `JOB_REPORT` added to `AttachmentType` enum
- [ ] `QUOTE_SENT` value retained in `LeadStatus` enum — not removed
- [ ] Quote upload button and modal removed from subcontractor job detail
- [ ] Quote upload button and modal removed from admin lead detail
- [ ] Quote upload button and modal removed from client lead detail
- [ ] Legacy quote file download links retained on admin and client views where `quote_url` exists
- [ ] Booking token generation removed from quote upload flow
- [ ] Booking link email send call removed (template preserved, commented out with CL16 note)
- [ ] Scheduled quote follow-up email scheduling calls removed
- [ ] Job Booked section appears on subcontractor job detail at LEAD_RECEIVED
- [ ] Date picker styled to match Jobbly input style
- [ ] "Today" button sets date picker to today's date correctly
- [ ] "Job Booked" button calls `PATCH /api/jobs/[quoteNumber]/book`
- [ ] Inline validation error shown if no date selected on submit
- [ ] API validates lead is LEAD_RECEIVED — returns 400 with message if not
- [ ] API writes `job_booked_date`, advances status to JOB_BOOKED
- [ ] Audit log row written for LEAD_RECEIVED → JOB_BOOKED
- [ ] On success: "Well done on getting the job booked! 🎉" pop-up appears for 4 seconds then dismisses
- [ ] No redirect after booking — page stays and refreshes to show JOB_BOOKED status
- [ ] "Book This Job" section replaced by "Complete This Job" section after status update
- [ ] Status pipeline diagram updated to three steps: Lead Received → Job Booked → Job Completed
- [ ] Legacy QUOTE_SENT leads display gracefully in the three-step pipeline diagram (no crash)
- [ ] `/jobs-booked` page API updated — uses `job_booked_date` not Booking table for date
- [ ] `/jobs-booked` page sorts by `job_booked_date` ascending
- [ ] Time window column removed from `/jobs-booked` table
- [ ] Legacy leads with Booking records fall back to slot date if `job_booked_date` is null
- [ ] Admin lead detail shows `job_booked_date` at JOB_BOOKED status
- [ ] Client lead detail shows `job_booked_date` at JOB_BOOKED status
- [ ] Calendar/time window display removed from admin and client lead detail at JOB_BOOKED
- [ ] Quotes Sent stat card removed from subcontractor dashboard
- [ ] Quotes Sent stat card retained on admin dashboard — query counts JOB_BOOKED + JOB_COMPLETED
- [ ] Quotes Sent stat card retained on client dashboard — query counts JOB_BOOKED + JOB_COMPLETED
- [ ] All other Quotes Sent API/reporting references updated to new logic
- [ ] Needs Action badge query — QUOTE_SENT references removed
- [ ] Needs Action badge logic correct: LEAD_RECEIVED with no job_booked_date = needs action
- [ ] Green dot disappears at JOB_BOOKED — not QUOTE_SENT
- [ ] No TypeScript errors

**Change 2 — Job report upload + customer email + portal + Stripe payment**
- [ ] "Attach Job Report" button present on subcontractor job detail at JOB_BOOKED
- [ ] Job report uploads to R2 under `job-reports/[campaign_id]/[quoteNumber]-report.[ext]`
- [ ] `job_report_url` set on lead after successful upload
- [ ] `job_report_uploaded_at` and `job_report_uploaded_by` set on lead
- [ ] Attachments table row written with `attachment_type: JOB_REPORT`
- [ ] Invoice shows uploaded filename and download link (with Replace option) — existing behaviour confirmed unchanged
- [ ] Job report shows uploaded filename and download link (with Replace option)
- [ ] "Submit Job" button disabled until both files are uploaded
- [ ] Disabled "Submit Job" shows tooltip: "Upload both the invoice and job report to submit"
- [ ] `POST /api/jobs/[quoteNumber]/complete` exists — SUBCONTRACTOR only
- [ ] Endpoint validates lead is JOB_BOOKED and both files exist — 400 if not
- [ ] AI invoice analysis called before email send
- [ ] AI analysis concerns appended to lead notes with date prefix — do not block completion
- [ ] `customer_portal_token` (UUID) generated and saved to lead
- [ ] If `customer_email` is present: customer notification email sent immediately
- [ ] `customer_email_sent_at` set after successful customer email send
- [ ] Customer email send failure does not crash endpoint — error appended to lead notes, job still completes
- [ ] If `customer_email` is null: Oli alert email sent to `EMAIL_OLI`
- [ ] Oli alert email includes portal URL and job details
- [ ] Lead status advances to JOB_COMPLETED
- [ ] `job_completed_at` set on lead
- [ ] Audit log row written for JOB_BOOKED → JOB_COMPLETED
- [ ] Customer email subject and body correct as specced
- [ ] Customer email button links to correct `/portal/[token]` URL
- [ ] GST treatment confirmed with Oli before Stripe session is built
- [ ] `stripe` npm package installed (flagged to Oli first)
- [ ] `POST /api/portal/[token]/create-checkout` endpoint exists
- [ ] Endpoint looks up CLIENT BillingProfile for the lead's campaign
- [ ] Returns `{ checkoutUrl: null }` if no verified Stripe profile found
- [ ] Decrypts client Stripe key using existing AES-256 utility
- [ ] Creates Stripe Checkout Session in NZD for correct amount (GST-confirmed)
- [ ] Line item description includes property address and quote number
- [ ] Success URL is `/portal/[token]?paid=true`
- [ ] Cancel URL is `/portal/[token]`
- [ ] Checkout URL saved to `leads.stripe_checkout_url` for reuse
- [ ] Existing session retrieved from Stripe on repeat page loads to check expiry
- [ ] Expired session detected, cleared, and regenerated correctly
- [ ] `/portal` added to middleware public allowlist
- [ ] Portal page shows clear error for invalid/unknown tokens
- [ ] Portal page shows customer name and property address
- [ ] Mobile: invoice shows as download button only (no iframe)
- [ ] Mobile: job report shows as download button only (no iframe)
- [ ] Desktop: invoice rendered in PDF iframe with download link below
- [ ] Desktop: job report rendered in PDF iframe with download link below
- [ ] Non-PDF files (JPG, PNG) rendered as `<img>` on all screen sizes
- [ ] "Pay Invoice" button links to Stripe Checkout URL
- [ ] "Payment link not yet available" shown (disabled) when checkoutUrl is null
- [ ] `?paid=true` shows payment success confirmation in place of pay button
- [ ] No internal financial data exposed on portal page (no rates, margins, commission)
- [ ] `NEXT_PUBLIC_BASE_URL` added to `.env.example` if not already present
- [ ] Submit Job success banner shown: "✅ Job submitted. The customer has been notified."
- [ ] Success banner displayed without redirect — page stays on subcontractor job detail
- [ ] Status badge updates to JOB_COMPLETED on page after submission
- [ ] "Complete This Job" upload section hidden after submission
- [ ] Invoice and job report shown as read-only download links after submission
- [ ] Customer Portal row visible on admin lead detail once `customer_portal_token` is set
- [ ] "Copy Link" button copies full portal URL to clipboard
- [ ] "Copy Link" button label changes to "Copied ✓" for 2 seconds after click
- [ ] "Resend Email" button visible on admin lead detail when `customer_email` is present and token is set
- [ ] "Resend Email" hidden when `customer_email` is null
- [ ] `POST /api/leads/[quoteNumber]/resend-customer-email` endpoint exists — ADMIN only
- [ ] Resend endpoint re-fires customer notification email with existing token
- [ ] Resend endpoint updates `customer_email_sent_at`
- [ ] Resend button shows loading state, then inline confirmation or error
- [ ] No TypeScript errors

**Change 3 — Customer details on all role views**
- [ ] `customer_phone` displayed on subcontractor job detail
- [ ] `customer_email` displayed on subcontractor job detail
- [ ] Null/empty values show `—` not a blank gap
- [ ] `customer_phone` visible on admin lead detail
- [ ] `customer_email` visible on admin lead detail
- [ ] `customer_phone` visible on client lead detail
- [ ] `customer_email` visible on client lead detail
- [ ] No TypeScript errors

**Change 4 — Simplify client Stripe setup + remove client Send Invoice button**
- [ ] "Send Invoice" button removed from client commission page (Reconciled Batches tab)
- [ ] "Sent [date]" label removed from client commission page
- [ ] "Mark Reconciled" button and all reconciliation behaviour completely unchanged
- [ ] Admin commission page untouched
- [ ] Client Stripe setup reduced to three steps: Stripe account → copy Secret Key → paste + verify
- [ ] GST tax rate step removed from client setup
- [ ] Enable invoicing step removed from client setup
- [ ] Create customer step removed from client setup
- [ ] Customer ID field removed from client setup
- [ ] Company name field removed from client BillingProfile form
- [ ] Billing address field removed from client BillingProfile form
- [ ] Billing email field retained and saved correctly to BillingProfile
- [ ] Settings section heading reads "Stripe — Customer Payments"
- [ ] Settings description clarifies key is for customer payment processing
- [ ] Admin Stripe setup renders identically to before — confirmed by reading the file
- [ ] If shared component: `mode` prop controls client vs admin rendering — admin path unchanged
- [ ] No TypeScript errors

**Final**
- [ ] Each of the four changes has its own commit, GitHub push, and Vibstr report
- [ ] All four are MINOR bumps — version incremented correctly for each
- [ ] Commit messages follow format in CLAUDE.md
- [ ] Vibstr build report run after every commit per CLAUDE.md
