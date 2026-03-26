# Jobbly — Comprehensive Update Prompt
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are multiple changes across different parts of the app. Some are bug fixes, some are feature additions, and one is a full redesign of the commission system. Do them all in a single session. Do not skip any item. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

If anything is unclear at any point — stop and ask. Do not invent a solution and proceed.

After completing all changes, bump the version in `package.json` (MINOR bump), commit with a descriptive message, and run the Vibstr build report as documented in `CLAUDE.md`.

---

## Change 1 — Fix Dark / Light Mode Toggle

### Problem
The dark/light mode toggle (moon icon in the top header) is not working. Clicking it does not change the theme. The app is stuck on whichever mode it loaded in.

### What needs to happen
- The toggle must switch between light and dark mode immediately on click — no page reload required
- The user's preference must be saved to `localStorage` so it persists across sessions
- The preference must be applied before first paint to prevent a flash of the wrong theme — this means the theme class must be set on the `<html>` element via an inline script in the document `<head>`, before React hydrates
- Dark mode should be implemented using Tailwind's `class` strategy — the `dark` class on the `<html>` element controls all dark mode styles
- In `tailwind.config.ts`, ensure `darkMode: 'class'` is set
- The toggle button must visually reflect the current mode — moon icon when in light mode (click to go dark), sun icon when in dark mode (click to go light)
- The toggle must work for all three roles — admin, client, and subcontractor — on every page

### Implementation notes
- In `app/layout.tsx`, add an inline `<script>` tag in the `<head>` that reads `localStorage.getItem('theme')` and applies the `dark` class to `<html>` before React loads — this eliminates the flash
- The toggle component should call `document.documentElement.classList.toggle('dark')` and update `localStorage` on each click
- Test in both directions: light → dark, dark → light, and verify preference survives a page refresh

---

## Change 2 — Add Profile Page for All Roles

### Problem
Non-admin users (Client View and Subcontractor) have no place to manage their own account. Clicking their name at the bottom of the sidebar does nothing useful. They need a basic profile section.

### What needs to happen
Create a `/profile` page accessible to all authenticated roles — admin, client, and subcontractor.

### Route and access
- URL: `/profile`
- Accessible by: ALL roles (ADMIN, CLIENT, SUBCONTRACTOR)
- Add to middleware as an authenticated-only route — unauthenticated users redirected to `/login`
- Add "Profile" link to the bottom of the sidebar for all roles — clicking the user's name at the bottom of the sidebar should navigate to `/profile`

### Page layout
Single column, centred, clean and simple. Page title: "My Profile".

### Section 1 — Account Details (read-only display)
Display the following fields as read-only text — not editable inputs:
- Full name
- Email address
- Role (displayed as a badge: Admin / Client View / Subcontractor)
- Campaign assignment (the campaign this user belongs to — show campaign name, not UUID. For ADMIN users, display "All campaigns")

### Section 2 — Change Password
This section allows the user to update their own password without needing to contact Oli.

Fields:
- Current password (input, type="password")
- New password (input, type="password")
- Confirm new password (input, type="password")

Validation rules (enforce all of these):
- Current password must match what is stored in the database (verify against bcrypt hash)
- New password must be at least 8 characters
- New password and confirm new password must match exactly
- New password cannot be the same as the current password

Button: "Update Password" — primary style

Success state: inline success message below the button — "Password updated successfully." No page redirect.

Error states (show inline below the relevant field or below the button):
- "Current password is incorrect."
- "New password must be at least 8 characters."
- "Passwords do not match."
- "New password must be different from your current password."

### API endpoint needed
`PATCH /api/profile/password`
- Authenticated users only — session required
- Body: `{ currentPassword, newPassword }`
- Verifies current password against stored bcrypt hash
- Hashes new password with bcrypt before storing
- Returns `200` on success, `400` with error message on failure
- Never returns the password hash in any response

---

## Change 3 — Make Entire Lead Table Row Clickable

### Problem
In the main dashboard lead table (`/dashboard`), only the quote number is clickable. Users should be able to click anywhere on a lead's row to navigate to that lead's detail page. This makes the table much easier to use, especially on mobile.

### What needs to happen
- Every row in the lead table must be fully clickable — clicking anywhere on the row navigates to `/leads/[quoteNumber]`
- The entire row should show a hover state (background colour change) to signal it is clickable
- Cursor must be `cursor-pointer` on row hover
- The Google Maps icon button within the row must still work independently — clicking it opens Google Maps in a new tab without triggering the row navigation. Use `e.stopPropagation()` on that button's click handler to prevent the row click from firing
- Any other action buttons within the row (if present) must also use `e.stopPropagation()` so they do not trigger row navigation
- This change applies to the lead table on `/dashboard` for both ADMIN and CLIENT roles
- This change also applies to the job queue table on `/jobs` for the SUBCONTRACTOR role — clicking anywhere on a job row navigates to `/jobs/[quoteNumber]`

### Implementation notes
- Wrap the `<tr>` with an `onClick` handler that calls `router.push('/leads/' + quoteNumber)`
- Apply `className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"` to each `<tr>`
- Do not use an `<a>` tag wrapping the entire row — use the onClick handler approach for cleaner HTML

---

## Change 4 — Add Job Booked Date to Status Update Flow

### Problem / Feature Request
When a user moves a lead's status from "Quote Sent" to "Job Booked", there is no way to record when the job was actually booked. We want to capture this date as part of the status update step.

### Decision
Yes — add a required date picker to the "Move to Job Booked" status update flow. The user must select a booking date before the "Confirm" button becomes active. This date is stored on the lead record and displayed in the lead detail page.

### Database change
Add the following field to the `leads` table:

```prisma
job_booked_date  DateTime?   // The date the job was booked, set when status moves to JOB_BOOKED
```

Run a Prisma migration for this field. It is nullable — existing leads that are already past this status will have null here, which is acceptable.

### Status update modal change
The status update modal already exists and handles all status transitions. Modify it specifically for the `QUOTE_SENT → JOB_BOOKED` transition only:

When the user selects "Job Booked" as the new status, before the confirm button appears or becomes active, show a date selection UI within the modal:

**Date picker UI:**
- Label: "Job booked date"
- Three separate dropdown selects side by side:
  - Day (1–31)
  - Month (January–December)
  - Year (current year and next year as options — e.g. 2025, 2026)
- All three dropdowns must be selected before the "Confirm — Move to Job Booked" button becomes enabled
- Default state of button: disabled and visually muted
- Once all three dropdowns have a value: button becomes active and primary-styled
- Validation: the selected date must be a valid calendar date (e.g. February 30 is not valid — show inline error "Please select a valid date")

**On confirm:**
- Store the selected date as `job_booked_date` on the lead record (as a proper `DateTime`, midnight UTC of the selected date)
- Write the status change to the audit log as normal
- Display the booked date on the lead detail page under the "Job Booked" step in the status pipeline section — format: "Booked: 15 April 2025"

**All other status transitions** (Lead Received → Quote Sent, Job Booked → Job Completed) are unchanged — no date picker required for those.

### API change
Update `PATCH /api/leads/[quoteNumber]` to accept and store `job_booked_date` when the status transition is `QUOTE_SENT → JOB_BOOKED`. Reject the request with `400` if this transition is attempted without a valid `job_booked_date` in the body.

---

## Change 5 — Fix Financial Fields Not Populating After Invoice Upload [CRITICAL BUG]

### Problem
This is the most important fix in this update. After a subcontractor uploads an invoice and the job is marked as Job Completed, none of the financial fields on the lead record are being updated. Specifically:

- `contractor_rate` — remains null
- `customer_price` — remains null
- `gross_markup` — remains null
- `omniside_commission` — remains null
- `client_margin` — remains null

As a result, the following on the dashboard are also broken:
- Total revenue stat card — shows $0 or nothing
- Commission earned stat card — shows $0 or nothing
- Commission pending stat card — shows $0 or nothing

### Root cause investigation
Before writing any fix, investigate and identify exactly where the breakdown is occurring. Check each of the following in order and document what you find:

1. Is the invoice upload API route (`PATCH /api/leads/[quoteNumber]`) receiving a `contractor_rate` value in the request body?
2. If yes — is it writing that value to the database correctly?
3. If no — is the frontend invoice upload form sending `contractor_rate` as part of the request?
4. Is the commission calculation function (`calculateCommission.ts` or equivalent) being called after the contractor rate is saved?
5. Are the calculated values (`customer_price`, `gross_markup`, `omniside_commission`, `client_margin`) being written back to the lead record?
6. Are the dashboard stat cards reading from the correct fields on the lead records, or are they computing from somewhere else?

### What the correct flow must be
When a subcontractor (or admin) uploads an invoice and enters the contractor rate, the following must happen in a single database transaction:

1. Save the invoice file and populate `invoice_url`, `invoice_uploaded_at`, `invoice_uploaded_by` on the lead
2. Save `contractor_rate` on the lead record
3. Retrieve the campaign's current `markup_percentage` and `commission_percentage`
4. Calculate and store all financial fields:
   - `customer_price` = `contractor_rate × (1 + markup_percentage / 100)`
   - `gross_markup` = `customer_price − contractor_rate`
   - `omniside_commission` = `gross_markup × (commission_percentage / 100)`
   - `client_margin` = `gross_markup − omniside_commission`
5. All five fields must be written to the lead record atomically — if any write fails, roll back all of them
6. These values must never be recomputed after this point — they are stored permanently as a snapshot of the rates at the time of the job

### Invoice upload UI fix
The invoice upload component (`InvoiceUpload.tsx` or equivalent) must include a `contractor_rate` input field if it does not already. This is how the financial data enters the system:

- Label: "Contractor rate (ex GST)"
- Input type: number, minimum value 0, step 0.01
- Placeholder: "e.g. 200.00"
- This field is required — the upload button must be disabled until both a file is selected AND a contractor rate is entered
- Display the calculated customer price in real time as the user types the contractor rate:
  - Small line below the input: "Customer price: $[calculated amount]" — updates on every keystroke
  - Use the campaign's markup percentage for this calculation (fetch it from the API if not already in the component's props)

### Dashboard stat card fix
Once the financial fields are correctly stored on lead records, verify the dashboard stat cards are reading them correctly:

- **Total revenue** — sum of `customer_price` across all leads in the campaign where `customer_price` is not null
- **Commission earned** — sum of `omniside_commission` across all leads where `reconciliation_batch_id` is not null and the batch is marked reconciled (after commission redesign in Change 6 below) — or for now, sum where `commission_reconciled = true`
- **Commission pending** — sum of `omniside_commission` across all JOB_COMPLETED leads where commission has not yet been reconciled

If these queries are wrong, fix them. Show the correct values.

---

## Change 6 — Commission Reconciliation Redesign (Monthly Batch System)

### Problem
The current per-job "Mark Reconciled" toggle does not match the real-world billing workflow. In practice, Oli sends one invoice to Continuous Group at the end of each month covering all completed jobs. Reconciliation needs to happen at the month level, not the job level.

### Database changes

#### Add `reconciliation_batches` table

```prisma
model ReconciliationBatch {
  id                      String   @id @default(uuid())
  campaign_id             String
  campaign                Campaign @relation(fields: [campaign_id], references: [id])
  label                   String   // e.g. "March 2025" or "March + April 2025"
  month_keys              String   // comma-separated month keys, e.g. "2025-03,2025-04"
  total_jobs              Int
  total_contractor_cost   Decimal
  total_customer_revenue  Decimal
  total_commission        Decimal
  reconciled              Boolean  @default(false)
  reconciled_at           DateTime?
  created_at              DateTime @default(now())
  leads                   Lead[]
}
```

#### Update `leads` table
Add:
```prisma
reconciliation_batch_id  String?
reconciliation_batch     ReconciliationBatch? @relation(fields: [reconciliation_batch_id], references: [id])
job_completed_at         DateTime?  // timestamp when status changed to JOB_COMPLETED — used for month grouping
```

Remove:
```prisma
commission_reconciled     Boolean
commission_reconciled_at  DateTime?
```

Run Prisma migrations for all of the above. When removing `commission_reconciled` and `commission_reconciled_at`, write the migration carefully — do not drop data from other fields.

Also populate `job_completed_at` going forward: when a lead's status changes to `JOB_COMPLETED`, write the current timestamp to `job_completed_at` on the lead record.

---

### New API endpoints

#### GET `/api/commission/months`
Returns all months that have at least one JOB_COMPLETED lead in the current campaign, grouped by month.

Response structure per month:
```json
{
  "month_key": "2025-04",
  "label": "April 2025",
  "job_count": 12,
  "total_contractor_cost": 2400.00,
  "total_customer_revenue": 3000.00,
  "total_commission": 240.00,
  "is_reconciled": false,
  "batch_id": null,
  "leads": [
    {
      "quote_number": "JBL-00001",
      "customer_name": "Jane Smith",
      "property_address": "14 Rata Street, Remuera",
      "contractor_rate": 200.00,
      "customer_price": 250.00,
      "omniside_commission": 20.00,
      "job_completed_at": "2025-04-12T10:30:00Z"
    }
  ]
}
```

Month grouping is based on `job_completed_at` on the lead record. Months with all leads already in a reconciled batch are still returned but flagged as `is_reconciled: true`.

#### POST `/api/commission/reconcile`
Body:
```json
{
  "month_keys": ["2025-03", "2025-04"],
  "label": "March + April 2025"
}
```

Actions:
1. Validate all months belong to the current campaign
2. Validate none of the months are already reconciled
3. Calculate totals across all leads in the selected months
4. Create a new `ReconciliationBatch` record with `reconciled: true` and `reconciled_at: now()`
5. Stamp `reconciliation_batch_id` on every JOB_COMPLETED lead in those months
6. Return the created batch

#### POST `/api/commission/unreconcile`
Body: `{ "batch_id": "uuid" }`

Actions:
1. Find the batch
2. Remove `reconciliation_batch_id` from all leads in that batch
3. Delete the batch record
4. Return success

#### GET `/api/commission/invoice/[batchId]`
Returns full invoice data for a reconciliation batch. Used to render the invoice preview modal.

Response includes: batch label, date created, campaign name, client company name, and full array of leads in the batch with all financial fields.

---

### Commission page UI redesign (`/commission`)

#### Stat cards (top of page — update these)

| Card | Calculation |
|---|---|
| Total commission earned | Sum of `omniside_commission` across all leads with a reconciled batch |
| Total commission pending | Sum of `omniside_commission` across JOB_COMPLETED leads with no batch |
| Total jobs completed | Count of all JOB_COMPLETED leads |
| Average commission per job | Total commission ÷ total completed jobs |

---

#### Two tabs below stat cards

**Tab 1: "By Month"** (default active tab)

This tab shows all months that have unreconciled completed jobs.

**Month card — one card per month:**
- Header: month name + year (e.g. "April 2025") — large, bold
- Sub-stats in a row: "[X] jobs" · "Revenue: $[total]" · "Commission: $[total]"
- Checkbox in the top-right corner of the card for multi-select
- Expandable section (click anywhere on the card body to expand/collapse):
  - Table of all leads within that month
  - Columns: Quote number, Customer name, Property address, Contractor rate, Customer price, Commission
  - Each row is read-only — no actions within this expanded view
- If the month is already reconciled (batch exists), show a green "Reconciled" badge on the card instead of the checkbox — these are display only, not selectable

**Multi-select actions bar:**
- Appears at the bottom of the screen (fixed, above the footer) when one or more month checkboxes are selected
- Shows selected months as removable tags: "March 2025 ✕" "April 2025 ✕"
- Live-updating combined totals:
  - "X jobs selected"
  - "Total revenue: $X"
  - "Total commission: $X"
- Two buttons:
  - "Generate Invoice" (secondary style) → opens invoice preview modal
  - "Mark Reconciled" (primary style) → opens confirmation modal, then calls POST `/api/commission/reconcile`

**Confirmation modal for Mark Reconciled:**
- Title: "Reconcile [March + April 2025]?"
- Body: "This will mark [X] jobs as reconciled with a total commission of $[X]. This action can be undone from the Reconciled Batches tab."
- Buttons: "Cancel" and "Confirm Reconciliation"

**Empty state (no unreconciled months):**
Centred message: "All done — no unreconciled jobs. Every completed job has been reconciled."

---

**Tab 2: "Reconciled Batches"**

Shows all historical reconciliation batches in reverse chronological order.

**Table columns:**
- Batch label (e.g. "March + April 2025")
- Date reconciled (formatted: "12 April 2025")
- Jobs included (count)
- Total commission ($)
- Actions column:
  - "View Invoice" button → opens invoice preview modal in read-only mode (no reconcile button shown)
  - "Unreconcile" button (destructive, red) → opens confirmation modal before proceeding

**Unreconcile confirmation modal:**
- Title: "Unreconcile this batch?"
- Body: "This will remove the reconciliation status from [X] jobs in [March + April 2025]. They will return to the unreconciled pool. This cannot be undone automatically."
- Buttons: "Cancel" and "Unreconcile"

---

#### Invoice preview modal

Opens when "Generate Invoice" is clicked from the actions bar, or "View Invoice" from the Reconciled Batches tab.

**Modal size:** Large (full-screen on mobile, wide centred panel on desktop)

**Invoice content:**
```
────────────────────────────────────────────
JOBBLY — COMMISSION INVOICE SUMMARY
────────────────────────────────────────────
Generated:     [12 April 2025]
Period:        [March + April 2025]
Campaign:      [Continuous Group Guttering]
Prepared by:   Omniside AI
────────────────────────────────────────────

Quote #       Customer Name        Commission
──────────    ─────────────────    ──────────
JBL-00001     Jane Smith           $20.00
JBL-00002     John Davies          $15.00
JBL-00003     Sarah Wilson         $22.50
JBL-00004     Mike Brown           $18.00

────────────────────────────────────────────
Total jobs:              4
Total commission owed:   $75.50
────────────────────────────────────────────

Jobbly by Omniside AI
```

**Modal action buttons:**
- If opened from "Generate Invoice" (not yet reconciled):
  - "Print / Save as PDF" (uses `window.print()` — browser handles PDF save)
  - "Mark Reconciled" (primary) → same action as the main page button
  - "Close"
- If opened from "View Invoice" (already reconciled — read-only):
  - "Print / Save as PDF"
  - "Close"

**Print styles:**
Add a `@media print` CSS block that hides the modal overlay, sidebar, header, and action buttons — only the invoice content prints cleanly on a white background.

---

## Build Order

Follow this order exactly. Do not jump ahead.

1. Run Prisma migrations:
   - Add `job_booked_date` to leads
   - Add `job_completed_at` to leads
   - Add `reconciliation_batch_id` to leads
   - Create `reconciliation_batches` table
   - Remove `commission_reconciled` and `commission_reconciled_at` from leads

2. Fix financial calculation bug (Change 5) — this is the most critical fix and must be working before the commission redesign is built on top of it

3. Fix dark/light mode toggle (Change 1)

4. Make lead table rows fully clickable (Change 3)

5. Add profile page and password change (Change 2)

6. Add job booked date to status update modal (Change 4)

7. Build new commission API endpoints (Change 6)

8. Rebuild commission page UI (Change 6)

9. Verify all dashboard stat cards show correct values (Change 5 follow-up)

10. Bump version in `package.json` — this is a MINOR version bump minimum, possibly MAJOR given the scope of changes

11. Commit with message: `v[X.X.0] — financial fix, dark mode, row click, profile page, job date, commission batch redesign`

12. Run Vibstr build report as per CLAUDE.md

---

## Build Checklist

Do not consider this session complete until every item below is verified:

- [ ] Dark mode toggle switches theme immediately on click with no page reload
- [ ] Dark mode preference survives a page refresh
- [ ] Theme applies correctly across all pages and all three role views
- [ ] `/profile` page exists and is accessible by all three roles
- [ ] Profile page displays name, email, role badge, and campaign name correctly
- [ ] Password change form validates all four error conditions correctly
- [ ] Password change succeeds and shows success message without page redirect
- [ ] Clicking anywhere on a lead row in `/dashboard` navigates to the lead detail page
- [ ] Clicking anywhere on a job row in `/jobs` navigates to the job detail page
- [ ] Google Maps button within a row still works independently without triggering row navigation
- [ ] Status update modal shows date picker dropdowns when "Job Booked" is selected
- [ ] Confirm button is disabled until all three date dropdowns are filled
- [ ] Invalid dates (e.g. Feb 30) are caught and shown as an error
- [ ] `job_booked_date` is saved to the database and displayed on the lead detail page
- [ ] Invoice upload form includes a contractor rate input field
- [ ] Uploading an invoice with a contractor rate correctly populates all five financial fields on the lead record
- [ ] Financial fields are correct: customer_price, gross_markup, omniside_commission, client_margin
- [ ] Dashboard stat cards show correct values: total revenue, commission earned, commission pending
- [ ] Commission page shows jobs grouped by month in "By Month" tab
- [ ] Multi-select of months works with live-updating totals
- [ ] "Generate Invoice" opens the invoice preview modal with correct data
- [ ] Invoice prints cleanly with sidebar and buttons hidden
- [ ] "Mark Reconciled" creates a batch and stamps all leads in selected months
- [ ] Reconciled months appear in "Reconciled Batches" tab
- [ ] "View Invoice" opens read-only invoice modal from reconciled batches tab
- [ ] "Unreconcile" removes batch and returns leads to unreconciled pool after confirmation
- [ ] Version bumped in `package.json`
- [ ] Committed to Git with correct message format
- [ ] Vibstr build report sent
