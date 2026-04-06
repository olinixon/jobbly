# Jobbly — Change Log 12
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There is one change in this session. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Locate the booking availability section in Campaign Settings**
Find the component and API route that power the Booking Availability section (Section 5b) in Campaign Settings — likely somewhere under `app/settings` and `app/api/settings/availability` (confirm actual paths). Read both the component and the API route in full before touching anything.

**3. Confirm the current slot list behaviour**
Read the slot list component and identify:
- Where past slots are being detected and rendered differently (muted style, read-only)
- Where the Edit button is conditionally hidden or disabled for past slots
- Where the Delete button is conditionally hidden or disabled for past slots
- Whether the delete/edit API routes have any server-side date guards blocking past slots

Document what you find before changing anything.

**4. Sync production database with current Prisma schema**
Before building anything, verify the production Supabase database is fully in sync. Run:

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports everything is in sync — proceed normally.
If it reports changes were applied — note what changed and confirm the app loads correctly on production before continuing.
If it throws an error — stop and report the error to Oli before proceeding.

Only after all four checks pass — begin building.

---

## Change 1 — [#158] Booking Availability — Edit/Delete All Slots + Past/Upcoming Filter

### Background

The Booking Availability section (Section 5b) in Campaign Settings currently shows past slots in a muted style and treats them as read-only — no edit, no delete. Over time these pile up and clutter the list. Oli needs to be able to edit or delete any slot regardless of whether it's in the past, present, or future. Past slots should also be hidden by default — visible only when explicitly requested via a filter toggle — so the main view stays clean and focused on upcoming availability.

No archiving system is needed. Slots are either visible (in the upcoming view or the past view) or deleted entirely.

The current version is **v1.23.1**. This change is a PATCH bump → **v1.23.2**.

---

### Step 1 — Remove the read-only restriction on past slots

Find where past slots are currently rendered as non-editable. The original spec said "Slots in the past shown in muted style — kept for records, not editable." Remove this restriction entirely.

All slots — past, present, and future — must now show both an Edit button and a Delete button. The visual muting of past slots (grey/muted style) can remain as a subtle indicator that the date has passed, but it must not prevent interaction.

---

### Step 2 — Enable edit for all slots

The Edit button currently exists for future slots. Confirm it opens an inline form or modal with:
- Date picker (pre-filled with the slot's current date)
- Start time picker (pre-filled)
- End time picker (pre-filled)
- Notes field (pre-filled)
- Save button → calls `PATCH /api/settings/availability/[slotId]`
- Cancel button → closes without saving

**Extend edit to past slots:** If the Edit button is currently hidden or disabled for past slots, enable it. Past slots are fully editable — the admin may need to correct a date, fix a time, or update notes on a historical record.

**Check the PATCH endpoint for server-side date guards:** Open `PATCH /api/settings/availability/[slotId]` and verify it does not have a guard that rejects edits to past-dated slots. If it does, remove that guard. The endpoint must accept updates for any slot ID regardless of date.

---

### Step 3 — Enable delete for all slots

The Delete button currently exists but is disabled when confirmed bookings exist for that slot. Keep that guard — never allow deletion of a slot that has confirmed bookings attached, regardless of whether it is past or future. That data integrity rule stays.

**What changes:** Remove any additional guard that prevents deletion of past slots purely because they are in the past. The only valid reason to block deletion is confirmed bookings.

**Delete confirmation dialog:** Clicking Delete opens a confirmation before anything is removed:

```
Are you sure you want to delete this slot?

[date] · [start_time] – [end_time]

This cannot be undone.

[Cancel]   [Delete slot]
```

If the slot has confirmed bookings, the Delete button shows a tooltip on hover: "Cannot delete — this slot has confirmed bookings." The button stays visible but non-interactive (disabled state).

**Check the DELETE endpoint for server-side date guards:** Open `DELETE /api/settings/availability/[slotId]` and verify it does not reject deletion of past-dated slots. If it does, remove that guard. The only valid server-side block is the confirmed bookings check.

---

### Step 4 — Add Upcoming / Past filter toggle

Above the slot list, add a simple two-option toggle:

```
[Upcoming]   [Past]
```

**Default view: Upcoming** — shows only slots where `date >= today`. This is what the admin sees on first load and after any page refresh. Past slots are hidden by default.

**Past view** — shows only slots where `date < today`, sorted in reverse chronological order (most recent past slot at the top). This gives a clean historical record when needed without cluttering the default view.

The filter can be implemented client-side (API returns all slots, component filters by date) or server-side (API accepts a `view=upcoming|past` query parameter). Use whichever is simpler given the existing implementation — do not over-engineer this.

**Toggle styling:** Match the existing tab or filter styling used elsewhere in Campaign Settings — keep it visually consistent. A simple two-button toggle group is sufficient. Active tab is highlighted; inactive is muted.

**Empty states:**
- Upcoming tab with no slots: "No upcoming availability slots. Add a slot above to get started."
- Past tab with no slots: "No past slots found."

---

### Step 5 — "Add Slot" button always visible regardless of active tab

The "Add Slot" button must remain visible and functional on both the Upcoming and Past tabs. Adding a slot always creates a new slot — regardless of which tab is currently active. The new slot will appear in Upcoming if its date is today or later, or in Past if a past date is entered.

---

### What does NOT change

- The "confirmed bookings block deletion" guard — kept exactly as is
- The slot creation flow (Add Slot button and form) — unchanged
- How slots appear on the customer booking page — unaffected
- The admin calendar view — unaffected
- Any other section of Campaign Settings — unchanged
- No database schema changes — no migration needed

---

### Build order

1. Read pre-flight — locate the booking availability component and both API routes
2. Investigate where past slots are marked read-only — document findings
3. Remove the read-only/muted restriction that prevents editing past slots — enable Edit on all slots
4. Verify `PATCH /api/settings/availability/[slotId]` has no past-date guard; remove if found
5. Enable Delete button on past slots — keeping only the confirmed-bookings guard
6. Add delete confirmation dialog
7. Verify `DELETE /api/settings/availability/[slotId]` has no past-date guard; remove if found
8. Add Upcoming / Past filter toggle above the slot list — default to Upcoming
9. Implement filtering by date (client-side or server-side — whichever is simpler)
10. Add empty states for both tabs
11. Verify "Add Slot" button visible and functional on both tabs
12. Bump version in `package.json` to `1.23.2` — PATCH bump
13. Commit: `v1.23.2 — enable edit/delete on past availability slots, add upcoming/past filter`
14. Push to GitHub: `git push origin main`
15. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

- [ ] Edit button visible and functional on ALL slots — past, present, and future
- [ ] Past slots no longer read-only — muted visual style may remain but must not block interaction
- [ ] Edit form pre-fills with current slot values (date, start time, end time, notes)
- [ ] `PATCH /api/settings/availability/[slotId]` accepts updates for past-dated slots — no date guard blocking it
- [ ] Delete button visible on ALL slots — past, present, and future
- [ ] Delete button disabled (with tooltip) only when confirmed bookings exist — regardless of whether slot is past or future
- [ ] Delete button fully functional for past slots with no confirmed bookings
- [ ] `DELETE /api/settings/availability/[slotId]` accepts deletion of past-dated slots — no date guard blocking it
- [ ] Delete confirmation dialog appears before deletion — shows slot date and time
- [ ] Confirmed bookings guard still active — cannot delete a slot (past or future) with confirmed bookings
- [ ] Upcoming / Past toggle appears above the slot list
- [ ] Default view is Upcoming — shows only slots where date >= today
- [ ] Past view shows only slots where date < today, sorted most recent first
- [ ] Upcoming tab empty state shown when no future slots exist
- [ ] Past tab empty state shown when no past slots exist
- [ ] "Add Slot" button visible and functional on both Upcoming and Past tabs
- [ ] Customer booking page completely unaffected
- [ ] Admin calendar view completely unaffected
- [ ] No other Campaign Settings sections affected
- [ ] No database migration required
- [ ] No TypeScript errors — run `npx tsc --noEmit`
- [ ] Version bumped to `v1.23.2` in `package.json`
- [ ] Committed with message `v1.23.2 — enable edit/delete on past availability slots, add upcoming/past filter`
- [ ] Pushed to GitHub: `git push origin main`
- [ ] Vibstr build report sent
