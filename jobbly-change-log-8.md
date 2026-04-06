# Jobbly — Change Log Prompt 8
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes in the order specified. Each change gets its own commit, GitHub push, and Vibstr report. Stop and ask if anything is unclear before proceeding.

---

## Build Order

1. **Change 72** — Fix "Booked X days ago" display issues on subcontractor views
2. **Change 73** — Reorganise subcontractor job detail page layout
3. **Change 74** — Improve app loading speed with skeletons, caching, and prefetching

After each change: bump `package.json` version, commit, run `git push origin main`, and run the Vibstr build report per CLAUDE.md.

---

## Pre-Flight Check

**1. Read CLAUDE.md**
Load versioning rules and Vibstr reporting command into context.

**2. Sync production database**
```bash
DATABASE_URL="postgresql://postgres.ziwjvyuomzcadbldzxnp:wyddyh-0goXdo-xychak@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" npx prisma db push
```
If in sync — proceed. If changes applied — confirm app loads before continuing. If error — stop and report.

**3. Locate the subcontractor job detail page**
Find `/app/jobs/[quoteNumber]/page.tsx` (confirm actual path). Read the full layout — identify where each card currently sits: Customer Details, Quote Options, Call Notes, Job Value, Show Activity on the left; Current Status, Invoice on the right. You will be restructuring this in Change 73.

**4. Locate the Jobs Booked page**
Find `/app/jobs-booked/page.tsx` (confirm actual path). Read how the "Booked" relative time column is currently calculated.

Only after all four checks pass — begin building.

---

## Change 72 — Fix "Booked X Days Ago" Display Issues

### What to fix

**Fix 1 — Remove from subcontractor job detail page**
The "Booked X days ago" muted text line currently appears on the subcontractor job detail page (`/jobs/[quoteNumber]`) below the booked date and time. Remove it entirely from this page. It should not appear here at all — only in the Jobs Booked table.

**Fix 2 — Fix the calculation on the Jobs Booked table**
The "Booked" column on `/jobs-booked` is showing negative values like "-2 days ago" for jobs booked today or recently. The bug is that the date comparison is using UTC, which puts the NZ date a day behind.

Fix the calculation to use `Pacific/Auckland` timezone:
- Compare today's date in NZ time against the booking date in NZ time
- Same day (NZ): show "Today"
- 1 day ago (NZ): show "Yesterday"
- 2+ days ago: show "[N] days ago"
- Never show a negative number — if the result is 0 or negative, show "Today"

The `formatNZDate` utility from `/lib/formatDate.ts` already handles timezone conversion — use it or the same `Pacific/Auckland` logic when calculating the day difference.

---

### Testing checklist

- [ ] "Booked X days ago" line is gone from subcontractor job detail page
- [ ] Jobs Booked table "Booked" column shows "Today" for a job booked today
- [ ] No negative values in the "Booked" column
- [ ] "Yesterday" and "X days ago" display correctly
- [ ] No TypeScript errors

---

### Build order

1. Remove "Booked X days ago" line from subcontractor job detail page
2. Fix the "Booked" column calculation on Jobs Booked table to use `Pacific/Auckland`
3. Run testing checklist
4. Bump version — PATCH bump
5. Commit: `v[X.X.X] — remove booked days ago from job detail, fix timezone calculation on jobs booked table`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md

---

## Change 73 — Reorganise Subcontractor Job Detail Page Layout

### Background

The subcontractor job detail page layout currently places too many cards on the left column, making it feel unbalanced and requiring excessive scrolling. This change moves cards to mirror the admin layout more closely — operational cards on the right, information cards on the left.

---

### Current layout

**Left column:** Customer Details, Quote Options, Call Notes, Job Value, Show Activity

**Right column:** Current Status (with action buttons), Invoice

---

### New layout

**Left column:** Customer Details, Quote Options, Call Notes, Internal Notes ← new addition

**Right column:** Current Status (with action buttons), Invoice, Job Value ← moved from left, Show Activity ← moved from left

---

### Changes in detail

**1. Move "Job Value" card to the right column**
Remove it from the left column. Place it on the right column, directly below the Invoice card.

**2. Move "Show Activity" card to the right column**
Remove it from the left column. Place it on the right column, directly below the Job Value card.

**3. Add "Internal Notes" card to the left column**
Add an Internal Notes card to the left column, below the Call Notes card. This mirrors the admin lead detail page which already has Internal Notes.

The Internal Notes card on the subcontractor view:
- Label: "Internal Notes"
- Description: "Your own notes about this job."
- Editable textarea — auto-saves on blur via `PATCH /api/leads/[quoteNumber]` updating the `internal_notes` field
- Shows "Saved." confirmation that fades after 2 seconds — same as admin
- If `internal_notes` is null: show empty textarea with placeholder text "Add notes about this job..."

**Important:** `internal_notes` is already a field on the Lead model (added in Change 54). The subcontractor can write to it — unlike on the admin view where it was admin-only. On the subcontractor view, internal notes are editable by the subcontractor. The API must allow SUBCONTRACTOR role to update `internal_notes` — update the PATCH endpoint to permit this if it currently blocks subcontractors from writing to that field.

---

### What does NOT change

- The content inside any card — only position changes
- The Current Status card and its buttons — unchanged
- The Invoice card — unchanged
- Customer Details, Quote Options, Call Notes — content unchanged, just Call Notes moves to above Internal Notes
- Any admin or client views — untouched

---

### Testing checklist

- [ ] Left column shows: Customer Details, Quote Options, Call Notes, Internal Notes
- [ ] Right column shows: Current Status, Invoice, Job Value, Show Activity
- [ ] Internal Notes textarea auto-saves on blur
- [ ] "Saved." confirmation appears and fades
- [ ] Subcontractor can write to Internal Notes — PATCH accepted
- [ ] Admin and client views unaffected
- [ ] No TypeScript errors

---

### Build order

1. Restructure the two-column layout on the subcontractor job detail page
2. Move Job Value card to right column below Invoice
3. Move Show Activity card to right column below Job Value
4. Add Internal Notes card to left column below Call Notes
5. Update PATCH endpoint to allow SUBCONTRACTOR to write `internal_notes` if currently blocked
6. Run testing checklist
7. Bump version — PATCH bump
8. Commit: `v[X.X.X] — reorganise subcontractor job detail layout, add internal notes card`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Change 74 — Improve App Loading Speed

### Background

Page transitions currently take 4-5 seconds because every tab click triggers a full server-side data fetch from Supabase before anything renders. This change adds three improvements that together make the app feel significantly faster without changing any functionality.

---

### Improvement 1 — Loading skeleton screens

For every major page that currently shows a blank screen while loading, add a skeleton placeholder that renders instantly. The skeleton shows the page structure (cards, table rows, column headers) as grey placeholder shapes while the real data loads in the background. This makes the app feel instant even if data takes 2-3 seconds.

**Pages to add skeletons to:**
- `/dashboard` (admin, client, subcontractor)
- `/jobs` (subcontractor)
- `/jobs-booked` (subcontractor)
- `/leads` (admin, client) — if a separate leads list page exists
- `/calendar` (admin)
- `/leads/[quoteNumber]` and `/jobs/[quoteNumber]` — lead/job detail pages

**Skeleton style:**
Use Tailwind's `animate-pulse` class on grey placeholder divs that match the approximate shape of the real content. Example for a table row:

```tsx
// Table row skeleton
<div className="animate-pulse flex space-x-4 p-4 border-b">
  <div className="h-4 bg-gray-200 rounded w-24"></div>
  <div className="h-4 bg-gray-200 rounded w-48"></div>
  <div className="h-4 bg-gray-200 rounded w-32"></div>
</div>
```

Do not install any skeleton library — build with Tailwind only per the coding standards in CLAUDE.md.

---

### Improvement 2 — Next.js router cache and revalidation tuning

In Next.js App Router, server components refetch data on every navigation by default. Add `revalidate` export to pages where data does not need to be fresh on every single visit:

```typescript
// At the top of page files where data changes infrequently:
export const revalidate = 30; // revalidate every 30 seconds
```

Apply `revalidate = 30` to:
- Dashboard stat cards (financial totals)
- Commission page
- Calendar page

Do NOT apply revalidation to:
- Lead/job detail pages — these must always show current status
- The leads/jobs list table — must always show current data
- Any page involved in booking or status changes

---

### Improvement 3 — Prefetch sidebar navigation links

Next.js `<Link>` components prefetch the linked page when the link is visible in the viewport by default. Confirm all sidebar nav items use `<Link href="...">` from `next/link` rather than `<a href="...">` tags or `router.push()` calls. If any sidebar links are using `<a>` tags, convert them to `<Link>` so Next.js can prefetch them automatically.

This means when the user is on the dashboard, the sidebar links to Leads, Calendar, Commission etc. are being prefetched in the background — so clicking them loads near-instantly.

---

### What does NOT change

- Any data fetching logic or API routes
- Any functionality — this is purely a rendering performance improvement
- The database queries themselves

---

### Testing checklist

- [ ] Dashboard shows skeleton immediately on navigation — no blank screen
- [ ] Jobs Booked page shows skeleton immediately
- [ ] Lead/job detail pages show skeleton immediately
- [ ] After skeleton, real data loads correctly — no visual glitches
- [ ] Switching between dashboard tabs feels noticeably faster than before
- [ ] Sidebar links use `<Link>` not `<a>` tags
- [ ] `revalidate = 30` applied to appropriate pages
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order

1. Add skeleton components to all major pages listed above
2. Add `export const revalidate = 30` to appropriate pages
3. Audit sidebar nav links — convert any `<a>` tags to `<Link>` from `next/link`
4. Run testing checklist
5. Bump version — MINOR bump (noticeable user-facing improvement)
6. Commit: `v[X.X.0] — add loading skeletons, page revalidation, and link prefetching for faster navigation`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 75 — [Title], then full spec
-->
