# Jobbly — Change Log Prompt 5
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes listed here in a single session in the order specified. Do not skip any item. Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end. Stop and ask if anything is unclear before proceeding.

---

## Build Order — Follow This Sequence Exactly

1. **Change 44** — Accept external quote number from n8n webhook payload
2. **Change 45** — Update subcontractor new lead notification email
3. **Change 46** — Add instructional text on subcontractor job detail page at LEAD_RECEIVED
4. **Change 47** — Fix all displayed timestamps to New Zealand time (Pacific/Auckland)
5. **Change 48** — Customer contact detail visibility by role
6. **Change 49** — AI quote parsing and multi-option booking flow
7. **Change 50** — Admin calendar view *(requires Phase 4 migrations — see note below)*
8. **Change 51** — Re-upload quote with AI customer validation
9. **Change 52** — Quote parsing status indicator and upcoming bookings panel
10. **Change 53** — Customer reschedule flow, PWB reschedule email, and Add to Calendar links
11. **Change 54** — Webhook notes field, notes tab across all roles, parsing badge on subcontractor, manual price entry fallback

After each change: bump `package.json` version, commit with the message specified in that change's build order, run `git push origin main`, and run the Vibstr build report per CLAUDE.md.

**Important — Phase 4 migration dependency for Changes 50, 51, 52, and 53:**
Changes 50 through 53 all depend on the `AvailabilitySlot` and `Booking` database tables existing. These are created in Phase 4 of the full build prompt (`jobbly-full-build-prompt.md`). Before starting Change 50, check `prisma/schema.prisma` — if `AvailabilitySlot` and `Booking` models are not present, run the Phase 4 migrations from that document first. Do not proceed to Change 50 until those tables exist and migrations are confirmed. Changes 44–49 do not have this dependency and can be built immediately.

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Inspect the Lead model in Prisma schema**
Open `prisma/schema.prisma`. Confirm `quote_number` is present, confirm its uniqueness constraint, and confirm the types of `storey_count`, `gutter_guards`, `customer_name`, and `property_address` — you will need all of these for Changes 44 and 45.

**3. Inspect `/lib/webhookFieldMap.ts`**
Read the current mappings. Note what fields are currently mapped and how the mapping is applied in the handler — you will add a new mapping for the incoming quote number in Change 44.

**4. Inspect the webhook handler**
Open the webhook handler (confirm its actual file path first). Read the full lead creation block — specifically how `quote_number` is currently generated and assigned. This is the code you will be modifying in Change 44.

**5. Locate the new lead email template**
Find the file that builds and sends the new lead notification email to subcontractors — likely at `/lib/emails/newLeadEmail.ts` or similar. Read its current content fully. This is the template you will be rewriting in Change 45.

**6. Locate the subcontractor job detail page**
Find the page at `/app/jobs/[quoteNumber]/page.tsx` (confirm the actual path). Read the current markup — specifically the status pipeline section and the upload quote section. You will be adding content between these in Change 46.

**7. Confirm Phase 4 tables for Changes 50–53**
Check `prisma/schema.prisma` for `AvailabilitySlot` and `Booking` models. If they exist, note their fields. If they do not exist, you must run the Phase 4 migrations from `jobbly-full-build-prompt.md` before starting Change 50. Document the outcome of this check so you know before you reach that point in the build order.

**8. Confirm Phase 2 fields exist for Changes 49 and 51**
Check `prisma/schema.prisma` for `quote_url`, `quote_uploaded_at`, `quote_uploaded_by`, and `booking_token` on the `Lead` model. These are required by Changes 49 and 51. If any are missing, run the Phase 2 migrations from `jobbly-full-build-prompt.md` before starting Change 49. Also confirm `job_types` table exists — if not, run the Phase 2 job types migration as well.

Only after all eight checks pass — begin building in the order listed above.

---

## Change 44 — Accept External Quote Number from n8n Webhook Payload

### Background

n8n generates its own quote number (e.g. `QU00103`) before firing the webhook to Jobbly. This number is written to the Google Sheet simultaneously. Currently Jobbly ignores any incoming quote number and auto-generates its own (`JBL-00001`). This means the number in Jobbly and the number in the Google Sheet are different, making cross-referencing impossible and causing confusion.

The fix is straightforward: if the webhook payload includes a quote number, Jobbly must use it. If the payload does not include one (e.g. during testing or future integrations), Jobbly falls back to auto-generating one as it does today. No quotes are ever created without a quote number.

This is a change to the webhook handler only. No UI changes, no schema changes (assuming `quote_number` is already typed `String` and is already unique — confirm this in pre-flight).

---

### What the incoming field looks like

n8n sends the quote number under the field name `quote_number` in the webhook payload. The value follows n8n's format: `QU00103`, `QU00104`, etc. Jobbly stores whatever is sent — it does not reformat or prefix it.

---

### Step 1 — Add the incoming field to the webhook field map

Open `/lib/webhookFieldMap.ts`. Add the following entry:

```typescript
"quote_number": "quote_number",   // n8n-generated quote number — use this instead of auto-generating
```

This maps the incoming `quote_number` field directly to the internal `quote_number` field name so it is available in the mapped payload.

---

### Step 2 — Update the webhook handler to use the incoming quote number if present

Open the webhook handler. Locate the section where `quote_number` is currently auto-generated — this is likely a call to something like `generateQuoteNumber(campaignId)` or a similar utility.

Replace the current logic with a conditional:

```typescript
// Use the incoming quote number if provided, otherwise auto-generate
const quoteNumber = mappedPayload.quote_number
  ? String(mappedPayload.quote_number).trim()
  : await generateQuoteNumber(campaignId); // or however it is currently called
```

Then use `quoteNumber` in the `prisma.lead.create()` call:

```typescript
quote_number: quoteNumber,
```

**Rules:**
- If `mappedPayload.quote_number` is a non-empty string after trimming → use it as-is
- If `mappedPayload.quote_number` is null, undefined, or empty string → fall back to auto-generating
- Never pass an empty string as `quote_number` to Prisma — this would violate the uniqueness constraint with confusing errors

---

### Step 3 — Handle duplicate quote number gracefully

Because the incoming quote number comes from an external system, there is a small risk it could arrive twice (e.g. n8n retries a failed webhook). The uniqueness constraint on `quote_number` in the database will reject the duplicate, but the handler must catch this gracefully rather than returning a 500.

Wrap the `prisma.lead.create()` call (it should already be inside a try/catch from Change 43). If Prisma throws a `P2002` unique constraint violation error specifically on `quote_number`, return a `409` response:

```typescript
if (error.code === 'P2002' && error.meta?.target?.includes('quote_number')) {
  return Response.json(
    { success: false, message: `Lead with quote number ${quoteNumber} already exists` },
    { status: 409 }
  );
}
```

This prevents duplicate leads from being created if n8n fires the same payload twice, and gives n8n a clear non-5xx signal that the lead already exists.

---

### What does NOT change

- The auto-generation logic (`generateQuoteNumber`) is not removed — it is still used as a fallback
- No changes to the Prisma schema
- No changes to the UI — quote numbers display wherever they already display
- No changes to any other field in the webhook handler
- No changes to how leads are queried by quote number (URLs still use the quote number as the route parameter — the format just changes from `JBL-00001` to `QU00103` for real leads)

---

### Testing checklist

- [ ] Sending a webhook payload with `quote_number: "QU00103"` creates a lead with `quote_number: "QU00103"` — not `JBL-00001`
- [ ] Sending a webhook payload without `quote_number` creates a lead with an auto-generated `JBL-XXXXX` number
- [ ] Sending the same payload with `quote_number: "QU00103"` a second time returns `409` — not `500`, not `200`
- [ ] The lead detail page URL uses the correct quote number: `/jobs/QU00103`
- [ ] The admin lead detail URL also works: `/leads/QU00103`
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Add `"quote_number": "quote_number"` to `/lib/webhookFieldMap.ts`
2. Update webhook handler to conditionally use incoming quote number or fall back to auto-generate
3. Add `P2002` duplicate detection to the catch block
4. Run the testing checklist
5. Bump version in `package.json` — PATCH bump
6. Commit: `v[X.X.X] — accept external quote number from webhook payload, fallback to auto-generate`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 45 — Update Subcontractor New Lead Notification Email

### Background

The new lead notification email currently sent to subcontractors when a webhook lead arrives has several issues:

1. The greeting is generic — "Hi Frank" is hardcoded or uses a static name rather than the actual recipient's first name
2. The property stats row shows perimeter and area — these are not useful to Frank at the quote stage. Storey count and gutter guards are what he actually needs.
3. There is no call to action telling Frank what to do next — he just sees the details and has to know to go generate a quote
4. The quote number shown is the old auto-generated one — after Change 44, this will now be the correct n8n quote number

This change rewrites the email content. The HTML structure and button design do not change — only the content inside it.

---

### The updated email spec

**Subject line** — no change:
```
New job — [Quote Number] — [Customer Name]
```

**Greeting** — personalised using the recipient's first name:
```
Hi [First Name],
```

To extract the first name: split the user's `name` field on the first space and take the first part. If the name is a single word (no space), use the whole name. If `name` is null or empty, fall back to "Hi there,".

Examples:
- `name: "Frank Johnson"` → `"Hi Frank,"`
- `name: "Frank"` → `"Hi Frank,"`
- `name: null` → `"Hi there,"`

**Opening line** — no change:
```
A new lead has come in from the AI campaign. Here are the details:
```

**Lead details card** — update the property stats row:

Remove:
- Property perimeter
- Property area

Add in their place:
- Storey count — label: `Storeys`, value: the `storey_count` field on the lead. If null, display `"Not specified"`
- Gutter guards — label: `Gutter Guards`, value: the `gutter_guards` field on the lead. If null, display `"Not specified"`

The full card content in order:
1. Quote number (large, bold, brand accent — already exists)
2. Customer name (large, bold — already exists)
3. Property address (full string — already exists)
4. Storeys and Gutter Guards displayed as two stat items side by side (replacing the perimeter / area / storeys row)

**Call to action line** — add this below the lead details card, above the buttons:

```
Please generate a quote for this customer and upload it to the job in Jobbly.
```

This line should be styled as regular body text — not a button, not a heading. Centred or left-aligned, matching the surrounding text style.

**Buttons** — no change:
- Primary: "View Job in Jobbly" → links to `/jobs/[quoteNumber]`
- Secondary: "Open in Google Maps" → links to `google_maps_url`

**Footer** — no change:
```
Jobbly by Omniside AI
```

---

### Implementation notes

- The email template is already built as HTML (from Change 15). This change only modifies content — do not restructure the HTML layout or change button styles.
- The recipient loop already iterates over SUBCONTRACTOR users with `notify_new_lead = true`. For each recipient, use that user's `name` field to extract their first name for the greeting. Do not use a single hardcoded name — each recipient gets their own personalised greeting.
- `storey_count` and `gutter_guards` are new fields added in Change 40. They may be null on leads that arrived before Change 40 was deployed. Handle null with "Not specified" as shown above.
- Do not change anything about how the email is triggered, who it is sent to, or how failures are handled.

---

### Testing checklist

- [ ] Email greeting uses the recipient's first name: "Hi Frank," not "Hi Frank Johnson," and not a hardcoded name
- [ ] Email greeting falls back to "Hi there," when recipient name is null
- [ ] Quote number in email matches the quote number on the lead (which is now the n8n quote number after Change 44)
- [ ] Email shows Storeys and Gutter Guards — not perimeter and area
- [ ] Storeys shows "Not specified" when `storey_count` is null
- [ ] Gutter Guards shows "Not specified" when `gutter_guards` is null
- [ ] The call-to-action line appears below the card: "Please generate a quote for this customer and upload it to the job in Jobbly."
- [ ] "View Job in Jobbly" button links to `/jobs/[quoteNumber]` with the correct quote number
- [ ] "Open in Google Maps" button links correctly
- [ ] Email renders correctly in Gmail on mobile
- [ ] If the email send fails, the webhook still returns `200` and the lead is still created

---

### Build order for this change

1. Open the email template file (confirm path in pre-flight)
2. Update the greeting logic to extract first name from each recipient's `name` field
3. Replace the property stats row (remove perimeter/area, add storey_count/gutter_guards)
4. Add the call-to-action line below the card
5. Run the testing checklist — send a real test webhook and check the received email
6. Bump version in `package.json` — PATCH bump
7. Commit: `v[X.X.X] — update subcontractor lead email: personalised greeting, storey/gutter fields, quote CTA`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 46 — Add Instructional Text on Subcontractor Job Detail at LEAD_RECEIVED

### Background

When a subcontractor opens a job that has just arrived (status: LEAD_RECEIVED), they see the job details and an "Upload Quote" button — but nothing that tells them what they are supposed to do between seeing the job and uploading the quote. The step they need to take — going away, creating a quote in their own system, and then coming back to upload it — is not communicated anywhere. This change adds a single clear instructional line to bridge that gap.

---

### What to add and where

**Location:** On the subcontractor job detail page (`/jobs/[quoteNumber]`), in the section between the status pipeline and the "Upload Quote" button.

**Visibility rule:** This line is only shown when the lead's current status is `LEAD_RECEIVED`. It must not appear at any other status. Do not show it at QUOTE_SENT, JOB_BOOKED, or JOB_COMPLETED.

**The line:**

```
Create a quote for this customer and come back here to upload it.
```

**Styling:** Plain body text, slightly muted colour (e.g. `text-gray-500` or `text-muted-foreground` — match whatever muted text style is used elsewhere on this page). Do not style it as a warning, an error, or a call-to-action button. It is a soft instructional note, not an alert.

**Placement in the markup:** Immediately below the status pipeline component and immediately above the "Upload Quote" button or upload section. If there is already a gap or divider between the pipeline and the upload UI, place it in that gap.

---

### What does NOT change

- The status pipeline component itself — no changes
- The "Upload Quote" button and upload UI — no changes to functionality
- This line does not appear on the admin lead detail page — subcontractor only
- No database changes, no API changes

---

### Testing checklist

- [ ] The instructional line appears on the subcontractor job detail page when status is `LEAD_RECEIVED`
- [ ] The line does not appear when status is `QUOTE_SENT`
- [ ] The line does not appear when status is `JOB_BOOKED`
- [ ] The line does not appear when status is `JOB_COMPLETED`
- [ ] The line does not appear on the admin lead detail page at any status
- [ ] The text reads exactly: "Create a quote for this customer and come back here to upload it."
- [ ] The text is visually muted — not bold, not coloured, not styled as a button or alert
- [ ] No TypeScript errors

---

### Build order for this change

1. Open the subcontractor job detail page (confirm path in pre-flight)
2. Locate the status pipeline component and the upload section
3. Add the conditional instructional line between them — only visible when `status === 'LEAD_RECEIVED'`
4. Run the testing checklist
5. Bump version in `package.json` — PATCH bump
6. Commit: `v[X.X.X] — add instructional text on subcontractor job detail at LEAD_RECEIVED`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 47 — Fix All Displayed Timestamps to New Zealand Time (Pacific/Auckland)

### Background

All timestamps stored in Jobbly's database are in UTC — this is correct and must not change. However, when timestamps are displayed in the UI, they are currently rendering in UTC rather than New Zealand time. For a New Zealand-based business, a job received at 9:00am NZ time should display as 9:00am — not 8:00pm (the UTC equivalent). This is causing confusion around when leads were received and when jobs were updated.

This is a display-only fix. No stored values change. No database schema changes. No API response changes. Only the formatting of timestamps at the point of rendering in the UI.

---

### New Zealand timezone

New Zealand observes two offsets depending on the time of year:
- **NZST** (New Zealand Standard Time): UTC+12 — applies April through September
- **NZDT** (New Zealand Daylight Time): UTC+13 — applies September through April

The correct IANA timezone identifier to use is `Pacific/Auckland`. This handles both offsets automatically including the daylight saving transitions. Never hardcode `+12` or `+13` — always use the named timezone so it adjusts correctly year-round.

---

### Step 1 — Create a shared date formatting utility

Create a new utility file at `/lib/formatDate.ts`. This file exports a single function used everywhere in the UI that a timestamp needs to be displayed.

```typescript
/**
 * Formats a date/timestamp for display in New Zealand time (Pacific/Auckland).
 * All timestamps are stored as UTC in the database — this converts them for display only.
 */
export function formatNZDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return '—';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  return d.toLocaleString('en-NZ', options ?? defaultOptions);
}

/**
 * Date only — no time component. Used for job booked dates, completed dates, etc.
 */
export function formatNZDateOnly(date: Date | string | null | undefined): string {
  return formatNZDate(date, {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
```

Both functions return `'—'` (em dash) for null, undefined, or invalid dates — they never throw.

---

### Step 2 — Replace all raw date rendering in the UI with the utility functions

Search the codebase for every place a timestamp is displayed in the UI. This includes but is not limited to:

- "Date received" / "Received" on the job detail page (subcontractor and admin)
- "Date completed" on the completed jobs page
- "Date booked" on the job detail page when status is JOB_BOOKED or later
- `created_at` displayed in any lead table column
- `updated_at` displayed anywhere
- Invoice upload timestamps
- Audit log timestamps
- Notification timestamps
- Commission page — any date labels on reconciliation batches or month groupings

For each occurrence, replace the raw date rendering with a call to `formatNZDate()` or `formatNZDateOnly()` as appropriate.

**Common patterns to find and replace:**

Raw JavaScript Date rendering (incorrect):
```typescript
// Any of these patterns:
new Date(lead.created_at).toLocaleDateString()
new Date(lead.created_at).toLocaleString()
new Date(lead.created_at).toString()
lead.created_at.toISOString()
// Or any date formatted without specifying Pacific/Auckland
```

Replace with:
```typescript
import { formatNZDate, formatNZDateOnly } from '@/lib/formatDate';

// For date + time:
formatNZDate(lead.created_at)

// For date only:
formatNZDateOnly(lead.created_at)
```

---

### Step 3 — Verify the "Date received" display on the subcontractor job detail page specifically

This is the field explicitly reported as showing the wrong time. After applying the utility function, verify that a lead received at, say, 9:00am NZ time shows as "9:00am" — not a UTC time.

If the job detail page is a server component, the date is being rendered server-side and will use the server's timezone (likely UTC). The `formatNZDate` utility using `Intl.DateTimeFormatOptions` with `timeZone: 'Pacific/Auckland'` handles this correctly regardless of where the server is located — it converts the UTC value to NZ time at format time.

---

### What does NOT change

- Database stored values — all `DateTime` fields remain UTC in the database. Never change this.
- API responses — dates are returned as ISO strings (UTC) from the API. This is correct. Do not change API response formats.
- Any date used in a comparison, calculation, or filter — only display formatting changes
- The `created_at` value used to calculate urgency dots or "hours overdue" — these use UTC timestamps for arithmetic, which is correct

---

### Testing checklist

- [ ] `/lib/formatDate.ts` exists and exports `formatNZDate` and `formatNZDateOnly`
- [ ] `formatNZDate(null)` returns `'—'`
- [ ] `formatNZDate('invalid')` returns `'—'`
- [ ] A timestamp of `2025-03-29T20:00:00Z` (8pm UTC) displays as `30 Mar 2025, 9:00 am` in NZ time (UTC+13 during NZ daylight saving)
- [ ] "Date received" on subcontractor job detail shows NZ time — not UTC
- [ ] "Date received" on admin lead detail shows NZ time
- [ ] Completed jobs table shows NZ dates
- [ ] Audit log timestamps show NZ time
- [ ] Notification timestamps show NZ time
- [ ] No raw `.toLocaleDateString()`, `.toLocaleString()`, or `.toISOString()` calls remain in UI components for display purposes
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Create `/lib/formatDate.ts` with both utility functions
2. Search the codebase for all raw date display patterns
3. Replace each with `formatNZDate()` or `formatNZDateOnly()` as appropriate
4. Specifically verify the subcontractor job detail "Date received" field
5. Run the testing checklist
6. Bump version in `package.json` — PATCH bump
7. Commit: `v[X.X.X] — fix all UI timestamps to display in Pacific/Auckland (NZ) time`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 48 — Customer Detail Visibility by Role

### Background

The current subcontractor job detail page was intentionally restricted in a previous change to show only the customer's name and address — phone number and email were hidden. This is correct for the subcontractor role. However, the admin and client lead detail pages have also ended up with incomplete customer details, either as an unintended side effect or because the fields were never fully built out. This change enforces a clear rule across all three roles.

---

### The rule

| Field | ADMIN | CLIENT | SUBCONTRACTOR |
|---|---|---|---|
| Customer name | ✅ Visible | ✅ Visible | ✅ Visible |
| Property address | ✅ Visible | ✅ Visible | ✅ Visible |
| Customer phone | ✅ Visible | ✅ Visible | ❌ Hidden |
| Customer email | ✅ Visible | ✅ Visible | ❌ Hidden |

Phone and email are visible to ADMIN and CLIENT. They are hidden from SUBCONTRACTOR — not just visually, but must not be included in any API response returned to the subcontractor role.

---

### Step 1 — Audit the current state before making any changes

Before writing any code, check the following:

1. Open the admin lead detail page (`/app/leads/[quoteNumber]/page.tsx` — confirm actual path). Check whether `customer_phone` and `customer_email` are currently rendered. If they are missing, add them. If they are present, leave them.
2. Open the client lead detail page — if it shares the same component or page as admin, confirm it also renders both fields. If it has its own view, check that too.
3. Open the subcontractor job detail page (`/app/jobs/[quoteNumber]/page.tsx` — confirm actual path). Confirm that `customer_phone` and `customer_email` are already hidden. If they are hidden, do not touch them. If they are visible, remove them.
4. Open the API route that serves lead detail data — likely `GET /api/leads/[quoteNumber]` or similar. Check whether the response includes `customer_phone` and `customer_email`, and whether any role-based filtering is applied to the response.

Do this audit first and note what is and is not already in place. Only change what needs changing.

---

### Step 2 — Ensure the API enforces the restriction server-side

The restriction must be enforced in the API, not just in the UI. A subcontractor must not be able to receive `customer_phone` or `customer_email` in the API response — even if they call the API directly.

In the API route that returns lead detail (confirm the actual route path):

- If the requesting user's role is `SUBCONTRACTOR`: exclude `customer_phone` and `customer_email` from the returned lead object before sending the response
- If the role is `ADMIN` or `CLIENT`: include all fields as normal

Pattern:

```typescript
const lead = await prisma.lead.findUnique({ where: { quote_number: quoteNumber } });

// Strip sensitive fields for subcontractor role
if (session.user.role === 'SUBCONTRACTOR') {
  const { customer_phone, customer_email, ...safeFields } = lead;
  return Response.json(safeFields);
}

return Response.json(lead);
```

This ensures the restriction holds even if the UI changes in future.

---

### Step 3 — Admin lead detail page: confirm or add phone and email

On the admin lead detail page, in the customer details section, ensure the following fields are present and displayed correctly:

- **Customer name** — already present, leave unchanged
- **Property address** — already present, leave unchanged
- **Phone number**
  - Label: `Phone`
  - Value: `customer_phone` from the lead record
  - If null: display `"—"`
  - Make it a tappable `tel:` link: `<a href="tel:[customer_phone]">[customer_phone]</a>`
- **Email address**
  - Label: `Email`
  - Value: `customer_email` from the lead record
  - If null: display `"—"`
  - Make it a tappable `mailto:` link: `<a href="mailto:[customer_email]">[customer_email]</a>`

Place phone and email in the customer section, below name and address. Match the existing visual style of other fields on the page — same label/value row pattern.

---

### Step 4 — Client lead detail page: confirm or add phone and email

Apply the same additions as Step 3 to the client view. If the client lead detail shares a component with the admin view and phone/email are already shown after Step 3, this step is already done — just confirm it renders correctly when logged in as a CLIENT user.

---

### Step 5 — Subcontractor job detail page: confirm phone and email are hidden

Open the subcontractor job detail page. Confirm that:
- `customer_phone` is not rendered anywhere on the page
- `customer_email` is not rendered anywhere on the page
- No raw API response data containing these fields is accessible in the browser (the API enforcement in Step 2 handles this)

If they are already hidden, do nothing. If they are visible, remove them.

---

### What does NOT change

- The subcontractor jobs list (`/jobs`) — no customer contact details are shown there and this does not change
- The admin and client lead list/table views — phone and email are not columns in the table and this does not change (detail page only)
- Any other page or component not directly related to lead detail display
- The data stored in the database — no schema changes

---

### Testing checklist

- [ ] Log in as ADMIN — open any lead detail page — confirm phone and email are visible with correct values
- [ ] Log in as ADMIN — open a lead with null phone and null email — confirm both show `"—"` not blank or "null"
- [ ] Log in as CLIENT — open any lead detail page — confirm phone and email are visible
- [ ] Log in as SUBCONTRACTOR — open any job detail page — confirm phone and email are NOT visible anywhere on the page
- [ ] As SUBCONTRACTOR, call the lead detail API directly (e.g. via browser devtools network tab) — confirm `customer_phone` and `customer_email` are not present in the API response JSON
- [ ] Phone value on admin/client page is a tappable `tel:` link
- [ ] Email value on admin/client page is a tappable `mailto:` link
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Audit the current state of all three detail pages and the lead detail API route (Step 1)
2. Add role-based field stripping to the lead detail API route (Step 2)
3. Add or confirm phone and email on the admin lead detail page (Step 3)
4. Add or confirm phone and email on the client lead detail page (Step 4)
5. Confirm phone and email are hidden on the subcontractor job detail page (Step 5)
6. Run the testing checklist
7. Bump version in `package.json` — PATCH bump
8. Commit: `v[X.X.X] — enforce customer contact detail visibility by role: phone and email visible to admin and client only`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 49 — AI Quote Parsing and Multi-Option Booking Flow

### Background and architecture shift

The existing Phase 2 spec requires Frank's VA to select a job type before uploading a quote. This is being replaced with a fully automatic flow: the VA uploads the PDF, AI parses it immediately, extracts however many priced options are on the quote (1, 2, or 3), stores those options on the lead, and the customer then sees those exact options as cards on the booking page — choosing the one they want before selecting a time slot.

This change affects Phase 2 (quote upload), Phase 4 (slot generation), and Phase 5 (booking page). Everything else — file storage, email sequencing, the calendar availability system — stays the same.

**The new flow end-to-end:**

```
VA uploads quote PDF
        ↓
Jobbly saves the file (R2 / local)
        ↓
AI parses the PDF automatically — extracts 1, 2, or 3 priced options
        ↓
Options stored as JSON on the lead
        ↓
Status advances to QUOTE_SENT
        ↓
Email sent to customer with booking link and PDF attached
        ↓
Customer opens booking page
        ↓
Customer sees option cards (Standard / Mid-Range / Full Service) with prices
        ↓
Customer selects an option → calendar loads time windows for that duration
        ↓
Customer picks a time → 10-minute hold
        ↓
Customer confirms → job_type_id set on lead, status → JOB_BOOKED
```

---

### Step 1 — Database: add `quote_options` field to the Lead model

Open `prisma/schema.prisma`. In the `Lead` model, add:

```prisma
quote_options   Json?   // Array of extracted quote options from AI parsing — see structure below
```

This field stores the parsed options as a JSON array. Each element in the array represents one priced option from the quote PDF.

**JSON structure:**

```json
[
  {
    "sort_order": 1,
    "name": "Standard Gutter Clean",
    "price_ex_gst": 250.00,
    "price_incl_gst": 287.50,
    "duration_minutes": 120,
    "job_type_id": "uuid-of-matching-job-type"
  },
  {
    "sort_order": 2,
    "name": "Mid-Range Clean",
    "price_ex_gst": 400.00,
    "price_incl_gst": 460.00,
    "duration_minutes": 240,
    "job_type_id": "uuid-of-matching-job-type"
  }
]
```

Fields per option:
- `sort_order` — 1, 2, or 3, based on order found in the PDF
- `name` — the job type name as extracted from the PDF, or matched from campaign job types
- `price_ex_gst` — price excluding GST, as a number
- `price_incl_gst` — price including GST (ex GST × 1.15), as a number
- `duration_minutes` — pulled from the matching campaign job type record (see Step 3 matching)
- `job_type_id` — UUID of the matched campaign job type, or null if no match found

After adding the field, run the migration:

```bash
npx prisma migrate dev --name add_quote_options_to_leads
```

---

### Step 2 — Remove the job type selector from the upload quote modal

Open the "Upload Quote" modal on the subcontractor job detail page. Remove the job type dropdown selector entirely. The modal now contains only:

- Title: "Upload Quote"
- Subtext: "Upload the quote PDF to send to the customer. PDF only — max 10MB."
- Drag-and-drop file zone (PDF only, max 10MB — unchanged)
- Upload button: "Upload & Send Quote" — enabled as soon as a file is selected (no longer requires a job type selection)

Do not change anything else about the modal — file validation, error handling, and success message are unchanged.

---

### Step 3 — Write the AI quote parsing service

Create a new utility file at `/lib/parseQuotePdf.ts`.

This function takes the uploaded PDF (as a base64-encoded string or a URL pointing to the stored file) and calls the Anthropic API to extract the priced options.

**Use the Anthropic API directly** — the API key is already in `.env.local` as `ANTHROPIC_API_KEY`. Use the `claude-sonnet-4-20250514` model. Do not install any new packages — use `fetch` to call the API directly, the same pattern used elsewhere in the codebase.

**The prompt to send to the API:**

```
You are parsing a gutter cleaning quote PDF. Extract all priced job options from this document.

Return ONLY a valid JSON array. No explanation, no markdown, no code fences — just the raw JSON array.

Each element must have exactly these fields:
- "sort_order": integer, starting at 1, in the order they appear in the document
- "name": string, the job type or service name as written in the document
- "price_ex_gst": number, the price excluding GST in NZD (no $ sign, no commas)
- "price_incl_gst": number, the price including GST in NZD (no $ sign, no commas) — calculate as price_ex_gst × 1.15 if not explicitly stated

Rules:
- If only one price is found, return an array with one element
- If two prices are found, return two elements
- If three prices are found, return three elements
- Never return more than three elements
- If no prices can be found, return an empty array []
- Do not invent prices — only extract what is explicitly on the document
```

**Function signature:**

```typescript
export interface ParsedQuoteOption {
  sort_order: number;
  name: string;
  price_ex_gst: number;
  price_incl_gst: number;
  duration_minutes: number | null; // populated by matching step, not AI
  job_type_id: string | null;      // populated by matching step, not AI
}

export async function parseQuotePdf(
  pdfBase64: string,
  campaignJobTypes: { id: string; name: string; duration_minutes: number; sort_order: number }[]
): Promise<ParsedQuoteOption[]>
```

**Matching extracted options to campaign job types:**

After the AI returns its JSON array, match each extracted option to a campaign job type to populate `duration_minutes` and `job_type_id`. Match in this priority order:

1. **Name match** — if the extracted `name` contains keywords from the job type name (case-insensitive). Example: extracted "Standard Clean" matches campaign job type "Standard Gutter Clean"
2. **Sort order match** — if no name match found, match by position: extracted option 1 → campaign job type with `sort_order: 1`, option 2 → `sort_order: 2`, etc.
3. **No match** — if neither applies, set `duration_minutes: null` and `job_type_id: null`

**Error handling:**

- If the API call fails (network error, timeout, etc.): log the error, return an empty array `[]` — do not throw, do not fail the upload
- If the API returns invalid JSON: log the parsing error, return `[]`
- If the returned array is empty: that is valid — the upload still proceeds, booking page will show all campaign job types as a fallback (see Step 7)

The upload must never fail because of a parsing error. Parsing is best-effort — the file is already saved and the lead is created regardless.

---

### Step 4 — Update the quote upload handler to run parsing automatically

In the quote upload API route (wherever `POST /api/leads/[quoteNumber]/upload-quote` or equivalent is handled — confirm the actual path first):

After the file is saved successfully to storage (R2 or local), and before advancing the lead status, run the parser:

```typescript
import { parseQuotePdf } from '@/lib/parseQuotePdf';

// Convert the saved file to base64 for the API call
// (or pass the R2 URL if using URL-based API input — check which approach the Anthropic API supports)
const parsedOptions = await parseQuotePdf(pdfBase64, campaignJobTypes);

// Store on the lead
await prisma.lead.update({
  where: { quote_number: quoteNumber },
  data: {
    quote_options: parsedOptions.length > 0 ? parsedOptions : null,
    // Do NOT set job_type_id here — it gets set at booking confirmation
  }
});
```

Then continue with the existing upload steps:
- Advance status to `QUOTE_SENT`
- Generate `booking_token`
- Send quote email to customer
- Schedule follow-up emails

**Important:** Do not set `job_type_id` on the lead during upload. It stays null until the customer picks an option at booking.

---

### Step 5 — Update the quote email to reflect multiple options

The initial quote email to the customer (Phase 3, P3.3) currently shows a single price. Update it to reflect that there may be multiple options:

**If `quote_options` has one entry:**
Keep the existing single-price format — show that one price.

**If `quote_options` has two or three entries:**
Replace the single price line with a summary:

```
Your quote includes [2/3] service options. Click the link below to view your options and book a time:
```

Remove the specific price from the email body — prices are shown on the booking page when the customer selects their option. The quote PDF is still attached and contains all prices.

The booking link and PDF attachment are unchanged.

---

### Step 6 — Update the booking page: option selection before calendar

This is the most significant UI change. The booking page at `/book/[booking_token]` currently goes straight to the slot picker. It must now show option cards first.

**New booking page flow — two steps:**

**Step 1 — Option selection (shown first):**

Page heading: "Choose your service"

Display one card per extracted quote option. Cards are ordered by `sort_order`. Each card shows:
- Service name (e.g. "Standard Gutter Clean")
- Price ex GST (e.g. "$250 + GST")
- Price incl. GST (e.g. "$287.50 incl. GST")
- Estimated duration (e.g. "Approx. 2 hours") — from `duration_minutes` on the option. If `duration_minutes` is null, do not show duration.
- A "Select" button or the entire card is clickable

Card states:
- Default: clean card with subtle border
- Selected: brand accent border and background tint, a tick or "Selected" label
- Only one card can be selected at a time

Below the cards: "Download Quote" button → opens `quote_url` in a new tab so customer can review the PDF

**"Continue to booking" button** — appears below the cards, disabled until one option is selected. On click: advances to Step 2.

**Fallback — if `quote_options` is null or empty:**
Show all three campaign job types as option cards instead — use the campaign's job type records (name and duration only, no price — price is on the PDF). This ensures the booking page always works even if parsing failed.

**Step 2 — Time slot selection (shown after option is selected):**

This is the existing slot picker — unchanged in structure. The only difference is that the time windows are now generated based on the `duration_minutes` of the **selected option** rather than a pre-set `job_type_id` on the lead.

The selected option's `job_type_id` is passed to `GET /api/book/[token]/slots` as a query parameter:

```
GET /api/book/[token]/slots?job_type_id=uuid
```

The slots API uses this to determine window duration. If no `job_type_id` is provided (fallback case), use the campaign's first job type by sort order.

**Back button:** Customer can go back to Step 1 to change their option selection. If they had a held slot, release it before going back.

---

### Step 7 — Update the slots API to accept job type as a parameter

Update `GET /api/book/[token]/slots` to accept an optional `job_type_id` query parameter.

- If `job_type_id` is provided: use that job type's `duration_minutes` for window generation
- If not provided: use the campaign's default job type (`sort_order: 1`)

No other changes to the slots API.

---

### Step 8 — Update the confirm booking API to set job_type_id on the lead

Update `POST /api/book/[token]/confirm` to accept the selected `job_type_id` in the request body:

```json
{
  "slot_id": "uuid",
  "window_start": "07:00",
  "window_end": "09:00",
  "job_type_id": "uuid"
}
```

On confirmation, set `job_type_id` on the lead record:

```typescript
await prisma.lead.update({
  where: { id: lead.id },
  data: {
    status: 'JOB_BOOKED',
    job_booked_date: new Date(),
    job_type_id: body.job_type_id ?? null,
  }
});
```

All other confirmation logic (cancel follow-up emails, send booking confirmation, send PWB notification) is unchanged.

---

### Step 9 — Display parsed options on the admin and client lead detail page

On the admin and client lead detail pages, add a "Quote Options" section that shows what was extracted from the PDF. This lets Oli and the client see exactly what was sent to the customer.

Display each option as a row:

| # | Service | Price (ex GST) | Price (incl. GST) | Duration |
|---|---|---|---|---|
| 1 | Standard Gutter Clean | $250.00 | $287.50 | 2 hrs |
| 2 | Mid-Range Clean | $400.00 | $460.00 | 4 hrs |

If `quote_options` is null (parsing failed or quote not yet uploaded): show "Quote not yet uploaded" or leave the section hidden.

Also show which option the customer selected (once `job_type_id` is set on the lead after booking):
- Highlight the selected row in the table with a "Customer selected" badge

---

### What does NOT change

- The file storage logic (R2 / local) — unchanged
- The `booking_token` generation — unchanged
- The email sequence scheduling (24h reminder, final reminder) — unchanged
- The hold/confirm mechanics on the booking page — unchanged
- The admin availability calendar and slot creation UI — unchanged
- The `AvailabilitySlot` and `Booking` database tables — unchanged
- Invoice upload — completely separate flow, unchanged
- The existing Phase 2 migration fields (`quote_url`, `quote_uploaded_at`, `quote_uploaded_by`, `booking_token`) — unchanged, still required

---

### New environment variable required

The Anthropic API key must be present in `.env.local` for the parsing step:

```
ANTHROPIC_API_KEY=your-api-key-here
```

Add this to `.env.local` and to `.env.example` (key name only, no value). If the key is already present (used elsewhere in the project), do not add it again — just confirm it is there.

---

### Testing checklist

- [ ] Migration runs successfully — `quote_options` column exists on `leads` table as `Json?`
- [ ] Upload quote modal no longer shows the job type selector
- [ ] Upload button activates as soon as a PDF is selected
- [ ] Uploading a PDF with three prices stores three objects in `quote_options` on the lead
- [ ] Uploading a PDF with one price stores one object in `quote_options`
- [ ] Uploading a PDF where parsing fails (e.g. image-only PDF) stores `null` in `quote_options` — upload still succeeds, status still advances, email still sends
- [ ] `job_type_id` is NOT set on the lead after upload — it remains null
- [ ] Customer quote email shows multiple-option language when 2+ options are parsed
- [ ] Customer quote email shows single price when 1 option is parsed
- [ ] Booking page Step 1 shows option cards in sort order
- [ ] Booking page Step 1 shows fallback cards from campaign job types when `quote_options` is null
- [ ] Selecting an option enables the "Continue to booking" button
- [ ] Step 2 (slot picker) generates windows using the selected option's duration
- [ ] Back button from Step 2 releases any held slot and returns to Step 1
- [ ] Booking confirmation sets `job_type_id` on the lead
- [ ] Booking confirmation email includes the selected job type name
- [ ] PWB notification email includes the selected job type name
- [ ] Admin lead detail shows the "Quote Options" section with extracted options
- [ ] The customer's selected option is highlighted once `job_type_id` is set
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

Follow this order exactly:

1. Run Prisma migration to add `quote_options` to the leads table
2. Remove job type selector from the upload quote modal (UI only)
3. Create `/lib/parseQuotePdf.ts` with the parsing function and job type matching logic
4. Update the quote upload API handler to call parsing after file save and store result on lead
5. Update the quote email to handle single vs. multiple options
6. Update the booking page — add Step 1 option cards, wire Step 2 to use selected option's duration
7. Update `GET /api/book/[token]/slots` to accept `job_type_id` query parameter
8. Update `POST /api/book/[token]/confirm` to accept and store `job_type_id`
9. Add "Quote Options" section to admin and client lead detail pages
10. Run the testing checklist
11. Bump version in `package.json` — MINOR bump (significant new capability)
12. Commit: `v[X.X.0] — AI quote parsing, multi-option booking flow, job type selection at booking`
13. Push to GitHub: `git push origin main`
14. Run Vibstr build report per CLAUDE.md

---

## Change 50 — Admin Calendar View

### Background

The admin currently has no visual overview of the booking schedule. Confirmed bookings, available slots, and unavailable days all exist in the database but are only visible through the lead table or the Campaign Settings availability list. This change adds a dedicated Calendar tab to the admin sidebar — a proper monthly/weekly/daily calendar that shows everything at a glance: available days, booked jobs with their time windows, and days with no availability set.

No external calendar libraries or API keys are required. The calendar is built as a custom component using existing Jobbly data from the `AvailabilitySlot` and `Booking` tables.

---

### Step 1 — Add Calendar to the admin sidebar

Open the admin sidebar component. Add a new nav item:

```
📅  Calendar
```

Position it between Leads and Commission — it sits in the main operational section of the nav.

**Updated admin sidebar order:**
```
[Jobbly wordmark]

⚠️  Needs Action    [badge]
📊  Dashboard
📋  Leads
📅  Calendar         ← new
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

**Route:** `/calendar`
**Access:** ADMIN only — add to middleware. CLIENT and SUBCONTRACTOR must not access this route.

---

### Step 2 — Build the Calendar page

Create the page at `/app/calendar/page.tsx`.

**Page title:** "Calendar"

**View toggle** — top right of the page, three buttons:
```
[Month]  [Week]  [Day]
```
Default view on first load: Month. Selected view is highlighted. Switching view is instant — no page reload.

**Navigation controls** — top left, adjacent to the page title:
```
← [Previous]    [Today]    [Next] →
```
- Previous/Next move one period (month, week, or day) depending on the active view
- Today always jumps to the current date
- The current period label sits between the controls: e.g. "March 2026", "24–30 March 2026", "Monday 29 March"

---

### Step 3 — Month view

The month view shows a standard calendar grid — 7 columns (Mon–Sun), rows for each week in the month.

**Day cell states:**

**Available day** (at least one `AvailabilitySlot` exists for this date with future date):
- Light brand accent background tint
- Small label at the top of the cell: the slot time range, e.g. "7:00am – 1:00pm"
- If multiple slots on the same day: show the first one and a "+N more" label

**Booked job** (a `Booking` with `status = CONFIRMED` exists on this date):
- A coloured pill inside the day cell showing the booking window and customer name
- Pill colour: brand accent (same as urgency dot colours used elsewhere — keep consistent)
- Pill text: "7:00am – 9:00am — Jane Smith" — truncate customer name if too long
- Multiple bookings on the same day: stack pills vertically, max 3 visible, then "+N more"

**Unavailable day** (no `AvailabilitySlot` exists for this date, and the date is in the future):
- Default white/neutral background — no special indicator
- Do not label it "unavailable" — the absence of a green tint is signal enough

**Past day** (date is before today):
- Muted grey background, no interaction
- Show any bookings that occurred (historical record) but in muted style

**Today:**
- Date number displayed in brand accent colour, bold
- Subtle ring or highlight on the cell border

**Clicking a day cell:**
- If the day has availability slots or bookings: opens a day detail drawer or panel (see Step 5)
- If the day has no slots and no bookings: clicking does nothing (or optionally opens Campaign Settings → Availability to add a slot — but only if this feels natural; don't add if it feels jarring)

---

### Step 4 — Week view

Shows 7 columns (Mon–Sun) with time rows running vertically — a standard week schedule grid.

**Time rows:** 6:00am to 8:00pm, one row per hour. Label each hour on the left axis.

**Availability blocks:**
- A shaded block spanning the slot's time range in the correct column
- Colour: light brand accent tint
- Label inside: "Available — 7:00am – 1:00pm"

**Booking blocks:**
- A solid brand accent coloured block inside the availability block, spanning the booking's window (e.g. 7:00am – 9:00am)
- Label: Customer name + quote number, e.g. "Jane Smith — QU00103"
- Clicking the block opens the lead detail page for that booking: `/leads/[quoteNumber]`

**Empty columns** (days with no slots): plain white, no special styling.

**Current time indicator:** A horizontal red line across the current hour column (today's column only), showing the current time of day. Only visible in week view when the current week is displayed.

---

### Step 5 — Day view

Shows a single day as a vertical timeline — same hour grid as the week view but for one day only, wider columns.

**Availability block:** Spans the slot's full time range. Label includes: date, time range, and any slot notes (from the `notes` field on `AvailabilitySlot`).

**Booking blocks inside the availability block:** Each confirmed booking rendered as a coloured sub-block at its window position. Shows:
- Customer name
- Quote number
- Window time range
- Duration (e.g. "2 hours")
- Clicking navigates to `/leads/[quoteNumber]`

**Gaps between bookings** (available windows not yet booked): rendered as lighter tinted areas — "Available 9:00am – 11:00am" — showing remaining bookable time within the slot.

---

### Step 6 — Day detail panel (from month view click)

When a day cell is clicked in the month view (and the day has data), a slide-in panel or modal appears on the right side of the screen:

**Panel content:**
- Date heading: "Monday 5 April 2026"
- Section: "Availability" — shows the slot(s) for that day: time range, notes
- Section: "Bookings" — lists each confirmed booking:
  - Time window
  - Customer name (link to `/leads/[quoteNumber]`)
  - Job type name (once set — may be null)
  - Duration
- Section: "Available windows" — lists any remaining unbooked windows within the slot, calculated the same way as the booking page slot generator

Closing the panel: click outside it or press Escape.

---

### Step 7 — API endpoint

Create `GET /api/calendar` — ADMIN only.

**Query parameters:**
- `from` — ISO date string — start of the period to fetch
- `to` — ISO date string — end of the period to fetch

**Response:**

```json
{
  "slots": [
    {
      "id": "uuid",
      "date": "2026-04-05",
      "start_time": "07:00",
      "end_time": "13:00",
      "notes": "Morning run",
      "bookings": [
        {
          "id": "uuid",
          "window_start": "07:00",
          "window_end": "09:00",
          "lead": {
            "quote_number": "QU00103",
            "customer_name": "Jane Smith",
            "property_address": "14 Rata Street, Remuera",
            "job_type": {
              "name": "Standard Gutter Clean",
              "duration_minutes": 120
            }
          }
        }
      ]
    }
  ]
}
```

The front-end receives this and renders the calendar entirely client-side — no server components for the calendar grid itself, as the view toggle and navigation need to be interactive without round-trips.

**Scoped to session campaign** — the admin only sees slots and bookings for their currently selected campaign. Same session-based campaign scoping as all other admin API routes.

---

### What does NOT change

- The availability slot creation/editing UI in Campaign Settings — unchanged, that is still where slots are added
- The booking page for customers — unchanged
- The lead detail page — unchanged
- Any other admin page or sidebar item — unchanged
- No database schema changes — reads from existing `AvailabilitySlot` and `Booking` tables

---

### No external dependencies needed

The calendar grid is built entirely with Tailwind CSS and React state. Do not install `react-big-calendar`, `fullcalendar`, or any other calendar library — build the grid from scratch. This keeps the bundle small, keeps the visual style consistent with the rest of Jobbly, and avoids licence or compatibility issues with third-party calendar packages.

---

### Testing checklist

- [ ] "Calendar" nav item appears in admin sidebar between Leads and Commission
- [ ] `/calendar` route loads without error when logged in as admin
- [ ] `/calendar` is not accessible to CLIENT or SUBCONTRACTOR — middleware redirects correctly
- [ ] Month view renders a correct 7-column grid for the current month
- [ ] Days with availability slots show the slot time range and a light tint
- [ ] Days with confirmed bookings show a pill with customer name and time window
- [ ] Past days are rendered in muted style
- [ ] Today's date is highlighted with brand accent colour
- [ ] Previous / Next / Today navigation works correctly in all three views
- [ ] Week view shows the correct 7 days with hourly rows
- [ ] Booking blocks in week view are correctly positioned on the time axis
- [ ] Clicking a booking block in week view navigates to `/leads/[quoteNumber]`
- [ ] Day view shows the full slot block and individual booking sub-blocks
- [ ] Remaining available windows are shown in day view
- [ ] Clicking a day cell in month view opens the day detail panel
- [ ] Day detail panel shows slot, bookings, and remaining windows
- [ ] Closing the panel with Escape or clicking outside works
- [ ] `GET /api/calendar` returns correctly scoped data for the admin's current campaign
- [ ] Calendar shows correct data after a new booking is confirmed — no stale state
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Create `GET /api/calendar` endpoint — query `AvailabilitySlot` with nested `Booking` and `Lead` data, scoped to session campaign, filtered by `from`/`to` date range
2. Add `/calendar` to middleware — ADMIN only
3. Add Calendar nav item to admin sidebar
4. Build the calendar page shell at `/app/calendar/page.tsx` with view toggle (Month/Week/Day) and navigation controls
5. Build the Month view grid component
6. Build the Week view timeline component
7. Build the Day view timeline component
8. Build the day detail panel (triggered from month view cell click)
9. Wire all views to `GET /api/calendar` with correct date range parameters
10. Run the testing checklist
11. Bump version in `package.json` — MINOR bump
12. Commit: `v[X.X.0] — add admin calendar view with month, week, and day views`
13. Push to GitHub: `git push origin main`
14. Run Vibstr build report per CLAUDE.md

---

## Change 51 — Re-upload Quote with AI Customer Validation

### Background

If the wrong quote PDF is uploaded — wrong customer name, wrong address, wrong quote entirely — the current system sends it immediately to the customer without any check. This change adds two things: the ability to replace an already-uploaded quote, and an AI validation step that checks the uploaded PDF's customer details against the lead before allowing the email to send. If the details don't match, the upload is rejected with a clear error and no email is sent.

---

### Part 1 — AI customer validation on upload

This runs automatically on every quote upload — both initial uploads and re-uploads.

**What the AI checks:**

After the PDF is saved and before any status change or email send, call the Anthropic API a second time (separate from the price-parsing call in Change 49) to extract the customer-facing details from the PDF and compare them to the lead record.

Create a new utility at `/lib/validateQuotePdf.ts`:

```typescript
export interface QuoteValidationResult {
  valid: boolean;
  confidence: 'high' | 'low';
  mismatch_reason: string | null; // null if valid
  extracted_name: string | null;
  extracted_address: string | null;
}

export async function validateQuotePdf(
  pdfBase64: string,
  lead: { customer_name: string; property_address: string }
): Promise<QuoteValidationResult>
```

**The prompt to send to the Anthropic API:**

```
You are validating that a quote PDF belongs to the correct customer.

Extract the customer name and property address from this quote PDF.

Then compare them to:
- Expected customer name: [customer_name]
- Expected property address: [property_address]

Return ONLY a valid JSON object with exactly these fields:
{
  "valid": true or false,
  "confidence": "high" or "low",
  "mismatch_reason": null or a short plain-English explanation of what doesn't match,
  "extracted_name": the name you found in the document or null,
  "extracted_address": the address you found in the document or null
}

Rules:
- "valid" is true if the name and address are a reasonable match (allow for minor formatting differences, abbreviations, or partial addresses)
- "valid" is false if the name is clearly different or the address is clearly a different property
- "confidence" is "low" if the document doesn't clearly show a customer name or address, or if you are unsure
- If confidence is "low", set "valid" to true as a safe default — do not block uploads when you cannot read the document clearly
- Never return more than one JSON object
```

**Handling the validation result in the upload handler:**

```typescript
const validation = await validateQuotePdf(pdfBase64, {
  customer_name: lead.customer_name,
  property_address: lead.property_address,
});

if (!validation.valid && validation.confidence === 'high') {
  // Reject — delete the just-saved file, return error to the VA
  await deleteUploadedFile(savedFilePath); // clean up
  return Response.json({
    success: false,
    error: 'quote_mismatch',
    message: `Quote details don't match this customer. The quote appears to be for "${validation.extracted_name}" at "${validation.extracted_address}". Please check you've uploaded the correct file.`
  }, { status: 422 });
}

// validation.valid === true OR confidence === 'low' → proceed normally
```

Only reject when `valid === false` AND `confidence === 'high'`. A low-confidence result always passes through — the AI couldn't read the document clearly enough to be sure, so it gives the benefit of the doubt.

**If the validation API call itself fails** (network error, timeout): log the error, proceed with the upload as if validation passed — never block an upload because of an API failure.

---

### Part 2 — Show the validation error in the upload modal

The upload modal currently shows a success or generic error state. Add a specific error state for quote mismatch:

**Error display in the modal:**

```
❌ Quote details don't match

The quote appears to be for "[extracted_name]" at "[extracted_address]".
Please check you have uploaded the correct quote for [customer_name] at [property_address].

[Try again]  [Upload anyway]
```

- "Try again" clears the file selection and returns to the upload state — the VA can pick the right file
- "Upload anyway" — a secondary escape hatch for cases where the AI is wrong (e.g. unusual formatting). Clicking it bypasses validation and proceeds with the upload. This must be clearly styled as a secondary/warning action — not a primary button.

**If "Upload anyway" is clicked:** proceed with the full upload flow, skip validation, and store a flag on the lead: `quote_validation_overridden: true` (see schema note below).

---

### Part 3 — Schema addition

Add one optional boolean field to the `Lead` model:

```prisma
quote_validation_overridden  Boolean?  @default(false)
```

This is set to `true` only when the VA clicks "Upload anyway" after a mismatch warning. It is visible on the admin lead detail page as a small warning badge: "⚠ Quote validation was overridden" — so Oli can see it and double-check if needed.

Run the migration:

```bash
npx prisma migrate dev --name add_quote_validation_overridden
```

---

### Part 4 — Re-upload (replace quote) on admin and subcontractor lead detail

Add a "Replace Quote" button to the lead detail page wherever the current quote is shown.

**Visibility rules:**

| Status | Admin | Subcontractor |
|---|---|---|
| `LEAD_RECEIVED` | Not applicable (no quote yet) | Not applicable |
| `QUOTE_SENT` | ✅ "Replace Quote" button visible | ✅ "Replace Quote" button visible |
| `JOB_BOOKED` | ✅ "Replace Quote" button visible | ✅ "Replace Quote" button visible |
| `JOB_COMPLETED` | ❌ Hidden — job is done | ❌ Hidden |

**What "Replace Quote" does:**

Opens the same upload modal as the initial upload. All the same logic applies — file validation, AI parsing (re-extracts options), AI customer validation, and file storage. On successful re-upload:

1. Overwrite `quote_url` on the lead with the new file URL
2. Update `quote_options` with freshly parsed options
3. Update `quote_uploaded_at` and `quote_uploaded_by`
4. Do NOT change the lead status — it stays at whatever it currently is
5. Do NOT re-send the quote email to the customer — the quote has already been sent. The new PDF will be accessible via the same booking link (the `booking_token` does not change)
6. Show success message: "Quote replaced successfully. The customer's booking link now points to the updated quote."

---

### What does NOT change

- The initial upload flow for a first-time upload — same as before, just with validation added
- File storage (R2 / local) — unchanged
- The booking token — never regenerated on re-upload
- Follow-up email scheduling — not affected by a re-upload

---

### Testing checklist

- [ ] Uploading a quote PDF where the customer name and address clearly match the lead → upload proceeds, email sends
- [ ] Uploading a quote PDF for a completely different customer → `422` returned, error shown in modal, no email sent, no status change
- [ ] Error modal shows extracted name and address and the expected lead details
- [ ] "Try again" clears the modal and allows re-selection
- [ ] "Upload anyway" bypasses validation, upload proceeds, `quote_validation_overridden: true` set on lead
- [ ] Admin lead detail shows "⚠ Quote validation was overridden" badge when flag is true
- [ ] AI validation API failure → upload proceeds as if valid — no block
- [ ] "Replace Quote" button visible at QUOTE_SENT and JOB_BOOKED for admin and subcontractor
- [ ] "Replace Quote" hidden at JOB_COMPLETED
- [ ] Re-upload updates `quote_url`, `quote_options`, timestamps — does not re-send email, does not change status
- [ ] No TypeScript errors

---

### Build order for this change

1. Run Prisma migration to add `quote_validation_overridden` to leads
2. Create `/lib/validateQuotePdf.ts`
3. Update quote upload handler — call validation after file save, before status change/email
4. Update upload modal UI — add mismatch error state with "Try again" and "Upload anyway" options
5. Update admin/subcontractor lead detail — add "Replace Quote" button and override warning badge
6. Run testing checklist
7. Bump version in `package.json` — MINOR bump
8. Commit: `v[X.X.0] — AI quote validation on upload, re-upload support, mismatch error UI`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 52 — Quote Parsing Status Indicator and Upcoming Bookings Panel

### Part 1 — Quote parsing status indicator on admin and client lead detail

When the VA uploads a quote, the AI parsing runs automatically. Currently nothing in the UI tells anyone whether it worked. This change adds a small status badge to the **admin and client** lead detail page — so Oli and the client can see the outcome of parsing at a glance.

**Note on subcontractor view:** The parsing badge for the subcontractor job detail page is handled entirely in Change 54, inside the Notes tab. Do not build the parsing badge on the subcontractor view here — it will be built once, correctly, in Change 54.

**Where it appears:** In the "Quote Options" section on the admin and client lead detail page (added in Change 49), directly below the section heading and above the options table.

**The four possible states:**

| State | Condition | Badge display |
|---|---|---|
| Not yet uploaded | `quote_url` is null | Hidden — no badge |
| Parsed successfully | `quote_options` is a non-empty array | ✅ `[N] option[s] parsed from quote` — green |
| Parsing failed | `quote_url` is set but `quote_options` is null or empty array | ⚠️ `Quote could not be parsed — customer will see all service options` — amber |
| Validation overridden | `quote_validation_overridden` is true | ⚠️ `Quote validation was overridden` — amber, shown separately below the main badge |

The green badge reassures Oli and the client that the AI read the quote correctly. The amber badge tells them the fallback will kick in on the booking page — the customer will see all campaign job types without prices, which is fine but worth knowing.

---

### Part 2 — Upcoming bookings panel on the admin calendar

This extends Change 50's calendar page. Add a collapsible sidebar panel on the right side of the calendar page — visible in all three views (Month, Week, Day).

**Panel title:** "Upcoming Bookings"

**Content:** A chronological list of all confirmed bookings from today onwards, for the current campaign. Each item shows:

- Date and time window (e.g. "Mon 5 Apr — 7:00am – 9:00am")
- Customer name (linked to `/leads/[quoteNumber]`)
- Job type name (if set)
- Property address (single line, truncated if too long)

**Sorted:** Ascending by date and window start time — soonest first.

**Empty state:** "No upcoming bookings." — shown when no confirmed bookings exist from today onwards.

**Behaviour:**
- Panel is open by default on desktop
- Collapsible — clicking a "→ Hide" toggle collapses it to just a thin strip with an "← Show" button
- On mobile: panel is hidden by default and accessible via a "Upcoming" button above the calendar grid
- The panel data comes from the same `GET /api/calendar` call used to render the calendar — call it with `from = today (ISO date)` and `to = today + 90 days (ISO date)`. Filter the response client-side to bookings with `status = CONFIRMED` and `date >= today`, sorted ascending. No separate API endpoint needed.

**Maximum items shown:** 20. If more than 20 upcoming bookings exist, show a "View all in leads table →" link at the bottom of the panel.

---

### Testing checklist

**Parsing status (admin and client views only):**
- [ ] Green badge appears on admin lead detail when `quote_options` has 1+ entries
- [ ] Badge correctly states the number: "1 option parsed", "2 options parsed", "3 options parsed"
- [ ] Amber badge appears when `quote_url` is set but `quote_options` is null
- [ ] No badge when `quote_url` is null
- [ ] Validation override badge visible on admin and client — not built on subcontractor view (that is Change 54)
- [ ] Client lead detail also shows the badge

**Upcoming bookings:**
- [ ] Panel appears on the right side of the calendar page
- [ ] Calendar API called with `from = today` and `to = today + 90 days`
- [ ] Shows confirmed bookings from today onwards, sorted ascending
- [ ] Each item links to the correct lead detail page
- [ ] Empty state shown when no upcoming bookings
- [ ] Panel collapses and expands correctly
- [ ] Panel is hidden by default on mobile, accessible via "Upcoming" button

---

### Build order for this change

1. Add parsing status badge to the "Quote Options" section on admin lead detail page
2. Confirm the same badge renders correctly on client lead detail — do not add to subcontractor view
3. Add upcoming bookings panel to the calendar page
4. Wire panel data from `GET /api/calendar` with `from = today`, `to = today + 90 days` — filter and sort client-side
5. Add collapse/expand toggle — store preference in component state
6. Run testing checklist
6. Bump version in `package.json` — PATCH bump
7. Commit: `v[X.X.X] — quote parsing status badge, upcoming bookings panel on calendar`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 53 — Customer Reschedule Flow, PWB Reschedule Email, and Add to Calendar Links

### Background

Once a customer books a job, there is currently no way for them to change their time slot. The booking page shows a static "Your job is booked" screen with no path forward. This change introduces a full reschedule flow, a notification email to Pro Water Blasting when a reschedule happens, and "Add to Calendar" links in both the confirmation and reschedule emails.

---

### Part 1 — Reschedule link on the booking page

On the "Your job is booked" screen at `/book/[booking_token]`, add a reschedule link below the booking details:

```
✅ Your job is booked

Date: Wednesday 5 April 2026
Time: 7:00am – 9:00am
Address: [property address]
Job type: Standard Gutter Clean

[Add to Calendar ▾]     ← see Part 4

Need to change your time? → Reschedule my booking
```

"Reschedule my booking" is a plain text link — not a button. Understated, so it doesn't encourage rescheduling but makes it possible.

**What clicking the link does:**

1. Releases the current confirmed booking (sets `Booking.status` back to `HELD` briefly, then cancels it — freeing the slot for other customers)
2. Returns the booking page to Step 1 (option selection) — with the previously chosen option pre-selected so the customer doesn't have to pick again
3. The customer selects a new time slot and confirms as normal

**Important:** The lead's `status` stays at `JOB_BOOKED` during the reschedule flow — it only updates `job_booked_date` and the `Booking` record. Status does not revert to `QUOTE_SENT`.

---

### Part 2 — Reschedule link in the booking confirmation email

The booking confirmation email sent to the customer (Phase 3, P3.6) must include a reschedule link.

Add this line to the email body, below the booking details and above the "Add to Calendar" links:

```
Need to change your booking? Reschedule here: [https://[domain]/book/[booking_token]]
```

The booking token link always shows the customer's current booking state — if they click it after a confirmed booking, they see the "Your job is booked" screen with the reschedule option. So the reschedule link and the booking confirmation link are the same URL — the page handles both states.

---

### Part 3 — PWB reschedule notification email

**Trigger:** Customer completes a reschedule (new booking confirmed after releasing the old one)

**To:** All SUBCONTRACTOR users in the campaign where `notify_new_lead = true`

**Subject:** `Booking rescheduled — [Quote Number] — [Customer Name]`

**Body:**

```
Hi [First Name],

A customer has rescheduled their booking.

Quote number: [Quote Number]
Customer: [Customer Name]
Property: [Property Address]
Google Maps: [maps URL]

Previous booking:
Date: [old date]
Time: [old window_start] – [old window_end]

New booking:
Date: [new date]
Time: [new window_start] – [new window_end]

Log in to Jobbly to view the full details:
[https://[domain]/jobs/[quoteNumber]]
```

To capture the old booking details: before releasing the confirmed booking in Part 1, store the old `window_start`, `window_end`, and slot date in a temporary variable — pass these to the email function after the new booking is confirmed.

The email uses the same personalised first name greeting as the new lead notification (extract first name from `name` field — same logic as Change 45).

---

### Part 4 — Add to Calendar links in confirmation and reschedule emails

Both the booking confirmation email and the reschedule confirmation email must include "Add to Calendar" links for three calendar platforms: Google Calendar, Apple Calendar, and Outlook.

**Where they appear:** Below the booking date and time details, above the reschedule link (in the confirmation email) or at the bottom of the email (in the reschedule email).

**Display:**

```
Add to your calendar:
[Google Calendar]  [Apple Calendar]  [Outlook]
```

Three links displayed inline, each opening in a new tab. Style as small secondary buttons or plain text links — subtle, not dominant.

---

**Google Calendar link format:**

```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=[URL-encoded job title]
  &dates=[start datetime in UTC, format: YYYYMMDDTHHmmssZ]/[end datetime in UTC]
  &details=[URL-encoded description]
  &location=[URL-encoded property address]
```

Example values:
- `text`: `Gutter Clean — [Property Address]`
- `dates`: start = booking window start in UTC (convert from NZ time using `Pacific/Auckland`), end = window end in UTC
- `details`: `Quote number: [Quote Number]\nJob type: [Job Type Name]`
- `location`: the property address

---

**Apple Calendar (`.ics` file) link format:**

Apple Calendar opens `.ics` files directly. Create a dynamic endpoint at `GET /api/book/[token]/calendar.ics` that returns a valid iCalendar file:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Jobbly//EN
BEGIN:VEVENT
UID:[booking-id]@jobbly
DTSTAMP:[now in UTC, format: YYYYMMDDTHHmmssZ]
DTSTART:[window start in UTC]
DTEND:[window end in UTC]
SUMMARY:Gutter Clean — [Property Address]
DESCRIPTION:Quote number: [Quote Number]\nJob type: [Job Type Name]
LOCATION:[Property Address]
END:VEVENT
END:VCALENDAR
```

Content-Type header: `text/calendar; charset=utf-8`
Content-Disposition: `attachment; filename="booking.ics"`

This endpoint is public — authenticated by the booking token in the URL, same as all other `/api/book/[token]/*` endpoints.

The link in the email: `https://[domain]/api/book/[token]/calendar.ics`

On mobile, tapping this link downloads the `.ics` file and the OS prompts to add it to the default calendar (which is Apple Calendar on iPhone/iPad).

---

**Outlook link format:**

Outlook Web supports a direct "add to calendar" URL:

```
https://outlook.live.com/calendar/0/action/compose
  ?rru=addevent
  &startdt=[start datetime in ISO 8601 format, UTC]
  &enddt=[end datetime in ISO 8601 format]
  &subject=[URL-encoded subject]
  &body=[URL-encoded body]
  &location=[URL-encoded property address]
```

Example:
- `startdt`: `2026-04-05T19:00:00Z` (7:00am NZ = 7pm UTC previous day during NZ daylight saving)
- `subject`: `Gutter Clean — 14 Rata Street, Remuera`

---

**Generating the calendar links — utility function:**

Create `/lib/generateCalendarLinks.ts`:

```typescript
export interface CalendarLinks {
  google: string;
  apple_ics: string;  // URL to the .ics endpoint
  outlook: string;
}

export function generateCalendarLinks(params: {
  bookingToken: string;
  bookingId: string;
  windowStartNZ: string;   // "07:00" — NZ local time
  windowEndNZ: string;     // "09:00"
  slotDateNZ: string;      // "2026-04-05" — NZ local date
  propertyAddress: string;
  quoteNumber: string;
  jobTypeName: string;
  appUrl: string;          // NEXT_PUBLIC_APP_URL
}): CalendarLinks
```

Convert NZ local time to UTC within this function using the `Pacific/Auckland` timezone — do not hardcode offset. Use the same `Intl` approach as the `formatDate.ts` utility.

---

### Part 5 — Also add Add to Calendar to the PWB reschedule email

The reschedule notification email sent to Pro Water Blasting (Part 3) must also include the same three calendar links for the **new** booking time. Frank's team can then update their calendar directly from the email.

Use the same `generateCalendarLinks` utility — pass the new booking's date and window.

---

### What does NOT change

- The customer booking flow (option selection → slot selection → confirm) — unchanged except for the reschedule entry point
- The hold/confirm APIs — unchanged
- The cancellation of follow-up emails on booking — unchanged
- Admin calendar view — already shows confirmed bookings; the rescheduled booking will naturally appear with the new time

---

### New API endpoints

**`POST /api/book/[token]/reschedule`**
- Validates token and confirms an existing confirmed booking exists
- Stores old booking details (date, window_start, window_end) before releasing
- Sets old `Booking.status` to cancelled/deleted
- Returns `{ success: true, old_booking: { date, window_start, window_end } }`
- The front-end then shows Step 1 of the booking flow with the option pre-selected
- Note: new booking is confirmed via the existing `POST /api/book/[token]/confirm` endpoint — no separate confirm-reschedule endpoint needed

**`GET /api/book/[token]/calendar.ics`**
- Public endpoint (authenticated by token)
- Returns iCalendar file for the current confirmed booking
- Returns `404` if no confirmed booking exists for this token

---

### Testing checklist

- [ ] "Reschedule my booking" link appears on the "Your job is booked" booking page
- [ ] Clicking reschedule releases the old booking and returns to Step 1 with option pre-selected
- [ ] Customer can select a new time and confirm — new booking saved correctly
- [ ] Old booking slot is freed and available to other customers after reschedule
- [ ] PWB reschedule email sent after reschedule confirms — shows old and new times
- [ ] PWB reschedule email uses personalised first name greeting
- [ ] Booking confirmation email includes reschedule link
- [ ] Booking confirmation email includes Add to Calendar section with all three links
- [ ] Google Calendar link opens correct event in new tab with correct date, time, address
- [ ] Apple Calendar link downloads a valid `.ics` file — event imports correctly into Apple Calendar
- [ ] Outlook link opens Outlook Web with event pre-filled
- [ ] Calendar links use correct UTC times (not NZ local times)
- [ ] PWB reschedule email includes Add to Calendar links for the new booking time
- [ ] `GET /api/book/[token]/calendar.ics` returns valid iCalendar content-type
- [ ] `GET /api/book/[token]/calendar.ics` returns `404` when no confirmed booking exists
- [ ] Lead status stays `JOB_BOOKED` during and after reschedule — does not revert
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Create `/lib/generateCalendarLinks.ts` utility
2. Create `GET /api/book/[token]/calendar.ics` endpoint
3. Create `POST /api/book/[token]/reschedule` endpoint
4. Update booking page — add reschedule link to "Your job is booked" screen, wire to reschedule API, return to Step 1 with option pre-selected
5. Update booking confirmation email — add reschedule link and Add to Calendar section
6. Write PWB reschedule notification email template
7. Update `POST /api/book/[token]/confirm` to accept reschedule metadata in the request body — when `is_reschedule: true` is present, send the PWB reschedule email (passing `old_date`, `old_window_start`, `old_window_end` from the body) instead of the standard new booking email. The reschedule endpoint (Step 3) must pass these old booking details to the front-end in its response, and the front-end must include them in the subsequent confirm call.
8. Add Add to Calendar links to PWB reschedule email
9. Run the testing checklist
10. Bump version in `package.json` — MINOR bump
11. Commit: `v[X.X.0] — customer reschedule flow, PWB reschedule email, Add to Calendar links (Google, Apple, Outlook)`
12. Push to GitHub: `git push origin main`
13. Run Vibstr build report per CLAUDE.md

---

## Change 54 — Webhook Notes Field, Notes Tab Across All Roles, Parsing Badge on Subcontractor, and Manual Price Entry Fallback

### Background

This change covers four connected things:

1. The `notes` field is being sent in the n8n webhook payload but is not currently being stored on the lead. It needs to be mapped, stored, and displayed.
2. The Notes tab exists on the admin lead detail page but is not populated from the webhook. It needs to show the incoming call notes.
3. The Notes tab does not exist on the client or subcontractor views. It needs to be added to both.
4. When AI quote parsing fails, there is currently no way to manually enter the prices. A manual entry form is needed so the customer always sees real prices on the booking page — not just generic job type names with no price.

---

### Step 1 — Add `notes` to the Lead model in Prisma

Check `prisma/schema.prisma`. If a `notes` field already exists on the `Lead` model, confirm its type is `String?` and skip this step. If it does not exist, add it:

```prisma
notes   String?   // Call notes from n8n webhook — stored as received
```

If a migration is needed:

```bash
npx prisma migrate dev --name add_notes_to_leads
```

---

### Step 2 — Add `notes` to the webhook field map

Open `/lib/webhookFieldMap.ts`. Add:

```typescript
"notes": "notes",   // n8n sends "notes" → maps to internal "notes" field on lead
```

The n8n payload sends this field as `notes` (confirmed from webhook payload — see screenshot). Do not alias it to anything else.

---

### Step 3 — Write `notes` to the lead on webhook receipt

Open the webhook handler. In the `prisma.lead.create()` data object, add:

```typescript
notes: toStringOrNull(mappedPayload.notes),
```

Use the same `toStringOrNull` helper already defined in the handler (from Change 43). This ensures an empty string from n8n is stored as `null`, not `""`.

---

### Step 4 — Update the Notes tab on the admin lead detail page

The Notes tab already exists on the admin lead detail page. Currently it either shows nothing, shows a manual notes entry only, or shows placeholder content. Update it to:

**Section 1 — Call Notes (from webhook)**

Label: "Call Notes"
Description text: "Notes recorded during the AI voice agent call."

Display: the `notes` field from the lead record. Render as plain text, preserving line breaks (`whitespace-pre-wrap` or equivalent). If `notes` is null or empty: show a muted placeholder — "No call notes were received for this lead."

This section is read-only — the admin cannot edit the call notes. They are the source of truth from the call.

**Section 2 — Internal Notes (manual)**

Label: "Internal Notes"
Description text: "Your own notes about this job — visible to admin only."

If an editable notes/internal notes field already exists on the lead detail page: keep it, just make sure it is clearly labelled as "Internal Notes" and distinct from the call notes above it.

If no editable notes field exists yet: add a simple textarea. On blur (when the field loses focus), auto-save via `PATCH /api/leads/[quoteNumber]` with the updated internal notes value. Show a brief "Saved" confirmation that fades after 2 seconds. No save button needed — auto-save on blur is cleaner.

Add a separate `internal_notes` field to the Lead model if it does not already exist:

```prisma
internal_notes   String?   // Admin-entered notes — not from webhook, not shared with client
```

Run migration if needed:

```bash
npx prisma migrate dev --name add_internal_notes_to_leads
```

**API enforcement:** `internal_notes` must only be writable by ADMIN. If a CLIENT or SUBCONTRACTOR sends a PATCH request with `internal_notes`, the API must ignore that field silently.

---

### Step 5 — Add a Notes tab to the client lead detail page

The client lead detail page currently has no Notes tab. Add one.

**What the client sees:**

**Call Notes section** — same as admin, same read-only display. Label: "Call Notes". Shows the `notes` field from the lead. If null: "No call notes were received for this lead."

The client does not see Internal Notes — that section is admin-only. Do not render it on the client view at all.

**Tab label:** "Notes" — placed in the tab row alongside whatever tabs already exist on the client lead detail page (e.g. Details, Financials). Position it last.

---

### Step 6 — Add a Notes tab to the subcontractor job detail page

The subcontractor job detail page currently has no Notes tab. Add one.

**Tab label:** "Notes" — placed in the tab row on the subcontractor job detail page. Position it after the main Details tab.

**What the subcontractor sees inside the Notes tab:**

Three sections, in this order from top to bottom:

---

**Section 1 — Quote Parsing Status**

This is the parsing badge from Change 52, repositioned to live inside the Notes tab on the subcontractor view rather than on the main Details tab. It makes contextual sense here — it is information about the quote, which connects to the notes context.

Display the badge as a clearly labelled status block, not just a small inline badge. Give it its own visual card or highlighted row:

| State | Display |
|---|---|
| Quote not yet uploaded | Hidden — do not render this section |
| Parsed successfully — 1 option | ✅ **Quote Parsed** — 1 pricing option found |
| Parsed successfully — 2 options | ✅ **Quote Parsed** — 2 pricing options found |
| Parsed successfully — 3 options | ✅ **Quote Parsed** — 3 pricing options found |
| Parsing failed | ⚠️ **Quote Could Not Be Parsed** — The customer will see all service options. You can enter prices manually below. |

The "enter prices manually below" text in the failure state is a link that scrolls to or expands Section 2.

---

**Section 2 — Manual Price Entry (shown only when parsing failed)**

Visible only when `quote_options` is null or empty AND `quote_url` is set (i.e. a quote has been uploaded but parsing failed).

Label: "Enter Quote Prices Manually"
Description: "The quote couldn't be read automatically. Enter the prices below so the customer sees the correct options when they go to book."

Show one row per campaign job type (the same three default options: Standard Gutter Clean, Mid-Range Clean, Full Service Clean — or however many exist for this campaign). Each row has:
- Job type name (read-only label — not editable)
- Price ex GST input field — number input, NZD, no $ symbol in the field (shown as a label prefix)
- Price incl. GST — auto-calculated and displayed read-only as the user types: `price_ex_gst × 1.15`, rounded to 2 decimal places

Example row:
```
Standard Gutter Clean    $  [        ]  ex GST   →   $287.50 incl. GST
```

**Save button:** "Save Prices" — saves all three rows at once via `PATCH /api/leads/[quoteNumber]/quote-options`.

On save, the API constructs a `quote_options` JSON array from the entered prices, matching each to the campaign job type's `id` and `duration_minutes`. Stores it on the lead the same way the AI parser would have.

After saving successfully: the parsing status badge in Section 1 updates to show ✅ "Quote options entered manually — [N] options" and Section 2 collapses.

**Validation:** At least one price must be entered before saving. Rows with empty price fields are excluded from the saved array — they are not saved as zero.

**Access:** This form is visible to SUBCONTRACTOR users only on their job detail page. Admin can also enter prices manually via the same mechanism on the admin lead detail page — add it to the admin "Quote Options" section from Change 49 as a secondary action: a small "Enter manually" link that expands the same form.

---

**Section 3 — Call Notes**

Below the parsing status and manual entry sections. Same as admin and client: read-only display of the `notes` field. Label: "Call Notes". If null: "No call notes were received for this lead."

---

### New API endpoint

**`PATCH /api/leads/[quoteNumber]/quote-options`**

Accessible to ADMIN and SUBCONTRACTOR. CLIENT cannot call this endpoint.

Body:
```json
{
  "options": [
    { "job_type_id": "uuid", "price_ex_gst": 250.00 },
    { "job_type_id": "uuid", "price_ex_gst": 400.00 },
    { "job_type_id": "uuid", "price_ex_gst": 600.00 }
  ]
}
```

The API:
1. Validates the lead exists and belongs to the session's campaign
2. Fetches each job type by `job_type_id` to get `name`, `duration_minutes`, `sort_order`
3. Calculates `price_incl_gst = price_ex_gst × 1.15` for each
4. Constructs the `quote_options` JSON array in the same format as the AI parser
5. Updates `leads.quote_options` with the constructed array
6. Returns `{ success: true, quote_options: [...] }`

---

### What does NOT change

- The AI parsing flow in Change 49 — unchanged. Manual entry is only shown as a fallback when parsing fails, not instead of it.
- The booking page — it reads `quote_options` however it was populated (AI or manual) and renders the same way either way
- The quote validation flow from Change 51 — unchanged
- Any other tab on the lead detail pages — do not remove or reorder existing tabs

---

### Testing checklist

**Webhook notes:**
- [ ] Sending a test webhook payload with `notes: "Customer mentioned large gum tree overhanging roof"` creates a lead with that value stored in `notes`
- [ ] Sending a payload with `notes: ""` stores `null`, not an empty string
- [ ] Sending a payload without `notes` stores `null`

**Admin Notes tab:**
- [ ] Call Notes section shows the `notes` field value from the webhook
- [ ] If `notes` is null, shows "No call notes were received for this lead."
- [ ] Internal Notes textarea auto-saves on blur
- [ ] "Saved" confirmation appears and fades after 2 seconds
- [ ] CLIENT cannot write to `internal_notes` via API — field is silently ignored

**Client Notes tab:**
- [ ] New Notes tab appears on client lead detail page
- [ ] Shows Call Notes only — no Internal Notes section
- [ ] Null notes handled gracefully

**Subcontractor Notes tab:**
- [ ] New Notes tab appears on subcontractor job detail page
- [ ] Parsing status badge shows correct state: ✅ parsed (with count), ⚠️ failed, hidden if no quote
- [ ] Manual price entry form only appears when parsing failed and quote is uploaded
- [ ] Prices entered correctly — `price_incl_gst` auto-calculates as user types
- [ ] At least one price required before saving
- [ ] Saving calls `PATCH /api/leads/[quoteNumber]/quote-options` successfully
- [ ] After saving, parsing badge updates to show manual entry confirmation and form collapses
- [ ] Call Notes section shows at the bottom of the tab
- [ ] CLIENT cannot call `PATCH /api/leads/[quoteNumber]/quote-options`
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Run Prisma migrations — add `notes` (if missing) and `internal_notes` to Lead model
2. Add `"notes": "notes"` to `/lib/webhookFieldMap.ts`
3. Update webhook handler to write `notes` to the lead on creation
4. Update admin lead detail Notes tab — Call Notes (read-only) and Internal Notes (auto-save)
5. Add Notes tab to client lead detail page — Call Notes only
6. Create `PATCH /api/leads/[quoteNumber]/quote-options` endpoint
7. Add Notes tab to subcontractor job detail page — parsing badge, manual entry form, call notes
8. Add "Enter manually" link to admin lead detail Quote Options section (expands same manual entry form)
9. Run testing checklist
10. Bump version in `package.json` — MINOR bump
11. Commit: `v[X.X.0] — webhook notes field, notes tab across all roles, parsing badge, manual price entry fallback`
12. Push to GitHub: `git push origin main`
13. Run Vibstr build report per CLAUDE.md

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 55 — [Title], then full spec
-->
