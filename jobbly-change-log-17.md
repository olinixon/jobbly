# Jobbly — Change Log 17
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Starter Prompt

Open the Jobbly project at `/Users/oliver/Claude Code/jobbly` and read this changelog in full before writing a single line of code. There are four changes in this session. Complete them in order. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

---

## Context

Four focused improvements following the CL16 build. No database schema migrations are required for Changes 1, 2, and 3. Change 4 requires one schema addition. Read all four changes before starting.

---

## Pre-Flight Check — Required Before Starting

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Read the current version**
Open `package.json` and note the current version. All four changes are **PATCH bumps** — increment the PATCH number for each, except Change 4 which is a **MINOR bump**.

**3. Locate and read these files before starting**

- `app/jobs/[quoteNumber]/page.tsx` — subcontractor job detail
- `app/leads/[quoteNumber]/page.tsx` — admin lead detail
- `app/client/leads/[quoteNumber]/page.tsx` — client lead detail
- The invoice upload component and handler — wherever they live
- The job report upload component and handler — wherever they live
- The "Book This Job" UI section built in CL16 — read it fully before restyling
- `PATCH /api/jobs/[quoteNumber]/book` — read in full before updating
- `POST /api/jobs/[quoteNumber]/complete` — read in full before extending
- The existing AI invoice analysis function — read in full before reusing

**4. Sync production database**

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports any errors — stop and report to Oli before proceeding.

Only after all four checks pass — begin building in the order listed below.

---

## Shared Rules — Apply to All Changes in This Session

These rules apply everywhere in this changelog. Do not repeat them per-change — just follow them throughout.

**File upload validation (apply to every file upload in the system):**
- Maximum file size: 10MB per file
- Accepted file types: PDF, JPG, PNG only
- If a file fails validation, show a specific dismissable error pop-up (not an inline message) explaining exactly what went wrong:
  - Over size: "This file is [X]MB. The maximum allowed size is 10MB. Please compress or reduce the file and try again."
  - Wrong type: "This file type ([extension]) is not supported. Please upload a PDF, JPG, or PNG."
- The pop-up appears immediately on file selection — before any upload is attempted
- Validation runs client-side first, then also enforced server-side on all upload endpoints
- On server-side rejection: return 400 with the same specific message

**Document replace behaviour:**
- All uploaded documents (invoice and job report) must show a "Replace" option once uploaded
- Clicking "Replace" opens the file picker directly — no confirmation modal needed
- The new file replaces the old one in R2 and updates the lead fields accordingly
- This applies across all role views (admin, subcontractor) at JOB_BOOKED status
- Client view is read-only — no Replace option for client

**Role access at JOB_BOOKED status:**
- ADMIN: full access — can upload invoice, upload job report, replace either, and trigger Submit Job
- SUBCONTRACTOR: full access — same as admin
- CLIENT: read-only — can view documents (download links only), cannot upload, replace, or submit

---

## Change 1 — [#163] Restyle "Book This Job" Section — Compact Actions Card

### Background

The "Book This Job" section built in CL16 is currently too large and visually dominant on the subcontractor job detail page. It needs to be restyled to sit inside a compact "Actions" card — consistent with how the admin lead detail page presents its action area. The layout should feel clean and lightweight, not like a form taking over the page.

This is a **PATCH bump**.

---

### What to change

On the subcontractor job detail page (`/jobs/[quoteNumber]`), at `LEAD_RECEIVED` status, restyle the "Book This Job" section as a compact card.

**Target layout:**

```
┌─────────────────────────────────────┐
│  Actions                            │
│  ─────────────────────────────────  │
│  Book this job                      │
│                                     │
│  Job date   [date input]  [Today]   │
│                                     │
│             [  Job Booked  ]        │
└─────────────────────────────────────┘
```

**Design rules:**
- The outer container is a card — same visual style as other cards on the page (border, rounded corners, consistent padding). Match the card style used elsewhere on the admin lead detail page for reference.
- The card header reads "Actions" in the same style as other card headers on the page
- Inside the card: a small subdued label "Book this job" — not a large heading
- Below that: the date picker and "Today" button on the same row — both compact in height
- Below that: the "Job Booked" primary button — right-aligned within the card
- The date picker should be narrow enough to sit comfortably next to the "Today" button without wrapping on desktop
- On mobile: date picker goes full width, "Today" button sits below it, "Job Booked" button full width below that
- Remove any section heading that previously read "Book This Job" as a large standalone header — the card header "Actions" replaces it
- Validation error ("Please select the booked job date") appears as small red text below the date picker row — not as a large separate error block
- The success pop-up ("Well done on getting the job booked! 🎉") behaviour is unchanged

**Extract this as a reusable component.** Name it `BookThisJobCard` or similar. Change 2 will import and reuse this exact component on the admin and client views — do not build separate implementations.

**Do not change any of the underlying logic or API calls** — only the visual presentation and component extraction.

---

### Build order for Change 1

1. Locate the "Book This Job" section on the subcontractor job detail page
2. Extract it as a reusable `BookThisJobCard` component
3. Restyle it as a compact "Actions" card matching the design rules above
4. Confirm the subcontractor job detail page renders identically using the extracted component
5. Confirm mobile layout stacks correctly
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply PATCH version bump in `package.json`
8. Commit: `v[version] — restyle Book This Job as compact Actions card, extract reusable component`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 2 — [#164] Add Job Booked Action to Admin and Client Lead Detail Pages

### Background

The "Book This Job" action currently only exists on the subcontractor job detail page. Admin users also need to be able to manually log a job booked date — for example when a booking is confirmed outside of Jobbly. Client gets the same card for visibility and manual use. The reusable `BookThisJobCard` component built in Change 1 is imported and used here — do not build a new version.

This is a **PATCH bump**.

---

### What to change

**Update the API endpoint** (`PATCH /api/jobs/[quoteNumber]/book`):
- Currently restricted to SUBCONTRACTOR role only
- Update to accept ADMIN and CLIENT roles as well
- All other validation unchanged: lead must be LEAD_RECEIVED, date must be valid
- The audit log entry must record the actual logged-in user's name — never "System" or blank. Verify this is happening correctly for all three roles.

**Admin lead detail (`/leads/[quoteNumber]`):**
- At `LEAD_RECEIVED` status: import and render `BookThisJobCard` — same compact style
- At `JOB_BOOKED` or `JOB_COMPLETED` status: do not render the card at all — no empty container, no placeholder

**Client lead detail (`/client/leads/[quoteNumber]`):**
- Same as admin — import and render `BookThisJobCard` at `LEAD_RECEIVED` only

**Success behaviour on all three role views:**
- On success: show the same 4-second "Well done on getting the job booked! 🎉" pop-up
- Page refreshes lead data to show JOB_BOOKED status
- The Actions card hides — replaced by the document upload section appropriate to the role

---

### Build order for Change 2

1. Update `PATCH /api/jobs/[quoteNumber]/book` — accept ADMIN and CLIENT roles
2. Verify audit log writes the correct user name for all three roles
3. Import `BookThisJobCard` into admin lead detail — render at LEAD_RECEIVED only
4. Import `BookThisJobCard` into client lead detail — render at LEAD_RECEIVED only
5. Confirm card does not render at JOB_BOOKED or JOB_COMPLETED on any role view
6. Confirm success pop-up appears on all three role views
7. Run `npx tsc --noEmit` — confirm no TypeScript errors
8. Apply PATCH version bump in `package.json`
9. Commit: `v[version] — add Job Booked action to admin and client lead detail`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

---

## Change 3 — [#165] Smarter Document Submission — Status Indicators, Replace, Multi-Upload, and Submit Confirmation

### Background

Four improvements to the document upload flow at `JOB_BOOKED` status:

1. Clear status indicators per document (Needed / Uploaded) so it's always obvious what's missing
2. Replace option on all uploaded documents so either file can be swapped at any time before Submit Job
3. Multi-upload option where the user selects both files at once and AI classifies which is which — including running invoice verification
4. A success pop-up after Submit Job confirming the customer has been notified

Applies to **admin and subcontractor** views. Client is read-only at JOB_BOOKED — sees document download links only, no upload actions.

This is a **PATCH bump**.

---

### Step 1 — Document status indicators and Replace option

Update the "Complete This Job" upload section on admin and subcontractor views.

**Document slot states:**

```
NOT UPLOADED:
┌──────────────────────────────────────┐
│  📄 Invoice              ⚪ Needed   │
│  [  Attach Invoice  ]                │
└──────────────────────────────────────┘

UPLOADED:
┌──────────────────────────────────────┐
│  📄 Invoice              ✅ Uploaded  │
│  filename.pdf   [Download]  [Replace]│
└──────────────────────────────────────┘

JOB REPORT — NOT UPLOADED:
┌──────────────────────────────────────┐
│  📋 Job Report           ⚪ Needed   │
│  [  Attach Job Report  ]             │
└──────────────────────────────────────┘

JOB REPORT — UPLOADED:
┌──────────────────────────────────────┐
│  📋 Job Report           ✅ Uploaded  │
│  filename.pdf   [Download]  [Replace]│
└──────────────────────────────────────┘
```

- `⚪ Needed` — neutral/grey pill badge, right-aligned on the slot header row
- `✅ Uploaded` — green pill badge, right-aligned on the slot header row
- "Replace" is a small secondary text link — clicking it opens the file picker directly, no confirmation modal
- The new file overwrites the existing one in R2 and updates the lead fields

**Helper text below both slots — updates dynamically:**

| State | Helper text |
|---|---|
| Neither uploaded | "Upload the invoice and job report to complete this job." |
| Invoice only | "Invoice received ✓ — job report still needed before you can submit." |
| Job report only | "Job report received ✓ — invoice still needed before you can submit." |
| Both uploaded | "Both documents received. Ready to submit." |

**"Submit Job" button:**
- Stays disabled until both documents are present — logic unchanged
- The dynamic helper text makes the reason clear without a tooltip

**Client view at JOB_BOOKED:**
- Show both document slots in read-only state
- If a document is uploaded: show filename and Download link — no Replace, no Attach button
- If a document is not yet uploaded: show the slot label and "⚪ Needed" badge — no upload button
- Do not show the Submit Job button or helper text on the client view

---

### Step 2 — Multi-upload option

Add a "Upload Both Documents" / "Upload Both" option below the two document slots on admin and subcontractor views only.

**UI spec:**

```
    ─── or ───

  [  Upload Both Documents  ]   ← desktop label
  [  Upload Both  ]             ← mobile label (breakpoint: below md)

  Jobbly will automatically work out which file is the
  invoice and which is the job report.
```

- Secondary button, outline style — less prominent than the individual Attach buttons
- Desktop label (md and above): "Upload Both Documents"
- Mobile label (below md): "Upload Both" — use Tailwind responsive classes to swap the label, not two separate buttons
- On click: opens a file picker with `multiple` attribute set
- Client-side validation before any upload:
  - Fewer than 2 files selected: show dismissable error pop-up — "Please select two files — one invoice and one job report."
  - More than 2 files selected: show dismissable error pop-up — "Please select exactly two files."
  - Either file over 10MB: show specific pop-up — "One or more files exceed the 10MB limit. [filename] is [X]MB. Please reduce the file size and try again."
  - Either file wrong type: show specific pop-up — "One or more files are not a supported type. [filename] is a .[ext] file. Please upload PDFs, JPGs, or PNGs only."
  - If both files are identical (same name and size): show dismissable error pop-up — "Both files appear to be the same. Please select two different documents."
- If one or both document slots already have a file uploaded when multi-upload is triggered: show a confirmation pop-up before proceeding — "This will replace your existing [invoice / job report / invoice and job report]. Are you sure?" with "Yes, replace" and "Cancel" buttons. Only proceed if confirmed.
- If both slots are empty: proceed directly to upload without confirmation

---

### Step 3 — AI classification and invoice verification endpoint

Create `POST /api/jobs/[quoteNumber]/classify-documents`:

```typescript
// Auth: ADMIN and SUBCONTRACTOR only
// Lead must be in JOB_BOOKED status
// Accepts two files via multipart form request (file1, file2)

// Step 1 — Server-side file validation (enforce even if client-side passed)
// Per file: max 10MB, accepted types PDF/JPG/PNG
// If any file fails: return 400 with specific message matching client-side error format

// Step 2 — Identical file check
// Compare file sizes and names. If both are identical: return 422 —
// "Both files appear to be the same. Please select two different documents."

// Step 3 — AI classification
// Pass both files to the Claude API.
// Prompt:
//   "You are reviewing two documents uploaded for a gutter cleaning job.
//    Identify which is the invoice (a bill requesting payment from the customer)
//    and which is the job report (a completion or inspection record).
//    Respond in JSON only — no other text:
//    { \"invoice\": \"file1\" | \"file2\", \"job_report\": \"file1\" | \"file2\" }
//    If you cannot confidently determine which is which, respond:
//    { \"error\": \"Cannot identify documents\" }"
// If Claude returns error: return 422 —
// "We couldn't identify which file is the invoice and which is the job report.
//  Please upload them individually."

// Step 4 — Invoice verification (same as individual upload path)
// Once the invoice file is identified, run the existing AI invoice analysis on it
// (the same function called during Submit Job).
// If analysis returns a concern: append note to lead.notes with prefix
// [AI Invoice Review — {date}] — do not block completion or return an error to the user.
// Proceed regardless.

// Step 5 — Save both files to R2 and update lead
// Upload invoice file → existing invoice R2 path
// Upload job report file → existing job report R2 path
// Update lead: invoice_url, invoice_uploaded_at, invoice_uploaded_by,
//              job_report_url, job_report_uploaded_at, job_report_uploaded_by
// Write two rows to attachments table: one INVOICE, one JOB_REPORT
// (If replacing existing attachments, update the existing rows rather than duplicating)

// Step 6 — Return 200 with updated lead data
// UI refreshes both document slots to ✅ Uploaded with correct filenames
```

**UI feedback during classification:**
- While processing: show loading state on the button — "Analysing documents..."
- On success: both slots update to ✅ Uploaded
- On 422 (cannot classify or identical files): dismissable error pop-up with the message from the API
- On 400 (file validation): dismissable error pop-up with specific validation message
- On any other error: dismissable generic pop-up — "Something went wrong. Please try uploading the files individually."

---

### Step 4 — Submit Job success pop-up

After the Submit Job button is tapped and the `POST /api/jobs/[quoteNumber]/complete` endpoint returns 200, show a dismissable success pop-up (in addition to the existing success banner):

```
✅  Done! Your invoice and job report has been sent to the customer.
```

- Display duration: 4 seconds, then auto-dismiss
- Appears as a pop-up (toast notification style) — not replacing the page banner
- The existing full-width success banner ("Job submitted. The customer has been notified.") remains — the pop-up appears on top of or alongside it
- If `customer_email` was null and the email was not sent: change the pop-up text to:
  "✅  Job completed. No customer email on file — Oli has been notified to send the portal link manually."

---

### Build order for Change 3

1. Update document slot UI — status badges and helper text — on subcontractor job detail
2. Update document slot UI on admin lead detail
3. Add read-only document slot UI (no upload/replace) to client lead detail at JOB_BOOKED
4. Add Replace option to all uploaded document slots (admin + subcontractor only)
5. Confirm Replace uses existing upload handler — file picker opens directly, no modal
6. Add "Upload Both Documents" / "Upload Both" button on admin and subcontractor views
7. Implement all client-side file validation and error pop-ups for multi-upload
8. Build `POST /api/jobs/[quoteNumber]/classify-documents` endpoint with all validation, classification, invoice verification, and R2 save steps
9. Wire multi-upload button to classify endpoint — loading state, success, and error handling
10. Add Submit Job success pop-up (both cases: email sent and email missing)
11. Confirm "Submit Job" button still only activates when both documents are present
12. Confirm all individual upload paths are unchanged
13. Confirm client view shows download-only slots with no upload actions
14. Run `npx tsc --noEmit` — confirm no TypeScript errors
15. Apply PATCH version bump in `package.json`
16. Commit: `v[version] — document status indicators, replace, multi-upload AI classification, submit confirmation`
17. Push to GitHub: `git push origin main`
18. Run Vibstr build report per CLAUDE.md

---

## Change 4 — Rebook, Unbook, and Job Cancelled Actions

### Background

Once a lead is in `JOB_BOOKED` status, there is currently no way to change the booked date if it was entered incorrectly, revert the lead if the job falls through, or mark that a customer cancelled. This change adds three actions to the admin and subcontractor views at `JOB_BOOKED` status — keeping everyone in the loop when plans change.

This is a **MINOR bump** (new feature).

---

### Step 1 — Database migration

Add one field to the `leads` table in `schema.prisma`:

```prisma
cancellation_reason   String?   // Set when lead is marked as Job Cancelled
```

Run the migration:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

Confirm the field exists before proceeding.

Also add `JOB_CANCELLED` to the `LeadStatus` enum in `schema.prisma`:

```prisma
enum LeadStatus {
  LEAD_RECEIVED
  QUOTE_SENT        // retained for legacy data — not used in new flow
  JOB_BOOKED
  JOB_COMPLETED
  JOB_CANCELLED     // new
}
```

Run `prisma db push` again after adding the enum value. Confirm in production before building UI.

---

### Step 2 — Update the Actions card at JOB_BOOKED status

On the subcontractor job detail page and the admin lead detail page, at `JOB_BOOKED` status, the Actions card should show three options:

```
┌──────────────────────────────────────────┐
│  Actions                                 │
│  ──────────────────────────────────────  │
│                                          │
│  Booked date: [current job_booked_date]  │
│  [  Edit Booking Date  ]                 │
│                                          │
│  ──────────────────────────────────────  │
│                                          │
│  [  Unbook Job  ]     [  Job Cancelled  ]│
└──────────────────────────────────────────┘
```

**"Edit Booking Date":**
- Secondary button (outline style)
- On click: the card expands to show the same date picker and "Today" button as the original booking form
- The date picker pre-fills with the current `job_booked_date`
- A "Save" button and "Cancel" link appear below
- On save: call `PATCH /api/jobs/[quoteNumber]/rebook` with the new date
- On cancel: collapse back to the static display
- On success: the card updates to show the new date. Show a small inline confirmation — "Booking date updated ✓"

**"Unbook Job":**
- Secondary button (outline, amber/warning colour to signal caution)
- On click: show a confirmation pop-up — "Are you sure you want to unbook this job? The lead will return to Lead Received and the booked date will be cleared." with "Yes, unbook" and "Cancel"
- If confirmed: call `PATCH /api/jobs/[quoteNumber]/unbook`
- On success: lead returns to LEAD_RECEIVED status, `job_booked_date` is cleared, page refreshes to show the "Book This Job" form

**"Job Cancelled":**
- Destructive secondary button (outline, red colour)
- On click: show a confirmation pop-up with an optional reason input — "Mark this job as cancelled? Optionally add a reason:" with a short text input (max 200 characters), a "Confirm Cancellation" button, and a "Keep Job" cancel link
- If confirmed: call `PATCH /api/jobs/[quoteNumber]/cancel` with the optional reason
- On success: lead moves to `JOB_CANCELLED` status, `cancellation_reason` is saved, page refreshes

**Client view at JOB_BOOKED:** Show the booked date as read-only text. Do not show Edit, Unbook, or Job Cancelled options. Client is read-only for these actions.

---

### Step 3 — Build the three API endpoints

**`PATCH /api/jobs/[quoteNumber]/rebook`:**
```typescript
// Auth: ADMIN and SUBCONTRACTOR
// Body: { job_booked_date: string }
// Lead must be JOB_BOOKED
// Validate date is present and valid
// Update lead: job_booked_date → new date
// Write to audit_log: action = "Booking date updated", changed_by = session user
// Return 200 with updated lead
```

**`PATCH /api/jobs/[quoteNumber]/unbook`:**
```typescript
// Auth: ADMIN and SUBCONTRACTOR
// No body required
// Lead must be JOB_BOOKED
// Update lead: status → LEAD_RECEIVED, job_booked_date → null
// Write to audit_log: old_status = JOB_BOOKED, new_status = LEAD_RECEIVED, changed_by = session user
// Return 200 with updated lead
```

**`PATCH /api/jobs/[quoteNumber]/cancel`:**
```typescript
// Auth: ADMIN and SUBCONTRACTOR
// Body: { reason?: string }
// Lead can be in any non-completed status (LEAD_RECEIVED or JOB_BOOKED)
// Update lead: status → JOB_CANCELLED, cancellation_reason → reason (if provided)
// Write to audit_log: old_status = [previous], new_status = JOB_CANCELLED, changed_by = session user
// Return 200 with updated lead
```

---

### Step 4 — Handle JOB_CANCELLED status across the app

**Lead tables (admin dashboard, client dashboard, subcontractor jobs list):**
- Add a `JOB_CANCELLED` status badge — use a red/dark colour to distinguish from other statuses
- Add "Cancelled" to the status filter dropdown on admin and client dashboards
- Cancelled leads should not appear in the subcontractor's active jobs list (`/jobs`) — they should be excluded the same way completed jobs are

**Status pipeline diagram:**
- `JOB_CANCELLED` is not a step in the pipeline — it is an exit state
- When a lead is cancelled, replace the pipeline diagram with a simple status display: a red "Job Cancelled" badge and the cancellation reason below it (if one was provided)

**Needs Action badge:**
- Cancelled leads do not count as "Needs Action" — exclude them from the badge count

**Stat cards:**
- Do not count `JOB_CANCELLED` leads in any existing stat card (Quotes Sent, Jobs Booked, Jobs Completed, etc.)
- Do not add a new stat card for cancelled jobs in this build

**Commission and reconciliation:**
- `JOB_CANCELLED` leads must not appear in commission calculations or reconciliation batches

---

### Step 5 — Notifications

When a lead is marked as `JOB_CANCELLED`, send a notification email to Oli.

**To:** `EMAIL_OLI`
**Subject:** `Job cancelled — [quote_number] — [customer_name]`
**Body:**

```
Hi Oli,

A job has been marked as cancelled.

Quote number:     [quote_number]
Customer name:    [customer_name]
Property address: [property_address]
Cancelled by:     [user_name] ([role])
Reason:           [cancellation_reason or "No reason provided"]

Log in to Jobbly to view the full lead details.

Jobbly by Omniside AI
```

If the email fails to send: log the error, do not crash the endpoint, still advance the status to JOB_CANCELLED.

---

### Build order for Change 4

1. Add `cancellation_reason` field and `JOB_CANCELLED` enum value to schema — run `prisma db push` — confirm in production
2. Build `PATCH /api/jobs/[quoteNumber]/rebook` endpoint
3. Build `PATCH /api/jobs/[quoteNumber]/unbook` endpoint
4. Build `PATCH /api/jobs/[quoteNumber]/cancel` endpoint
5. Update Actions card on subcontractor job detail at JOB_BOOKED — add Edit Booking Date, Unbook Job, Job Cancelled
6. Update Actions card on admin lead detail at JOB_BOOKED — same three actions
7. Confirm client lead detail shows booked date as read-only — no action buttons
8. Add JOB_CANCELLED status badge to lead tables on all role views
9. Add "Cancelled" to status filter dropdown on admin and client dashboards
10. Exclude cancelled leads from subcontractor active jobs list
11. Update pipeline diagram — show red badge + reason for cancelled leads instead of steps
12. Exclude JOB_CANCELLED from Needs Action badge count
13. Exclude JOB_CANCELLED from all stat card queries
14. Exclude JOB_CANCELLED from commission and reconciliation queries
15. Build and wire cancellation notification email to Oli
16. Run `npx tsc --noEmit` — confirm no TypeScript errors
17. Apply MINOR version bump in `package.json`
18. Commit: `v[version] — rebook, unbook, and job cancelled actions with notifications`
19. Push to GitHub: `git push origin main`
20. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — [#163] Restyle Book This Job as compact Actions card**
- [ ] `BookThisJobCard` extracted as a reusable component
- [ ] Subcontractor job detail renders correctly using the extracted component
- [ ] Card header reads "Actions"
- [ ] "Book this job" label inside card is small and subdued
- [ ] Date picker and "Today" button on the same row — compact height
- [ ] "Job Booked" button right-aligned within the card
- [ ] Card visual style matches other cards on the page
- [ ] Mobile layout: date picker full width, "Today" below, "Job Booked" full width below that
- [ ] Validation error appears as small red text below the date row
- [ ] All underlying logic and API calls unchanged
- [ ] Success pop-up ("Well done on getting the job booked! 🎉") unchanged
- [ ] No TypeScript errors

**Change 2 — [#164] Job Booked action on admin and client**
- [ ] `PATCH /api/jobs/[quoteNumber]/book` accepts ADMIN and CLIENT roles
- [ ] Audit log writes the correct logged-in user's name for all three roles — not "System" or blank
- [ ] Admin lead detail imports and renders `BookThisJobCard` at LEAD_RECEIVED
- [ ] Client lead detail imports and renders `BookThisJobCard` at LEAD_RECEIVED
- [ ] Actions card does not render at JOB_BOOKED on any role — no empty container
- [ ] Actions card does not render at JOB_COMPLETED on any role — no empty container
- [ ] Success pop-up appears on all three role views on booking
- [ ] Page refreshes to JOB_BOOKED and Actions card hides on success
- [ ] No TypeScript errors

**Change 3 — [#165] Document status indicators, replace, multi-upload, submit confirmation**
- [ ] Invoice slot shows ⚪ Needed badge when not uploaded — admin and subcontractor views
- [ ] Invoice slot shows ✅ Uploaded badge when uploaded — admin and subcontractor views
- [ ] Job report slot shows ⚪ Needed badge when not uploaded — admin and subcontractor views
- [ ] Job report slot shows ✅ Uploaded badge when uploaded — admin and subcontractor views
- [ ] Helper text updates correctly for all four states on admin and subcontractor views
- [ ] "Replace" link shown on uploaded invoice slot — admin and subcontractor only
- [ ] "Replace" link shown on uploaded job report slot — admin and subcontractor only
- [ ] Replace opens file picker directly — no confirmation modal
- [ ] Replace saves new file to R2 and updates lead fields correctly
- [ ] Client view at JOB_BOOKED shows ⚪ Needed / ✅ Uploaded badges and Download links only
- [ ] Client view has no upload, attach, or replace controls
- [ ] Client view has no Submit Job button or helper text
- [ ] "Upload Both Documents" button visible on admin and subcontractor views at JOB_BOOKED
- [ ] Desktop label: "Upload Both Documents" — mobile label: "Upload Both" (Tailwind responsive)
- [ ] Error pop-up if fewer than 2 files selected
- [ ] Error pop-up if more than 2 files selected
- [ ] Error pop-up with file name and size if any file over 10MB
- [ ] Error pop-up with file name and extension if wrong file type
- [ ] Error pop-up if both files are identical (same name and size)
- [ ] Confirmation pop-up before multi-upload if one or both slots already have a file
- [ ] Confirmation pop-up names which document(s) will be replaced
- [ ] Multi-upload proceeds without confirmation if both slots are empty
- [ ] `POST /api/jobs/[quoteNumber]/classify-documents` endpoint exists — ADMIN and SUBCONTRACTOR only
- [ ] Endpoint enforces 10MB and file type validation server-side — returns 400 with specific message
- [ ] Endpoint returns 422 if files are identical
- [ ] Claude API called to classify documents
- [ ] Endpoint returns 422 if Claude cannot identify documents
- [ ] Invoice verification (existing AI analysis) runs on the identified invoice file
- [ ] AI analysis concerns appended to lead notes — classification not blocked
- [ ] Correct file saved as invoice to R2 — existing invoice upload path used
- [ ] Correct file saved as job report to R2 — existing job report upload path used
- [ ] Lead fields updated: invoice_url, job_report_url and all associated metadata
- [ ] Attachments table updated — no duplicate rows created on replace
- [ ] Loading state shown during classification: "Analysing documents..."
- [ ] Both slots update to ✅ Uploaded with correct filenames on success
- [ ] 422 errors show as dismissable error pop-ups in UI
- [ ] 400 validation errors show as dismissable specific error pop-ups in UI
- [ ] Generic error pop-up shown for any other failure
- [ ] "Submit Job" button only activates when both documents are present — unchanged
- [ ] Submit Job success pop-up appears: "✅ Done! Your invoice and job report has been sent to the customer."
- [ ] Pop-up auto-dismisses after 4 seconds
- [ ] If customer email was null: pop-up reads "✅ Job completed. No customer email on file — Oli has been notified to send the portal link manually."
- [ ] All individual upload paths unchanged and working
- [ ] No TypeScript errors

**Change 4 — Rebook, Unbook, and Job Cancelled**
- [ ] `cancellation_reason` field exists on leads table in production
- [ ] `JOB_CANCELLED` value exists in LeadStatus enum in production
- [ ] `PATCH /api/jobs/[quoteNumber]/rebook` endpoint exists — ADMIN and SUBCONTRACTOR only
- [ ] Rebook updates `job_booked_date` — lead stays at JOB_BOOKED
- [ ] Rebook writes correct audit log entry with user name
- [ ] `PATCH /api/jobs/[quoteNumber]/unbook` endpoint exists — ADMIN and SUBCONTRACTOR only
- [ ] Unbook sets status to LEAD_RECEIVED and clears `job_booked_date`
- [ ] Unbook writes correct audit log entry
- [ ] `PATCH /api/jobs/[quoteNumber]/cancel` endpoint exists — ADMIN and SUBCONTRACTOR only
- [ ] Cancel works from both LEAD_RECEIVED and JOB_BOOKED status
- [ ] Cancel sets status to JOB_CANCELLED and saves `cancellation_reason`
- [ ] Cancel writes correct audit log entry
- [ ] Actions card at JOB_BOOKED on subcontractor view shows booked date, Edit Booking Date, Unbook Job, Job Cancelled
- [ ] Actions card at JOB_BOOKED on admin view shows same three actions
- [ ] Edit Booking Date expands date picker pre-filled with current date
- [ ] Edit Booking Date Save/Cancel behave correctly
- [ ] Inline confirmation shown after successful rebook: "Booking date updated ✓"
- [ ] Unbook confirmation pop-up appears before action is taken
- [ ] Job Cancelled confirmation pop-up appears with optional reason input (max 200 chars)
- [ ] Client view at JOB_BOOKED shows booked date as read-only — no action buttons
- [ ] JOB_CANCELLED status badge appears in lead tables — red/dark colour
- [ ] "Cancelled" option in status filter dropdown on admin and client dashboards
- [ ] Cancelled leads excluded from subcontractor active jobs list
- [ ] Pipeline diagram replaced with red badge + reason for cancelled leads
- [ ] JOB_CANCELLED excluded from Needs Action badge count
- [ ] JOB_CANCELLED excluded from all stat card queries (Quotes Sent, Jobs Booked, etc.)
- [ ] JOB_CANCELLED excluded from commission and reconciliation queries
- [ ] Cancellation notification email sent to Oli on cancel
- [ ] Email includes quote number, customer name, address, cancelled-by user, and reason
- [ ] Email failure does not crash the cancel endpoint — status still advances
- [ ] No TypeScript errors

**Final**
- [ ] Changes 1, 2, 3 each have their own commit, GitHub push, and Vibstr report — PATCH bumps
- [ ] Change 4 has its own commit, GitHub push, and Vibstr report — MINOR bump
- [ ] Commit messages follow format in CLAUDE.md
- [ ] Vibstr build report run after every commit per CLAUDE.md
