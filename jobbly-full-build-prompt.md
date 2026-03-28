# Jobbly — Combined Build Prompt
### Change Log 4 Fixes + Booking System Spec
### Read this entire document before writing a single line of code.

---

## Deployment Setup

### GitHub Repository
The Jobbly codebase must be pushed to GitHub after every session. The remote repository is:

```
https://github.com/olinixon/jobbly.git
```

**If the repo is not yet connected, run these commands once from the project root:**
```bash
git remote add origin https://github.com/olinixon/jobbly.git
git branch -M main
git push -u origin main
```

**After every build session, push to GitHub:**
```bash
git push origin main
```

This must happen after every commit — not just at the end of the full build. Every meaningful change gets committed AND pushed.

### Vercel Cron Job Configuration
Create a `vercel.json` file at the project root to configure the email processing cron job for production:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-emails",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

This runs the email cron every 15 minutes in production automatically. Commit this file to the repo.

### Production Database (Supabase)
The production PostgreSQL database is hosted on Supabase. The connection string is:

```
DATABASE_URL=postgresql://postgres:Jobbly1505!@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres
```

Add this to `.env.local` for production use. For local development, the existing `DATABASE_URL` pointing to SQLite remains unchanged — Prisma uses whichever `DATABASE_URL` is set in the environment.

### Production Environment Variables for Vercel
When deploying, these must be added to Vercel's environment variables (Settings → Environment Variables):
- All values from `.env.local` except `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_URL` = the live Vercel domain (e.g. `https://jobbly.vercel.app`)
- `DATABASE_URL` = the Supabase PostgreSQL connection string (provided by Oli)
- `NODE_ENV` = `production`

---

## PART A — IMMEDIATE FIXES (Build these first, in order)

These are fixes and improvements that must be completed before any booking system work begins. Do not start Part B until every item in Part A is verified.

---

## Pre-Flight Check

Before writing any code, complete all of the following in order:

**1. Read `CLAUDE.md`**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Confirm `job_booked_date` exists on the leads table**
Check `prisma/schema.prisma` — if missing, add `job_booked_date DateTime?` and run `npx prisma migrate dev --name add_job_booked_date`.

**3. Confirm `job_completed_at` exists on the leads table**
Same check — if missing, add and run migration before proceeding.

**4. Confirm `reconciliation_batches` table exists**
If missing, stop and flag to Oli before proceeding — do not attempt to rebuild it from scratch.

**5. Install `@aws-sdk/client-s3` if not already in `package.json`**
This package is required for Cloudflare R2 file storage in Phase 2. Run `npm install @aws-sdk/client-s3` now so it is available when needed. R2 is S3-compatible and uses this SDK.

**6. Add or update the following values in `.env.local`**

Add these lines if not already present, or update any placeholder values:

```
# Cloudflare R2 (production file storage)
CLOUDFLARE_R2_ACCOUNT_ID=77ec73ecf5ea5b470994a531c7eba522
CLOUDFLARE_R2_ACCESS_KEY_ID=861515354aeadf7a24a325ad3d28e37c
CLOUDFLARE_R2_SECRET_ACCESS_KEY=940f5f175faefcfe3d7abf47afb0edeb4342f9c47232ecffff1be5320da1420d
CLOUDFLARE_R2_BUCKET_NAME=jobbly-files
CLOUDFLARE_R2_ENDPOINT=https://77ec73ecf5ea5b470994a531c7eba522.r2.cloudflarestorage.com
CLOUDFLARE_R2_PUBLIC_URL=https://pub-72600890c2df4d52a903fbe65e126e02.r2.dev
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Production database (Supabase) — use as DATABASE_URL when deploying to Vercel
SUPABASE_DATABASE_URL=postgresql://postgres:Jobbly1505!@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres
```

**7. Verify `.gitignore`**
Confirm `.env.local` is listed. These credentials must never be committed to the repository.

**8. Do not hardcode any credentials**
All R2 credentials must be read via `process.env.CLOUDFLARE_R2_ACCOUNT_ID` etc. Never the raw strings anywhere in the codebase.

---

## Change 40 — Fix Financial Stat Cards — Ensure All Show Correct Ex GST Values

### Problem
Financial stat cards show inconsistent values across pages and roles. The "Our Margin (ex GST)" on the client dashboard shows a different number to "Total Margin Generated (ex GST)" on the client commission page — they represent the same data and must match. The discrepancy is caused by GST being incorrectly multiplied somewhere on one of the cards.

### Rule: every stat card always shows raw ex GST values — no multiplication applied

### Investigation steps
1. Find the API route powering the client dashboard "Our Margin" card — is it returning `SUM(gross_markup)` directly or applying `× 1.15`?
2. Find the API route powering the client commission page "Total Margin Generated" card — same check
3. Find where the discrepancy is and fix the incorrect one to match the correct one
4. Apply the same check to every financial card across all three roles

### Correct calculation for every card

**Admin dashboard:**
| Card | Formula |
|---|---|
| Total Billed to Customers (ex GST) | `SUM(customer_price)` WHERE `status = 'JOB_COMPLETED'` |
| Our Margin (ex GST) | `SUM(gross_markup)` WHERE `status = 'JOB_COMPLETED'` |
| Commission Received (ex GST) | `SUM(omniside_commission)` WHERE `status = 'JOB_COMPLETED'` AND reconciled |
| Commission Owed to Me (ex GST) | `SUM(omniside_commission)` WHERE `status = 'JOB_COMPLETED'` AND NOT reconciled |

**Client dashboard:**
| Card | Formula |
|---|---|
| Total Billed to Customers (ex GST) | `SUM(customer_price)` WHERE `status = 'JOB_COMPLETED'` |
| Our Margin (ex GST) | `SUM(gross_markup)` WHERE `status = 'JOB_COMPLETED'` |

**Subcontractor dashboard:**
| Card | Formula |
|---|---|
| Total Billed to Customers (ex GST) | `SUM(customer_price)` WHERE `status = 'JOB_COMPLETED'` |
| Total Jobs Revenue (ex GST) | `SUM(contractor_rate)` WHERE `status = 'JOB_COMPLETED'` |

**Client commission page:**
| Card | Formula |
|---|---|
| Total Margin Generated (ex GST) | `SUM(gross_markup)` WHERE `status = 'JOB_COMPLETED'` |
| Total Margin (incl. GST) | `SUM(gross_markup) × 1.15` — intentional, correctly labelled |

Both client commission page cards must exist and display correctly. The fix is accuracy only — not removing either card.

### Manual verification required
After fixing, manually sum `gross_markup` for all JOB_COMPLETED leads in the database. Confirm the "Our Margin" card on admin dashboard, client dashboard, and client commission page all show that same number.

---

## Change 41 — "Needs Action" as a Standalone Button on the Dashboard Filter Bar

### Problem
"Needs Action" is buried in the status dropdown. It should be a permanent standalone button on the filter bar.

### New filter bar layout
```
[Search bar]    [⚠ Needs Action (4)]  [All Statuses ▼]  [All time ▼]
```

### Button behaviour
- Default (inactive): amber outlined style — amber border, amber text
- Active: amber filled, white text
- Shows count badge when flagged leads exist: "⚠ Needs Action (4)"
- No badge when count is 0 — button still visible
- Clicking activates filter — All Statuses dropdown resets, two filters are mutually exclusive
- Clicking again deactivates — returns to all leads
- Works alongside date range filter simultaneously
- URL updates with `?filter=needs-action` when active

### Status dropdown update
Remove "Needs Action" from the All Statuses dropdown. It now lives only as the standalone button.

### Applies to
- Admin `/dashboard`
- Subcontractor `/jobs`
- CLIENT does not see this button

### Notes
- Button count uses same `GET /api/needs-action` call as the sidebar badge — same number always
- Mobile: button sits above dropdowns if space is tight

---

## Change 42 — Fix Subcontractor Route Access to Notifications and Audit Log

### Problem
Subcontractors are still redirected to login when clicking Notifications or Audit Log. Previously attempted, still broken.

### Investigation — check all four locations
1. `middleware.ts` — confirm SUBCONTRACTOR is in allowed roles for `/notifications/*` and `/audit/*`
2. `app/notifications/page.tsx` — check for any page-level role check blocking SUBCONTRACTOR
3. `app/audit/page.tsx` — same check
4. Any shared layout component wrapping these pages — check for role restrictions
5. `GET /api/notifications` and `GET /api/audit` — confirm they return data for SUBCONTRACTOR sessions

Fix wherever the block is found — could be any or all of the above.

### After fix — test exactly this
1. Log in as subcontractor → click Notifications → page loads with campaign notifications
2. Log in as subcontractor → click Audit Log → page loads with campaign audit entries
3. Log in as client → confirm neither page is accessible
4. Confirm subcontractor only sees their campaign data on both pages

---

## Change 43 — Clickable Leads in Commission Expanded Month View

### Problem
Lead rows inside expanded month cards on the Commission page are not clickable.

### What needs to happen
Every lead row in an expanded commission month card must navigate to the lead detail page on click.

### Navigation
- Admin/Client: click row → `/leads/[quoteNumber]?from=commission`
- Subcontractor: click row → `/jobs/[quoteNumber]?from=commission`

### Back button
On the lead detail page, when `from=commission` is in the URL:
- Show "← Back to Commission" instead of default back button
- Clicking navigates to `/commission`

### Row styling
- `cursor-pointer` on hover
- Subtle background highlight on hover

---

## Part A Build Order

1. Change 40 — investigate and fix financial stat card GST values
2. Verify all cards manually against database ground truth
3. Change 41 — Needs Action standalone button, remove from dropdown
4. Change 42 — subcontractor route access — check all four locations
5. Change 43 — clickable commission leads with back button
6. Verify all changes working across all three roles
7. Bump version `package.json` (PATCH bump)
8. Commit: `v[X.X.X] — fix stat card GST, Needs Action button, subcontractor routes, clickable commission leads`
9. Run Vibstr build report

## Part A Checklist

**Change 40**
- [ ] Root cause of GST discrepancy identified and documented
- [ ] "Our Margin" on client dashboard = "Total Margin Generated" on client commission page — identical values
- [ ] All financial cards return raw ex GST database values — no multiplication
- [ ] Total Margin (incl. GST) on client commission page = gross_markup sum × 1.15 — correct and intentional
- [ ] Both client commission cards exist and display
- [ ] All values verified manually against database

**Change 41**
- [ ] Standalone "⚠ Needs Action" button on filter bar for admin and subcontractor
- [ ] "Needs Action" removed from All Statuses dropdown
- [ ] Button shows count badge when leads flagged
- [ ] Amber outlined inactive, amber filled active
- [ ] Mutually exclusive with status dropdown filter
- [ ] Works alongside date range filter
- [ ] URL param updates correctly
- [ ] Button count matches sidebar badge count

**Change 42**
- [ ] Subcontractor accesses /notifications without redirect
- [ ] Subcontractor accesses /audit without redirect
- [ ] Both pages show only subcontractor's campaign data
- [ ] Client cannot access either page
- [ ] Admin access unchanged

**Change 43**
- [ ] Lead rows in expanded commission month view are clickable
- [ ] Admin/client rows navigate to /leads/[quoteNumber]?from=commission
- [ ] "← Back to Commission" shown on lead detail when from=commission
- [ ] Works on mobile

---
---

## PART B — BOOKING SYSTEM (Build after Part A is complete and verified)

### Status: Do not begin until Part A checklist is fully ticked off

---

## Overview

Part B introduces a significant redesign of the subcontractor workflow and a new customer-facing booking system. It is broken into five phases. Build them in order — each phase depends on the previous.

---

## Phase 1 — Subcontractor View Simplification

### P1.1 Sidebar navigation

**Remove:** Audit Log tab

**Add:** Completed Jobs tab (replaces Audit Log position)

**Updated sidebar:**
```
[Jobbly wordmark]

⚠️  Needs Action    [badge]
📊  Dashboard
🔧  Jobs
✅  Completed Jobs
🔔  Notifications

─────────────────
👤  [User name]
🚪  Log out
```

### P1.2 Dashboard stat cards — remove Total Billed to Customers

Subcontractor dashboard shows:
- Total Leads, Quotes Sent, Jobs Booked, Jobs Completed, Total Jobs Revenue (ex GST)

Remove: Total Billed to Customers (ex GST)

### P1.3 Main jobs table — active jobs only

`/jobs` shows only leads where `status != 'JOB_COMPLETED'`. Remove "Job Completed" from the status filter dropdown on this page.

### P1.4 Completed Jobs page (`/completed-jobs`)

New page — read only.

**Table columns:** Quote number, Customer name, Property address, Date completed, Contractor rate (ex GST), Invoice download
Sorted: most recently completed first
Row click: navigates to `/jobs/[quoteNumber]`
Add to middleware: SUBCONTRACTOR access only (admin can also access)

### P1.5 Green "new lead" dot

Small green dot (`bg-green-500`) on any `LEAD_RECEIVED` row that has had no subcontractor action.

- Disappears when status moves to `QUOTE_SENT`
- Distinct from amber/red urgency dots
- Green dot count adds to Needs Action badge total

### P1.6 Strip customer details on subcontractor job detail

`/jobs/[quoteNumber]` shows only:
- Customer name
- Property address
- Google Maps link
- Quote number
- Date received

Remove phone number. Email already hidden — confirm stays hidden.

### P1.7 Fix status filter on subcontractor jobs table

Filter applies immediately on selection — no button press. Same auto-apply as Change 22.

---

## Phase 2 — Quote Upload Workflow

### P2.1 New database fields on leads

```prisma
quote_url              String?
quote_uploaded_at      DateTime?
quote_uploaded_by      String?
booking_token          String?    @unique
```

Run migration before any other Phase 2 work.

### P2.2 Job types — new settings and field

Introduce job types to the campaign settings. This allows different booking durations per job type.

**New database table:**
```prisma
model JobType {
  id                String   @id @default(uuid())
  campaign_id       String
  campaign          Campaign @relation(fields: [campaign_id], references: [id])
  name              String   // e.g. "Standard Gutter Clean"
  duration_minutes  Int      // e.g. 120
  sort_order        Int      // display order in UI
  created_at        DateTime @default(now())
}
```

**Default job types created on campaign setup (editable at any time in settings):**

| # | Name | Duration |
|---|---|---|
| 1 | Standard Gutter Clean | 120 minutes (2 hours) |
| 2 | Mid-Range Clean | 240 minutes (4 hours) |
| 3 | Full Service Clean | 360 minutes (6 hours) |

**Add to leads table:**
```prisma
job_type_id  String?   // FK → job_types.id — set when quote is uploaded
```

**Add to Campaign Settings — new Section 5a: Job Types**
Before the Booking Availability section. Shows a list of job types with name and duration, each editable. Admin can add, edit, or remove job types at any time.

### P2.3 Replace "Move to Quote Sent" with "Upload Quote"

On subcontractor job detail page at `LEAD_RECEIVED`:

```
Current Status
LEAD RECEIVED

[Upload Quote]
```

"Upload Quote" opens a drag-and-drop modal:
- Title: "Upload Quote"
- Subtext: "Upload the quote PDF to send to the customer. PDF only — max 10MB."
- File type: PDF only
- Job type selector: dropdown showing all job types for this campaign (e.g. Standard Gutter Clean, Mid-Range, Full Service) — required before upload button activates
- Upload button: "Upload & Send Quote" — disabled until both file and job type selected

### P2.4 What happens on upload

Automatically in sequence:
1. Save quote PDF — store in same system as invoices (local dev filesystem, Cloudflare R2 in production — see P2.5)
2. Set `quote_url`, `quote_uploaded_at`, `quote_uploaded_by` on lead
3. Set `job_type_id` on lead from selected job type
4. Auto-advance status: `LEAD_RECEIVED` → `QUOTE_SENT` — write to audit log
5. Generate `booking_token` (UUID v4) — store on lead
6. Send quote email to customer (Phase 3)
7. Schedule follow-up email sequence (Phase 3)
8. Show success message to PWB: "Quote uploaded and sent to the customer."

### P2.5 File storage — Cloudflare R2

For production deployment, quote PDFs and invoices must be stored in Cloudflare R2, not on the local filesystem.

**Why R2 not GitHub:** GitHub is for code only — storing binary files there bloats the repo and is not designed for file serving. Cloudflare R2 is purpose-built object storage with a generous free tier (10GB free), no egress fees, and S3-compatible API.

**All R2 credentials are already configured in `.env.local` via the Pre-Flight step.** Do not add them again here — they are already present. Simply implement the R2 upload logic using `process.env.CLOUDFLARE_R2_*` environment variables.

**Implementation:**
- In development (`NODE_ENV !== 'production'`): files save to local `./uploads` directory — unchanged from current behaviour
- In production (`NODE_ENV === 'production'`): files upload to R2 using the `@aws-sdk/client-s3` package
- Use `S3Client` from `@aws-sdk/client-s3` configured with the R2 endpoint and credentials
- The stored URL in `quote_url` and `invoice_url` uses `CLOUDFLARE_R2_PUBLIC_URL` as the base
- This same R2 logic applies to invoice uploads as well — migrate both quote and invoice storage to R2 in production

---

## Phase 3 — Email Sequence Infrastructure

### P3.1 New database table

```prisma
model ScheduledEmail {
  id             String   @id @default(uuid())
  lead_id        String
  lead           Lead     @relation(fields: [lead_id], references: [id])
  email_type     String   // "quote_initial" | "quote_reminder_24h" | "quote_reminder_final"
  scheduled_for  DateTime
  sent           Boolean  @default(false)
  cancelled      Boolean  @default(false)
  created_at     DateTime @default(now())
}
```

Run migration.

### P3.2 Email sender address

All emails use `EMAIL_FROM` from `.env.local`. Currently set to `oli@omnisideai.com` for development and testing. When Continuous Group's email address is confirmed, update this environment variable — no code changes needed.

### P3.3 Email 1 — Initial quote email to customer

**Trigger:** Quote uploaded
**To:** `customer_email` on the lead record
**Subject:** `Your gutter cleaning quote — [Property Address]`
**Attach:** Quote PDF

**Body:**
```
Hi [Customer Name],

Thank you for your interest in our gutter cleaning service.
Please find your quote attached.

Quote details:
Property: [Property Address]
Quote number: [Quote Number]
Price: $[customer_price ex GST] + GST = $[customer_price incl. GST]

To book your job, click the link below and choose a time that suits you:

[BOOK NOW → https://[domain]/book/[booking_token]]

This quote is valid for 30 days.

If you have any questions, please don't hesitate to get in touch.

Jobbly by Omniside AI
```

**If `customer_email` is null or empty:**
- Do not attempt to send the email
- Send an alert email to `EMAIL_OLI` (from `.env.local`) with subject: "Action required — customer email missing"
- Body: "The lead [Quote Number] — [Customer Name] — [Property Address] was received without a customer email address. The quote has been uploaded but the email could not be sent. Please obtain the customer's email address and send manually."
- Still complete all other steps (status advance, booking token generation, schedule follow-ups if email is added later)

### P3.4 Follow-up emails

**Email 2 — 24-hour reminder**
Scheduled 24 hours after quote upload. Sends only if `status` is still `QUOTE_SENT` at send time.
Subject: `Don't forget — your gutter cleaning quote is waiting`
Body: Shortened version of Email 1 with same booking link. Attach quote PDF again.

**Email 3 — Final reminder**
Scheduled 5 days after quote upload (4 days after Email 2). Sends only if still `QUOTE_SENT`.
Subject: `Final reminder — your gutter cleaning quote`
Body: Short final reminder. Same booking link. Same PDF.

**After Email 3:** No more emails.

**Cancellation:** When status moves to `JOB_BOOKED`, immediately set `cancelled = true` on all `ScheduledEmail` records for that lead where `sent = false`.

### P3.5 Background cron job for email processing

A cron endpoint at `POST /api/cron/process-emails`:
- Finds all `ScheduledEmail` records where `sent = false` AND `cancelled = false` AND `scheduled_for <= now()`
- For each: checks the lead's current status — only sends if lead is still `QUOTE_SENT`
- Sends the email via Resend
- Sets `sent = true` on the record
- In production: runs every 15 minutes via a Vercel cron job (configured in `vercel.json`)

**Local development testing:**
The cron endpoint can be triggered manually during development:
```bash
curl -X POST http://localhost:3000/api/cron/process-emails
```
This allows testing the email sequence without waiting for a scheduled trigger. Add a note in the README explaining this.

### P3.6 Booking confirmation email to customer

**Trigger:** Customer confirms booking on booking page
**Subject:** `Booking confirmed — [Property Address]`

```
Hi [Customer Name],

Your gutter cleaning has been booked.

Property: [Property Address]
Date: [e.g. Wednesday 5 April 2026]
Time: [e.g. 7:00am – 9:00am]
Job type: [e.g. Standard Gutter Clean]
Quote number: [Quote Number]

We'll see you then. If you need to make any changes, please contact us.

Jobbly by Omniside AI
```

### P3.7 Booking notification email to PWB

**Trigger:** Customer confirms booking
**Subject:** `New job booked — [Quote Number] — [Customer Name]`

```
Hi,

A customer has booked a job.

Quote number: [Quote Number]
Customer: [Customer Name]
Property: [Property Address]
Google Maps: [maps URL]
Job type: [e.g. Standard Gutter Clean]
Date: [date]
Time: [time range]

Log in to Jobbly to view the full details:
[https://[domain]/jobs/[quoteNumber]]

Jobbly by Omniside AI
```

**To:** All SUBCONTRACTOR users in the campaign where `notify_new_lead = true`

---

## Phase 4 — Admin Availability Calendar

### P4.1 New database tables

```prisma
model AvailabilitySlot {
  id                String    @id @default(uuid())
  campaign_id       String
  campaign          Campaign  @relation(fields: [campaign_id], references: [id])
  date              DateTime
  start_time        String    // "07:00"
  end_time          String    // "13:00"
  notes             String?
  created_at        DateTime  @default(now())
  bookings          Booking[]
}

model Booking {
  id              String           @id @default(uuid())
  slot_id         String
  slot            AvailabilitySlot @relation(fields: [slot_id], references: [id])
  lead_id         String           @unique
  lead            Lead             @relation(fields: [lead_id], references: [id])
  window_start    String           // "07:00"
  window_end      String           // "09:00"
  booked_at       DateTime         @default(now())
  held_until      DateTime?
  held_by_token   String?
  status          BookingStatus    @default(HELD)
}

enum BookingStatus {
  HELD
  CONFIRMED
}
```

Run migrations.

### P4.2 How slots and windows work

An `AvailabilitySlot` defines a block of time on a date (e.g. 5 April, 7am–1pm). When a customer views the booking page, Jobbly generates the available windows from that slot based on the lead's `job_type.duration_minutes`.

Example:
- Slot: 5 April, 7:00–13:00
- Lead job type: Standard Gutter Clean (120 min)
- Generated windows: 7:00–9:00, 9:00–11:00, 11:00–13:00

A window is unavailable if a confirmed booking exists covering that time range.

### P4.3 Campaign Settings — Section 5a: Job Types (already in Phase 2)

### P4.4 Campaign Settings — Section 5b: Booking Availability

Located in Campaign Settings below Job Types section.

Shows a chronological list of all defined availability slots:
- Date, time range, notes, bookings taken vs total possible
- Edit button, Delete button (disabled if any confirmed bookings exist for that slot)

**Add Slot button** opens a form:
- Date picker
- Start time picker
- End time picker
- Notes (optional, internal only)

Slots in the past shown in muted style — kept for records, not editable.

---

## Phase 5 — Customer Booking Page

### P5.1 Public route

`/book/[booking_token]` — publicly accessible, no login required.

Middleware must explicitly allow this route without authentication. All other app routes remain protected.

**Important deployment note:** The booking link sent in emails is constructed as `${NEXT_PUBLIC_APP_URL}/book/${booking_token}`. In `.env.local` this is set to `http://localhost:3000` for development. When the app is deployed to production (Vercel), `NEXT_PUBLIC_APP_URL` must be updated to the live domain (e.g. `https://jobbly.vercel.app` or a custom domain). Flag this to Oli when deployment is ready — the booking links in emails will not work correctly until this is updated.

### P5.2 Booking page content

**Jobbly branding** — Jobbly logo, Jobbly colours. No client or subcontractor branding.

**Quote details card:**
- Customer name
- Property address
- Quote number
- Job type (e.g. "Standard Gutter Clean — 2 hours")
- Price: $[customer_price ex GST] + GST = $[incl. GST]
- Download Quote button → quote PDF

**Slot picker:**
- Heading: "Choose a time that works for you"
- Grid of available windows generated from `AvailabilitySlot` records for this campaign
- Each window card: date (e.g. "Wednesday 5 April"), time range (e.g. "7:00am – 9:00am")
- Duration shown: "2 hour slot"

**Window states:**
- Available: selectable, normal style
- Held by another customer (held_until > now): "Temporarily unavailable" — greyed out, not selectable
- Confirmed booking exists: hidden entirely
- Selected by current user: brand accent highlight

**After slot selection:**
- Countdown timer appears: "Reserved for you for 9:45"
- "Confirm Booking" primary button becomes active

**Already booked state** (if `job_booked_date` is set on the lead):
```
✅ Your job is booked

Date: Wednesday 5 April 2026
Time: 7:00am – 9:00am
Address: [property address]

If you need to change your booking, please contact us.
```

**No slots available state:**
```
No times are currently available for booking.
Please contact us to arrange a time.
```

### P5.3 Slot hold API

`POST /api/book/[token]/hold`
- Body: `{ slot_id, window_start, window_end }`
- Checks window is not already held or confirmed
- If another hold exists for this token: release it first
- Creates or updates a Booking record: `status = HELD`, `held_until = now + 10 minutes`, `held_by_token = token`
- Returns: `{ success: true, held_until: [timestamp], window_start, window_end }`
- Rate limit: 20 requests per IP per minute

### P5.4 Confirm booking API

`POST /api/book/[token]/confirm`
- Body: `{ slot_id, window_start, window_end }`
- Validates: token is valid, window is held by this token, held_until > now
- Updates Booking: `status = CONFIRMED`, clears `held_until` and `held_by_token`
- Updates lead: `status = JOB_BOOKED`, `job_booked_date = booked date`
- Cancels scheduled follow-up emails for this lead
- Sends booking confirmation email to customer
- Sends booking notification email to PWB
- Returns: `{ success: true, booking_date, booking_time }`

### P5.5 Get available slots API

`GET /api/book/[token]/slots`
- Validates token
- Fetches all `AvailabilitySlot` records for the campaign where date >= today
- For each slot: generates windows based on lead's job type duration
- For each window: checks for confirmed bookings (hidden) and active holds (shown as temporarily unavailable)
- Returns: structured list of slots with windows and their availability status

### P5.6 Security

**Token design:**
- UUID v4 — unguessable, one per lead
- Never expires — link works forever
- Stored in `leads.booking_token` with `@unique` constraint

**Hold security:**
- Stored server-side only — `bookings.held_until`
- Customer cannot extend hold by any browser manipulation
- Server always uses stored `held_until` timestamp

**What cannot happen:**
- Book multiple slots: `lead_id @unique` on Booking table
- Extend hold: server timestamp is authoritative
- Spam the page: rate limiting on all public booking endpoints

**What can happen by design:**
- Customer clicks link multiple times — shows their booking or the slot picker
- If hold expires, slot returns to available and can be selected again — no need to re-request the link
- Customer can select a different slot before confirming — previous hold is released automatically

---

## New Environment Variables (already added to `.env.local` in Pre-Flight — verify they are present)

```
# Cloudflare R2 (production file storage)
CLOUDFLARE_R2_ACCOUNT_ID=77ec73ecf5ea5b470994a531c7eba522
CLOUDFLARE_R2_ACCESS_KEY_ID=861515354aeadf7a24a325ad3d28e37c
CLOUDFLARE_R2_SECRET_ACCESS_KEY=940f5f175faefcfe3d7abf47afb0edeb4342f9c47232ecffff1be5320da1420d
CLOUDFLARE_R2_BUCKET_NAME=jobbly-files
CLOUDFLARE_R2_ENDPOINT=https://77ec73ecf5ea5b470994a531c7eba522.r2.cloudflarestorage.com
CLOUDFLARE_R2_PUBLIC_URL=https://pub-72600890c2df4d52a903fbe65e126e02.r2.dev
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Production database (Supabase PostgreSQL)
# Use this as DATABASE_URL when deploying to production
# For local development, keep the existing SQLite DATABASE_URL unchanged
SUPABASE_DATABASE_URL=postgresql://postgres:Jobbly1505!@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres
```

`NEXT_PUBLIC_APP_URL` is used to construct booking links in emails: `${NEXT_PUBLIC_APP_URL}/book/${booking_token}`

For production deployment, update `NEXT_PUBLIC_APP_URL` to the live domain. All other R2 values are already production-ready.

**When deploying to Vercel**, add these environment variables in Vercel's dashboard (Settings → Environment Variables):
- All values above
- `DATABASE_URL` = the Supabase connection string (copy from `SUPABASE_DATABASE_URL` above)
- `NEXT_PUBLIC_APP_URL` = your live Vercel domain (e.g. `https://jobbly.vercel.app`)
- `NODE_ENV` = `production`

---

## Part B Build Order

### Phase 1 — Subcontractor simplification
1. Remove audit log from subcontractor sidebar
2. Add Completed Jobs tab and page
3. Remove Total Billed to Customers from subcontractor dashboard
4. Active-only jobs table — completed jobs go to Completed Jobs tab
5. Green new-lead dot
6. Strip customer details on job detail page
7. Fix status filter auto-apply

### Phase 2 — Quote upload
1. Database migrations: `quote_url`, `quote_uploaded_at`, `quote_uploaded_by`, `booking_token` on leads
2. `job_types` table and default data (Standard 120min, Mid-Range 240min, Full Service 360min)
3. `job_type_id` on leads table
4. Job Types section in Campaign Settings (Section 5a)
5. Replace Move to Quote Sent with Upload Quote modal (with job type selector)
6. Upload handler: save file, set fields, advance status, generate booking token
7. Cloudflare R2 file storage setup (production only)

### Phase 3 — Email infrastructure
1. `scheduled_emails` table migration
2. Email functions: quote initial, 24h reminder, final reminder, booking confirmation, PWB notification
3. Missing email alert to Oli when customer_email is null
4. Schedule follow-up emails on quote upload
5. Cron endpoint `POST /api/cron/process-emails`
6. Cancellation logic when job is booked

### Phase 4 — Availability calendar
1. `availability_slots` and `bookings` tables migration
2. Booking Availability section in Campaign Settings (Section 5b)
3. Slot creation, editing, deletion UI
4. Window generation logic from slot + job type duration

### Phase 5 — Booking page
1. Public `/book/[token]` route — add to middleware allowlist
2. Booking page UI (Jobbly branding, quote details, slot picker)
3. `GET /api/book/[token]/slots` — available windows with hold status
4. `POST /api/book/[token]/hold` — 10-minute hold
5. `POST /api/book/[token]/confirm` — confirm booking, trigger emails, update lead status
6. Already-booked state on booking page
7. No-slots-available state

---

## Part B Checklist — Phase 1

- [ ] Audit log tab removed from subcontractor sidebar
- [ ] Completed Jobs tab added to subcontractor sidebar
- [ ] /completed-jobs page shows only JOB_COMPLETED leads with correct columns
- [ ] Total Billed to Customers card removed from subcontractor dashboard
- [ ] /jobs table shows only non-completed leads
- [ ] Job Completed removed from /jobs status filter dropdown
- [ ] Green dot appears on LEAD_RECEIVED rows with no subcontractor action
- [ ] Green dot disappears when status moves to QUOTE_SENT
- [ ] Green dot count contributes to Needs Action badge
- [ ] Subcontractor job detail shows: name, address, maps link, quote number, date received only
- [ ] Phone number removed from subcontractor job detail
- [ ] Status filter on /jobs applies immediately — no button press

## Part B Checklist — Phase 2

- [ ] Database migrations complete — all new fields on leads exist
- [ ] JobType table created with three default entries
- [ ] job_type_id on leads table
- [ ] Job Types section in Campaign Settings editable
- [ ] Upload Quote button replaces Move to Quote Sent on subcontractor job detail
- [ ] Upload modal has job type selector and file drop zone
- [ ] Upload activates only when both file and job type are selected
- [ ] On upload: file saved, fields set, status advances to QUOTE_SENT, booking token generated
- [ ] Cloudflare R2 used in production — local filesystem in development

## Part B Checklist — Phase 3

- [ ] scheduled_emails table created
- [ ] Quote initial email sends to customer on upload with PDF attached
- [ ] If customer_email null: alert email sent to Oli, no crash
- [ ] 24h reminder scheduled on upload
- [ ] Final reminder scheduled on upload (5 days after upload)
- [ ] Cron endpoint processes due emails every 15 minutes in production
- [ ] Follow-ups only send if status is still QUOTE_SENT at send time
- [ ] All pending follow-ups cancelled when status moves to JOB_BOOKED
- [ ] Booking confirmation email sent to customer on booking
- [ ] Booking notification email sent to PWB on booking

## Part B Checklist — Phase 4

- [ ] availability_slots table created
- [ ] bookings table created
- [ ] Booking Availability section in Campaign Settings
- [ ] Admin can add, edit, delete slots
- [ ] Delete blocked if confirmed bookings exist for that slot
- [ ] Window generation logic correct — uses lead's job type duration

## Part B Checklist — Phase 5

- [ ] /book/[token] accessible without login
- [ ] Booking page shows Jobbly branding, quote details, job type, price
- [ ] Download Quote button works
- [ ] Available windows shown correctly based on slot + job type duration
- [ ] Held windows shown as "Temporarily unavailable"
- [ ] Confirmed/booked windows hidden entirely
- [ ] Selecting a window triggers 10-minute hold server-side
- [ ] Countdown timer shown to customer holding a slot
- [ ] Selecting a different window releases previous hold
- [ ] Confirm Booking updates lead to JOB_BOOKED with correct date and time
- [ ] Booking confirmation email sent to customer
- [ ] PWB notification email sent
- [ ] Booking page shows already-booked state if lead is JOB_BOOKED
- [ ] No-slots-available state shown if no future slots exist
- [ ] Rate limiting on all public booking endpoints
- [ ] One booking per lead enforced at database level

## Final

- [ ] Version bumped in `package.json` (MINOR bump for Part A, MAJOR bump after Part B)
- [ ] Committed with correct message format
- [ ] Vibstr build report sent
