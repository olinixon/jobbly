# Jobbly — Change Log 15
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are three changes in this session — a bug fix on the Stripe verify endpoint, a settings UI cleanup, and two small copy/timing tweaks. Complete all three in a single session in the order listed. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Locate the Stripe verify endpoint**
Find `POST /api/settings/stripe/verify`. Read it in full — specifically how it resolves the `campaign_id` when creating or upserting the `BillingProfile`. This is the root of the bug in Change 1.

**3. Locate the StripeConnectionSetup component**
Find `/components/settings/StripeConnectionSetup.tsx`. Read it in full — you will be removing hardcoded company name references and fixing the GST tax rate step instructions.

**4. Locate the admin settings page**
Find `app/settings/page.tsx`. Read it in full — you will be reordering the sections so the Danger Zone card is always last.

**5. Locate the client settings page**
Find `app/client/settings/page.tsx`. Read it in full — confirm the same section ordering applies here.

**6. Locate the InvoiceReminderSettings component**
Find `/components/settings/InvoiceReminderSettings.tsx`. Read it in full — you will be extending the day range and improving the UI.

**7. Locate the quote upload modal**
Find the modal or component that shows the "Quote Approved" success state after a quote is uploaded. Read it in full — you will be changing the auto-dismiss timing.

**8. Sync production database with current Prisma schema**
Run:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports everything is in sync — proceed normally.
If it throws an error — stop and report to Oli before proceeding.

Only after all eight checks pass — begin building in the order listed below.

---

## Change 1 — [#162] BUG: Stripe Verify — Campaign Auto-Detection + GST Step Location Fix

### Background

Two issues in the Stripe setup flow, both in the same area:

**Bug 1 — "No campaign assigned" error on Save & Verify**

When a user clicks "Save & Verify" in Step 5 of the Stripe setup checklist, the verify endpoint is throwing a "no campaign assigned" error when trying to create the `BillingProfile`. The endpoint is not correctly resolving which campaign the current user belongs to.

The fix: the campaign ID must be read automatically from the session — never from the request body. CLIENT and SUBCONTRACTOR users have `campaignId` stored directly on their session at login. ADMIN users have `campaignId` set when they select a campaign from the campaign selector. The verify endpoint must read this from the session and use it when upserting the `BillingProfile`. If `campaignId` is null or missing from the session, return a `400` with message: `"No campaign selected. Please select a campaign before connecting Stripe."` — this should only ever happen for an admin who hasn't selected a campaign yet.

The BillingProfile is per-campaign, per-role. If Oli switches to a different campaign and goes through setup again, a separate BillingProfile record is created for that campaign. The settings UI will reflect whichever campaign is currently active in the session.

**Bug 2 — GST tax rate step location is wrong**

Step 3 of the setup checklist currently tells users to go to `Settings → Tax rates → New tax rate`. This is incorrect. The correct path in Stripe is `Settings → Business tax details`. Update the instruction text in `StripeConnectionSetup.tsx`.

This change is a **PATCH bump**. Read the current version from `package.json` and increment the PATCH number.

---

### Step 1 — Fix campaign resolution in the verify endpoint

In `POST /api/settings/stripe/verify`, find where `campaign_id` is resolved. Replace any logic that reads `campaign_id` from the request body with logic that reads it from the session:

```typescript
const session = await getServerSession(authOptions);
if (!session?.user) return Response.json({ error: 'Unauthorised' }, { status: 401 });

const campaignId = session.user.campaignId;
if (!campaignId) {
  return Response.json(
    { error: 'No campaign selected. Please select a campaign before connecting Stripe.' },
    { status: 400 }
  );
}

const userRole = session.user.role; // 'ADMIN' | 'CLIENT'
```

Use `campaignId` and `userRole` from the session in the `BillingProfile` upsert — do not accept either from the request body.

Also remove `campaign_id` and `role` from the request body type if they were included — the frontend should never need to send these.

Apply the same fix to `DELETE /api/settings/stripe/disconnect` — confirm it also reads `campaignId` from the session, not from the request body.

---

### Step 2 — Fix the GST tax rate step in StripeConnectionSetup

In `/components/settings/StripeConnectionSetup.tsx`, find Step 3 instructions. Change:

**From:**
```
In Stripe, go to Settings → Tax rates → New tax rate
```

**To:**
```
In Stripe, go to Settings → Business tax details
```

Update this text for both the admin and client versions of the component (or if it's a shared component with props, update the single shared copy).

---

### Build order for Change 1

1. Fix `POST /api/settings/stripe/verify` — read `campaignId` and `role` from session only
2. Fix `DELETE /api/settings/stripe/disconnect` — confirm same session-only pattern
3. Update Step 3 instruction text in `StripeConnectionSetup.tsx`
4. Run `npx tsc --noEmit` — confirm no TypeScript errors
5. Apply PATCH version bump in `package.json`
6. Commit: `v[version] — fix Stripe verify campaign auto-detection, fix GST step location`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 2 — [#159] Settings Page UI Cleanup

### Background

Three UI fixes to the Stripe & Invoicing settings area and the settings page layout:

1. **Card order** — The Danger Zone / Deactivate Campaign card must always be the last section on the settings page. Currently the Stripe & Invoicing section appears below it. Swap the order so Stripe & Invoicing comes before Danger Zone on both the admin and client settings pages.

2. **Hardcoded company names** — The `StripeConnectionSetup` component currently has hardcoded references to real business names (e.g. "Omniside AI", "Continuous Group", "Pro Water Blasting") in the step-by-step instructions. These must be replaced with the `senderCompanyName` and `recipientCompanyName` props that are already passed into the component — so the text is always accurate regardless of who is viewing it. Any example customer names in Step 4 must also be replaced with generic placeholders (e.g. "Your Client Ltd").

3. **Invoice reminder picker** — The current day-of-month dropdown only goes to 28 and feels clunky. Replace it with a cleaner implementation: extend the range to 31, display days with ordinal suffixes (1st, 2nd, 3rd... 31st), and add a small helper note below the selector: "Note: if the selected day doesn't exist in a given month (e.g. 31st in April), the reminder will fire on the last day of that month." Style the selector to match the existing Jobbly input style — clean, not a raw browser default dropdown.

This change is a **PATCH bump**. Read the current version from `package.json` and increment the PATCH number.

---

### Step 1 — Fix card order on admin settings page

In `app/settings/page.tsx`, reorder the sections so Danger Zone is always the final section on the page. The correct order from top to bottom is:

1. General
2. Commission & Pricing
3. Booking Availability (if present)
4. Stripe & Invoicing ← move above Danger Zone
5. Danger Zone ← always last

---

### Step 2 — Fix card order on client settings page

Apply the same fix to `app/client/settings/page.tsx`. Danger Zone (or any deactivation/destructive section) must be last.

---

### Step 3 — Remove hardcoded company names from StripeConnectionSetup

In `/components/settings/StripeConnectionSetup.tsx`, replace every hardcoded business name in the step instructions with the appropriate prop value:

- References to the sender's company name → use `{senderCompanyName}`
- References to the recipient's company name → use `{recipientCompanyName}`
- Any example customer names in Step 4 (e.g. "Continuous Group", "Pro Water Blasting", "Frank Weggen") → replace with `{recipientCompanyName}` or a generic placeholder like `"Your Client Ltd"`

After this change, the instructions should read naturally for any combination of sender and recipient — no real business names hardcoded anywhere in the component.

---

### Step 4 — Improve the invoice reminder picker

In `/components/settings/InvoiceReminderSettings.tsx`:

- Extend the day range from 1–28 to 1–31
- Keep ordinal suffixes (1st, 2nd, 3rd, 4th... 31st)
- Replace the raw browser `<select>` with a styled dropdown that matches the existing input style in the Jobbly design system — consistent border, padding, font, and focus state
- Add a helper note below the selector:

```
Note: if your chosen day doesn't exist in a given month (e.g. the 31st in April), 
the reminder will fire on the last day of that month instead.
```

- The cron endpoint already uses `new Date().getDate()` for day matching — update it to also handle end-of-month fallback: if today is the last day of the month AND no users have today's exact day set, also fire reminders for any users whose `invoice_reminder_day` is greater than today's date (i.e. their day doesn't exist this month). This ensures someone who set day 31 still gets their reminder in February.

---

### Build order for Change 2

1. Reorder sections in admin `app/settings/page.tsx` — Danger Zone last
2. Reorder sections in client `app/client/settings/page.tsx` — Danger Zone last
3. Remove all hardcoded company names from `StripeConnectionSetup.tsx` — use props
4. Replace reminder picker with styled version, extend to 31, add helper note
5. Update cron endpoint end-of-month fallback logic
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply PATCH version bump in `package.json`
8. Commit: `v[version] — settings card order fix, remove hardcoded names, improve reminder picker`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 3 — [#161] [#160] Payment Terms Copy + Quote Approved Timing

### Background

Two small standalone fixes:

**#161 — Payment terms copy**
In Step 2 of the Stripe setup checklist (`StripeConnectionSetup.tsx`), the helper text currently says `"e.g. due in 14 days"`. Change this to `"e.g. due in 30 days"`.

**#160 — Quote Approved popup duration**
The "Quote Approved" success state that appears after a quote is uploaded currently auto-dismisses after approximately 2 seconds. Increase this to 4 seconds so users have time to read the confirmation.

Both are **PATCH bumps**. Apply one PATCH bump covering both fixes.

---

### Step 1 — Fix payment terms copy

In `StripeConnectionSetup.tsx`, find the Step 2 instructions. Change `"due in 14 days"` to `"due in 30 days"`.

---

### Step 2 — Increase Quote Approved auto-dismiss timing

Find the modal or component that shows the "Quote Approved" success state after a quote is uploaded. Find the `setTimeout` or equivalent that controls how long the success state is shown. Change the duration from its current value (approximately 2000ms) to `4000ms`.

If there are multiple dismiss timers in the same component (e.g. for different success states), only change the one for the Quote Approved state — do not change others.

---

### Build order for Change 3

1. Update payment terms copy in `StripeConnectionSetup.tsx`
2. Update Quote Approved auto-dismiss from ~2000ms to 4000ms
3. Run `npx tsc --noEmit` — confirm no TypeScript errors
4. Apply PATCH version bump in `package.json`
5. Commit: `v[version] — payment terms copy fix, quote approved timing increased to 4s`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — Stripe verify campaign auto-detection + GST step fix**
- [ ] `POST /api/settings/stripe/verify` reads `campaignId` from session — never from request body
- [ ] `POST /api/settings/stripe/verify` reads `role` from session — never from request body
- [ ] Returns `400` with clear message if `campaignId` is missing from session
- [ ] `DELETE /api/settings/stripe/disconnect` also reads `campaignId` from session only
- [ ] BillingProfile correctly scoped per campaign — switching campaigns creates a separate record
- [ ] Step 3 instruction updated: `Settings → Business tax details` (not Tax rates)
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 2 — Settings UI cleanup**
- [ ] Danger Zone is the final section on the admin settings page
- [ ] Danger Zone is the final section on the client settings page
- [ ] No hardcoded business names remain in `StripeConnectionSetup.tsx`
- [ ] Step instructions use `{senderCompanyName}` and `{recipientCompanyName}` props throughout
- [ ] Step 4 example customer name is generic — no real client names
- [ ] Reminder picker styled to match Jobbly input design — not a raw browser dropdown
- [ ] Reminder picker range extended to 1–31
- [ ] Ordinal suffixes correct: 1st, 2nd, 3rd, 4th... 21st, 22nd, 23rd, 24th... 31st
- [ ] Helper note visible below picker explaining end-of-month behaviour
- [ ] Cron endpoint fires reminders for day 29/30/31 users on the last day of shorter months
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Change 3 — Copy and timing fixes**
- [ ] Step 2 payment terms reads "e.g. due in 30 days" — not 14
- [ ] Quote Approved success state auto-dismisses after 4000ms — not ~2000ms
- [ ] No other dismiss timers changed
- [ ] No TypeScript errors — run `npx tsc --noEmit`

**Final**
- [ ] Each change has its own commit, push, and Vibstr report
- [ ] All three changes are PATCH bumps — read current version from `package.json` and increment PATCH for each
- [ ] All commits use correct message format per CLAUDE.md
