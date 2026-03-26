# Jobbly — Change Log Prompt
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes listed here in a single session in the order specified. Do not skip any item. Stop and ask if anything is unclear before proceeding.

After completing all changes, bump the version in `package.json`, commit with a descriptive message, and run the Vibstr build report as documented in `CLAUDE.md`.

---

## Pre-Flight — Environment Setup

Before building anything in this session, check and update the `.env.local` file at the project root.

**Step 1 — Verify `.env.local` exists**
If it does not exist, create it now at the project root. This file must never be committed to Git — verify `.gitignore` includes `.env.local` before proceeding.

**Step 2 — Add or update the following values in `.env.local`**

Add these lines if they are not already present, or update them if they contain placeholder values:

```
RESEND_API_KEY=re_6yK32MEX_B1bn17Z7vLcMB7edTCcBEoRg
EMAIL_FROM=Jobbly <oli@omnisideai.com>
ANTHROPIC_API_KEY=sk-ant-REDACTED
```

**Step 3 — Verify `.gitignore`**
Open `.gitignore` and confirm `.env.local` is listed. If it is not, add it immediately before doing anything else. These keys must never be committed to the repository.

**Step 4 — Do not hardcode any keys in the codebase**
All API keys and secrets in code must be read from environment variables — `process.env.RESEND_API_KEY`, `process.env.ANTHROPIC_API_KEY`, etc. Never the raw key strings.

---

## Change 7 — Welcome Email on User Creation

### What needs to happen
When Oli creates a new user via the `/users` User Management screen, Jobbly must automatically send a welcome email to that user's email address immediately after the account is created. This removes the need for Oli to manually send login credentials.

### Trigger
The welcome email fires on successful `POST /api/users` — after the user record is written to the database and before the API returns a success response.

### Email content

**To**: the new user's email address

**Subject**:
```
You've been invited to Jobbly
```

**Body**:
```
Hi [User's name],

You've been added to Jobbly by Omniside AI.

Here are your login details:

Login page: [NEXTAUTH_URL]/login
Email: [user's email address]
Temporary password: [the plain-text password as entered by Oli — before hashing]

Once you're logged in, go to your profile page to change your password.

[NEXTAUTH_URL]/login

Jobbly by Omniside AI
```

### Implementation notes
- The plain-text password must be captured before it is hashed with bcrypt — pass it to the email function before the hash step
- Use Resend to send the email — the API key is in `.env.local` as `RESEND_API_KEY`
- The sender address is `EMAIL_FROM` from `.env.local`
- The login URL must be built from `NEXTAUTH_URL` in `.env.local` — never hardcode the domain
- If the email fails to send, do NOT roll back the user creation — log the error and return a warning in the API response: `{ success: true, warning: "User created but welcome email failed to send." }`
- If the email sends successfully, return: `{ success: true, message: "User created and welcome email sent." }`
- Show the result in the UI — either a success toast "User created — welcome email sent to [email]" or a warning toast "User created but welcome email failed — send login details manually"

### API change
Update `POST /api/users` to:
1. Capture plain-text password before hashing
2. Hash password and create user record as normal
3. Send welcome email via Resend
4. Return success or warning based on email result

---

## Change 8 — Invoice Upload UI Redesign

### Problem
The current invoice upload UI inside the "Attach Invoice" modal is poor. It shows a raw "Choose File — no file selected" browser input which looks unfinished and is not intuitive. The contractor rate input field sitting above it is confusing to users. The whole component needs to be redesigned.

### What needs to happen
Remove the manual contractor rate input field from the invoice upload modal entirely. The customer price will now be extracted automatically from the invoice using AI parsing (see Change 9). The upload modal should be purely focused on file selection and upload.

### New invoice upload UI

**Title**: "Attach Invoice"

**Drag and drop zone:**
- A clearly defined rectangular zone with a dashed border and a light background
- Sized generously — comfortable to interact with on both desktop and mobile
- Inside the zone, centred:
  - A small upload icon at the top
  - Text: "Drag and drop your invoice here"
  - Smaller subtext: "PDF, JPG, or PNG — max 10MB"
  - A clearly visible "Choose File" button below the text — styled as a proper button, not a raw browser input. Clicking opens the file picker
- When a file is dragged over the zone: border colour changes to brand accent, background lightens slightly
- When a file is dropped or selected: show filename and size inside the zone with a small green tick — replacing the drag/drop text
- Wrong file type: inline error inside zone — "Only PDF, JPG, and PNG files are accepted"
- File too large: inline error — "File must be under 10MB"

**Buttons below the zone:**
- "Cancel" (secondary) — closes modal, no changes
- "Upload" (primary) — disabled until a valid file is selected

### Implementation notes
- Hide the default browser `<input type="file">` and trigger it programmatically from the styled button
- Use `onDragOver`, `onDragLeave`, and `onDrop` handlers on the zone div
- Accepted: `application/pdf`, `image/jpeg`, `image/png`
- File size check happens client-side before upload

---

## Change 9 — AI Invoice Parsing to Auto-Extract Customer Price and Calculate All Financials

### Context
When a subcontractor uploads an invoice, that invoice shows the **customer price** — the amount the customer was charged, already marked up under Continuous Group branding. This is the number the AI reads. Jobbly then works backwards from the customer price to derive the contractor rate and calculate all other financial fields.

### The calculation logic

The invoice contains the **customer price ex GST**. Jobbly works **backwards**:

```
contractor_rate     = customer_price ÷ (1 + markup_percentage / 100)
gross_markup        = customer_price − contractor_rate
omniside_commission = gross_markup × (commission_percentage / 100)
client_margin       = gross_markup − omniside_commission
```

Example with markup 25%, commission 40%:
- Customer price (from invoice, ex GST): $250.00
- Contractor rate: $250 ÷ 1.25 = **$200.00**
- Gross markup: $250 − $200 = **$50.00**
- Omniside commission: $50 × 0.40 = **$20.00**
- Client margin: $50 × 0.60 = **$30.00**

All five values are stored permanently on the lead record. Never recomputed after this point.

### GST handling
All values in Jobbly are stored and displayed **ex GST**.

- The AI must extract the **ex GST subtotal** — not the GST-inclusive total
- If the invoice only shows a GST-inclusive total, divide by 1.15 to get ex GST (NZ GST rate is 15%)

**AI system prompt:**
```
You are an invoice parser for a New Zealand business.
Extract the total amount charged EXCLUDING GST (the ex-GST subtotal) from this invoice.
If the invoice shows a GST-inclusive total only, divide by 1.15 to calculate the ex-GST amount.
Return ONLY a JSON object in this exact format, nothing else:
{ "customer_price_ex_gst": 250.00, "currency": "NZD", "gst_inclusive_total": 287.50, "confidence": "high" }
If you cannot find a clear total, return:
{ "customer_price_ex_gst": null, "currency": null, "gst_inclusive_total": null, "confidence": "low", "reason": "brief explanation" }
Do not include any other text, explanation, or markdown.
```

### What needs to happen

**Step 1 — Parse the invoice**
- After file upload and save, pass the invoice to the Anthropic API
- Use model: `claude-sonnet-4-20250514`
- Send file as base64-encoded document or image
- Parse JSON response
- If `confidence` is `"low"` or `customer_price_ex_gst` is null, flag lead for manual review

**Step 2 — Calculate and store all five fields in a single database transaction**
1. Fetch campaign's `markup_percentage` and `commission_percentage`
2. Run reverse calculations
3. Write all five fields atomically — if any write fails, roll back all

**Step 3 — Show result to user before closing**
```
Invoice uploaded ✓

Extracted from invoice:
Customer price (ex GST):   $250.00

Calculated:
Contractor rate:           $200.00
Gross markup:               $50.00
Omniside commission:        $20.00
Client margin:              $30.00
```
Note: "Based on [25%] markup and [40%] commission from campaign settings."

Buttons:
- "Confirm & Close" — saves all five values to lead record
- "Edit manually" — opens a simple form to correct any value before saving

**Step 4 — Fallback if parsing fails**
- Still save the invoice file to the lead
- Show: "We couldn't read a total from this invoice. Please enter the customer price manually."
- Single input: "Customer price (ex GST)" — run same reverse calculations from this value
- This is fallback only — not the primary flow

### API changes
Update the invoice upload route to:
1. Save file, populate `invoice_url`, `invoice_uploaded_at`, `invoice_uploaded_by`
2. Call Anthropic API to extract `customer_price_ex_gst`
3. Reverse-calculate all five financial fields
4. Write all to lead record in one transaction
5. Return extracted and calculated values to frontend

### Notes
- Use `process.env.ANTHROPIC_API_KEY` — never hardcoded
- Install `@anthropic-ai/sdk` if not already in `package.json`
- First page of PDF only for parsing
- Store raw AI response in a log field on the lead for debugging

---

## Change 10 — Password Visibility Toggle

### Problem
Users cannot see what they are typing in password fields, causing frustration when logins fail due to invisible typos.

### What needs to happen
Add a show/hide password toggle to every password input field in the app:
- Login page (`/login`) — the password field
- Profile page (`/profile`) — all three password fields (current, new, confirm new)

### Toggle behaviour
- Default: hidden (dots)
- Small icon button inside the input, right-aligned
- Closed eye icon when hidden, open eye when visible
- Click toggles between `type="password"` and `type="text"`
- Per-field — toggling one does not affect others
- Icon: muted grey, slightly darker on hover

### Implementation notes
- `useState` boolean per field
- Relative-positioned wrapper, button absolutely positioned inside input on right
- Right padding on input so text does not overlap the button
- No third-party library — Tailwind + simple SVG eye icon

---

## Change 11 — Lead Received Date — Show Time as Well

### Problem
The "Date received" field only shows date, not time. For a high-volume AI call campaign, the time a lead came in is useful context.

### Format
```
27 March 2025, 20:40
```
- Full month name, 24-hour time, hours and minutes only, no seconds, no am/pm

### Where this applies
- Lead table on `/dashboard` — Date received column
- Lead detail page `/leads/[quoteNumber]` — date received field
- Subcontractor job queue `/jobs` — date received column
- Subcontractor job detail `/jobs/[quoteNumber]` — date received field
- Audit log `/audit` — timestamp column
- Notifications `/notifications` — timestamp on each notification

### Implementation notes
- Create or update shared utility: `/lib/formatDate.ts`
- All date displays must use this utility — no inline formatting in components
- Use user's local timezone — do not force UTC

---

## Change 12 — Allow Status Reversion for All Roles

### Problem
There is no way to undo a status change made in error. All roles need the ability to revert a status if something changes or goes wrong.

### Rules
- ALL roles can revert — ADMIN, CLIENT, SUBCONTRACTOR
- One step back only
- Valid reversions:
  - `QUOTE_SENT` → `LEAD_RECEIVED`
  - `JOB_BOOKED` → `QUOTE_SENT` — clears `job_booked_date`
  - `JOB_COMPLETED` → `JOB_BOOKED` — clears `invoice_url`, `invoice_uploaded_at`, `invoice_uploaded_by`, `job_completed_at`
- Reverting a reconciled lead is blocked: "This job has been reconciled. Unreconcile it first before reverting the status."
- Every reversion writes to the audit log
- Campaign scoping still applies — users can only revert leads in their own campaign

### UI
On `/leads/[quoteNumber]` and `/jobs/[quoteNumber]`:
- Small subtle "Revert status" button below current status — not prominent
- Confirmation modal:
  - Title: "Revert status?"
  - Body: "This will move [Customer Name]'s lead back from [Current Status] to [Previous Status]. This action will be logged."
  - Buttons: "Cancel" and "Confirm Revert"
- Visible to ALL roles
- Hidden when lead is at `LEAD_RECEIVED`

### API change
Update `PATCH /api/leads/[quoteNumber]` to handle backwards transitions for all authenticated roles. Validate one step back. Validate campaign scope. Write to audit log. Clear relevant fields.

---

## Change 13 — Make Campaign Settings Editable

### Problem
Once a campaign is created, settings cannot be edited. Admin needs to be able to update all campaign details at any time.

### Editable fields — four sections, each with its own Save button

**Section 1 — General**
- Campaign name, Industry, Client company name, Subcontractor company name, Campaign start date

**Section 2 — Commission & Pricing**
- Client markup percentage (%)
- Omniside commission percentage (%)
- Client margin percentage — auto-calculated, read-only: `100 − commission %`
- Note: "Changes to these percentages apply to future leads only. Existing lead records are not affected."

**Section 3 — Campaign Status**
- Selector: Active / Paused / Completed with descriptions
- Must stay in sync with the campaign card status toggle

**Section 4 — Danger Zone**
- "Deactivate Campaign" — red button, confirmation modal required

### Save behaviour
- Each section saves independently
- On save: PATCH `/api/campaigns/[id]`, show inline "Settings saved." on success
- Rate changes show warning: "This will affect all future leads. Existing leads will not be changed."

### API change
`PATCH /api/campaigns/[id]` — ADMIN only. Validates `commission_percentage + client_margin_percentage = 100`.

---

## Change 14 — GST Display Formatting Throughout the App

### Context
All financial values are stored ex GST. The UI needs to make this clear everywhere, and the commission invoice must follow standard NZ GST format.

### Dashboard and lead table
Add small muted "(ex GST)" label — `text-xs text-gray-400` — to all financial column headers and stat card titles. Individual cell values do not need the label.

### Lead detail page
Show all five fields with ex GST labels, plus an informational incl. GST line:
```
Contractor rate:            $200.00  (ex GST)
Customer price:             $250.00  (ex GST)
Gross markup:                $50.00  (ex GST)
Omniside commission:         $20.00  (ex GST)
Client margin:               $30.00  (ex GST)

Customer price (incl. GST):  $287.50
```
`customer_price × 1.15` — displayed only, never stored.

### Commission invoice template
```
────────────────────────────────────────────
JOBBLY — COMMISSION INVOICE SUMMARY
────────────────────────────────────────────
Generated:      [12 April 2025]
Period:         [March + April 2025]
Campaign:       [Continuous Group Guttering]
Prepared by:    Omniside AI

────────────────────────────────────────────
Quote #      Customer Name       Commission
                                  (ex GST)
──────────   ─────────────────   ──────────
JBL-00001    Jane Smith            $20.00
JBL-00002    John Davies           $15.00
JBL-00003    Sarah Wilson          $22.50
JBL-00004    Mike Brown            $18.00

────────────────────────────────────────────
Subtotal (ex GST):          $75.50
GST (15%):                  $11.33
Total (incl. GST):          $86.83
────────────────────────────────────────────

Jobbly by Omniside AI
```
- GST: `subtotal × 0.15`
- Total incl. GST: `subtotal × 1.15`
- Round to 2 decimal places
- Display only — never stored in the database

---

## Master Build Order

Follow this order exactly. Do not jump ahead.

1. Pre-flight — verify/create `.env.local`, verify `.gitignore`
2. Install `@anthropic-ai/sdk` if not already present
3. Change 7 — welcome email on user creation
4. Change 8 — invoice upload UI redesign
5. Change 9 — AI invoice parsing, reverse calculations, confirmation step, fallback
6. Change 10 — password visibility toggle on login and profile
7. Change 11 — date + time formatting utility, update all date displays
8. Change 12 — status reversion for all roles
9. Change 13 — editable campaign settings
10. Change 14 — GST labels and invoice formatting
11. Verify all dashboard stat cards show correct values
12. Bump version in `package.json` — MINOR bump minimum
13. Commit: `v[X.X.0] — welcome email, AI invoice parsing, password toggle, date+time format, status reversion, editable settings, GST display`
14. Run Vibstr build report as per CLAUDE.md

---

## Master Build Checklist

Do not consider this session complete until every item is verified.

**Pre-flight**
- [ ] `.env.local` exists with all three keys present and correct
- [ ] `.gitignore` includes `.env.local`
- [ ] No API keys hardcoded anywhere in the codebase

**Change 7 — Welcome email**
- [ ] Creating a new user triggers a welcome email immediately
- [ ] Email has correct name, email, temp password, and login link
- [ ] Login link uses `NEXTAUTH_URL` — not hardcoded
- [ ] If email fails, user still created — warning toast shown
- [ ] If email succeeds, success toast shown
- [ ] Plain-text password used in email, not bcrypt hash

**Change 8 — Invoice upload UI**
- [ ] Modal shows drag and drop zone — no raw browser input visible
- [ ] Dragging highlights the zone
- [ ] Dropping shows filename and size with green tick
- [ ] Choose File button opens file picker
- [ ] Wrong file type shows inline error
- [ ] File over 10MB shows inline error
- [ ] Upload button disabled until valid file selected
- [ ] No contractor rate input field in modal

**Change 9 — AI invoice parsing**
- [ ] AI extracts customer price ex GST from uploaded invoice
- [ ] All five financial fields reverse-calculated and shown in confirmation step
- [ ] Confirm & Close saves all five values to lead record
- [ ] Edit manually allows correction before saving
- [ ] Fallback manual input appears if AI parsing fails
- [ ] Lead detail page shows all five fields correctly after upload
- [ ] Dashboard stat cards update correctly
- [ ] `ANTHROPIC_API_KEY` read from environment only

**Change 10 — Password toggle**
- [ ] Password field on `/login` has eye icon toggle
- [ ] All three password fields on `/profile` have eye icon toggle
- [ ] Toggle switches between hidden and visible
- [ ] Toggling one field does not affect others

**Change 11 — Date + time format**
- [ ] All date displays show "27 March 2025, 20:40" format
- [ ] Shared utility used — no inline formatting in components
- [ ] Applied to: dashboard, lead detail, job queue, job detail, audit log, notifications

**Change 12 — Status reversion**
- [ ] All three roles can revert status one step back
- [ ] Revert button on lead detail page for all roles
- [ ] Revert button on subcontractor job detail page
- [ ] Revert button hidden at LEAD_RECEIVED
- [ ] Reverting from JOB_COMPLETED clears invoice fields and job_completed_at
- [ ] Reverting from JOB_BOOKED clears job_booked_date
- [ ] Reconciled lead reversion blocked with clear error
- [ ] Every reversion written to audit log

**Change 13 — Editable campaign settings**
- [ ] Settings page pre-fills current campaign values
- [ ] Each section saves independently
- [ ] Rate change warning shown before saving
- [ ] Client margin auto-calculates as read-only
- [ ] Status synced with campaign card
- [ ] Deactivate requires confirmation modal
- [ ] API validates commission + margin = 100

**Change 14 — GST display**
- [ ] All stat card titles show "(ex GST)" label
- [ ] All financial column headers show "(ex GST)" label
- [ ] Lead detail shows all five fields with ex GST labels
- [ ] Lead detail shows incl. GST customer price as informational line
- [ ] Commission invoice shows subtotal, GST at 15%, total incl. GST
- [ ] GST figures display only — not stored

**Final**
- [ ] Version bumped in `package.json`
- [ ] Committed with correct message format
- [ ] Vibstr build report sent

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 15 — [Title], then full spec
-->

---

## Change 15 — Automated Lead Notification Email to Subcontractor

### Context
Currently, when a new lead arrives in Jobbly via the n8n webhook, there is no automatic notification sent to Frank's VA. The VA has no way of knowing a new job has come in unless Oli manually forwards the details. This change automates that entirely — the moment a lead hits Jobbly, an email fires to the right person with everything they need to act on it immediately.

### What needs to happen
When a new lead is created via `POST /api/webhooks/lead`, Jobbly must immediately send a styled HTML email to every SUBCONTRACTOR user assigned to that campaign who has `notify_new_lead = true` on their user record (see Change 16 for the preference flag).

### Email content and design
All emails in Jobbly must be styled HTML — not plain text. This applies to this new email AND to the existing welcome email (Change 7) and job completed email already in the system. Upgrade all three to styled HTML as part of this change.

**Styled HTML email template for new lead notification:**

The email must be built as a React Email component or as an inline HTML string passed to Resend. It must render correctly in Gmail, Outlook, and Apple Mail on both desktop and mobile.

**Design spec:**
- White background, clean layout, max-width 600px centred
- Jobbly wordmark at the top in brand accent colour
- A soft grey divider below the header
- A lead details card — white surface, subtle border, rounded corners — containing:
  - Quote number (large, bold, brand accent colour)
  - Customer name (large, bold)
  - Phone number (with a tel: link so it's tappable on mobile)
  - Property address (full address string)
  - Property perimeter, area, storeys — displayed as three small stat items in a row
- Two buttons stacked below the card:
  - Primary button: "View Job in Jobbly" — brand accent background, white text, rounded, links to `[NEXTAUTH_URL]/jobs/[quoteNumber]`
  - Secondary button: "Open in Google Maps" — white background, brand accent border and text, links to the `google_maps_url` on the lead
- Footer: "Jobbly by Omniside AI" — small, muted, centred

**Subject line:**
```
New job — [JBL-00001] — [Customer Name]
```

**To:** All SUBCONTRACTOR users in the campaign where `notify_new_lead = true`

### Implementation notes
- The email send happens inside the webhook handler, after the lead record is successfully created
- If the email fails, do NOT fail the webhook response — log the error, still return `200` with the lead created successfully
- If no SUBCONTRACTOR users exist for the campaign, or none have `notify_new_lead = true`, skip silently
- Use `process.env.RESEND_API_KEY` and `process.env.EMAIL_FROM`
- Build the email template in `/lib/emails/newLeadEmail.ts` (or equivalent)
- Also upgrade the existing welcome email and job completed email to styled HTML using the same design language — consistent look across all Jobbly emails

### Also upgrade existing emails to styled HTML
While building the new lead email template, update the following to match the same HTML design style:

**Welcome email** (already specced in Change 7):
- Jobbly header
- Welcome message card with login details
- "Log in to Jobbly" primary button
- Footer

**Job completed email** (already exists in the codebase):
- Jobbly header
- Job summary card: quote number, customer name, address, contractor rate, customer price, commission
- "View Lead in Jobbly" primary button
- Footer

---

## Change 16 — Notification Preferences on Profile Page

### What needs to happen
Add a "Notification Preferences" section at the bottom of the `/profile` page for all authenticated users. Each user sees only the toggles that are relevant to their role. Users can opt in or out of email notifications without needing to contact Oli.

### Database change
Add two new boolean columns to the `users` table:

```prisma
notify_new_lead       Boolean @default(true)   // SUBCONTRACTOR only — email on new lead arrival
notify_job_completed  Boolean @default(true)   // ADMIN only — email when job marked completed
```

Run a Prisma migration for both fields. Default is `true` for both — existing users will have notifications on unless they opt out.

### Profile page UI — new section at the bottom

**Section title**: "Notification Preferences"
**Subtitle**: "Control which emails Jobbly sends you."

**SUBCONTRACTOR users see:**
- Toggle: "New lead notifications"
- Description: "Email me when a new job lead is assigned to my campaign."
- On/off toggle switch — default on

**ADMIN users see:**
- Toggle: "Job completion notifications"
- Description: "Email me when a job is marked completed and an invoice is attached."
- On/off toggle switch — default on

**CLIENT users:**
- Do not show this section at all — clients receive no automated emails from Jobbly

**Save behaviour:**
- Changes save immediately on toggle — no separate Save button needed for this section
- Use `PATCH /api/profile/notifications` to update the flag on the user record
- Show a small inline confirmation: "Preferences saved." — fades out after 2 seconds

### API endpoint
`PATCH /api/profile/notifications`
- Authenticated users only
- Body: `{ notify_new_lead?: boolean, notify_job_completed?: boolean }`
- Only updates the fields relevant to the user's role — ignores irrelevant fields
- Returns `200` on success

### Update existing email send logic
Every place in the codebase where a notification email is sent must now check the relevant flag before sending:

- New lead email (Change 15): check `notify_new_lead = true` on each SUBCONTRACTOR user before sending
- Job completed email: check `notify_job_completed = true` on the ADMIN user before sending
- Welcome email (Change 7): always sends — not affected by preferences (it's a transactional email, not a notification)

---

## Change 17 — Monthly PDF Export on Commission Page

### What needs to happen
Add an "Export PDF" button to the Commission page that allows Oli to download a clean, print-ready PDF summary of any reconciliation batch or unreconciled month. This serves as the official record for each billing period and can be filed or forwarded as needed.

### Where the button appears
- On the "By Month" tab: each month card has an "Export PDF" button alongside the existing checkbox — visible whether the month is reconciled or not
- On the "Reconciled Batches" tab: each batch row has an "Export PDF" button in the actions column alongside "View Invoice" and "Unreconcile"

### PDF content
The PDF must be formatted identically to the commission invoice modal already built, including the GST breakdown. It is effectively the same document made downloadable.

```
────────────────────────────────────────────
JOBBLY — COMMISSION SUMMARY
────────────────────────────────────────────
Generated:      [12 April 2025]
Period:         [April 2025] or [March + April 2025]
Campaign:       [Continuous Group Guttering]
Prepared by:    Omniside AI

────────────────────────────────────────────
Quote #      Customer        Completed     Commission
──────────   ─────────────   ──────────    ──────────
JBL-00001    Jane Smith      3 Apr 2025     $20.00
JBL-00002    John Davies     7 Apr 2025     $15.00
JBL-00003    Sarah Wilson    12 Apr 2025    $22.50
JBL-00004    Mike Brown      18 Apr 2025    $18.00

────────────────────────────────────────────
Total jobs:                  4
Subtotal (ex GST):           $75.50
GST (15%):                   $11.33
Total commission (incl. GST): $86.83
────────────────────────────────────────────

Jobbly by Omniside AI
```

### Implementation
- Use the browser's `window.print()` approach already implemented for the invoice modal — no external PDF library needed
- When "Export PDF" is clicked, open the invoice preview modal pre-populated with that month's or batch's data, and immediately trigger `window.print()`
- The `@media print` CSS already hides the sidebar, header, and modal overlay — only the invoice content prints
- The browser's "Save as PDF" option handles the actual file download

### No new API endpoints needed
The existing `GET /api/commission/invoice/[batchId]` endpoint already returns the data needed. For unreconciled months, use `GET /api/commission/months` and filter by month key.

---

## Change 18 — Dashboard Date Range Filter

### What needs to happen
Add a date range selector to the top of the `/dashboard` page that filters both the stat cards and the lead table to show only leads within the selected period. This allows Oli and Continuous Group to view campaign performance for any time window, not just all time.

### UI placement
Top right of the dashboard page, inline with the "All leads for this campaign" heading (or page title). A single dropdown selector — compact, does not take up much space.

### Date range options
```
All time          ← default
Today
Last 7 days
Month to date
Last month
Last quarter
Custom range      ← opens a from/to date picker inline
```

### Behaviour
- Selecting a range immediately filters both the stat cards and the lead table
- All stat cards recalculate for the selected period:
  - Total leads (in period)
  - Quotes sent (in period)
  - Jobs booked (in period)
  - Jobs completed (in period)
  - Total revenue (in period)
  - Commission earned (in period)
  - Commission pending (in period)
- The lead table filters to show only leads created within the selected period
- The URL updates with the selected range as a query parameter (e.g. `?range=last-month`) so the view is shareable and survives a page refresh
- "Custom range" shows two date inputs side by side: "From" and "To" — selecting both applies the filter

### Implementation notes
- Default is "All time" on first load — no filter applied
- If a URL query parameter is present on load, apply that range immediately
- The filter is applied at the API level — not just in the UI. The dashboard data API must accept `from` and `to` date parameters and filter the database query accordingly
- For CLIENT role: the same filter appears on their dashboard — same options, same behaviour, but scoped to their campaign as always

### API change
Update `GET /api/dashboard` (or equivalent) to accept optional `from` and `to` query parameters as ISO date strings. When provided, filter all lead queries to `created_at >= from AND created_at <= to`. When not provided, return all leads as normal.

---

## Build Order for Changes 15–18

1. Database migration — add `notify_new_lead` and `notify_job_completed` to users table (Change 16)
2. Build styled HTML email templates for all three emails: new lead, job completed, welcome (Change 15)
3. Update webhook handler to send new lead email to eligible subcontractors (Change 15)
4. Update job completed email send to check `notify_job_completed` flag (Change 16)
5. Add notification preferences section to `/profile` page (Change 16)
6. Build `PATCH /api/profile/notifications` endpoint (Change 16)
7. Add Export PDF button to commission page — By Month tab and Reconciled Batches tab (Change 17)
8. Add date range selector to dashboard — UI, URL params, API filter (Change 18)
9. Bump version in `package.json` (MINOR bump)
10. Commit: `v[X.X.0] — lead notification email, notification preferences, PDF export, dashboard date filter`
11. Run Vibstr build report as per CLAUDE.md

## Build Checklist for Changes 15–18

**Change 15 — Lead notification email**
- [ ] New lead webhook triggers email to all SUBCONTRACTOR users with `notify_new_lead = true`
- [ ] Email is styled HTML — not plain text
- [ ] Email contains: quote number, customer name, phone, address, property data
- [ ] "View Job in Jobbly" button links to correct job URL
- [ ] "Open in Google Maps" button links to correct Maps URL
- [ ] Email renders correctly on mobile
- [ ] If email fails, webhook still returns 200 and lead is still created
- [ ] Welcome email upgraded to styled HTML
- [ ] Job completed email upgraded to styled HTML

**Change 16 — Notification preferences**
- [ ] `notify_new_lead` and `notify_job_completed` columns exist on users table
- [ ] Notification preferences section appears at bottom of `/profile` for ADMIN and SUBCONTRACTOR
- [ ] CLIENT role does not see the preferences section
- [ ] SUBCONTRACTOR sees new lead toggle only
- [ ] ADMIN sees job completed toggle only
- [ ] Toggling saves immediately via PATCH request
- [ ] "Preferences saved." confirmation appears and fades
- [ ] New lead email checks `notify_new_lead` flag before sending
- [ ] Job completed email checks `notify_job_completed` flag before sending

**Change 17 — PDF export**
- [ ] Export PDF button on each month card in By Month tab
- [ ] Export PDF button on each batch row in Reconciled Batches tab
- [ ] Clicking Export PDF opens invoice modal and triggers print dialog
- [ ] PDF content matches commission invoice format with GST breakdown
- [ ] Print styles hide sidebar, header, modal overlay — invoice content only

**Change 18 — Dashboard date filter**
- [ ] Date range dropdown appears top right of dashboard, inline with heading
- [ ] All time is the default selection
- [ ] Selecting a range filters stat cards and lead table immediately
- [ ] All seven stat cards recalculate for the selected period
- [ ] Custom range shows from/to date picker
- [ ] Selected range persists in URL as query parameter
- [ ] Page reload with query parameter applies the filter automatically
- [ ] CLIENT role dashboard also has the date filter
- [ ] API accepts `from` and `to` parameters and filters at database level
