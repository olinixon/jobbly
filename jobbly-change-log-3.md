# Jobbly — Change Log Prompt 3
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes listed here in a single session in the order specified. Do not skip any item. Stop and ask if anything is unclear before proceeding.

After completing all changes, bump the version in `package.json`, commit with a descriptive message, and run the Vibstr build report as documented in `CLAUDE.md`.

---

## Change 29 — Rename Stat Cards Across All Three Role Views

### Problem
The current stat card labels on the dashboard are not self-explanatory. Users — particularly the client and subcontractor — do not immediately understand what each number represents without context. All labels need to be renamed to be instantly clear.

### What needs to happen

#### Admin view — rename all financial stat cards

| Old label | New label |
|---|---|
| Total Customer Revenue (ex GST) | Total Billed to Customers (ex GST) |
| Campaign Revenue (ex GST) | Our Margin (ex GST) |
| My Commission Earned (ex GST) | Commission Received (ex GST) |
| My Commission Pending (ex GST) | Commission Owed to Me (ex GST) |

The activity cards (Total Leads, Quotes Sent, Jobs Booked, Jobs Completed) do not change — their labels are already clear.

#### Client view — rename financial stat cards

| Old label | New label |
|---|---|
| Total Customer Revenue (ex GST) | Total Billed to Customers (ex GST) |
| Campaign Revenue (ex GST) | Our Margin (ex GST) |

"Our Margin" tells Continuous Group clearly that this is the profit margin the campaign generated above subcontractor cost.

#### Subcontractor view — rename existing card and add a second revenue card

The subcontractor dashboard currently shows one revenue card. It must now show two revenue cards side by side:

**Card 1 — Total Billed to Customers (ex GST)**
- Value: Sum of `customer_price` across all JOB_COMPLETED leads where `customer_price` is not null
- Label: "Total Billed to Customers (ex GST)"

**Card 2 — Total Jobs Revenue (ex GST)**
- Value: Sum of `contractor_rate` across all JOB_COMPLETED leads where `contractor_rate` is not null
- Label: "Total Jobs Revenue (ex GST)"

Together these two cards give the subcontractor both the big picture (what customers were billed) and their specific contribution (what their team earned). They do not see commission or margin figures.

### Implementation notes
- Label and query changes only — no database schema changes required
- Every place these labels appear must be updated: dashboard, PDF export template, commission page stat cards, any tooltips
- The date range filter must apply to both new subcontractor revenue cards
- Ensure the subcontractor dashboard API returns both `customer_price` sum and `contractor_rate` sum as separate fields
- **Important:** When building the two new subcontractor revenue cards, apply the `status = 'JOB_COMPLETED'` filter from the outset — do not add it later as a separate fix in Change 35. Changes 29 and 35 overlap on the subcontractor cards specifically — build them correctly the first time here so Change 35 only needs to verify and fix the admin and client cards.

---

## Change 30 — Fix Campaign Settings Page — Full Investigation and Rebuild

### Problem
The Settings page (`/settings`) shows "No campaign selected. Choose a campaign." even when the admin is already inside a campaign context. Clicking "Choose a campaign" takes the user back to the campaign selector, and clicking "Enter Campaign" goes to the dashboard — not to settings with that campaign loaded. This has been attempted before and is still broken. This change is a full investigation and rebuild of how campaign context reaches the settings page.

### Root cause — investigate this first before writing any code

The campaign context for ADMIN users is stored in the session after they select a campaign from `/campaigns`. Every other page (Dashboard, Leads, Commission, etc.) reads this campaign context from the session correctly. The settings page is not reading it correctly — or the session value is not being set when the user enters a campaign.

Before writing any fix, Claude Code must:
1. Check how the campaign ID is stored in the session when the user clicks "Enter Campaign" on the `/campaigns` page — is `session.campaignId` being set correctly at that point?
2. Check how the `/settings` page reads the campaign ID — is it reading from `session.campaignId`? If not, what is it reading?
3. Check how other working pages (e.g. `/dashboard`) read the campaign context — and make the settings page do exactly the same thing
4. Log the session contents on the settings page API route to confirm what is and isn't present
5. Only after identifying the exact break point — write the fix

### What the settings page must do once the bug is fixed

The settings page must automatically load the current campaign's data when the admin navigates to `/settings` — no extra steps, no "choose a campaign" prompt. Display the current campaign name as a page subtitle: "Settings — Continuous Group Guttering".

### Section 1 — General
All fields editable, pre-filled with current values:
- Campaign name, Industry, Client company name, Subcontractor company name, Campaign start date
- Save button: "Save General Settings"
- On success: inline "Settings saved." confirmation

### Section 2 — Commission & Pricing
- Client markup percentage (editable)
- Omniside commission percentage (editable)
- Client margin percentage — read-only, auto-calculates live as `100 − commission %`
- Before saving: warning modal — "These changes will apply to all future leads. Existing lead records will not be affected."
- Validate: `commission_percentage + client_margin_percentage` must equal 100

### Section 3 — Campaign Status
- Selector: Active / Paused / Completed — pre-selected with current status
- Descriptions shown below each option
- Must stay in sync with the campaign card badge on `/campaigns`

### Section 4 — Danger Zone
- "Deactivate Campaign" button (red)
- Confirmation modal required before proceeding
- On confirm: sets campaign status to COMPLETED

### API requirements
- `GET /api/campaigns/[id]` — returns full campaign record for current session's campaign ID — used to pre-fill all fields
- `PATCH /api/campaigns/[id]` — accepts partial updates per section, ADMIN only, validates commission + margin = 100

### Critical implementation note
The campaign ID must come from the session — not a URL parameter. If the session has no campaign ID, redirect to `/campaigns` with message: "Please select a campaign first."

---

## Change 31 — Default Lead Table Sort Order — Active Leads First, Completed at Bottom

### Problem
The lead table mixes active and completed leads together with no priority ordering. Job Completed leads sit in the middle of active leads, making it harder to see what needs attention. The table should act as a priority queue.

### Default sort logic — two-tier sort

**Tier 1 — Status group:**
- All leads where status is NOT `JOB_COMPLETED` appear first (top)
- All leads where status IS `JOB_COMPLETED` appear last (bottom)

**Tier 2 — Within each group, sort by `created_at` ascending (oldest first):**
- Active leads: oldest lead at the very top — been waiting longest, needs most attention
- Completed leads: oldest completed first within the bottom group

### User override
Default sort only — users can still click column headers to override. Clicking a header applies a flat sort on that column for all rows (no two-tier grouping when manually sorted). Default sort restores on page refresh.

### Implementation notes
- Sort must be applied at the API/database level — not client-side — so pagination works correctly
- SQL: `ORDER BY (CASE WHEN status = 'JOB_COMPLETED' THEN 1 ELSE 0 END) ASC, created_at ASC`
- Applies to: `GET /api/leads` (admin and client) and `GET /api/jobs` (subcontractor)
- Must respect active filters — two-tier sort still applies within filtered results
- When user clicks a column header: remove two-tier grouping, apply flat sort on that column

### Applies to
- Admin lead table on `/dashboard`
- Client lead table on `/dashboard`
- Subcontractor job queue on `/jobs`

---

## Change 32 — Fix "No Campaign Assigned" Error on Reconciliation

### Problem
When the admin clicks "Confirm Reconciliation" on the commission page, the modal shows "No campaign assigned." and the reconciliation fails. The campaign ID is not being sent with the API request.

### Root cause
`POST /api/commission/reconcile` is not receiving a campaign ID. This is the same underlying issue as the settings page bug in Change 30 — the campaign context stored in the session after selecting a campaign is not being read correctly in this API route. Once the session-reading pattern is fixed in Change 30, apply that exact same fix here.

### Investigation steps before writing any fix
1. Check what `POST /api/commission/reconcile` does to identify the campaign — session, request body, or URL parameter?
2. Check how other working commission routes (e.g. `GET /api/commission/months`) identify the campaign — make the reconcile route do the same
3. Log session contents at the time the reconcile request fires

### What the correct behaviour must be
- `POST /api/commission/reconcile` must read campaign ID directly from the session
- No campaign ID should ever need to be passed in the request body or URL
- "No campaign assigned" must never appear
- If session has no campaign ID: return `401` and redirect to `/campaigns`

### What NOT to change
- Do not add any campaign selector to the reconciliation modal
- Do not change the modal UI in any way
- This is purely a backend session-reading fix

---

## Change 33 — Fix Subcontractor Access to Notifications and Audit Log Pages

### Problem
When a subcontractor clicks "Notifications" or "Audit Log" in their sidebar, they are redirected to the login page. The route protection middleware is blocking subcontractor access to these routes even though they are logged in. These routes were added to the subcontractor sidebar in Change 23 but the middleware was never updated to allow access.

### Root cause
In `middleware.ts`, `/notifications/*` and `/audit/*` only allow ADMIN access. SUBCONTRACTOR users are rejected and sent to `/login`.

### What needs to happen

#### 1. Update middleware.ts

| Route | Current allowed roles | New allowed roles |
|---|---|---|
| `/notifications/*` | ADMIN only | ADMIN, SUBCONTRACTOR |
| `/audit/*` | ADMIN only | ADMIN, SUBCONTRACTOR |

CLIENT role does not get access to either — leave unchanged.

#### 2. Verify API-level campaign scoping
- `GET /api/notifications` — must return only notifications for the subcontractor's campaign
- `GET /api/audit` — must return only audit log entries for the subcontractor's campaign
- Both must include `WHERE campaign_id = session.user.campaignId` if not already present

### What NOT to change
- CLIENT role access — unchanged
- ADMIN access — unchanged
- UI of either page — unchanged
- Any other middleware rules — only update the two routes listed

### Implementation notes
- Likely a one or two line change in `middleware.ts`
- Test by logging in as subcontractor and navigating to both pages — must load without redirect

---

## Change 34 — Add Client Commission Tab with Monthly Invoice Generation

### Context
Continuous Group needs to invoice Pro Water Blasting (Frank) at the end of each month for the gross markup on all completed jobs. The gross markup is the 25% management fee — e.g. if Frank charges $200 and customer pays $250, the gross markup is $50. Continuous Group invoices Frank for that $50 per job. This is separate from the admin commission system and must never show the 40/60 split.

### What needs to happen

#### 1. Add "Commission" to client sidebar

```
[Jobbly wordmark]

📊  Dashboard
💰  Commission    ← new

─────────────────
👤  [User name]
🚪  Log out
```

Route: `/commission` — CLIENT view must be entirely different from ADMIN view. Use role-based rendering or a separate route — whichever is cleanest architecturally.

#### 2. Client commission page layout

**Page title**: "Commission"
**Subtitle**: "Monthly markup summary — [Campaign Name]"

**Date range filter:**
A date range selector must appear at the top right of the page, identical in behaviour to the dashboard date range filter. Options:
- All time (default)
- Today
- Last 7 days
- Month to date
- Last month
- Last quarter
- Custom range (from/to date picker)

When a range is selected, both the stat cards and the month cards below must filter to show only JOB_COMPLETED leads within the selected period. The URL must update with the range as a query parameter so the filtered view persists on refresh. This applies to all three users who can see financial data — admin, client, and subcontractor. The client commission page is no exception.

**Stat cards (two):**
- "Total Margin Generated (ex GST)" — sum of `gross_markup` WHERE `status = 'JOB_COMPLETED'`
- "Total Margin (incl. GST)" — `total gross_markup × 1.15` — display only, never stored

**Month cards below stat cards:**
- Group JOB_COMPLETED leads by month of `job_completed_at`
- One card per month showing: month name, job count, total margin ex GST, total incl. GST
- Expandable: click to show job list — Quote number, Customer name, Address, Gross markup (ex GST)
- "Generate Invoice" button on each month card

#### 3. Invoice preview modal

```
────────────────────────────────────────────
INVOICE
────────────────────────────────────────────
From:       Continuous Group
To:         Pro Water Blasting
Date:       [12 April 2026]
Period:     [March 2026]

────────────────────────────────────────────
Quote #      Customer Name       Margin
                                 (ex GST)
──────────   ─────────────────   ──────────
JBL-00001    Jane Smith           $50.00
JBL-00002    John Davies          $37.50

────────────────────────────────────────────
Subtotal (ex GST):         $87.50
GST (15%):                 $13.13
Total (incl. GST):        $100.63
────────────────────────────────────────────

Jobbly by Omniside AI
```

**NOT shown:** contractor rate, customer price, Omniside commission, client margin percentage

**Modal buttons:** "Print / Save as PDF" and "Close"

#### 4. API endpoint

`GET /api/client/commission/months`
- CLIENT role only — return 403 for any other role
- Scoped to session campaign ID
- Returns: month key, label, job count, total gross_markup, leads array (quote_number, customer_name, property_address, gross_markup only)
- Never returns: contractor_rate, customer_price, omniside_commission, client_margin

---

## Change 35 — Fix Financial Stat Cards — Only Count JOB_COMPLETED Leads

### Problem
Financial stat cards are including leads at all statuses in their calculations, or filtering by invoice presence instead of job completion status. Every financial card must only count leads where `status = 'JOB_COMPLETED'`.

### Root cause investigation
Before writing any fix:
1. Check what filter each financial stat card API query is using — is it `status = 'JOB_COMPLETED'`? If not, that is the bug.
2. Is any query filtering by `invoice_url IS NOT NULL`? This is incorrect.
3. Are all financial cards using the same filter?

### Correct calculations for every card

**Admin dashboard:**

| Card | Correct calculation |
|---|---|
| Total Billed to Customers (ex GST) | Sum of `customer_price` WHERE `status = 'JOB_COMPLETED'` |
| Our Margin (ex GST) | Sum of `gross_markup` WHERE `status = 'JOB_COMPLETED'` |
| Commission Received (ex GST) | Sum of `omniside_commission` WHERE `status = 'JOB_COMPLETED'` AND `reconciliation_batch_id IS NOT NULL` |
| Commission Owed to Me (ex GST) | Sum of `omniside_commission` WHERE `status = 'JOB_COMPLETED'` AND `reconciliation_batch_id IS NULL` |

**Client dashboard:**

| Card | Correct calculation |
|---|---|
| Total Billed to Customers (ex GST) | Sum of `customer_price` WHERE `status = 'JOB_COMPLETED'` |
| Our Margin (ex GST) | Sum of `gross_markup` WHERE `status = 'JOB_COMPLETED'` |

**Subcontractor dashboard:**

| Card | Correct calculation |
|---|---|
| Total Billed to Customers (ex GST) | Sum of `customer_price` WHERE `status = 'JOB_COMPLETED'` |
| Total Jobs Revenue (ex GST) | Sum of `contractor_rate` WHERE `status = 'JOB_COMPLETED'` |

**Client commission page:**

| Card | Correct calculation |
|---|---|
| Total Margin Generated (ex GST) | Sum of `gross_markup` WHERE `status = 'JOB_COMPLETED'` |

### Full filter condition (including date range when active)
```sql
WHERE status = 'JOB_COMPLETED'
AND campaign_id = [session campaign ID]
AND created_at >= from_date AND created_at <= to_date  -- only when date range is active
```

### Implementation notes
- Query-level fix only — no UI changes required
- Fix must be applied to every API route powering a financial stat card — do not fix one and leave others broken
- After fixing, verify each card manually by counting only JOB_COMPLETED leads in the lead table and summing their values

---

## Change 36 — Restrict Invoice Upload to JOB_BOOKED and JOB_COMPLETED Statuses Only

### Problem
The invoice upload button is visible at all lead statuses including Lead Received and Quote Sent. It should only appear once a job is booked — showing it too early causes confusion and potential misuse.

### Exact rules by status

| Current status | Invoice upload visible? |
|---|---|
| `LEAD_RECEIVED` | ❌ Hidden completely |
| `QUOTE_SENT` | ❌ Hidden completely |
| `JOB_BOOKED` | ✅ Visible — primary upload moment |
| `JOB_COMPLETED` | ✅ Visible — for invoice replacement if needed |

### Where this applies
1. Admin lead detail page (`/leads/[quoteNumber]`) — "Attach Invoice" section
2. Subcontractor job detail page (`/jobs/[quoteNumber]`) — invoice upload section

### UI behaviour
- At LEAD_RECEIVED or QUOTE_SENT: do not render the invoice section at all — no disabled button, no placeholder, nothing
- At JOB_BOOKED: show full drag and drop upload UI
- At JOB_COMPLETED with invoice: show file name, upload date, download button, and "Replace Invoice" button
- At JOB_COMPLETED without invoice: show the upload UI

### API enforcement
The invoice upload API route must also enforce this server-side:
- Check current lead status from the database before accepting a file
- If status is `LEAD_RECEIVED` or `QUOTE_SENT`: return `400` — "Invoice can only be attached once a job is booked."
- Read status from database — not from the request body

---

## Change 37 — Fix Subcontractor Dashboard Row Click Navigation

### Problem
On the subcontractor dashboard page (`/dashboard`), clicking a lead row navigates to `/jobs` (the jobs list) instead of `/jobs/[quoteNumber]` (the specific job detail page). The quote number is not being appended to the navigation path.

### Correct navigation by role

| Role | Page | Row click navigates to |
|---|---|---|
| ADMIN | `/dashboard` | `/leads/[quoteNumber]` — unchanged |
| CLIENT | `/dashboard` | `/leads/[quoteNumber]` — unchanged |
| SUBCONTRACTOR | `/dashboard` | `/jobs/[quoteNumber]` ← fix this |
| SUBCONTRACTOR | `/jobs` | `/jobs/[quoteNumber]` — already correct, do not touch |

### Implementation notes
- Fix is in the dashboard lead table component — the `onClick` handler on each `<tr>`
- When `session.user.role === 'SUBCONTRACTOR'`: navigate to `/jobs/${quoteNumber}`
- When role is ADMIN or CLIENT: navigate to `/leads/${quoteNumber}` — do not change
- Google Maps button must still use `e.stopPropagation()` — verify it still works after the fix
- Do not change anything on the `/jobs` page

### Testing
1. Log in as subcontractor
2. Navigate to `/dashboard`
3. Click any lead row
4. Confirm browser navigates to `/jobs/[quoteNumber]` and correct job detail loads
5. Confirm Google Maps button opens Maps in new tab without navigating away

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Verify `job_booked_date` exists on the leads table**
Run the following and check the output:
```bash
npx prisma db pull
```
Or inspect the Prisma schema at `prisma/schema.prisma` and confirm `job_booked_date` exists as a field on the `Lead` model.

If `job_booked_date` does NOT exist:
- Add it to the Prisma schema: `job_booked_date DateTime?`
- Run `npx prisma migrate dev --name add_job_booked_date`
- Do not proceed to any change until this migration succeeds

If `job_booked_date` DOES exist: proceed normally.

**2. Verify `reconciliation_batches` table exists**
Check `prisma/schema.prisma` for a `ReconciliationBatch` model. If it does not exist, the commission changes in this prompt will fail. If it is missing, stop and flag this to Oli before proceeding — do not attempt to rebuild it from scratch without confirmation.

**3. Verify `job_completed_at` exists on the leads table**
Same check — confirm `job_completed_at` is present on the `Lead` model in the schema. If missing, add it: `job_completed_at DateTime?` and run a migration before proceeding.

**4. Read CLAUDE.md before writing any code**
Confirm the Vibstr reporting command, versioning rules, and coding standards are loaded into context.

Only after all four checks pass — begin building in the order specified below.

---



Follow this order exactly. Do not jump ahead.

1. Change 29 — Rename all stat card labels, add second subcontractor revenue card
2. Change 30 — Investigate and fix campaign settings page — root cause first, then rebuild
3. Change 31 — Two-tier default sort on lead table across all three role views
4. Change 32 — Fix "No campaign assigned" on reconciliation — session reading fix
5. Change 33 — Update middleware to allow subcontractor access to notifications and audit log
6. Change 34 — Build client commission tab with monthly invoice generation
7. Change 35 — Fix all financial stat cards to only count JOB_COMPLETED leads
8. Change 36 — Restrict invoice upload to JOB_BOOKED and JOB_COMPLETED only
9. Change 37 — Fix subcontractor dashboard row click to navigate to job detail
10. Change 38 — Add Financials section to client lead detail page
11. Change 39 — Urgency dots, Needs Action sidebar, page, and filter
12. Verify all stat cards show correct values across all three roles
13. Bump version in `package.json` — MINOR bump minimum
14. Commit: `v[X.X.0] — stat card rename, settings fix, lead sort, reconcile fix, sub routes, client commission, revenue fix, invoice restriction, nav fix, client financials, needs action system`
15. Run Vibstr build report as per CLAUDE.md

---

## Master Build Checklist

Do not consider this session complete until every item is verified.

**Change 29 — Stat card renaming**
- [ ] Admin: "Total Billed to Customers", "Our Margin", "Commission Received", "Commission Owed to Me"
- [ ] Client: "Total Billed to Customers", "Our Margin"
- [ ] Subcontractor: two cards — "Total Billed to Customers" and "Total Jobs Revenue"
- [ ] Both subcontractor cards respect the active date range filter
- [ ] PDF export template uses updated label names
- [ ] Commission page stat card labels updated to match

**Change 30 — Campaign settings fix**
- [ ] Root cause identified and documented before any code is written
- [ ] Settings page loads without "No campaign selected" message
- [ ] Page subtitle shows current campaign name
- [ ] All four sections load with current values pre-filled
- [ ] Section 1 (General) saves correctly and persists after page reload
- [ ] Section 2 shows warning modal before saving rate changes
- [ ] Client margin auto-calculates live as commission % is changed
- [ ] Section 3 status saves and syncs with campaign card
- [ ] Section 4 deactivate requires confirmation modal
- [ ] Campaign ID comes from session only — not URL parameter

**Change 31 — Lead table sort**
- [ ] Active leads appear at top, JOB_COMPLETED leads at bottom by default
- [ ] Within active group: oldest lead first
- [ ] Sort applied at database level — not client-side
- [ ] Pagination works correctly with two-tier sort
- [ ] Active filters still work with two-tier sort
- [ ] Column header click overrides to flat sort
- [ ] Applies to admin, client, and subcontractor views

**Change 32 — Reconciliation campaign bug**
- [ ] "No campaign assigned" error no longer appears
- [ ] Reconciliation completes successfully
- [ ] Campaign ID read from session — not request body
- [ ] ReconciliationBatch created with correct campaign ID
- [ ] Leads stamped with batch ID
- [ ] Reconciled months disappear from By Month tab
- [ ] Batch appears in Reconciled Batches tab

**Change 33 — Subcontractor route access**
- [ ] Subcontractor can access /notifications without redirect to login
- [ ] Subcontractor can access /audit without redirect to login
- [ ] Both pages show only data from subcontractor's campaign
- [ ] CLIENT role still cannot access either page
- [ ] No other middleware rules changed

**Change 34 — Client commission tab**
- [ ] Commission tab in client sidebar
- [ ] Date range filter appears top right of client commission page
- [ ] Date range filter options match dashboard: All time, Today, Last 7 days, Month to date, Last month, Last quarter, Custom range
- [ ] Selecting a range filters both stat cards and month cards immediately
- [ ] Selected range persists in URL as query parameter
- [ ] Two stat cards: total margin ex GST and incl. GST — both respect date range filter
- [ ] Jobs grouped by month of job_completed_at
- [ ] Month cards expandable with job list
- [ ] Generate Invoice opens modal with correct invoice content
- [ ] Invoice shows gross markup only — no contractor rate, customer price, or commission split
- [ ] GST breakdown correct: subtotal × 0.15, total × 1.15
- [ ] Print / Save as PDF works cleanly
- [ ] API returns gross_markup only — never commission or margin figures
- [ ] API scoped to session campaign ID
- [ ] API accepts from/to date parameters for date range filtering

**Change 35 — Financial stat cards — completed jobs only**
- [ ] Every financial card filters by status = JOB_COMPLETED
- [ ] No card filters by invoice presence
- [ ] All cards correct across admin, client, and subcontractor views
- [ ] Date range filter still applies correctly alongside status filter
- [ ] Values verified manually against lead table

**Change 36 — Invoice upload restriction**
- [ ] Invoice section completely hidden at LEAD_RECEIVED
- [ ] Invoice section completely hidden at QUOTE_SENT
- [ ] Invoice section visible at JOB_BOOKED
- [ ] Invoice section visible at JOB_COMPLETED
- [ ] Applies to admin lead detail and subcontractor job detail
- [ ] API returns 400 if upload attempted at LEAD_RECEIVED or QUOTE_SENT
- [ ] No disabled button shown at early statuses — section is not rendered at all

**Change 37 — Subcontractor dashboard nav fix**
- [ ] Clicking lead row on subcontractor /dashboard goes to /jobs/[quoteNumber]
- [ ] Admin and client row clicks still go to /leads/[quoteNumber]
- [ ] Google Maps button still opens Maps without triggering row navigation
- [ ] Correct job detail page loads — not the general jobs list

**Change 38 — Client lead detail financials**
- [ ] Financials section appears on client lead detail page
- [ ] Positioned between Invoice section and Show Activity section
- [ ] All six fields visible: Contractor Rate, Customer Price, Gross Markup, Omniside Commission, Client Margin, Customer Price incl. GST
- [ ] All fields are read-only — no editing
- [ ] Null values show as "—" not $0.00
- [ ] Customer Price incl. GST calculated as customer_price × 1.15 — display only
- [ ] Visual grouping matches admin financials card
- [ ] API returns all five financial fields to CLIENT role — overrides previous Change 24 client restriction
- [ ] SUBCONTRACTOR API restriction from Change 24 is unchanged

**Change 39 — Needs Action system**
- [ ] Amber dot on Lead Received rows where created_at is 24+ hours ago
- [ ] Red dot on Lead Received rows where created_at is 48+ hours ago
- [ ] Urgency dot on Lead Received only clears when status moves to Quote Sent — not when notes or other fields are updated
- [ ] Amber dot on Job Booked rows where job_booked_date is 10+ days ago
- [ ] Red dot on Job Booked rows where job_booked_date is 21+ days ago
- [ ] Urgency dot on Job Booked only clears when invoice is uploaded — not when notes or other fields are updated
- [ ] No dot on Quote Sent or Job Completed rows
- [ ] Dots appear on admin lead table and subcontractor job queue
- [ ] Hover tooltip shows plain English time overdue using correct timestamp per status
- [ ] "Needs Action" sidebar item visible for admin and subcontractor
- [ ] Sidebar badge shows correct count of flagged leads
- [ ] Badge hidden when count is 0
- [ ] Badge scoped to session campaign — subcontractor only sees their campaign
- [ ] /needs-action page accessible by admin and subcontractor — blocked for client
- [ ] Needs Action page shows two sections: Quotes Not Sent and Jobs Not Completed
- [ ] Each section sorted by most overdue first
- [ ] Clicking a row navigates to correct detail page by role
- [ ] Empty state shows "All clear" message when no leads flagged
- [ ] "Needs Action" option in status filter dropdown on dashboard and jobs page
- [ ] Needs Action filter shows leads meeting either urgency condition
- [ ] Needs Action filter works alongside date range filter
- [ ] Urgency fields computed server-side using created_at for LEAD_RECEIVED and job_booked_date for JOB_BOOKED
- [ ] No database schema changes required
- [ ] CLIENT role cannot see urgency dots, Needs Action sidebar, or page

**Final**
- [ ] Version bumped in `package.json`
- [ ] Committed with correct message format
- [ ] Vibstr build report sent

---

## Change 38 — Add Financials Section to Client Lead Detail Page

### Problem
On the client lead detail page (`/leads/[quoteNumber]`), the Financials section is missing entirely. The client can see financial summary numbers on the dashboard stat cards, but when they click into an individual lead they cannot see the breakdown for that specific job. The Financials section needs to be added to the client view of the lead detail page.

### What needs to happen
Add a Financials card to the client lead detail page, positioned between the Invoice section and the Show Activity section — exactly as it appears on the admin lead detail page.

### Fields to display — all six, identical to the admin view

```
Financials

Contractor Rate (ex GST)          $320.00
Customer Price (ex GST)           $400.00
Gross Markup (ex GST)              $80.00

Omniside Commission (ex GST)       $32.00
Client Margin (ex GST)             $48.00

Customer Price (incl. GST)        $460.00
```

- All six fields are shown — no fields hidden from the client
- Omniside Commission and Client Margin are visible to the client
- The visual grouping matches the admin view — contractor rate, customer price, and gross markup in one group; commission and margin in a second group; incl. GST price as a final line
- All values are read-only — the client cannot edit any financial field
- If any financial field is null (e.g. invoice not yet uploaded), show a dash "—" for that value rather than $0.00 or blank

### Positioning
The Financials card must appear in this exact order on the client lead detail page:
1. Customer & Property details (already exists)
2. Status pipeline (already exists)
3. **Financials** ← add here
4. Invoice (already exists)
5. Show Activity (already exists)

### API change
The `GET /api/leads/[quoteNumber]` route currently strips financial fields from the client response (as specced in Change 24). This must be updated — when the requesting user is CLIENT, return all five stored financial fields: `contractor_rate`, `customer_price`, `gross_markup`, `omniside_commission`, `client_margin`. The client is now allowed to see all of these.

Note: this overrides the previous Change 24 restriction for CLIENT role only. The SUBCONTRACTOR restriction from Change 24 remains unchanged — subcontractors still do not see `omniside_commission` or `client_margin`.

### Implementation notes
- The Financials component already exists from the admin view — reuse it for the client view rather than building a new one
- The component should accept a `role` prop or read from the session to determine which fields to show — in this case CLIENT gets all fields, SUBCONTRACTOR gets the restricted set
- `Customer Price (incl. GST)` is calculated as `customer_price × 1.15` — display only, never stored
- Apply the same visual styling as the admin financials card — dark surface, field label on the left, bold value on the right, dividers between groups

---

## Change 39 — Urgency Indicators and "Needs Action" System

### Dependency check — do this before writing any code for this change
This change uses `job_booked_date` on the leads table. Before writing any code here, confirm this field exists. It was introduced in a previous build session. If it is missing from the schema, add it and run the migration now — do not skip this step or the urgency calculations for Job Booked leads will fail silently.

### Context
Leads can get stuck at certain statuses without anyone noticing — particularly Lead Received (needs a quote sent) and Job Booked (needs an invoice uploaded and job completed). This change adds a visual urgency system and a dedicated "Needs Action" view so both Oli and Frank's VA always know immediately what requires attention, without having to scan through every lead manually.

### Who sees this
- **ADMIN (Oli)** — sees urgency dots on the lead table, Needs Action sidebar item, and Needs Action filter
- **SUBCONTRACTOR (Frank/VA)** — sees urgency dots on the job queue, Needs Action sidebar item, and Needs Action filter
- **CLIENT** — does not see urgency indicators or Needs Action — this is an operational tool, not a reporting tool

---

### Part 1 — Urgency Dot Rules

The urgency clock is tied directly to the **status** — not to `updated_at`. The only thing that clears an urgency indicator is completing the required action for that status. Adding a note, editing a field, or any other incidental update to the lead record does not reset the clock.

**Lead Received urgency clock:**
- Starts from `created_at` — the moment the lead entered Jobbly
- Never resets until the status changes to `QUOTE_SENT`
- Once status moves to `QUOTE_SENT`, the urgency clears permanently for that lead

**Job Booked urgency clock:**
- Starts from `job_booked_date` — the date recorded when the status moved to `JOB_BOOKED`
- Never resets until an invoice is uploaded (`invoice_url` becomes non-null)
- Once an invoice is attached, the urgency clears permanently for that lead

This means:
- A VA adding a note to a Lead Received lead does **not** clear the amber/red dot
- Only actually sending the quote (moving status to Quote Sent) clears it
- A VA adding a note to a Job Booked lead does **not** clear the amber/red dot
- Only uploading the invoice clears it

#### Lead Received — urgency thresholds
A lead at `LEAD_RECEIVED` needs a quote sent as quickly as possible. This is the most time-critical status.

| Time since `created_at` | Indicator |
|---|---|
| Under 24 hours | No dot — within normal range |
| 24 hours or more | 🟡 Amber dot — needs attention soon |
| 48 hours or more | 🔴 Red dot — overdue, needs immediate action |

#### Job Booked — urgency thresholds
A lead at `JOB_BOOKED` needs an invoice uploaded and the job marked complete.

| Time since `job_booked_date` | Indicator |
|---|---|
| Under 10 days | No dot — within normal range |
| 10 days or more | 🟡 Amber dot — getting overdue |
| 21 days or more | 🔴 Red dot — significantly overdue |

#### Quote Sent — no urgency indicator
Quote Sent does not get urgency dots — once a quote is sent, the next move is the customer's, not the VA's.

#### Job Completed — no urgency indicator
Completed jobs need no further action.

---

### Part 2 — Visual dot implementation on the lead/job table

**Where the dot appears:**
- A small filled circle (8px) in a dedicated column on the far left of the table row — before the Quote # column
- Or alternatively, placed directly to the left of the Quote # text within that cell — whichever is cleaner visually
- The dot replaces nothing — it is additive to the existing row

**Colours:**
- Amber: `bg-amber-400` — `#FBBF24`
- Red: `bg-red-500` — `#EF4444`

**Tooltip on hover:**
- Amber on Lead Received: "Quote not sent — [X] hours overdue"
- Red on Lead Received: "Quote not sent — [X] hours overdue"
- Amber on Job Booked: "Invoice not uploaded — [X] days overdue"
- Red on Job Booked: "Invoice not uploaded — [X] days overdue"

The tooltip uses plain English time — "2 days overdue", "36 hours overdue" — calculated from `updated_at`.

**Applies to:**
- Admin lead table on `/dashboard`
- Subcontractor job queue on `/jobs`

---

### Part 3 — "Needs Action" sidebar item

Add a "Needs Action" nav item to both the admin and subcontractor sidebars. It sits above the Jobs/Leads item — near the top of the nav, because it represents the highest priority view.

**Updated admin sidebar:**
```
[Jobbly wordmark]

⚠️  Needs Action    [badge count]  ← new, near top
📊  Dashboard
📋  Leads
💰  Commission
🔔  Notifications
📁  Audit Log
⚙️  Settings
👥  Users

─────────────────
🔀  Switch Campaign
👤  [User name]
🚪  Log out
```

**Updated subcontractor sidebar:**
```
[Jobbly wordmark]

⚠️  Needs Action    [badge count]  ← new, near top
📊  Dashboard
🔧  Jobs
🔔  Notifications
📁  Audit Log

─────────────────
👤  [User name]
🚪  Log out
```

**Badge count:**
- Shows the total number of leads currently meeting either urgency condition:
  - Lead Received AND `updated_at` is 24+ hours ago
  - Job Booked AND `updated_at` is 10+ days ago AND no invoice attached (`invoice_url IS NULL`)
- Badge uses the same red pill style as the notifications unread badge
- Updates on every page load — no real-time polling needed for MVP
- If count is 0, the badge is hidden — not shown as "0"
- Scoped to the user's campaign — subcontractor only sees their campaign's count

**Route:** `/needs-action`
- ADMIN and SUBCONTRACTOR only — add to middleware
- Redirects to login if unauthenticated

---

### Part 4 — "Needs Action" page (`/needs-action`)

A dedicated page showing only the leads that currently need action. Clean, focused, nothing else.

**Page title:** "Needs Action"
**Subtitle:** "[X] leads need your attention"

**Two sections on the page:**

**Section 1 — Quotes Not Sent**
Heading: "Quote not sent"
Description: "These leads have been waiting 24+ hours without a quote being sent."
Table showing all `LEAD_RECEIVED` leads where `updated_at` is 24+ hours ago:
- Columns: Urgency dot, Quote #, Customer name, Address, Phone, Date received, Hours waiting
- "Hours waiting" = number of hours since `updated_at` — shown as "36 hrs" or "2 days 4 hrs"
- Sorted by hours waiting descending — most overdue at top
- Clicking a row navigates to the lead detail page (admin → `/leads/[quoteNumber]`, subcontractor → `/jobs/[quoteNumber]`)

**Section 2 — Jobs Not Completed**
Heading: "Invoice not uploaded"
Description: "These jobs have been booked for 10+ days without an invoice being attached."
Table showing all `JOB_BOOKED` leads where `updated_at` is 10+ days ago AND `invoice_url IS NULL`:
- Columns: Urgency dot, Quote #, Customer name, Address, Phone, Date booked, Days waiting
- "Days waiting" = number of days since `updated_at` — shown as "12 days"
- Sorted by days waiting descending — most overdue at top
- Clicking a row navigates to the lead detail page

**Empty state:**
If no leads meet either condition, show a centred success message:
"All clear — no leads need action right now."
With a small green tick icon above it.

---

### Part 5 — "Needs Action" quick filter on the jobs/leads table

Add a "Needs Action" filter option to the status filter dropdown on both the admin dashboard lead table and the subcontractor job queue.

**Updated status filter dropdown options:**
```
All Statuses  ← default
─────────────
⚠️  Needs Action  ← new option at top of status list
─────────────
Lead Received
Quote Sent
Job Booked
Job Completed
```

When "Needs Action" is selected:
- Shows only leads meeting either urgency condition (same logic as the sidebar badge)
- Lead Received 24+ hours old OR Job Booked 10+ days old without invoice
- Both urgency dot colours appear in the filtered results
- The filter works alongside the date range filter — both can be active simultaneously

---

### API requirements

**`GET /api/needs-action`**
- ADMIN and SUBCONTRACTOR only
- Scoped to session campaign ID
- Returns two arrays:
  - `quotes_not_sent`: all `LEAD_RECEIVED` leads where `created_at < now - 24 hours` — clock based on creation, never resets
  - `jobs_not_completed`: all `JOB_BOOKED` leads where `job_booked_date < now - 10 days` AND `invoice_url IS NULL` — clock based on booking date, only clears when invoice is uploaded
- Returns counts for both arrays (used for sidebar badge — `quotes_not_sent.length + jobs_not_completed.length`)

**`GET /api/dashboard` and `GET /api/jobs` — add urgency fields to lead responses**
Each lead in the response must include two computed fields:
- `urgency_level`: `null` | `'amber'` | `'red'` — calculated server-side using the correct timestamp per status:
  - For `LEAD_RECEIVED`: compare `now` against `created_at`
  - For `JOB_BOOKED`: compare `now` against `job_booked_date`
  - For all other statuses: always `null`
- `urgency_hours`: number of hours since the relevant timestamp — used for tooltip text (e.g. "36 hours overdue", "12 days overdue")

These fields are computed at query time — not stored in the database. No schema changes needed.

### Database changes
None required. All urgency calculations are based on existing fields: `status`, `updated_at`, and `invoice_url`.

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 40 — [Title], then full spec
-->
