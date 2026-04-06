# Jobbly — Change Log Prompt 6
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes listed here in a single session in the order specified. Do not skip any item. Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end. Stop and ask if anything is unclear before proceeding.

---

## Build Order — Follow This Sequence Exactly

1. **Change 55** — Fix customer reschedule flow
2. **Change 56** — Fix booking record creation and slot confirmed count
3. **Change 57** — Fix quote number not passing through from n8n
4. **Change 58** — Remove "Move to Job Booked" button at QUOTE_SENT status
5. **Change 59** — Replace "Move to Job Completed" with "Attach Invoice" as primary action
6. **Change 60** — Jobs Booked tab and remove notifications from subcontractor sidebar
7. **Change 61** — Upload quote on admin and client level
8. **Change 62** — Add to Calendar on lead detail and fix subcontractor confirmation email
9. **Change 63** — Add quote number validation to AI quote check
10. **Change 64** — Remove notifications tab from all role views
11. **Change 65** — Admin: delete lead
12. **Change 66** — Add "Booked X days ago" label to Jobs Booked tab

After each change: bump `package.json` version, commit with the message specified in that change's build order, run `git push origin main`, and run the Vibstr build report per CLAUDE.md.

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Locate the customer-facing booking page**
Find `/app/book/[token]/page.tsx` (confirm actual path). Read the full file — specifically the "already booked" state, the reschedule flow, and where `POST /api/book/[token]/reschedule` is currently called. You will be modifying this file in Change 55.

**3. Locate the reschedule, slots, and confirm API endpoints**
Find and read these three files in full before touching any of them:
- `POST /api/book/[token]/reschedule` — Change 55 modifies this
- `GET /api/book/[token]/slots` — Change 55 verifies this
- `POST /api/book/[token]/confirm` — **both Change 55 AND Change 56 modify this endpoint**

**Critical note on the confirm endpoint:** Changes 55 and 56 both make changes to `POST /api/book/[token]/confirm`. Build Change 55's modifications first (add `is_reschedule` flag, send correct emails). Then when building Change 56, read the confirm endpoint again in its post-Change-55 state before modifying it further. Never overwrite Change 55's additions when applying Change 56.

**4. Locate the webhook handler and field map**
Find the webhook handler (confirm actual path) and `/lib/webhookFieldMap.ts`. Read both in full. You will be investigating and fixing these in Change 57.

**5. Locate the invoice upload handler**
Find the API route that handles invoice uploads (confirm actual path). Read how it currently handles file saving and status updates. You will be confirming or adding auto-completion logic in Change 59.

**6. Locate the subcontractor job detail page and sidebar**
Find `/app/jobs/[quoteNumber]/page.tsx` (confirm actual path) and the subcontractor sidebar component. Read both. You will be modifying these in Changes 58, 59, and 60.

**7. Locate the notifications middleware entries**
Find where `/notifications` is allowed in `middleware.ts`. Note which roles currently have access. You will be removing this access in Changes 60 and 64.

**8. Confirm `generateCalendarLinks` utility exists**
Find `/lib/generateCalendarLinks.ts` (built in Change Log 5, Change 53). If it does not exist, stop and flag this to Oli before proceeding — Change 62 depends on it entirely.

**9. Locate `/lib/validateQuotePdf.ts`**
Read the current interface and prompt. You will be extending both in Change 63.

**10. Confirm no database migrations are required**
Check `prisma/schema.prisma` — none of the changes in this file require new fields or migrations. Do not run any migrations as part of this changelog. If you believe a migration is needed for any reason, stop and flag it before proceeding.

**11. Sync production database with current Prisma schema**
Before building anything, verify the production Supabase database is fully in sync with the current `prisma/schema.prisma`. Run the following command to push any schema changes that exist locally but have not yet been applied to production:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this command reports that everything is already in sync — proceed normally.
If it reports changes were applied — note which fields were added and confirm the app loads correctly on production before continuing.
If it throws an error — stop and report the error to Oli before proceeding.

This step must always run before any code changes. A schema mismatch between local and production is the most common cause of "column does not exist" errors on Vercel.

Only after all eleven checks pass — begin building in the order listed above.

---

## Change 55 — Fix Customer Reschedule Flow

### Background

The reschedule flow is partially working but has three distinct problems that together make it unusable. This change fixes all three in one pass since they are all connected to the same flow.

---

### Problem 1 — "This job is already booked" blocks slot selection during reschedule

When a customer clicks the reschedule link and is shown the slot picker, selecting a time slot shows a red error: "This job is already booked." The slots API or the booking page is treating the reschedule attempt as a duplicate booking rather than a replacement. The old confirmed booking has not been released before the slot picker is shown, so when the customer tries to pick a new time, the system correctly sees a confirmed booking and blocks it — but it shouldn't, because this is a reschedule.

**The fix:** The reschedule flow must release the old confirmed booking **before** showing the slot picker — not after the customer picks a new time. The sequence must be:

1. Customer clicks "Reschedule my booking"
2. `POST /api/book/[token]/reschedule` is called immediately
3. The old `Booking` record is released (status set to cancelled or deleted)
4. Old booking details (date, window_start, window_end) are stored temporarily so they can be shown to the customer and included in the PWB notification later
5. The slot picker is shown — now with no existing confirmed booking blocking selection
6. Customer picks a new time → standard confirm flow

If the reschedule API is currently being called at a different point in the flow (e.g. after slot selection), move it to before the slot picker is shown.

---

### Problem 2 — Reschedule link disappears on repeat visits to the booking page

The "Your job is booked" confirmation screen sometimes shows a reschedule link and sometimes doesn't — specifically it stops appearing after the second or third visit to the same booking URL. The reschedule link must always appear on the booked confirmation screen, every time, on every visit, for as long as the job is at `JOB_BOOKED` status.

**The fix:** The reschedule link visibility must be driven purely by the lead's current status — not by any session state, local storage, or one-time flag. If `lead.status === 'JOB_BOOKED'`, show the reschedule link. Always. No exceptions.

The booked confirmation screen must always show:

```
✅ Your job is booked

Date: [date]
Time: [window_start] – [window_end]
Job type: [job type name]
Address: [property address]

[Add to Calendar ▾]

Need to change your time? → Reschedule my booking
```

The "Reschedule my booking" link must be present every time this screen is shown.

---

### Problem 3 — No context shown to the customer during reschedule

When the customer is in the reschedule flow and sees the slot picker, there is no indication of what their current booking is or that they are changing it. It looks identical to a first-time booking, which is confusing.

**The fix:** When the booking page is in reschedule mode (i.e. the customer has clicked the reschedule link and the old booking has been released), show a clear context banner above the slot picker:

```
You are rescheduling your booking.
Your previous time was [day, date] at [window_start] – [window_end].
Pick a new time below.
```

This banner uses the old booking details returned from `POST /api/book/[token]/reschedule` in Problem 1's fix. Store these in component state after the reschedule API call and display them above the slot picker.

The banner should be styled as an informational notice — blue or neutral toned, not a warning or error. Muted and clear, not alarming.

---

### How the fixed reschedule flow works end-to-end

```
Customer is on "Your job is booked" screen
        ↓
Clicks "Reschedule my booking"
        ↓
POST /api/book/[token]/reschedule fires immediately
        ↓
Old Booking record released — slot freed
Old booking date/time stored in response: { old_date, old_window_start, old_window_end }
        ↓
Booking page returns to Step 1 (option selection)
Previously selected option is pre-selected
Old booking details stored in component state
        ↓
Customer clicks "Continue to booking" (or option is auto-confirmed if only one)
        ↓
Slot picker shown with context banner:
"You are rescheduling. Previous time: [day] at [time]. Pick a new time below."
        ↓
Customer selects new slot → 10-minute hold placed
        ↓
Customer confirms → POST /api/book/[token]/confirm fires
is_reschedule: true passed in body, along with old_date, old_window_start, old_window_end
        ↓
New Booking record created as CONFIRMED
Lead job_booked_date updated
PWB reschedule notification email sent (shows old → new times)
Customer reschedule confirmation email sent
        ↓
Booking page shows "Your job is booked" screen with new date/time
Reschedule link present again
```

---

### API changes required

**`POST /api/book/[token]/reschedule`**

This endpoint must:
1. Find the confirmed `Booking` record for this token
2. Store the old booking details before releasing: `old_date` (from the slot's date), `old_window_start`, `old_window_end`
3. Cancel/delete the old `Booking` record — freeing the slot
4. Return: `{ success: true, old_date, old_window_start, old_window_end, previously_selected_job_type_id }`

If no confirmed booking exists (customer somehow hits this endpoint without a booking): return `{ success: false, message: "No confirmed booking found to reschedule" }` — do not error.

**`GET /api/book/[token]/slots`**

This endpoint must not block slot selection based on whether this token already has a confirmed booking. After the reschedule endpoint releases the booking, there is no confirmed booking for this token — the slots API should behave identically to a first-time booking. Confirm this is the case and fix if not.

**`POST /api/book/[token]/confirm`**

Accept these additional optional fields in the request body:

```json
{
  "slot_id": "uuid",
  "window_start": "07:00",
  "window_end": "09:00",
  "job_type_id": "uuid",
  "is_reschedule": true,
  "old_date": "2026-04-01",
  "old_window_start": "15:00",
  "old_window_end": "17:00"
}
```

When `is_reschedule` is `true`: send the PWB reschedule notification email instead of the standard new booking email. Pass the old date and window times to the email function so it can show the before/after comparison. Send a reschedule confirmation to the customer as well (not the standard booking confirmation — a reschedule-specific version).

---

### Email content for reschedule confirmation to customer

**Subject:** `Your booking has been rescheduled — [Property Address]`

**Body:**
```
Hi [Customer Name],

Your gutter cleaning booking has been rescheduled.

Your new booking:
Date: [new date]
Time: [new window_start] – [new window_end]
Job type: [job type name]
Address: [property address]

[Add to Calendar ▾]

If you need to make any further changes, use the link below:
[Reschedule again → https://[domain]/book/[booking_token]]

Jobbly by Omniside AI
```

---

### What does NOT change

- The initial first-time booking flow — completely unchanged
- The 10-minute hold mechanic — unchanged
- The slot availability logic — unchanged
- The booking confirmation email for first-time bookings — unchanged
- The PWB new job notification email for first-time bookings — unchanged
- Any admin or subcontractor pages

---

### Testing checklist

- [ ] "Your job is booked" screen always shows "Reschedule my booking" link — on every visit, every time
- [ ] Clicking "Reschedule my booking" immediately calls `POST /api/book/[token]/reschedule`
- [ ] Old booking is released before slot picker is shown — no "already booked" error when selecting a new time
- [ ] Context banner shown above slot picker: "You are rescheduling. Previous time was [day] at [time]."
- [ ] Previously selected option is pre-selected on Step 1 during reschedule
- [ ] Customer can select a new time and confirm successfully
- [ ] New booking is confirmed — lead `job_booked_date` updated to new date
- [ ] Old slot is freed — another customer could theoretically book it
- [ ] PWB reschedule email sent showing old time → new time
- [ ] Customer reschedule confirmation email sent with new booking details and Add to Calendar links
- [ ] `is_reschedule: true` correctly triggers reschedule emails instead of new booking emails
- [ ] First-time booking flow completely unaffected — works exactly as before
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Read pre-flight — locate booking page, reschedule API, slots API, confirm API
2. Fix `POST /api/book/[token]/reschedule` — release old booking, return old booking details
3. Fix booking page — call reschedule API immediately on click, store old details in state, show context banner above slot picker, ensure reschedule link always visible on booked screen
4. Fix `GET /api/book/[token]/slots` — confirm it does not block selection after reschedule
5. Fix `POST /api/book/[token]/confirm` — accept `is_reschedule` flag and old booking details, send correct emails
6. Write reschedule confirmation email to customer
7. Write PWB reschedule notification email (old → new times)
8. Run testing checklist
9. Bump version in `package.json` — MINOR bump
10. Commit: `v[X.X.0] — fix customer reschedule flow: release old booking, context banner, consistent reschedule link`
11. Push to GitHub: `git push origin main`
12. Run Vibstr build report per CLAUDE.md

---

## Change 56 — Fix Booking Record Creation and Slot Confirmed Count

### Background

When a customer confirms a booking through the booking page, two things should happen: the lead status moves to `JOB_BOOKED`, and a `Booking` record is created in the database linking the lead to the specific `AvailabilitySlot` and time window. The lead status update is working correctly — the admin lead detail page shows JOB_BOOKED with the correct date. However the `Booking` record is either not being created, not being linked to the slot correctly, or is being created with the wrong status. This means:

- The booking availability section in Campaign Settings shows "0 confirmed" even though a job is booked
- The admin calendar shows "No upcoming bookings" even though a confirmed job exists
- The upcoming bookings panel on the calendar is empty

This is a data integrity issue — the lead and the booking are out of sync.

---

### Step 1 — Investigate before fixing

Before writing any code, open `POST /api/book/[token]/confirm` and read it fully. Check:

1. Is a `Booking` record being created via `prisma.booking.create()` as part of the confirm flow? If yes, what `status` is it being created with — is it `CONFIRMED` or `HELD`?
2. Is the `slot_id` being correctly passed and stored on the `Booking` record?
3. Is the `lead_id` being correctly linked on the `Booking` record?
4. After the confirm runs, query the database directly: `SELECT * FROM "Booking" WHERE lead_id = '[lead id]'` — does a record exist?

Also check the count query used by the booking availability section in Campaign Settings — find where "0 confirmed / 5 possible" is calculated. Is it counting `Booking` records where `status = 'CONFIRMED'`? Is it correctly joining to the slot?

Document what you find before changing anything.

---

### Step 2 — Fix the confirm endpoint

Based on the investigation, fix whichever of these is broken:

**If no `Booking` record is being created:** Add the `prisma.booking.create()` call inside the confirm handler, after the lead status update. It must use a database transaction so both the lead update and the booking creation succeed or fail together — never one without the other.

```typescript
await prisma.$transaction([
  prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: 'JOB_BOOKED',
      job_booked_date: new Date(),
      job_type_id: body.job_type_id ?? null,
    }
  }),
  prisma.booking.upsert({
    where: { lead_id: lead.id },
    create: {
      slot_id: body.slot_id,
      lead_id: lead.id,
      window_start: body.window_start,
      window_end: body.window_end,
      status: 'CONFIRMED',
      booked_at: new Date(),
    },
    update: {
      slot_id: body.slot_id,
      window_start: body.window_start,
      window_end: body.window_end,
      status: 'CONFIRMED',
      booked_at: new Date(),
      held_until: null,
      held_by_token: null,
    }
  })
]);
```

Use `upsert` rather than `create` so that if a HELD booking record already exists for this lead (from the 10-minute hold), it gets updated to CONFIRMED rather than throwing a unique constraint error.

**If a `Booking` record exists but with wrong status:** Update the confirm handler to set `status: 'CONFIRMED'` explicitly and clear `held_until` and `held_by_token`.

**If the record exists and is correct but the count query is wrong:** Fix the Campaign Settings count query to correctly count `Booking` records with `status = 'CONFIRMED'` for each slot.

---

### Step 3 — Fix the confirmed count in Campaign Settings booking availability

The booking availability section shows "X confirmed / Y possible" for each slot. The confirmed count must reflect the actual number of `Booking` records with `status = 'CONFIRMED'` linked to that slot.

Find the API route that powers the booking availability section in Campaign Settings. Confirm the query includes:

```typescript
_count: {
  where: { status: 'CONFIRMED' }
}
```

or equivalent. If it is counting all bookings regardless of status, fix it to only count confirmed ones.

---

### Step 4 — Fix the calendar and upcoming bookings panel

The admin calendar (`GET /api/calendar`) fetches `AvailabilitySlot` records with their nested `Booking` records. Confirm the query includes bookings with `status = 'CONFIRMED'`. If the query is filtering incorrectly or not including the booking relation at all, fix it.

The upcoming bookings panel filters for confirmed bookings from today onwards. Once the `Booking` record exists with `status = 'CONFIRMED'`, this should work automatically — verify after fixing Steps 2 and 3.

---

### What does NOT change

- The lead status update logic — already working correctly
- The 10-minute hold mechanic — unchanged
- The slot window generation logic — unchanged
- Any customer-facing booking page behaviour

---

### Testing checklist

- [ ] Customer completes a booking → `Booking` record exists in database with `status = 'CONFIRMED'`
- [ ] `Booking` record has correct `slot_id`, `lead_id`, `window_start`, `window_end`
- [ ] Campaign Settings booking availability shows "1 confirmed / 5 possible" after a booking
- [ ] Admin calendar shows the booked job on the correct date after a booking
- [ ] Upcoming bookings panel shows the booking
- [ ] Clicking the booking in the calendar navigates to the correct lead detail page
- [ ] Completing a second booking on a different slot increments that slot's confirmed count
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Investigate `POST /api/book/[token]/confirm` — document findings before changing anything
2. Fix the confirm endpoint to correctly create/update the `Booking` record as `CONFIRMED`
3. Fix the Campaign Settings confirmed count query if needed
4. Fix the calendar API query if needed
5. Test by completing a fresh booking end-to-end and verifying all three places update
6. Run testing checklist
7. Bump version in `package.json` — PATCH bump
8. Commit: `v[X.X.X] — fix booking record creation on confirm, fix confirmed count in settings and calendar`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 57 — Fix Quote Number Not Passing Through From n8n

### Background

Change 44 was built to accept the quote number from the n8n webhook payload (`QU00103` etc.) and use it instead of auto-generating `JBL-00001`. Despite that change being deployed, the system is still generating new `JBL-` quote numbers on every lead. This change investigates why and fixes it properly.

---

### Step 1 — Investigate before touching anything

Open the webhook handler and check three things in order:

**1. Is `quote_number` in the field map?**
Open `/lib/webhookFieldMap.ts`. Confirm `"quote_number": "quote_number"` exists. If it is missing, that is the cause — add it and proceed to Step 2.

**2. Is the conditional logic correct in the handler?**
Find where `quote_number` is assigned in the handler. It should look like:
```typescript
const quoteNumber = mappedPayload.quote_number
  ? String(mappedPayload.quote_number).trim()
  : await generateQuoteNumber(campaignId);
```
If this code does not exist or is structured differently, that is the cause.

**3. What is actually arriving in the raw payload?**
The `leads.webhook_raw` field stores the raw incoming payload on every lead. Open the most recent lead in the database (via Prisma Studio or the admin lead detail) and check the `webhook_raw` JSON. Look for the `quote_number` field — is it present? What is its value? Specifically check whether it is arriving as a string like `"QU00103"` or as an unevaluated n8n template expression like `"{{ $('Quote Number Update').item.json.quote_number }}"`.

If the value in `webhook_raw` is an unevaluated template expression, the problem is on the n8n side — the n8n workflow is sending the template syntax instead of the resolved value. In that case, add a guard in the handler:

```typescript
const rawQuoteNumber = mappedPayload.quote_number;
const isTemplate = typeof rawQuoteNumber === 'string' && rawQuoteNumber.includes('{{');
const quoteNumber = (rawQuoteNumber && !isTemplate)
  ? String(rawQuoteNumber).trim()
  : await generateQuoteNumber(campaignId);
```

This treats an unevaluated template as if no quote number was provided and falls back to auto-generating — so the system never stores a broken template string as a quote number.

**4. Is the field being mapped correctly?**
Log the full `mappedPayload` object at the start of the handler (temporarily, for this investigation) and check the Vercel logs after firing a test webhook. Confirm `mappedPayload.quote_number` has the expected value.

---

### Step 2 — Fix whatever was found in Step 1

Apply the fix based on what the investigation revealed. The correct end state is:

- If n8n sends a valid `quote_number` string (e.g. `"QU00103"`): use it
- If n8n sends a template expression, null, undefined, or empty string: auto-generate `JBL-XXXXX`
- Never store a template expression or empty string as a quote number

---

### Step 3 — Verify end-to-end

Fire a test webhook payload with `quote_number: "QU00199"` and confirm:
- The lead is created with `quote_number: "QU00199"` in the database
- The lead detail URL is `/leads/QU00199`
- The subcontractor job URL is `/jobs/QU00199`
- The notification email subject shows `QU00199`

---

### Testing checklist

- [ ] Webhook payload with `quote_number: "QU00199"` creates lead with that exact quote number
- [ ] Webhook payload without `quote_number` creates lead with auto-generated `JBL-XXXXX`
- [ ] Webhook payload with unevaluated template string falls back to auto-generate — no template stored
- [ ] Lead detail and job URLs use the correct quote number
- [ ] No TypeScript errors

---

### Build order for this change

1. Inspect `webhookFieldMap.ts` and the webhook handler
2. Check `webhook_raw` on a recent lead for what n8n is actually sending
3. Apply the fix
4. Fire test webhook and verify
5. Bump version — PATCH bump
6. Commit: `v[X.X.X] — fix quote number passthrough from n8n webhook, guard against unevaluated templates`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 58 — Remove "Move to Job Booked" Button at QUOTE_SENT Status

### Background

On the subcontractor job detail page, when a lead is at `QUOTE_SENT` status, there is currently a "Move to Job Booked" button. This button should not exist — a job can only move to JOB_BOOKED when the customer books through the calendar link. The subcontractor cannot and should not manually advance this status.

---

### What to change

On the subcontractor job detail page (`/jobs/[quoteNumber]`), at `QUOTE_SENT` status, remove the "Move to Job Booked" button entirely.

The only actions visible at `QUOTE_SENT` for the subcontractor should be:
- **Replace Quote** — already exists, keep it
- **Revert status** — already exists, keep it

No primary action button. No "Move to Job Booked". The subcontractor simply waits for the customer to book.

Also check the admin lead detail page at `QUOTE_SENT` — if a similar "Move to Job Booked" button exists there, remove it too. The admin should also not be able to manually advance to JOB_BOOKED — that status transition is owned by the booking confirmation flow.

**API enforcement:** The API route that handles status transitions (`PATCH /api/leads/[quoteNumber]` or equivalent) must also reject any attempt to set status to `JOB_BOOKED` manually. If a request comes in trying to move a lead from `QUOTE_SENT` to `JOB_BOOKED` outside of the booking confirmation endpoint, return `400` with message: `"Job Booked status can only be set by the customer booking flow."`

---

### Testing checklist

- [ ] Subcontractor job detail at QUOTE_SENT shows no "Move to Job Booked" button
- [ ] Replace Quote button still visible at QUOTE_SENT — unchanged
- [ ] Revert status still visible at QUOTE_SENT — unchanged
- [ ] Admin lead detail at QUOTE_SENT also has no manual "Move to Job Booked" button
- [ ] API rejects direct PATCH to set status `JOB_BOOKED` from `QUOTE_SENT` — returns `400`
- [ ] Booking via the customer booking page still correctly advances status to `JOB_BOOKED` — unchanged

---

### Build order for this change

1. Remove "Move to Job Booked" button from subcontractor job detail at QUOTE_SENT
2. Check and remove from admin lead detail if present
3. Add API-level guard rejecting manual JOB_BOOKED transition
4. Run testing checklist
5. Bump version — PATCH bump
6. Commit: `v[X.X.X] — remove manual Move to Job Booked button, enforce booking-only status transition`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 59 — Replace "Move to Job Completed" with "Attach Invoice" as Primary Action

### Background

On the subcontractor job detail page at `JOB_BOOKED` status, there is currently a "Move to Job Completed" button alongside an "Attach Invoice" button. The attach invoice action should be the primary action — when an invoice is attached, the job automatically completes. The separate "Move to Job Completed" button creates a confusing two-step process and should be removed entirely.

---

### New button layout at JOB_BOOKED status (subcontractor view)

**Before invoice is attached:**
- **Attach Invoice** — primary button (brand accent colour, prominent)
- **Replace Quote** — secondary button

No "Move to Job Completed" button. No other action buttons.

**After invoice is attached (JOB_COMPLETED status):**
- **Replace Invoice** — secondary button (allows swapping the invoice if needed)
- **Replace Quote** — secondary button

The "Move to Job Completed" flow is replaced entirely by the invoice attachment triggering automatic completion. Confirm this automatic completion is already wired — when an invoice is uploaded at `JOB_BOOKED` status, the lead should automatically advance to `JOB_COMPLETED`. If this automation is not in place, add it to the invoice upload handler:

```typescript
// After successful invoice upload at JOB_BOOKED status:
await prisma.lead.update({
  where: { id: lead.id },
  data: {
    status: 'JOB_COMPLETED',
    job_completed_at: new Date(),
    invoice_url: savedFileUrl,
    invoice_uploaded_at: new Date(),
    invoice_uploaded_by: session.user.id,
  }
});
// Write to audit log
```

**Also check the admin lead detail page at JOB_BOOKED** — if a "Move to Job Completed" button exists there separately from the invoice flow, remove it too. The admin should also complete jobs via invoice attachment.

---

### Testing checklist

- [ ] Subcontractor job detail at JOB_BOOKED shows "Attach Invoice" as the primary button
- [ ] "Move to Job Completed" button is gone from subcontractor view
- [ ] "Replace Quote" button still present at JOB_BOOKED
- [ ] Attaching an invoice automatically advances status to JOB_COMPLETED
- [ ] After JOB_COMPLETED: "Replace Invoice" button visible, "Attach Invoice" gone
- [ ] Admin lead detail at JOB_BOOKED also has no separate "Move to Job Completed" button
- [ ] Audit log entry created when status advances to JOB_COMPLETED via invoice upload
- [ ] No TypeScript errors

---

### Build order for this change

1. Remove "Move to Job Completed" button from subcontractor job detail at JOB_BOOKED
2. Make "Attach Invoice" the primary styled button at JOB_BOOKED
3. Add "Replace Invoice" button at JOB_COMPLETED
4. Confirm invoice upload handler auto-advances status to JOB_COMPLETED — add if missing
5. Check and update admin lead detail view
6. Run testing checklist
7. Bump version — PATCH bump
8. Commit: `v[X.X.X] — replace Move to Job Completed with Attach Invoice as primary action, auto-complete on invoice upload`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 60 — Jobs Booked Tab and Remove Notifications from Subcontractor Sidebar

### Background

The subcontractor sidebar currently includes a Notifications tab that Frank's team does not need or use. It also has no dedicated view for jobs that have been booked and are waiting to be completed — these currently sit mixed in with active leads. This change removes the notifications tab and adds a clear "Jobs Booked" tab.

---

### Part 1 — Remove Notifications from subcontractor sidebar

Remove the Notifications nav item from the subcontractor sidebar entirely. Do not show it, do not disable it — remove it completely.

Also remove subcontractor access to the `/notifications` route in middleware — subcontractors should be redirected if they somehow navigate there directly.

**Updated subcontractor sidebar:**
```
[Jobbly wordmark]

⚠️  Needs Action    [badge]
📊  Dashboard
🔧  Jobs
📅  Jobs Booked      ← new
✅  Completed Jobs
📁  Audit Log

─────────────────
👤  [User name]
🚪  Log out
```

---

### Part 2 — Add Jobs Booked tab

**Route:** `/jobs-booked`
**Access:** SUBCONTRACTOR only — add to middleware

**Page title:** "Jobs Booked"
**Subtitle:** "Jobs that have been booked by customers and are waiting to be completed."

**Table columns:**

| Column | Value |
|---|---|
| Status dot | Coloured dot — amber always, indicating job needs completing |
| Quote # | Quote number — links to `/jobs/[quoteNumber]` |
| Customer name | Customer name |
| Property address | Property address |
| Booked date | The date the job is booked for — from the `Booking` record's slot date |
| Booked time | The time window — e.g. "7:00am – 9:00am" from `window_start`/`window_end` on the `Booking` record |
| Days until job | Calculated: number of days from today until the booked date — e.g. "3 days", "Today", "Tomorrow" |

**Sorted:** By booked date ascending — soonest job at the top.

**Filter:** Only leads with status `JOB_BOOKED` that belong to the subcontractor's campaign.

**The amber dot:** A small filled amber circle (`bg-amber-400`) on the left of each row. It indicates the job needs to be completed. It does not disappear until the job moves to `JOB_COMPLETED` — at which point the lead leaves this table entirely.

**Row click:** Navigates to `/jobs/[quoteNumber]`

**Empty state:** "No jobs are currently booked. Jobs will appear here once customers confirm a booking."

**API endpoint:** `GET /api/jobs-booked`
- SUBCONTRACTOR only
- Scoped to session campaign
- Returns all leads with status `JOB_BOOKED` joined with their `Booking` record (for slot date and window times)
- Sorted by slot date ascending

---

### Testing checklist

- [ ] Notifications tab removed from subcontractor sidebar
- [ ] Subcontractor cannot access `/notifications` — redirected
- [ ] "Jobs Booked" tab appears in subcontractor sidebar between Jobs and Completed Jobs
- [ ] `/jobs-booked` page loads correctly
- [ ] Table shows leads with JOB_BOOKED status only
- [ ] Booked date and time columns show correct values from the Booking record
- [ ] "Days until job" calculates correctly — "Today", "Tomorrow", "3 days" etc.
- [ ] Amber dot present on every row
- [ ] Row click navigates to correct job detail page
- [ ] Empty state shown when no booked jobs
- [ ] Page not accessible to ADMIN or CLIENT
- [ ] No TypeScript errors

---

### Build order for this change

1. Remove Notifications from subcontractor sidebar and middleware
2. Create `GET /api/jobs-booked` endpoint
3. Add `/jobs-booked` to middleware — SUBCONTRACTOR only
4. Build the Jobs Booked page
5. Add nav item to subcontractor sidebar
6. Run testing checklist
7. Bump version — MINOR bump
8. Commit: `v[X.X.0] — remove subcontractor notifications, add Jobs Booked tab with slot date and time`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 61 — Upload Quote on Admin and Client Level

### Background

Currently the "Upload Quote" button and flow only exists on the subcontractor job detail page. The admin and client lead detail pages have no way to upload a quote — they can only use "Move to Quote Sent" manually, which bypasses the AI parsing, the customer validation, and the booking link generation. This change adds the full upload quote flow to the admin and client views.

---

### What to change

On the admin lead detail page and the client lead detail page, at `LEAD_RECEIVED` status:

- Remove any "Move to Quote Sent" button if one exists
- Add an "Upload Quote" button in its place — same as the subcontractor version
- Clicking it opens the same upload modal with the same full flow: file selection, AI parsing, customer validation, status advance to QUOTE_SENT, booking token generation, quote email to customer

The upload modal and all its logic (AI parsing, validation, error states, "Upload anyway" override) is identical to the subcontractor version. Do not build a separate version — reuse the same component.

**Access by role at LEAD_RECEIVED:**

| Role | Upload Quote button |
|---|---|
| ADMIN | ✅ Visible |
| CLIENT | ✅ Visible |
| SUBCONTRACTOR | ✅ Already exists — unchanged |

**At all other statuses:** The upload quote button is not shown. "Replace Quote" is available at QUOTE_SENT and JOB_BOOKED as per Change 51.

---

### Testing checklist

- [ ] Admin lead detail at LEAD_RECEIVED shows "Upload Quote" button
- [ ] Client lead detail at LEAD_RECEIVED shows "Upload Quote" button
- [ ] Upload flow works identically on all three role views — AI parsing, validation, email send
- [ ] "Move to Quote Sent" button removed from admin and client views if it existed
- [ ] Status advances to QUOTE_SENT after successful upload on all roles
- [ ] No TypeScript errors

---

### Build order for this change

1. Locate the upload quote modal component used on the subcontractor view — confirm it is reusable
2. Add the Upload Quote button and modal to the admin lead detail page at LEAD_RECEIVED
3. Add the Upload Quote button and modal to the client lead detail page at LEAD_RECEIVED
4. Remove any "Move to Quote Sent" manual buttons from admin and client views
5. Run testing checklist
6. Bump version — PATCH bump
7. Commit: `v[X.X.X] — add upload quote flow to admin and client lead detail pages`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 62 — Add to Calendar on Lead Detail and Fix Subcontractor Confirmation Email

### Background

Two related issues: the subcontractor booking confirmation email is missing "Add to Calendar" links and the "View Job in Jobbly" button. Also, the booked date and time shown on lead detail pages across all three roles shows the date but not the time window — and there is no calendar link there either.

**Dependency:** This change requires the `generateCalendarLinks()` utility from Change Log 5 Change 53 — confirmed to exist in pre-flight check 8. Do not proceed with this change if that utility is missing.

---

### Part 1 — Fix subcontractor booking confirmation email

The email sent to subcontractors when a customer books a job must include:

1. **"View Job in Jobbly" button** — primary button, links to `/jobs/[quoteNumber]`
2. **Booked date AND time** — currently shows date only. Must show: "Wednesday, 1 April 2026 — 7:00am – 9:00am"
3. **Add to Calendar links** — all three platforms, same as the customer confirmation email:

```
Add to your calendar:
[Google Calendar]  [Apple Calendar]  [Outlook]
```

Use the same `generateCalendarLinks()` utility from Change 53. Pass the booking's slot date and window times.

The email structure after the fix:

```
Hi [First Name],

A customer has booked a job.

Quote number: [Quote Number]
Customer: [Customer Name]
Property: [Property Address]
Google Maps: [maps URL]
Job type: [Job Type Name]

Date: Wednesday, 1 April 2026
Time: 7:00am – 9:00am

Add to your calendar:
[Google Calendar]  [Apple Calendar]  [Outlook]

[View Job in Jobbly →]

Jobbly by Omniside AI
```

---

### Part 2 — Add booked date, time, and calendar link to lead detail across all roles

On the lead/job detail page for all three roles, when the lead is at `JOB_BOOKED` or `JOB_COMPLETED` status, show:

**Booked date and time:**
- Label: `Booked`
- Value: The slot date formatted in NZ time (using `formatNZDate`) + the window — e.g. "Wednesday, 1 April 2026 — 7:00am – 9:00am"
- Source: The `Booking` record linked to this lead — `slot.date`, `booking.window_start`, `booking.window_end`
- If no `Booking` record exists (data issue): show just `job_booked_date` with "—" for the time

**Add to Calendar link:**
- A small "Add to Calendar" link directly below the booked date/time row
- Opens a small inline dropdown with three options: Google Calendar, Apple Calendar (.ics), Outlook
- Uses the same `generateCalendarLinks()` utility
- Visible to all three roles — admin, client, and subcontractor

**Where to place it:** In the property/details section of the lead detail page, immediately below the status pipeline, near the job booked date field that already exists.

---

### Testing checklist

**Subcontractor email:**
- [ ] "View Job in Jobbly" button present in subcontractor confirmation email
- [ ] Email shows date AND time: "Wednesday, 1 April 2026 — 7:00am – 9:00am"
- [ ] All three Add to Calendar links present in subcontractor email
- [ ] Google Calendar link opens correct event
- [ ] Apple Calendar `.ics` link downloads correctly
- [ ] Outlook link opens with correct details

**Lead detail across roles:**
- [ ] Admin lead detail at JOB_BOOKED shows booked date + time
- [ ] Client lead detail at JOB_BOOKED shows booked date + time
- [ ] Subcontractor job detail at JOB_BOOKED shows booked date + time
- [ ] "Add to Calendar" dropdown link appears below booked date on all three views
- [ ] Dropdown shows Google, Apple, Outlook options
- [ ] No TypeScript errors

---

### Build order for this change

1. Fix subcontractor booking confirmation email — add View Job button, date+time, Add to Calendar
2. Update lead detail API to include Booking record data (slot date, window times) in the response
3. Add booked date+time row to admin lead detail
4. Add booked date+time row to client lead detail
5. Add booked date+time row to subcontractor job detail
6. Add "Add to Calendar" dropdown to all three views using `generateCalendarLinks()`
7. Run testing checklist
8. Bump version — MINOR bump
9. Commit: `v[X.X.0] — fix subcontractor confirmation email, add booked time and calendar links to all role views`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

---

## Change 63 — Add Quote Number Validation to AI Quote Check

### Background

The AI quote validator from Change 51 currently checks that the customer name and address on the uploaded PDF match the lead. It does not check the quote number. When a quote PDF with the wrong quote number was uploaded as a test, it passed validation and was accepted — this is wrong. The quote number on the PDF must also match the quote number on the lead.

---

### Update the validation prompt

Open `/lib/validateQuotePdf.ts`. Update the `QuoteValidationResult` interface to include the extracted quote number:

```typescript
export interface QuoteValidationResult {
  valid: boolean;
  confidence: 'high' | 'low';
  mismatch_reason: string | null;
  extracted_name: string | null;
  extracted_address: string | null;
  extracted_quote_number: string | null; // new
}
```

Update the function signature to accept the lead's quote number:

```typescript
export async function validateQuotePdf(
  pdfBase64: string,
  lead: {
    customer_name: string;
    property_address: string;
    quote_number: string; // new
  }
): Promise<QuoteValidationResult>
```

**Updated prompt to send to the Anthropic API:**

```
You are validating that a quote PDF belongs to the correct customer and job.

Extract the following from this quote PDF:
1. Customer name
2. Property address
3. Quote number or reference number

Then compare them to:
- Expected customer name: [customer_name]
- Expected property address: [property_address]
- Expected quote number: [quote_number]

Return ONLY a valid JSON object with exactly these fields:
{
  "valid": true or false,
  "confidence": "high" or "low",
  "mismatch_reason": null or a short plain-English description of what does not match,
  "extracted_name": the name found in the document or null,
  "extracted_address": the address found in the document or null,
  "extracted_quote_number": the quote number or reference found in the document or null
}

Rules:
- "valid" is true only if ALL THREE fields are a reasonable match
- "valid" is false if ANY of the three fields clearly does not match
- Allow minor formatting differences (e.g. "QU00103" vs "QU-00103", or partial addresses)
- "confidence" is "low" if the document is unclear or any field cannot be found
- If confidence is "low", set "valid" to true as a safe default
- Never return more than one JSON object
```

**Update all callers** of `validateQuotePdf` to pass `quote_number` from the lead record.

**Update the error message shown in the upload modal** to include the quote number mismatch if that is what failed:

```
❌ Quote details don't match

The quote appears to be for:
Name: "[extracted_name]"
Address: "[extracted_address]"
Quote number: "[extracted_quote_number]"

Expected:
Name: [customer_name]
Address: [property_address]
Quote number: [quote_number]

Please check you have uploaded the correct quote file.

[Try again]  [Upload anyway]
```

---

### Testing checklist

- [ ] Uploading a PDF with matching name, address, AND quote number → passes validation
- [ ] Uploading a PDF with correct name and address but wrong quote number → fails with high confidence → blocked
- [ ] Uploading a PDF with wrong name but correct quote number → fails → blocked
- [ ] Error modal shows extracted values vs expected values for all three fields
- [ ] "Upload anyway" still works as override — `quote_validation_overridden: true` set on lead
- [ ] Low confidence result still passes through — no upload blocked on unclear PDFs
- [ ] No TypeScript errors

---

### Build order for this change

1. Update `QuoteValidationResult` interface to include `extracted_quote_number`
2. Update `validateQuotePdf` function signature to accept `quote_number`
3. Update the AI prompt to check all three fields
4. Update all callers to pass `quote_number`
5. Update the upload modal error display to show all three field comparisons
6. Run testing checklist
7. Bump version — PATCH bump
8. Commit: `v[X.X.X] — add quote number validation to AI quote checker`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 64 — Remove Notifications Tab from All Role Views

### Background

The Notifications tab is not being used and is not needed. This change removes it completely from all three role views — admin, client, and subcontractor. Note that Change 60 already removed it from the subcontractor sidebar — this change covers admin and client, and also ensures the route and any remaining references are fully cleaned up across all roles.

---

### What to remove

**Admin sidebar:** Remove the Notifications (🔔) nav item entirely.

**Client sidebar:** Remove the Notifications nav item entirely if present.

**Subcontractor sidebar:** Change 60 earlier in this session removed the Notifications nav item from the subcontractor sidebar. After completing Change 60, open the subcontractor sidebar component and confirm the Notifications item is absent. If for any reason it is still present, remove it now. Also confirm subcontractor access to `/notifications` is blocked in middleware — Change 60 should have done this, but verify it here.

**Middleware:** Remove ADMIN and CLIENT access to the `/notifications` route. Any user navigating directly to `/notifications` should be redirected to their dashboard.

**Sidebar order after removal:**

Admin:
```
[Jobbly wordmark]

⚠️  Needs Action    [badge]
📊  Dashboard
📋  Leads
📅  Calendar
💰  Commission
📁  Audit Log
⚙️  Settings
👥  Users

─────────────────
🔀  Switch Campaign
👤  [User name]
🚪  Log out
```

Client:
```
[Jobbly wordmark]

📊  Dashboard
📋  Leads
💰  Commission

─────────────────
👤  [User name]
🚪  Log out
```

---

### What does NOT change

- The notifications data in the database — do not delete any records
- The notifications API routes — leave them in place in case they are needed later
- The unread notification badge logic — can be removed from the sidebar since the nav item is gone, but do not delete the underlying API

---

### Testing checklist

- [ ] Notifications nav item gone from admin sidebar
- [ ] Notifications nav item gone from client sidebar
- [ ] Subcontractor sidebar confirmed — no notifications item
- [ ] Navigating to `/notifications` as any role redirects to dashboard
- [ ] No broken links or references to notifications in any sidebar component
- [ ] No TypeScript errors

---

### Build order for this change

1. Remove Notifications nav item from admin sidebar component
2. Remove Notifications nav item from client sidebar component
3. Update middleware to redirect `/notifications` for all roles
4. Run testing checklist
5. Bump version — PATCH bump
6. Commit: `v[X.X.X] — remove notifications tab from all role sidebars`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 65 — Admin: Delete Lead

### Background

There is currently no way to delete a lead in Jobbly. If a test lead comes in, a duplicate is created, or a lead arrives with completely wrong data, the admin has no option to remove it — it sits in the system permanently. This change adds a delete button on the lead detail page, accessible to the admin only, so leads can be removed when necessary.

---

### What to add

**Location:** On the admin lead detail page (`/leads/[quoteNumber]`), at the very bottom of the page — below all other content including the status pipeline, notes, and financial details.

**The button:**

```
[Delete Lead]
```

Styled as a danger/destructive action — red text, subtle red border, not a filled red button. Small and understated. It should not look like an accidental click is likely — it sits at the bottom of the page away from all other actions.

**Visibility:** ADMIN only. This button must not appear on the client or subcontractor views under any circumstances.

---

### Confirmation modal

Clicking "Delete Lead" must open a confirmation modal before anything is deleted. The modal:

**Title:** "Delete this lead?"

**Body:**
```
This will permanently delete the lead for [Customer Name] — [Quote Number].
This action cannot be undone.
```

**Buttons:**
- "Cancel" — closes the modal, nothing happens
- "Delete permanently" — red filled button, proceeds with deletion

---

### What gets deleted

When the admin confirms deletion, the following must be removed in order within a single database transaction:

1. Any `Booking` record linked to this lead
2. Any `ScheduledEmail` records linked to this lead
3. Any `AuditLog` entries linked to this lead
4. The lead record itself

Use a Prisma transaction so all deletions succeed or fail together — never a partial delete.

If any related file exists (`quote_url`, `invoice_url`) stored in Cloudflare R2, delete those files from R2 as well before deleting the lead record. If the R2 deletion fails, log the error but still proceed with deleting the lead from the database — do not block the deletion over a file cleanup failure.

---

### API endpoint

**`DELETE /api/leads/[quoteNumber]`**

- ADMIN only — return `403` for any other role
- Scoped to session campaign — admin cannot delete leads from other campaigns
- Perform all deletions in a transaction as described above
- Return `{ success: true, message: "Lead deleted" }` on success
- Return `{ success: false, message: "Lead not found" }` if the quote number does not exist

---

### After deletion

After successful deletion, navigate the admin back to the dashboard (`/dashboard`). Show a brief success toast: "Lead deleted successfully."

---

### What does NOT change

- Client and subcontractor views — no delete button, no access to the delete API
- Any other lead — deleting one lead has no effect on others
- Campaign settings, commission records, or reconciliation batches

---

### Testing checklist

- [ ] "Delete Lead" button appears at the bottom of the admin lead detail page
- [ ] Button does not appear on client lead detail page
- [ ] Button does not appear on subcontractor job detail page
- [ ] Clicking the button opens the confirmation modal
- [ ] Modal shows correct customer name and quote number
- [ ] Clicking "Cancel" closes the modal — lead is unchanged
- [ ] Clicking "Delete permanently" deletes the lead and all related records
- [ ] Admin is redirected to the dashboard after deletion
- [ ] Success toast shown after deletion
- [ ] `DELETE /api/leads/[quoteNumber]` returns `403` for CLIENT and SUBCONTRACTOR roles
- [ ] Attempting to navigate to the deleted lead's URL returns a 404 or redirect
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Create `DELETE /api/leads/[quoteNumber]` endpoint with role check, campaign scope, and transaction deletion
2. Add "Delete Lead" button to admin lead detail page — bottom of page, admin only
3. Build the confirmation modal
4. Wire button → modal → API call → redirect on success
5. Run testing checklist
6. Bump version — PATCH bump
7. Commit: `v[X.X.X] — add admin-only delete lead with confirmation modal`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

## Change 66 — Add "Booked X Days Ago" Label to Jobs Booked Tab

### Background

The Jobs Booked tab added in Change 60 shows jobs waiting to be completed. Each row shows the booked date and the days until the job. However there is no quick way to see how long ago the booking was confirmed — useful for Frank's team to understand how long a customer has been waiting and to prioritise communication if something has changed. This change adds a small "booked X days ago" label to the detail level so the booking history context is always visible.

---

### Part 1 — "Booked X days ago" on the Jobs Booked table

On the Jobs Booked page (`/jobs-booked`), add a new column to the table:

| Column | Value |
|---|---|
| Booked | How long ago the customer confirmed the booking — e.g. "Today", "Yesterday", "3 days ago" |

This is calculated from `lead.job_booked_date` (the timestamp when the customer confirmed) — not from the slot date. It shows how long the booking has been sitting in the system.

Place this column after the "Days until job" column. It gives Frank's team both pieces of information at a glance: how far away the job is AND how long it's been booked.

**Formatting:**
- Same day: "Today"
- 1 day ago: "Yesterday"  
- 2+ days ago: "[N] days ago"

Use the existing NZ timezone formatting — calculate based on `Pacific/Auckland` dates, not raw UTC.

---

### Part 2 — Booking history on the job detail page

On the subcontractor job detail page (`/jobs/[quoteNumber]`), when the status is `JOB_BOOKED`, add a small muted line below the "Booked" date/time row (added in Change 62):

```
Booked [N] days ago
```

This tells Frank's team at a glance how long the booking has been confirmed, without having to check the audit log. Same formatting rules as Part 1 above.

**Visibility:** Only shown when status is `JOB_BOOKED`. Not shown at other statuses.

**Styling:** Muted grey text (`text-gray-500`) — same as the instructional text from Change 46. Small and informational, not prominent.

---

### What does NOT change

- The Jobs Booked table columns added in Change 60 — unchanged, this is additive
- The job detail page layout — this is one additional line below the booked date
- Any admin or client views — this is subcontractor-facing only

---

### Testing checklist

- [ ] Jobs Booked table shows "Booked" column with correct relative time
- [ ] "Today" shown when booking was confirmed earlier the same day (NZ time)
- [ ] "Yesterday" shown when confirmed the previous day
- [ ] "3 days ago" shown when confirmed 3 days earlier
- [ ] Subcontractor job detail at JOB_BOOKED shows "Booked X days ago" below the booked date
- [ ] Label not shown at QUOTE_SENT, LEAD_RECEIVED, or JOB_COMPLETED
- [ ] Times calculated in NZ timezone — not UTC
- [ ] No TypeScript errors

---

### Build order for this change

1. Add "Booked" relative time column to the Jobs Booked table
2. Add "Booked X days ago" line to subcontractor job detail at JOB_BOOKED status
3. Run testing checklist
4. Bump version — PATCH bump
5. Commit: `v[X.X.X] — add booked X days ago label to Jobs Booked tab and subcontractor job detail`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 67 — [Title], then full spec
-->
