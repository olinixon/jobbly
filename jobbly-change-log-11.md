# Jobbly — Change Log 11
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are five changes in this session — bug fixes, UI improvements, and new features. Complete all five in a single session in the order listed. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Locate the invoice upload handler**
Find the API route that handles invoice uploads (likely `POST /api/leads/[quoteNumber]/invoice` or similar — confirm actual path). Read the full file. You will be modifying the AI prompt and adding a quote number validation check in Change 1.

**3. Locate the invoice AI parsing utility**
Find where the Anthropic API is called to extract `customer_price_ex_gst` from the uploaded invoice. This may be inline in the upload route or in a separate utility file (e.g. `/lib/parseInvoice.ts`). Read it fully — you will extend the AI prompt and add quote number extraction.

**4. Locate the invoice upload modal component**
Find the modal shown during and after invoice upload — the one that shows the financial breakdown confirmation screen ("Invoice uploaded ✓ / Extracted from invoice: / Customer price ex GST: ..."). You will be adding a new error state to this modal in Change 1.

**5. Locate the booking slots API**
Find `GET /api/book/[token]/slots` (confirm actual path). Read the full file — specifically how time windows are generated from `AvailabilitySlot` records. You will add time filtering logic in Change 2.

**6. Locate the dashboard and job queue search API routes**
Find the API routes that handle text search for the admin/client dashboard lead table and the subcontractor job queue — likely `GET /api/dashboard` and `GET /api/jobs` (confirm actual paths). Read the Prisma `where` clause in each. You will be adding `mode: 'insensitive'` to the `contains` filters in Change 3.

**7. Locate the sidebar component(s)**
Find the sidebar navigation component(s) for each role — admin, client, and subcontractor likely have separate sidebar files or a shared component with role-based rendering. Read each one. You will be adding a mobile hamburger menu and slide-out drawer in Change 4.

**8. Locate the lead table and job queue list components**
Find the component(s) that render the lead table on the admin/client dashboard and the job card/row list on the subcontractor job queue. Read both. You will be adding responsive card layouts for mobile in Change 4.

**9. Locate the webhook handler and manual lead creation route**
Find the webhook handler (`POST /api/webhooks/lead` or similar — confirm actual path) and the manual lead creation route (`POST /api/leads` or similar). Read both. You will be adding duplicate detection logic to both in Change 5.

**10. Sync production database with current Prisma schema**
Before building anything, verify the production Supabase database is fully in sync. Run:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports everything is in sync — proceed normally.
If it reports changes were applied — note what changed and confirm the app loads correctly on production before continuing.
If it throws an error — stop and report the error to Oli before proceeding.

Only after all ten checks pass — begin building in the order listed below.

---

## Change 1 — [#157] Invoice Upload — Add Quote Number Validation

### Background

When a subcontractor uploads an invoice, Jobbly already uses the Anthropic API to extract the customer price (ex GST) and calculate all five financial fields. That feature is working well. The problem is that there is currently no check to confirm the invoice actually belongs to this lead — any invoice can be uploaded against any job.

The fix is to also extract the quote number from the invoice during the same AI parsing step, then compare it against the lead's `quote_number` field. If they don't match (with high confidence), show an error screen before the financial confirmation step — the same way the quote upload flow shows a mismatch error when the wrong quote PDF is uploaded.

---

### Step 1 — Extend the AI invoice parsing prompt to extract the quote number

Find the existing AI prompt used for invoice parsing. It currently asks the AI to extract `customer_price_ex_gst`. Extend it to also extract the quote/reference number.

**Updated AI system prompt:**

```
You are an invoice parser for a New Zealand business.

Extract the following from this invoice:
1. The total amount charged EXCLUDING GST (the ex-GST subtotal). If the invoice shows a GST-inclusive total only, divide by 1.15 to calculate the ex-GST amount.
2. The quote number, reference number, job number, or any similar identifier on the invoice.

Return ONLY a valid JSON object in this exact format, nothing else:
{
  "customer_price_ex_gst": 250.00,
  "currency": "NZD",
  "gst_inclusive_total": 287.50,
  "confidence": "high",
  "extracted_quote_number": "QU00103"
}

If you cannot find a clear total, set "customer_price_ex_gst" to null and "confidence" to "low".
If you cannot find a quote/reference number, set "extracted_quote_number" to null.
Do not include any other text, explanation, or markdown — just the raw JSON object.
```

**Update the return type / interface** for the invoice parsing result to include `extracted_quote_number: string | null`.

---

### Step 2 — Add quote number validation logic in the upload handler

After the AI parses the invoice and returns `extracted_quote_number`, compare it to the lead's `quote_number` before proceeding to financial calculations.

**Validation rules:**

- **Match** — `extracted_quote_number` is a reasonable match to `lead.quote_number` (allow minor formatting differences, e.g. `QU00103` vs `QU-00103` or `qu00103` — normalise both to uppercase with non-alphanumeric characters stripped for comparison)
- **Mismatch** — `extracted_quote_number` is clearly a different value (e.g. `QU00107` vs `QU00103`)
- **Unknown** — `extracted_quote_number` is null (could not be found in the document)

**Only block the upload when:**
- `extracted_quote_number` is not null AND
- The normalised values do not match AND
- The overall parsing `confidence` is `"high"`

In all other cases (null quote number, or `confidence === "low"`, or a match), proceed with the upload as normal.

**Logic (pseudo-code for reference):**

```typescript
function normaliseQuoteNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const extractedNormalised = result.extracted_quote_number
  ? normaliseQuoteNumber(result.extracted_quote_number)
  : null;
const expectedNormalised = normaliseQuoteNumber(lead.quote_number);

const quoteMismatch =
  extractedNormalised !== null &&
  extractedNormalised !== expectedNormalised &&
  result.confidence === 'high';

if (quoteMismatch) {
  // Return a specific error — do NOT block file save, do NOT block financial calc
  // The file is already saved — keep it. Just return the mismatch error to the client.
  return Response.json({
    success: false,
    error: 'invoice_quote_mismatch',
    extracted_quote_number: result.extracted_quote_number,
    expected_quote_number: lead.quote_number,
  }, { status: 422 });
}
```

**Important:** Do not delete the uploaded file if there is a quote number mismatch. The file has been saved — keep it. The user is shown the error and can choose to upload again (selecting the correct invoice) or override. The override flow will re-submit and the handler should accept an `override_quote_mismatch: true` flag in the request body to bypass this check on the second attempt.

---

### Step 3 — Add the mismatch error state to the invoice upload modal

The invoice upload modal currently has these states: idle → uploading → parsing → financial confirmation → closed (or error).

Add a new `invoice_quote_mismatch` state that appears when the API returns `error: 'invoice_quote_mismatch'`.

**Error display:**

```
❌ Quote number doesn't match

The invoice appears to reference quote number "[extracted_quote_number]",
but this job is for quote number [expected_quote_number].

Please check you've uploaded the correct invoice.

[Try again]   [Upload anyway]
```

- `[extracted_quote_number]` — the value returned by the API (what the AI found on the invoice)
- `[expected_quote_number]` — the lead's `quote_number`
- **"Try again"** — clears the file selection and returns the modal to the idle upload state. The user can pick the correct invoice and try again. The previously uploaded (mismatched) file remains saved but is not linked to the lead's `invoice_url`.
- **"Upload anyway"** — re-submits the upload with `override_quote_mismatch: true` in the request body. The handler skips the quote number check and proceeds with financial parsing and confirmation as normal. This escape hatch covers cases where the AI misread the quote number, or the invoice uses an alternative reference format.

Style this error state to match the existing quote mismatch error state used in the quote upload modal — same ❌ icon treatment, same button pattern.

---

### Step 4 — "Upload anyway" re-submission flow

When the user clicks "Upload anyway":

1. Re-submit the same file to the upload endpoint
2. Include `override_quote_mismatch: true` in the request body (as a form field or JSON flag — match whatever format the upload route uses)
3. The upload handler checks for this flag before running quote number validation — if present, skip the quote number check entirely and proceed to financial extraction and confirmation as normal
4. The financial confirmation screen then appears as usual — unchanged

The file does not need to be re-uploaded from scratch if the server already has it. If the architecture makes it easier to re-send the file, that is also fine — whatever is cleanest given the current upload implementation.

---

### What does NOT change

- The price extraction and financial calculation flow — unchanged
- The financial confirmation screen ("Invoice uploaded ✓ / Customer price ex GST: ...") — unchanged, still appears after a successful parse (with or without override)
- The "Confirm & Close" and "Edit manually" buttons — unchanged
- The fallback flow when AI parsing fails entirely (low confidence, no price found) — unchanged
- The role-gating of financial fields (subcontractor does not see commission/margin) — unchanged
- The auto-advance to JOB_COMPLETED on subcontractor upload — unchanged

---

### Build order for this change

1. Read pre-flight — locate invoice upload handler and AI parsing utility
2. Extend the AI prompt to extract `extracted_quote_number`
3. Update the parsing result interface/type to include `extracted_quote_number: string | null`
4. Add `normaliseQuoteNumber` helper
5. Add quote number mismatch check in the upload handler — return `422` with `invoice_quote_mismatch` error
6. Add `override_quote_mismatch` flag handling in the upload handler to skip the check on override
7. Add `invoice_quote_mismatch` error state to the invoice upload modal component
8. Wire "Try again" to return to idle state
9. Wire "Upload anyway" to re-submit with override flag
10. Bump version in `package.json` — PATCH bump
11. Commit: `v[X.X.X] — add quote number validation to invoice upload`
12. Push to GitHub: `git push origin main`
13. Run Vibstr build report per CLAUDE.md

---

## Change 2 — [#156] Booking Page — Filter Out Past and Near-Future Time Slots

### Background

On the customer-facing booking page (`/book/[booking_token]`), the slot picker shows available time windows generated from `AvailabilitySlot` records. The problem is that it currently shows windows that have already passed, or are so close to the current time that the team could not realistically receive and prepare for the job.

For example: a customer viewing the page at 1:00pm on 1 April can still see and select the 9:00am – 11:00am window from earlier that same day, or a 1:00pm window starting right now.

The fix: filter out any time window where the start time is in the past OR within 2 hours of the current time (NZ time). Only show windows that start more than 2 hours from now.

---

### Step 1 — Locate how windows are generated in the slots API

Find `GET /api/book/[token]/slots` and read how it generates windows from `AvailabilitySlot` records. Windows are generated by splitting the slot's time range into chunks based on `duration_minutes`. For example:

- Slot date: 1 April 2026
- Slot time range: 07:00 – 13:00
- Duration: 120 min
- Generated windows: 07:00–09:00, 09:00–11:00, 11:00–13:00

Each window is defined by a date (from the slot) and a start time string (e.g. `"09:00"`).

---

### Step 2 — Add a 2-hour buffer filter to the window generation

After generating all windows from the slot, filter out any window where the full datetime of the window start is less than 2 hours from now.

**Logic:**

```typescript
const now = new Date();
const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

const filteredWindows = allWindows.filter((window) => {
  // Combine the slot's date with the window's start time to get a full datetime
  // slot.date is a DateTime — take the date portion
  // window.window_start is a time string like "09:00"
  const slotDate = new Date(slot.date); // e.g. 2026-04-01T00:00:00.000Z
  const [hours, minutes] = window.window_start.split(':').map(Number);

  const windowDateTime = new Date(slotDate);
  windowDateTime.setUTCHours(hours, minutes, 0, 0);

  // Only include windows that start more than 2 hours from now
  return windowDateTime > twoHoursFromNow;
});
```

**Important — timezone handling:**
The `AvailabilitySlot.date` is stored as a UTC `DateTime` in the database (Prisma/Supabase). The `start_time` and `end_time` strings (e.g. `"07:00"`) represent NZ local time (NZST = UTC+12, NZDT = UTC+13). When combining date and time for comparison, be careful not to introduce a timezone offset error.

Investigate how the slot date and time are currently being combined when generating windows — use the same approach already in the codebase. If UTC methods are used, use UTC throughout. If local time is used, be consistent. The goal is that a window starting at 09:00 NZ time on 1 April is treated as 09:00 NZ time — not 09:00 UTC.

If you are unsure of the correct approach after reading the existing code, stop and flag it to Oli before proceeding.

---

### Step 3 — Filter out entire slots with no remaining windows

After filtering windows, if a slot has no windows remaining (all were in the past or within 2 hours), do not include that slot in the API response at all. A slot with zero available windows is useless to the customer.

---

### Step 4 — Verify the filter applies to the correct state

This filter must apply in all of the following scenarios:

- First-time booking (customer has not booked yet)
- Reschedule (customer has an existing booking and is picking a new time)

The filter should be applied at the point where windows are generated and returned — not at the UI layer. The API response must never include past or near-future windows.

---

### Step 5 — What "no available slots" looks like after filtering

If all slots have been filtered out (e.g. it is late in the day and all remaining windows are within 2 hours or in the past), the booking page will receive an empty slots array. This state should already be handled by the existing "no available slots" UI on the booking page — confirm that it is, and that the page shows a sensible empty state to the customer rather than crashing or showing a blank slot picker.

If there is no empty state, add one:

```
No times are currently available.

If you'd like to arrange a time, please reply to your quote email and we'll be in touch.
```

---

### What does NOT change

- The slot picker UI on the booking page — no layout or visual changes
- How held slots ("Temporarily unavailable") are treated — unchanged
- How confirmed/already-booked windows are hidden — unchanged
- The booking token validation — unchanged
- Any admin calendar or admin availability views — unchanged (this filter is customer-facing only)

---

### Build order for this change

1. Read pre-flight — locate `GET /api/book/[token]/slots` and read it fully
2. Understand how the slot date and window start time are currently combined — note the approach
3. Add `twoHoursFromNow` filter to the window generation loop
4. Add slot-level filtering — remove slots with zero remaining windows
5. Verify the reschedule path also goes through the same slots API and picks up the filter
6. Verify the empty state UI on the booking page — add if missing
7. Bump version in `package.json` — PATCH bump
8. Commit: `v[X.X.X] — filter past and near-future windows from customer booking page`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 3 — Case-Insensitive Search on Dashboard and Job Queue

### Background

The search bar on the admin/client dashboard (`/dashboard`) and the subcontractor job queue (`/jobs`) lets users filter by quote number, customer name, or address. The issue is that the search is currently case-sensitive — typing `qu00103` does not match `QU00103`, and typing a lowercase name will miss leads with title-cased names in the database.

Since quote numbers are always stored in uppercase (e.g. `QU00103`), a user typing in lowercase gets no results. This is a small fix but a necessary one.

---

### What needs to change

Find the API route(s) that handle the search query for the leads table and the job queue. This is likely `GET /api/dashboard` and/or `GET /api/jobs` — confirm the actual paths by reading the existing code.

Locate the Prisma query that filters leads by the search term. It will look something like:

```typescript
where: {
  OR: [
    { quote_number: { contains: search } },
    { customer_name: { contains: search } },
    { property_address: { contains: search } },
  ]
}
```

Add `mode: 'insensitive'` to each `contains` filter:

```typescript
where: {
  OR: [
    { quote_number: { contains: search, mode: 'insensitive' } },
    { customer_name: { contains: search, mode: 'insensitive' } },
    { property_address: { contains: search, mode: 'insensitive' } },
  ]
}
```

`mode: 'insensitive'` is a Prisma feature supported natively by PostgreSQL — no migration needed, no package changes required.

**Apply this fix to every search query that filters leads by text input**, including:
- Admin dashboard lead table search
- Client dashboard lead table search (if it has its own query)
- Subcontractor job queue search
- Any other lead/job search in the codebase that uses `contains` without `mode: 'insensitive'`

Do not change the search UI — no visual changes needed.

---

### What does NOT change

- Search field placement or placeholder text — unchanged
- What fields are searched (quote number, name, address) — unchanged
- Any other filter (status, date range) — unchanged
- Database schema — no migration needed

---

### Build order for this change

1. Find all API routes that handle lead/job search queries
2. Add `mode: 'insensitive'` to every `contains` filter on text search fields
3. Verify the fix applies to admin dashboard, client dashboard, and subcontractor job queue
4. Bump version in `package.json` — PATCH bump
5. Commit: `v[X.X.X] — fix case-insensitive search on dashboard and job queue`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Change 4 — Mobile-Optimised Layout for All Roles

### Background

Jobbly is accessed in the browser on desktop and mobile — same URL, same login, same app. At the moment the layout is built for desktop only. On a phone, the sidebar overlaps content, tables overflow the screen, and modals can be difficult to interact with. This change adds a fully responsive mobile layout across all three roles without changing anything about the desktop experience.

Everything is additive — Tailwind's responsive utilities (`sm:`, `md:`, `lg:`) mean mobile styles are layered on top of the existing desktop styles. Do not remove or restructure existing desktop layout classes. Only add mobile-specific overrides.

---

### Step 1 — Collapsible sidebar with hamburger menu

This is the core structural change. On mobile, the sidebar must not sit permanently on screen — it collapses and is toggled by a hamburger button.

**Mobile behaviour:**
- The sidebar is hidden off-screen by default on mobile (e.g. `translate-x-full` or `hidden`)
- A hamburger icon button appears in the top-left corner of the header/nav bar on mobile only — hidden on desktop (`lg:hidden`)
- Tapping the hamburger slides the sidebar in from the left as a drawer overlay
- A semi-transparent dark backdrop appears behind the drawer — tapping the backdrop closes the drawer
- Tapping any nav item in the drawer navigates and closes the drawer automatically
- On desktop (`lg:`) the sidebar is always visible as before — no hamburger, no drawer, no change

**Apply this to all three role sidebars** — admin, client, and subcontractor. If they share a sidebar component, one implementation covers all three. If they are separate files, apply the same pattern to each.

**State management:** A simple `useState` boolean (`sidebarOpen`) in the layout component is sufficient — no external state library needed.

---

### Step 2 — Lead table → card layout on mobile

The admin and client dashboard lead tables have 8+ columns. On mobile, replace the table with a stacked card layout — one card per lead.

**Mobile card layout (applied with `block md:hidden` or similar):**

```
┌──────────────────────────────────────┐
│ ⚠️  QU00103                  BOOKED  │
│ Jane Smith                           │
│ 14 Rata Street, Remuera              │
│ Received 27 Mar 2026                 │
└──────────────────────────────────────┘
```

Each card shows:
- Quote number (left) + status badge (right) on the first line — urgency dot before quote number if applicable
- Customer name on the second line
- Property address on the third line
- Date received on the fourth line, muted text
- The entire card is tappable → navigates to the lead detail page (same as clicking a row on desktop)

**The desktop table stays completely unchanged** — hide it on mobile with `hidden md:block` (or equivalent), show the card list on mobile with `block md:hidden`. Do not modify the table component itself.

---

### Step 3 — Subcontractor job queue → card layout on mobile

Apply the same card-per-job pattern to the subcontractor job queue (`/jobs`).

**Mobile card:**

```
┌──────────────────────────────────────┐
│ 🔴  QU00103              JOB BOOKED  │
│ Jane Smith                           │
│ 14 Rata Street, Remuera              │
│ Booked 12 days ago                   │
└──────────────────────────────────────┘
```

Same approach — hide the desktop table on mobile, show cards on mobile. Tapping a card navigates to the job detail page.

---

### Step 4 — Commission table → scrollable on mobile

The commission table (`/commission`) is data-heavy. Rather than converting it to cards (the financial columns are all important), make it horizontally scrollable on mobile with a visible scroll hint.

Wrap the table in a `div` with `overflow-x-auto` — this is a one-line change and keeps all columns accessible. No card conversion needed here.

---

### Step 5 — Lead detail and job detail pages — verify stacking

The lead detail page is a two-column layout on desktop (customer details left, status + financials right). On mobile this should stack to a single column — customer details first, then status/financials below.

Check whether this is already handled by the existing layout classes. If the grid is `grid-cols-2` without a mobile override, add `grid-cols-1 lg:grid-cols-2`. If it already stacks correctly on mobile, no change needed.

Apply the same check to the subcontractor job detail page.

---

### Step 6 — Modals — verify mobile usability

Open each major modal on mobile viewport (375px wide) and check:
- The modal does not overflow the screen horizontally
- Buttons are large enough to tap comfortably (minimum 44px height)
- Scrollable if content is taller than the viewport

If any modal overflows, add `max-w-[calc(100vw-2rem)]` or `mx-4` to the modal container on mobile. Do not redesign modals — just make sure they fit.

**Modals to check:** invoice upload modal, quote upload modal, status change modal, any confirmation modals.

---

### Step 7 — Customer booking page — verify mobile usability

The booking page (`/book/[token]`) is customer-facing and likely already works on mobile. Open it at 375px width and verify:
- Quote details card renders correctly
- Slot picker cards are full-width and tappable
- "Confirm Booking" button is clearly visible and tappable
- No horizontal overflow

If it already works correctly, no changes needed. Only fix what is broken.

---

### What does NOT change

- Desktop layout for any role — zero changes to any desktop-only classes
- Any data, API routes, or business logic — this is a UI-only change
- The URL, login flow, or session handling — unchanged
- Booking token validation — unchanged
- Any component that already works correctly on mobile — do not touch it

---

### Build order for this change

1. Read pre-flight — locate all sidebar components and layout wrapper files
2. Add hamburger button and drawer behaviour to the layout — admin sidebar first, then client and subcontractor
3. Add backdrop overlay and close-on-tap-outside behaviour
4. Add close-on-nav-item-tap behaviour
5. Build mobile card layout for admin/client dashboard lead table — hide table on mobile, show cards
6. Build mobile card layout for subcontractor job queue — same pattern
7. Add `overflow-x-auto` wrapper to commission table
8. Check lead detail and job detail page stacking — fix grid if not already responsive
9. Check all major modals at 375px width — fix overflow if present
10. Check customer booking page at 375px width — fix if needed
11. Bump version in `package.json` — MINOR bump (significant UI addition)
12. Commit: `v[X.X.0] — mobile-optimised layout for all roles`
13. Push to GitHub: `git push origin main`
14. Run Vibstr build report per CLAUDE.md

---

## Change 5 — Duplicate Lead Detection

### Background

As Charlie's call volume grows, the same customer may be called more than once — either by mistake or after a period of time. When a duplicate comes in via the webhook (or is created manually), the current system silently creates a second lead with no warning. This means Frank's team could unknowingly contact the same customer twice, or Oli could end up with two separate pipeline entries for the same job.

The fix: when a new lead is created (via webhook or manually), check whether a lead already exists with the same phone number or address within the last 6 months. If one is found, create the lead and fire all notifications as normal — but flag the new lead visibly so Oli can review and decide what to do.

**The lead always gets created. Emails always fire. Nothing in the pipeline is blocked.**

---

### Step 1 — Database schema change

Add one new field to the `Lead` model in `prisma/schema.prisma`:

```prisma
duplicate_dismissed   Boolean   @default(false)
```

This field tracks whether Oli has reviewed and dismissed the duplicate warning. Default is `false` — the warning is active until explicitly dismissed.

After adding the field, run the migration:

```bash
npx prisma migrate dev --name add_duplicate_dismissed_to_leads
```

Then push to production:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

---

### Step 2 — Duplicate detection logic

Create a utility function at `/lib/detectDuplicate.ts`:

```typescript
export interface DuplicateMatch {
  confidence: 'high' | 'medium';
  reason: string;           // e.g. "Same phone number and address"
  matched_lead_id: string;
  matched_quote_number: string;
  matched_customer_name: string;
}

export async function detectDuplicate(
  phone: string,
  address: string,
  excludeLeadId?: string  // exclude the current lead from matching against itself
): Promise<DuplicateMatch | null>
```

**Detection rules — check in this priority order:**

**1. Same phone AND same address (high confidence)**
```typescript
const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

const match = await prisma.lead.findFirst({
  where: {
    AND: [
      { customer_phone: { contains: phone, mode: 'insensitive' } }, // normalised phone
      { property_address: { contains: address, mode: 'insensitive' } },
      { created_at: { gte: sixMonthsAgo } },
      { id: { not: excludeLeadId } }, // don't match itself
    ]
  },
  orderBy: { created_at: 'desc' }
});

if (match) return {
  confidence: 'high',
  reason: 'Same phone number and address',
  matched_lead_id: match.id,
  matched_quote_number: match.quote_number,
  matched_customer_name: match.customer_name,
};
```

**2. Same phone number only (medium confidence)**
```typescript
const phoneOnlyMatch = await prisma.lead.findFirst({
  where: {
    AND: [
      { customer_phone: { contains: phone, mode: 'insensitive' } },
      { created_at: { gte: sixMonthsAgo } },
      { id: { not: excludeLeadId } },
    ]
  },
  orderBy: { created_at: 'desc' }
});

if (phoneOnlyMatch) return {
  confidence: 'medium',
  reason: 'Same phone number',
  matched_lead_id: phoneOnlyMatch.id,
  matched_quote_number: phoneOnlyMatch.quote_number,
  matched_customer_name: phoneOnlyMatch.customer_name,
};
```

**3. Same address only → no flag.** Too many false positives (different people at the same property). Do not implement address-only matching.

**Phone normalisation:** Before comparing phone numbers, normalise both values using the existing `normalisePhone()` utility — strip spaces, dashes, and country code formatting. This prevents `+64 21 123 4567` and `021 123 4567` from being treated as different numbers.

---

### Step 3 — Call duplicate detection from the webhook handler

In the webhook handler (`POST /api/webhooks/lead`), after the lead record is created, call `detectDuplicate()` and if a match is found, write the result to the lead record.

Add two new fields to the `Lead` model for storing the duplicate match data:

```prisma
duplicate_confidence   String?   // 'high' or 'medium' — null if no duplicate found
duplicate_reason       String?   // e.g. "Same phone number and address"
duplicate_lead_id      String?   // quote_number of the matched lead
```

After lead creation:

```typescript
const duplicate = await detectDuplicate(
  normalisePhone(lead.customer_phone),
  lead.property_address,
  lead.id
);

if (duplicate) {
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      duplicate_confidence: duplicate.confidence,
      duplicate_reason: duplicate.reason,
      duplicate_lead_id: duplicate.matched_quote_number,
    }
  });
}
```

Do this **after** the lead is created and **after** notification emails have already fired — the duplicate check must not delay or block the email send.

---

### Step 4 — Call duplicate detection from manual lead creation

Apply the same duplicate detection logic to the manual lead creation route (`POST /api/leads`). Same approach — create the lead, send notification emails, then check for duplicates and update the lead record if a match is found.

---

### Step 5 — Show the duplicate warning on the dashboard lead table

On the admin dashboard lead table, add a ⚠️ badge next to the quote number for any lead where `duplicate_confidence` is not null AND `duplicate_dismissed` is false.

**High confidence:** amber/orange ⚠️ badge — "Possible duplicate"
**Medium confidence:** muted yellow ⚠️ badge — "Check for duplicate"

The badge is shown in the quote number cell, before the quote number text. Hovering over it on desktop shows a tooltip: "Same phone number and address as [matched_quote_number]" or "Same phone number as [matched_quote_number]".

On mobile, the badge appears in the top-left of the lead card (in the same line as the quote number).

**Client role:** The client dashboard also shows leads — show the same badge so Continuous Group is also aware. They cannot dismiss it (dismiss is admin-only) but can see the flag.

---

### Step 6 — Show the duplicate warning on the lead detail page

On the admin lead detail page, if `duplicate_confidence` is not null AND `duplicate_dismissed` is false, show a prominent warning banner at the top of the page — above all other content.

**High confidence banner:**
```
⚠️  Possible duplicate lead

A lead for the same phone number and address already exists within the last 6 months:
[QU00089] · [Jane Smith] · [14 Rata Street, Remuera]  [View lead →]

Review both leads before actioning.

                                          [Dismiss warning]
```

**Medium confidence banner:**
```
⚠️  Check for duplicate

A lead with the same phone number already exists within the last 6 months:
[QU00089] · [Jane Smith] · [14 Rata Street, Remuera]  [View lead →]

This may be the same customer.

                                          [Dismiss warning]
```

- "View lead →" is a link that navigates directly to the matched lead's detail page (`/leads/[matched_quote_number]`)
- "Dismiss warning" is an ADMIN-only button — not visible to CLIENT or SUBCONTRACTOR
- Clicking "Dismiss warning" calls `PATCH /api/leads/[quoteNumber]/dismiss-duplicate`

---

### Step 7 — Dismiss duplicate warning API and audit log

Create `PATCH /api/leads/[quoteNumber]/dismiss-duplicate`:

- ADMIN only — return 403 for any other role
- Sets `duplicate_dismissed = true` on the lead
- Writes to the audit log: `"Duplicate warning dismissed by [admin name]"`
- Returns `{ success: true }`

On the lead detail page, after a successful dismiss, the banner disappears without a page reload (update local state).

---

### Step 8 — Needs Action — surface unflagged duplicates

Add a third condition to the Needs Action system: leads with an active, undismissed duplicate warning (`duplicate_confidence IS NOT NULL AND duplicate_dismissed = false`) surface in the Needs Action tab and count toward the badge.

Update `GET /api/needs-action` to include:

```typescript
const duplicateLeads = await prisma.lead.findMany({
  where: {
    campaign_id: session.campaignId,
    duplicate_confidence: { not: null },
    duplicate_dismissed: false,
  }
});
```

On the Needs Action page itself, add a third section below "Quotes not sent" and "Jobs not completed":

**Section heading:** "Possible duplicates"
**Table columns:** Urgency (⚠️), Quote #, Customer name, Address, Matched lead, Confidence
**Matched lead** column: shows the matched quote number as a link → navigates to that lead

---

### What does NOT change

- The lead creation flow — leads always get created, always fire notification emails
- Any existing status transitions — unchanged
- Financial calculations — unchanged
- Subcontractor role — does not see duplicate warnings at any point (this is an admin/operational concern)
- Any other Needs Action logic — the existing two conditions are unchanged

---

### Build order for this change

1. Add `duplicate_dismissed`, `duplicate_confidence`, `duplicate_reason`, `duplicate_lead_id` to `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add_duplicate_detection_to_leads`
3. Push migration to production DB
4. Create `/lib/detectDuplicate.ts` utility
5. Add duplicate detection call to webhook handler — after lead create, after email send
6. Add duplicate detection call to manual lead creation route — after lead create, after email send
7. Add ⚠️ badge to dashboard lead table for leads with active duplicate warnings
8. Add ⚠️ badge to mobile lead cards (from Change 4)
9. Add duplicate warning banner to admin lead detail page
10. Add "View lead →" link to banner — navigates to matched lead
11. Add "Dismiss warning" button — ADMIN only
12. Create `PATCH /api/leads/[quoteNumber]/dismiss-duplicate` endpoint
13. Write dismiss action to audit log
14. Update `GET /api/needs-action` to include duplicate leads as third condition
15. Add "Possible duplicates" section to Needs Action page
16. Bump version in `package.json` — MINOR bump
17. Commit: `v[X.X.0] — duplicate lead detection with warning badges, dismiss flow, and Needs Action integration`
18. Push to GitHub: `git push origin main`
19. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — Invoice quote number validation**
- [ ] AI prompt updated to extract `extracted_quote_number` alongside price
- [ ] Parsing result type/interface includes `extracted_quote_number: string | null`
- [ ] `normaliseQuoteNumber` helper strips non-alphanumeric characters and uppercases before comparing
- [ ] Upload handler returns `422` with `invoice_quote_mismatch` error when extracted quote number clearly does not match and confidence is high
- [ ] Upload handler does NOT reject when `extracted_quote_number` is null
- [ ] Upload handler does NOT reject when `confidence === 'low'`
- [ ] Upload handler does NOT reject when normalised values match (including minor formatting differences)
- [ ] `override_quote_mismatch: true` flag in request body bypasses the quote number check entirely
- [ ] Invoice upload modal shows new `invoice_quote_mismatch` error state on `422` response
- [ ] Error state shows extracted quote number and expected quote number
- [ ] "Try again" button returns modal to idle upload state
- [ ] "Upload anyway" re-submits with `override_quote_mismatch: true` and proceeds to financial confirmation
- [ ] Financial confirmation screen ("Invoice uploaded ✓") appears after override — unchanged from current
- [ ] Existing price extraction and financial calculation flow — completely unchanged
- [ ] Subcontractor role-gating of financial fields — completely unchanged
- [ ] Auto-advance to JOB_COMPLETED on subcontractor upload — completely unchanged
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 2 — Booking page time slot filtering**
- [ ] `GET /api/book/[token]/slots` filters out all windows where start datetime ≤ 2 hours from now
- [ ] A window at exactly 2 hours from now is filtered out — only windows MORE than 2 hours away are shown
- [ ] Past windows (start datetime < now) are also filtered out
- [ ] Slots with zero remaining windows after filtering are excluded from the API response entirely
- [ ] Timezone handling is consistent — NZ local time interpreted correctly, no UTC offset errors
- [ ] Filter applies to first-time booking flow
- [ ] Filter applies to reschedule flow
- [ ] Booking page shows a sensible empty state when no windows remain
- [ ] Admin calendar view — completely unaffected
- [ ] Admin availability settings — completely unaffected
- [ ] Held/confirmed window exclusion logic — completely unaffected
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 3 — Case-insensitive search**
- [ ] Admin dashboard search returns results regardless of case (e.g. `qu00103` matches `QU00103`)
- [ ] Client dashboard search is also case-insensitive (if it has its own query)
- [ ] Subcontractor job queue search is also case-insensitive
- [ ] `mode: 'insensitive'` applied to all three fields: `quote_number`, `customer_name`, `property_address`
- [ ] No other search behaviour changed — status filter, date filter unaffected
- [ ] No database migration required — no schema changes
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 4 — Mobile-optimised layout**
- [ ] Hamburger button visible on mobile (`lg:hidden`) — not visible on desktop
- [ ] Sidebar collapses off-screen on mobile by default
- [ ] Tapping hamburger opens sidebar as a slide-out drawer
- [ ] Semi-transparent backdrop appears behind open drawer
- [ ] Tapping backdrop closes the drawer
- [ ] Tapping a nav item closes the drawer and navigates correctly
- [ ] Desktop sidebar completely unchanged — always visible, no hamburger
- [ ] Applied to admin, client, and subcontractor sidebars
- [ ] Mobile card layout shown on admin/client dashboard on mobile — table hidden on mobile
- [ ] Mobile card layout shown on subcontractor job queue on mobile — table hidden on mobile
- [ ] Desktop lead table completely unchanged
- [ ] Commission table wrapped in `overflow-x-auto` — horizontally scrollable on mobile
- [ ] Lead detail page stacks to single column on mobile — two-column on desktop unchanged
- [ ] Job detail page stacks to single column on mobile — unchanged on desktop
- [ ] All major modals fit within 375px viewport — no horizontal overflow
- [ ] Customer booking page verified usable at 375px — slot cards tappable, button visible
- [ ] No desktop layout classes modified — all changes additive only
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 5 — Duplicate lead detection**
- [ ] `duplicate_dismissed`, `duplicate_confidence`, `duplicate_reason`, `duplicate_lead_id` fields added to Lead model
- [ ] Migration runs cleanly locally
- [ ] Migration pushed to production DB successfully
- [ ] `/lib/detectDuplicate.ts` created with correct priority order (phone+address first, phone-only second)
- [ ] Phone numbers normalised before comparison using `normalisePhone()`
- [ ] 6-month window applied — leads older than 6 months never flagged
- [ ] A lead never matches against itself (`excludeLeadId` working)
- [ ] Address-only matching is NOT implemented
- [ ] Duplicate detection called in webhook handler — after lead created, after emails sent
- [ ] Duplicate detection called in manual lead creation route — after lead created, after emails sent
- [ ] Lead creation and email notification never blocked or delayed by duplicate check
- [ ] ⚠️ badge appears on dashboard lead table row for leads with active (undismissed) duplicate warnings
- [ ] High confidence badge is more prominent than medium confidence badge
- [ ] Badge tooltip shows matched quote number and reason on desktop
- [ ] ⚠️ badge appears on mobile lead card
- [ ] Client dashboard also shows the badge — client cannot dismiss
- [ ] Duplicate warning banner appears at top of admin lead detail page when warning is active
- [ ] Banner shows correct text for high vs. medium confidence
- [ ] "View lead →" link navigates to the matched lead's detail page
- [ ] "Dismiss warning" button visible to ADMIN only — not visible to CLIENT or SUBCONTRACTOR
- [ ] `PATCH /api/leads/[quoteNumber]/dismiss-duplicate` — ADMIN only, returns 403 for other roles
- [ ] Dismissing sets `duplicate_dismissed = true`
- [ ] Dismissing writes to audit log: "Duplicate warning dismissed by [admin name]"
- [ ] Banner disappears after dismiss without page reload
- [ ] `GET /api/needs-action` includes undismissed duplicate leads as third condition
- [ ] "Possible duplicates" section appears on Needs Action page with correct columns
- [ ] Needs Action badge count includes duplicate leads
- [ ] After dismissal, lead no longer appears in Needs Action duplicates section
- [ ] Subcontractor role sees no duplicate warnings anywhere
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Final**
- [ ] Each change has its own commit, push, and Vibstr report
- [ ] Changes 1, 2, 3 — PATCH bumps
- [ ] Changes 4, 5 — MINOR bumps
- [ ] All commits use correct message format per CLAUDE.md
