# Jobbly — Change Log Prompt 7
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes in the order specified. Each change gets its own commit, GitHub push, and Vibstr report. Stop and ask if anything is unclear before proceeding.

---

## Build Order

1. **Change 67** — Fix delayed booking confirmation emails — send immediately on booking
2. **Change 68** — Clean up booking confirmation screen — remove change link, add close tab message
3. **Change 69** — Quote upload success confirmation
4. **Change 70** — Rename Jobs tab to All Jobs, remove Audit Log from subcontractor sidebar
5. **Change 71** — Update new lead email: "AI campaign" → "reactivation campaign"

After each change: bump `package.json` version, commit, run `git push origin main`, and run the Vibstr build report per CLAUDE.md.

---

## Pre-Flight Check

**1. Read CLAUDE.md**
Load versioning rules and Vibstr reporting command into context.

**2. Sync production database**
Run the following before touching any code:
```bash
DATABASE_URL="postgresql://postgres.ziwjvyuomzcadbldzxnp:wyddyh-0goXdo-xychak@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" npx prisma db push
```
If it reports everything in sync — proceed. If it applies changes — confirm the app loads on production before continuing. If it errors — stop and report.

**3. Locate `POST /api/book/[token]/confirm`** (Change 67)
Read the full confirm endpoint. Identify exactly where the booking confirmation email to the customer and the new job notification to the subcontractor are being triggered — direct Resend call or `ScheduledEmail` queue.

**4. Locate the customer-facing booking page** (Change 68)
Find `/app/book/[token]/page.tsx` (confirm actual path). Read the confirmed booking state — specifically where the "← Change" link is rendered and where the booking details end. You will be modifying this state only.

**5. Locate the upload quote modal component** (Change 69)
Find the component that renders the upload modal for quote uploads (used across admin, client, and subcontractor). Read its current success and error states. You will be adding a new success state.

**6. Locate the subcontractor sidebar component** (Change 70)
Find the subcontractor sidebar and confirm the current nav items. Note whether "Audit Log" is still present and whether the Jobs link is currently labelled "Jobs" or "All Jobs".

**7. Locate the new lead email template** (Change 71)
Find `/lib/emails/newLeadEmail.ts` (confirm actual path). Find the line containing "AI campaign" — confirm it exists and note the exact surrounding text.

Only after all seven checks pass — begin building.

---

## Change 67 — Fix Delayed Booking Confirmation Emails

### Background

When a customer confirms a booking, two emails should fire instantly:
1. Booking confirmation to the customer
2. New job booked notification to the subcontractor (PWB)

Both emails are arriving approximately 10 minutes late. The cause is almost certainly that these emails are being added to the `ScheduledEmail` queue and picked up by the cron job at `POST /api/cron/process-emails`, which runs every 15 minutes on Vercel. The cron job is designed for delayed follow-up emails (24h reminder, final reminder) — not for time-sensitive confirmations that must fire immediately.

---

### The fix

**Investigate first:** Open `POST /api/book/[token]/confirm` and find exactly how the two booking emails are being triggered. There are two possibilities:

**Scenario A — emails are being added to `ScheduledEmail` with `scheduled_for = now()`:**
This is the bug. Remove them from the queue. Instead, call the email send functions directly inside the confirm handler immediately after the booking is confirmed, using the same Resend send functions used elsewhere in the codebase. The emails must be awaited — send both before returning the success response.

**Scenario B — emails are being called directly but something else is delaying them:**
If the emails are already being called directly via Resend inside the confirm handler, the delay is coming from somewhere else — likely Resend itself or a slow API response. In this case, check whether the email send calls are being awaited sequentially (which would be slow) and parallelise them:

```typescript
// Instead of awaiting one at a time:
await sendCustomerConfirmationEmail(...);
await sendPWBNotificationEmail(...);

// Send in parallel:
await Promise.all([
  sendCustomerConfirmationEmail(...),
  sendPWBNotificationEmail(...),
]);
```

**In both scenarios:** The email sends must never block the confirm response if they fail. Wrap both in a try/catch — if an email fails to send, log the error but still return `{ success: true }` to the booking page. The booking is confirmed regardless of email success.

---

### What the `ScheduledEmail` table is for

The `ScheduledEmail` table and cron job must only be used for emails that are intentionally delayed:
- 24-hour quote reminder
- Final quote reminder (5 days)

These two email types stay on the cron queue — do not change them. Only the booking confirmation emails move to immediate sending.

---

### Also check: reschedule confirmation emails

The reschedule confirmation email to the customer and the PWB reschedule notification (built in Change 55) should also be sending immediately. If they are going through the cron queue, apply the same fix — move them to direct send inside `POST /api/book/[token]/confirm` when `is_reschedule: true`.

---

### Testing checklist

- [ ] Complete a test booking end-to-end
- [ ] Customer confirmation email arrives within 30 seconds of confirming — not 10 minutes
- [ ] Subcontractor new job notification arrives within 30 seconds of confirming
- [ ] If email send fails: booking page still shows success — no error shown to customer
- [ ] 24h and final reminder emails are unaffected — still going through the cron queue
- [ ] Reschedule confirmation emails also send immediately if previously delayed
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order for this change

1. Read `POST /api/book/[token]/confirm` — identify how booking emails are currently triggered
2. If queued: move them to direct send inside the confirm handler
3. If direct but sequential: parallelise with `Promise.all`
4. Wrap email sends in try/catch — booking success must not depend on email success
5. Check reschedule emails in the same handler — apply same fix if needed
6. Run testing checklist — complete a real test booking and time the email arrival
7. Bump version — PATCH bump
8. Commit: `v[X.X.X] — fix delayed booking confirmation emails, send immediately on confirm`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 68 — Update Booking Confirmation Screen

### Background

The "Your job is booked" screen currently shows the booking details but leaves the customer wondering what to do next. The "Your selection" card at the top still shows a "← Change" link even though the booking is confirmed and the only way to change it is via the reschedule link in their email. This change cleans up the screen and adds a clear close message.

---

### What to change

**1. Remove the "← Change" link from the "Your selection" card**
Once a booking is confirmed, the customer should not be able to click back to change their option from this screen. The reschedule flow (via the email link) is the correct path. Remove the "← Change" link entirely from the confirmed booking state. The card still shows the selected package and price — just no change link.

**2. Add a "You can close this tab" message**
Below the booking details and below the reschedule link, add a simple muted closing message:

```
You're all set — you can close this tab now.
```

Styled as small muted text (`text-gray-400` or similar) — the least prominent element on the screen. It should feel like a helpful afterthought, not a headline.

**The confirmed booking screen should read top to bottom:**
```
✅ Your job is booked

Date: [date]
Time: [time]
Job type: [job type]
Address: [address]

[Add to Calendar ▾]

Need to change your time? → Reschedule my booking

You're all set — you can close this tab now.
```

---

### What does NOT change

- The reschedule link — unchanged
- The Add to Calendar links — unchanged
- The booking details displayed — unchanged
- Any other state of the booking page (option selection, slot picker, etc.)

---

### Testing checklist

- [ ] Confirmed booking screen shows no "← Change" link
- [ ] "You're all set — you can close this tab now." appears below the reschedule link
- [ ] Message is styled as small muted text — not prominent
- [ ] All other booking page states unaffected
- [ ] No TypeScript errors

---

### Build order

1. Remove "← Change" link from the confirmed booking screen
2. Add closing message below reschedule link
3. Run testing checklist
4. Bump version — PATCH bump
5. Commit: `v[X.X.X] — clean up booking confirmation screen, add close tab message, remove change link`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Change 69 — Quote Upload Success Confirmation

### Background

When a quote is uploaded and the AI validation passes, the page advances to QUOTE_SENT with no visual confirmation that validation succeeded. The user only sees the status change — there is no positive feedback confirming the quote was checked and matched. This change adds a brief success state to the upload modal before it closes.

---

### What to add

After a successful upload (validation passed, parsing complete, status advanced to QUOTE_SENT), before the modal closes, show a brief success confirmation state inside the modal:

```
✅ Quote approved

The quote details match this customer.
[N] pricing option[s] found.
The quote has been sent to the customer.
```

- The ✅ and "Quote approved" heading in green
- "The quote details match this customer." — confirms validation passed
- "[N] pricing option[s] found." — e.g. "3 pricing options found." or "1 pricing option found." — confirms parsing result
- "The quote has been sent to the customer." — confirms email sent

The modal shows this success state for **2 seconds** then closes automatically. No button needed — it closes on its own.

**Applies to all roles** — admin, client, and subcontractor upload modals all show this confirmation.

If parsing failed but validation passed (fallback case), the message reads:
```
✅ Quote approved

The quote details match this customer.
Quote sent to customer — pricing options could not be read automatically.
```

---

### What does NOT change

- The mismatch error state ("Quote details don't match") — unchanged
- The upload flow itself — unchanged
- The "Upload anyway" override — unchanged

---

### Testing checklist

- [ ] Uploading a valid matching quote shows the ✅ success state in the modal
- [ ] Success state shows correct number of parsed options
- [ ] Modal closes automatically after 2 seconds
- [ ] Success state appears on admin, client, and subcontractor upload modals
- [ ] Fallback message shown when parsing failed but validation passed
- [ ] Mismatch error state unchanged
- [ ] No TypeScript errors

---

### Build order

1. Add success state to the upload modal component
2. Wire it to show after successful upload before auto-close
3. Test on all three role views
4. Bump version — PATCH bump
5. Commit: `v[X.X.X] — add quote upload success confirmation with validation and parsing result`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Change 70 — Rename Jobs Tab and Remove Audit Log from Subcontractor Sidebar

### Background

Two small cleanup changes on the subcontractor sidebar and nav. The "Jobs" tab label is ambiguous alongside "Jobs Booked" and "Completed Jobs" — renaming it to "All Jobs" makes the three tabs immediately clear. The Audit Log tab was supposed to be removed in Change 60/64 but needs confirming — if it is still present on the subcontractor sidebar, remove it now.

---

### What to change

**1. Rename "Jobs" to "All Jobs" in the subcontractor sidebar**
Find the subcontractor sidebar nav item that links to `/jobs`. Change the label from "Jobs" to "All Jobs". Also update the page title on the `/jobs` page itself from "Jobs" to "All Jobs" if it currently reads "Jobs".

**2. Remove Audit Log from the subcontractor sidebar**
If the Audit Log nav item is still present on the subcontractor sidebar after Changes 60 and 64, remove it now. Also block subcontractor access to `/audit` in middleware if not already done.

**Final subcontractor sidebar:**
```
[Jobbly wordmark]

⚠️  Needs Action    [badge]
📊  Dashboard
🔧  All Jobs         ← renamed
📅  Jobs Booked
✅  Completed Jobs

─────────────────
👤  [User name]
🚪  Log out
```

Five nav items total. No Notifications, no Audit Log.

---

### Testing checklist

- [ ] Subcontractor sidebar shows "All Jobs" not "Jobs"
- [ ] `/jobs` page title reads "All Jobs"
- [ ] Audit Log nav item absent from subcontractor sidebar
- [ ] Subcontractor navigating to `/audit` directly is redirected
- [ ] No TypeScript errors

---

### Build order

1. Rename "Jobs" label to "All Jobs" in subcontractor sidebar
2. Update page title on `/jobs` page
3. Confirm Audit Log is removed — remove and block in middleware if still present
4. Run testing checklist
5. Bump version — PATCH bump
6. Commit: `v[X.X.X] — rename Jobs to All Jobs, confirm audit log removed from subcontractor sidebar`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 71 — Update New Lead Email: "AI campaign" → "reactivation campaign"

### Background

The new lead notification email sent to the subcontractor when a webhook lead arrives contains the line "A new lead has come in from the AI campaign." The word "AI" should be replaced with "reactivation" to better describe the campaign to Frank's team.

---

### What to change

Open the new lead email template (located at `/lib/emails/newLeadEmail.ts` or equivalent — confirm actual path).

Find the line:
```
A new lead has come in from the AI campaign. Here are the details:
```

Change it to:
```
A new lead has come in from the reactivation campaign. Here are the details:
```

One word changed. Nothing else in this file changes.

---

### Testing checklist

- [ ] Fire a test webhook and confirm the received subcontractor email reads "reactivation campaign" not "AI campaign"
- [ ] No other text in the email is changed
- [ ] No TypeScript errors

---

### Build order

1. Update the one line in the new lead email template
2. Fire a test webhook and verify the email text
3. Bump version — PATCH bump
4. Commit: `v[X.X.X] — update new lead email: AI campaign → reactivation campaign`
5. Push to GitHub: `git push origin main`
6. Run Vibstr build report per CLAUDE.md

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 72 — [Title], then full spec
-->
