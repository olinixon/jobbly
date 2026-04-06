# Jobbly — Change Log Prompt 9
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes in the order specified. Each change gets its own commit, GitHub push, and Vibstr report. Stop and ask if anything is unclear before proceeding.

---

## Build Order

1. **Change 76** — Admin: manual lead creation

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

**3. Locate the admin dashboard or leads list page**
Find where the lead table is rendered for the admin — likely `/app/dashboard/page.tsx` or `/app/leads/page.tsx` (confirm actual path). This is where the "+ Add Lead Manually" button will be added.

**4. Locate `/lib/normalisePhone.ts`**
Confirm this file exists and exports `normalisePhone`. It will be used inside the new API endpoint to format the phone number on submission.

**5. Locate `/lib/generateMapsUrl.ts`** (or equivalent)
Find the utility that generates Google Maps URLs from a property address string. This is used by the webhook handler on lead creation — the manual lead endpoint will use the same function.

Only after all five checks pass — begin building.

---

## Change 76 — Admin: Manual Lead Creation

### Background

All leads currently enter Jobbly via the n8n webhook. If the n8n workflow fails, crashes, or doesn't fire for any reason, there is no way to manually add that customer — they simply don't exist in Jobbly and the campaign data is incomplete. This change adds a manual lead creation form for the admin, so any missed leads can be entered by hand.

---

### Where to put it

On the admin dashboard or leads list page, add a button in the top right alongside any existing action buttons:

```
[+ Add Lead Manually]
```

Styled as a secondary button — not the primary brand accent colour. Clicking it opens a slide-over panel or modal form.

**Access:** ADMIN only. This button and form must not appear for CLIENT or SUBCONTRACTOR.

---

### The form

**Title:** "Add Lead Manually"
**Subtitle:** "Use this when a lead couldn't be captured automatically via the AI campaign."

**Fields:**

| Field | Label | Type | Required? | Notes |
|---|---|---|---|---|
| `quote_number` | Quote Number | Text | ✅ Yes | Must be unique — validate before saving. E.g. `QU00104` |
| `customer_name` | Customer Name | Text | ✅ Yes | Full name |
| `customer_phone` | Phone Number | Text | ✅ Yes | Normalise to +64 using `normalisePhone()` |
| `customer_email` | Email Address | Email | ✅ Yes | Required |
| `property_address` | Property Address | Text | ✅ Yes | Full address string |
| `gutter_guards` | Gutter Guards | Select | ✅ Yes | Options: Yes, No |
| `property_storeys` | Storeys | Select | No | Optional. Options: 1, 2, Unsure |
| `notes` | Call Notes | Textarea | No | Optional. Notes from the call or customer interaction |

No financial fields — contractor rate, pricing etc. come later via invoice upload.

**Required fields — form cannot submit without all of these:**
- Quote Number
- Customer Name
- Phone Number
- Email Address (must be valid email format)
- Property Address
- Gutter Guards (must select Yes or No — cannot leave blank)

**Optional fields — can be left empty:**
- Storeys
- Call Notes

---

### What happens on submit

1. Validate all required fields
2. Validate `quote_number` is unique — if duplicate, show inline error: "A lead with this quote number already exists."
3. Normalise `customer_phone` using `normalisePhone()` from `/lib/normalisePhone.ts`
4. Auto-generate `google_maps_url` from `property_address` using the same utility as webhook leads
5. Set `status` to `LEAD_RECEIVED`
6. Set `source` to `"manual"` — distinguishes manual leads from webhook leads in the database
7. Store `storey_count` from the storeys field (string: "1", "2", or "Unsure")
8. Store `gutter_guards` from the gutter guards field (string: "Yes" or "No")
9. Create the lead via `prisma.lead.create()`
10. Write to audit log: "Lead created manually by [admin name]"
11. Send new lead notification email to subcontractors — same email as webhook leads
12. Close the form and show success toast: "Lead created successfully."
13. Refresh the lead table

**Do NOT:**
- Auto-generate a quote number — the admin must provide one to match external records
- Send a customer email — no quote uploaded yet

---

### API endpoint

**`POST /api/leads/manual`**

- ADMIN only — return `403` for any other role
- Scoped to session campaign
- Validates, normalises, and creates the lead
- Triggers subcontractor notification email
- Returns `{ success: true, quote_number: "QU00104" }` on success
- Returns `{ success: false, message: "Quote number already exists" }` on duplicate

---

### Testing checklist

- [ ] "+ Add Lead Manually" button appears on admin leads page
- [ ] Button not visible to CLIENT or SUBCONTRACTOR
- [ ] Form opens as slide-over or modal
- [ ] Required field validation works — form cannot submit with missing fields
- [ ] Duplicate quote number shows inline error
- [ ] Phone normalised to +64 format
- [ ] Google Maps URL auto-generated
- [ ] Lead created with `status: LEAD_RECEIVED` and `source: "manual"`
- [ ] `storey_count` and `gutter_guards` stored correctly
- [ ] Audit log entry written
- [ ] Subcontractor notification email sent
- [ ] No customer email sent
- [ ] Lead appears in table immediately after creation
- [ ] Success toast shown
- [ ] `POST /api/leads/manual` returns `403` for non-admin roles
- [ ] No TypeScript errors — run `npx tsc --noEmit`

---

### Build order

1. Create `POST /api/leads/manual` endpoint
2. Add "+ Add Lead Manually" button to the admin leads page
3. Build the slide-over or modal form with all fields and validation
4. Wire form submission → API → success state (close, toast, refresh table)
5. Run testing checklist
6. Bump version — MINOR bump
7. Commit: `v[X.X.0] — add admin manual lead creation with subcontractor notification`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 77 — [Title], then full spec
-->
