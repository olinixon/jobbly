# jobbly-change-log-24.md
### Jobbly — Change Log 24

---

## Change 1 — Simplify Admin Calendar View

### Context

The calendar was built around a slot-based booking system that is no longer used. The subcontractor now simply enters a job date on the lead. The calendar should be simplified to reflect this — showing how many jobs are booked on each day based on confirmed lead dates, with no slot management.

---

### Step 1 — Remove slot-based calendar logic

Remove any rendering logic tied to booking availability slots. The calendar no longer needs to display or reference slots.

---

### Step 2 — Render job counts from lead data

Replace slot data with a query that fetches all leads where:
- Status is `BOOKED` or later (i.e. a job date has been set)
- A job date (`jobDate` or equivalent field) exists on the record

Group leads by job date. For each date that has at least one lead, display a badge or indicator on the calendar showing the count — e.g. "2 jobs".

Clicking a date can remain as-is or simply do nothing for now — the main goal is the count being visible at a glance.

---

### Step 3 — Verify

- [ ] Calendar loads without errors
- [ ] Dates with booked jobs show the correct job count
- [ ] Dates with no jobs show nothing
- [ ] Rescheduled jobs (updated job date) reflect correctly

---

## Change 2 — Clean Up Admin Settings Page

### Context

The admin Settings page has several cards that are no longer relevant to the current workflow. This change removes the legacy cards, renames the invoicing section, restructures the payment options, and adds an auto-send toggle to the invoice reminder.

---

### Step 1 — Remove Job Types card

Remove the Job Types card from the admin Settings page entirely. Also remove any associated API routes or database queries that exist solely to support this card, if they are no longer used elsewhere.

---

### Step 2 — Remove Booking Availability card

Remove the Booking Availability (Section 5b) card from the admin Settings page entirely. Also remove any associated API routes or database queries that exist solely to support this card, if they are no longer used elsewhere.

---

### Step 3 — Rename "Stripe & Invoicing" to "Invoicing"

Find the Stripe & Invoicing card on the admin Settings page and rename its heading to **Invoicing**.

---

### Step 4 — Add payment method selector

Below the "Invoicing" heading, add a section labelled **Payment Method** with three options displayed as selectable cards or buttons:

1. **Stripe** — functional, shows connected state if already connected
2. **MYOB** — "Coming soon" badge, non-interactive
3. **Xero** — "Coming soon" badge, non-interactive

When Stripe is selected (default if already connected), the existing Stripe connection UI displays below — connected status, billing email, verified date, and Disconnect button — exactly as it does now.

MYOB and Xero options are visually present but disabled. Clicking them does nothing. Each shows a "Coming soon" label so the intent is clear without implying functionality.

---

### Step 5 — Add auto-send toggle to Invoice Reminder

Below the existing invoice reminder day selector, add a toggle labelled **Automatically send invoice on this date**.

Behaviour:
- **Toggle ON** — on the selected day each month, the invoice is generated and sent automatically via Stripe (or active payment method) without any manual action required
- **Toggle OFF** (default) — on the selected day, a reminder email is sent to the admin prompting them to review and send manually

The toggle state must be saved to the database alongside the existing reminder day preference. If no reminder day is set, the toggle is disabled and shows a helper note: "Set a reminder day above to enable auto-send."

Update the daily cron job that handles reminder emails to check this toggle — if auto-send is on, trigger the invoice send instead of the reminder email.

---

### Step 6 — Verify

- [ ] Job Types card is gone
- [ ] Booking Availability card is gone
- [ ] Section heading reads "Invoicing"
- [ ] Stripe shows as selected and connected with existing UI intact
- [ ] MYOB and Xero show as "Coming soon" and are non-interactive
- [ ] Auto-send toggle saves correctly
- [ ] Toggle OFF → reminder email fires on the set date
- [ ] Toggle ON → invoice sends automatically on the set date
- [ ] If no reminder day is set, toggle is disabled

---

## Change 3 — Simplify Client Financials View

### Context

The client Financials page currently shows a By Month / Reconciled Batches tab structure designed for a B2B reconciliation workflow. Since this is a B2C model where jobs are invoiced individually, the view should be simplified to show invoice status clearly — what's been sent, what's been paid.

---

### Step 1 — Replace tabs

Replace the existing **By Month** and **Reconciled Batches** tabs with two new tabs:

- **Unpaid** — invoices that have been sent but not yet paid
- **Paid** — invoices that have been paid

---

### Step 2 — Update table columns

The table under each tab should show the following columns only:

| Quote # | Customer | Margin (ex GST) | Sent | Paid |
|---|---|---|---|---|

- **Sent** — yes/no or a date if available
- **Paid** — yes/no or a date if available
- Remove the Address column

Each row is clickable and navigates to the corresponding lead detail page, consistent with the rest of the platform.

---

### Step 3 — Verify

- [ ] Unpaid tab shows only invoices not yet paid
- [ ] Paid tab shows only paid invoices
- [ ] Columns are Quote #, Customer, Margin (ex GST), Sent, Paid
- [ ] Address column is gone
- [ ] Clicking a row navigates to the lead page
- [ ] Date range filter at top right still works and filters correctly across both tabs
- [ ] Admin-side Financials is not affected — this change is client view only

---

## Build Order

1. Simplify calendar — remove slot logic, render job counts from lead data (Change 1)
2. Remove Job Types card from admin Settings (Change 2, Step 1)
3. Remove Booking Availability card from admin Settings (Change 2, Step 2)
4. Rename "Stripe & Invoicing" to "Invoicing" (Change 2, Step 3)
5. Add payment method selector with Stripe active, MYOB and Xero as coming soon (Change 2, Step 4)
6. Add auto-send toggle to invoice reminder (Change 2, Step 5)
7. Update client Financials tabs and table columns (Change 3)
8. Verify all checklist items across all three changes
9. Bump version — MINOR
10. Commit: `vX.X.0 — simplify calendar, clean up admin settings, restructure client financials`
11. Push to GitHub: `git push origin main`
12. Run Vibstr build report per CLAUDE.md
