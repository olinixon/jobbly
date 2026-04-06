# Jobbly — Change Log Prompt 4
### Ongoing changes — paste into Claude Code when ready to build

Read this entire document before touching a single file. Build all changes listed here in a single session in the order specified. Do not skip any item. Each change gets its own commit, push to GitHub, and Vibstr report — do not batch them into one commit at the end. Stop and ask if anything is unclear before proceeding.

---

## Build Order — Follow This Sequence Exactly

Complete the Pre-Flight check first, then build each change in this order:

1. **Change 43** — Fix webhook handler type conversions and phone normalisation *(fix the crashing webhook first — everything else builds on top of a working handler)*
2. **Change 40** — Add gutter guards and storey count fields to lead record *(schema, mapping, handler, UI)*
3. **Change 41** — Phone number normalisation *(utility file may already exist from Change 43 — check before creating)*
4. **Change 42** — Per-campaign customer email sender address *(campaign schema, settings UI, email helper)*

After each change: bump `package.json` version, commit with the message specified in that change's build order, run `git push origin main`, and run the Vibstr build report per CLAUDE.md. Do not skip any of these steps for any change.

---

## Pre-Flight Check — Required Before Starting

Before writing a single line of code, complete these checks in order:

**1. Read CLAUDE.md**
Confirm the Vibstr reporting command, versioning rules, and coding standards are loaded into context before proceeding.

**2. Inspect the Lead model in Prisma schema**
Open `prisma/schema.prisma` and confirm the current fields on the `Lead` model. Specifically check whether `gutter_guards`, `storey_count`, `property_storeys` (Int?), `property_perimeter_m` (Float?), and `property_area_m2` (Float?) already exist and note their exact types — you will need this for both Change 43 (type fixes) and Change 40 (new fields).

**3. Inspect the Campaign model in Prisma schema**
In the same file, check the `Campaign` model. Confirm whether `customer_from_email` and `customer_from_name` already exist — if they do, do not add them again in Change 42.

**4. Inspect the webhook handler**
Open the webhook handler at `/app/api/webhooks/lead/route.ts` (or wherever the webhook POST handler lives — confirm the actual path first). Read it fully before making any changes. Note every field being passed to `prisma.lead.create()` and its current form — raw string, number, or already converted. This is critical for Change 43.

**5. Inspect `/lib/webhookFieldMap.ts`**
Open the file and read its current contents. Understand the existing mapping structure before adding new entries in Change 40.

**6. Identify the lead detail views**
Locate the component or page that renders lead detail for ADMIN and CLIENT roles (likely `/app/leads/[quoteNumber]/page.tsx`) and for the SUBCONTRACTOR role (likely `/app/jobs/[quoteNumber]/page.tsx`). Confirm both paths — you will need them for Change 40's UI step.

Only after all six checks pass — begin building in the order listed above.

---

## Change 40 — Add Gutter Guards & Storey Count Fields to Lead Record

### Background

The n8n webhook payload already sends two additional property fields with every new lead. Jobbly is currently not capturing or storing these fields — they arrive in the payload but are silently ignored. This change adds full support for both fields end-to-end: schema, webhook mapping, webhook handler, and UI display.

These fields are relevant to quote preparation. Frank and the admin need to see them when reviewing a lead so they can price the job accurately. Gutter guards add time and complexity to the clean. Storey count affects safety requirements and job difficulty.

### The two new fields

| Internal field name | Incoming webhook field name | Type | Possible values | Purpose |
|---|---|---|---|---|
| `gutter_guards` | `gutter_guards` | `String?` | `"Yes"` / `"No"` | Whether the property has gutter guards installed — affects quote price and job complexity |
| `storey_count` | `property_storeys` | `String?` | `"1"` / `"2"` / `"Unsure"` | Number of storeys on the property — affects safety requirements and job difficulty |

**Important note on `storey_count` vs `property_storeys`:**
The existing webhook spec already references `property_storeys` as the n8n field name for storey data, and the existing `webhookFieldMap.ts` already maps `"storeys"` and `"floors"` to `"property_storeys"`. This change introduces a dedicated internal field called `storey_count` specifically for this data — separate from any legacy mapping. Add `"property_storeys"` as a new mapping entry pointing to `"storey_count"` so the incoming payload field name is correctly routed to the new dedicated field.

---

### Step 1 — Prisma schema: add two new fields to the `Lead` model

Open `prisma/schema.prisma`. In the `Lead` model, add the following two fields. Place them logically near the other property fields (e.g. near `property_perimeter_m`, `property_area_m2`):

```prisma
gutter_guards   String?   // "Yes" or "No" — whether the property has gutter guards installed
storey_count    String?   // "1", "2", or "Unsure" — number of storeys on the property
```

Both fields are optional (`String?`) — they will be null if not provided in the webhook payload. Do not make them required. Do not add any default value.

After adding the fields, run the Prisma migration:

```bash
npx prisma migrate dev --name add_gutter_guards_storey_count
```

Confirm the migration runs without errors before proceeding to Step 2. If it fails, stop and resolve the migration error before continuing.

---

### Step 2 — Webhook field map: add new mappings to `/lib/webhookFieldMap.ts`

Open `/lib/webhookFieldMap.ts`. Add the following two new entries to the mapping object:

```typescript
"gutter_guards": "gutter_guards",       // n8n sends "gutter_guards" → maps to internal "gutter_guards"
"property_storeys": "storey_count",     // n8n sends "property_storeys" → maps to internal "storey_count"
```

**Do not remove any existing entries.** Only add these two new lines. The existing `"storeys"` and `"floors"` entries that currently map to `"property_storeys"` can remain — they are legacy fallbacks and do not conflict with the new mapping.

The file after your additions should contain both the existing entries and the two new ones. The order of entries within the object does not matter.

---

### Step 3 — Webhook handler: write the new fields to the lead record on creation

Open the webhook handler at `/app/api/webhooks/lead/route.ts` (confirm the actual path first — it may differ).

The handler receives the incoming payload, runs it through the field map, and then constructs a `data` object that is passed to `prisma.lead.create()`. You need to add `gutter_guards` and `storey_count` to that `data` object so they are written to the database when the lead is created.

Find the section of the handler where existing optional fields like `property_perimeter_m`, `property_area_m2`, and `property_storeys` are pulled from the mapped payload and added to the Prisma create call. Add the two new fields in the same pattern:

```typescript
gutter_guards: mappedPayload.gutter_guards ?? null,
storey_count: mappedPayload.storey_count ?? null,
```

Use whatever variable name holds the mapped payload — match the existing pattern exactly. Do not change how any existing field is handled. Only add the two new lines.

After this change, any incoming webhook payload that includes `gutter_guards` and/or `property_storeys` will have those values stored on the lead record in the database.

---

### Step 4 — Lead detail UI: display both fields on the lead detail page

Both fields must be visible to anyone who can see the full customer/property details on a lead. Based on the current role structure in Jobbly, this means:

- **ADMIN** — on the lead detail page at `/leads/[quoteNumber]`
- **CLIENT** — on the lead detail page at `/leads/[quoteNumber]` (CLIENT shares this view or a variant of it)
- **SUBCONTRACTOR** — on the job detail page at `/jobs/[quoteNumber]`

All three roles need to see these fields because they all interact with the lead record and need full property information to do their job. Add them to every lead/job detail view that currently shows property details.

#### Where to place the fields in the UI

Locate the section of the lead detail page that shows property information. This will likely include fields like property address, Google Maps link, perimeter, area, and storeys. Add `gutter_guards` and `storey_count` to this same section — they belong with the property data, not with financial data or status information.

Place them in this order within the property section:
1. Property address (existing)
2. Google Maps link (existing)
3. Property perimeter (existing, if shown)
4. Property area (existing, if shown)
5. **Storey count** ← new
6. **Gutter guards** ← new

#### Labels and display format

Display each field as a labelled row, matching the visual style of existing property fields on the page.

**Storey count:**
- Label: `Storeys`
- Value: display the raw stored value — `"1"`, `"2"`, or `"Unsure"`
- If null: display `"—"` (em dash) — do not show "null" or leave blank

**Gutter guards:**
- Label: `Gutter Guards`
- Value: display the raw stored value — `"Yes"` or `"No"`
- If null: display `"—"` (em dash) — do not show "null" or leave blank

#### Null safety

Both fields will be null on any lead that was created before this change was deployed, and on any lead where the webhook payload did not include these values. The UI must handle null gracefully — show `"—"` rather than throwing an error or rendering an empty cell.

#### Do not create new components

Add these fields inline within the existing property section of the lead detail page. Do not create a new component just for two fields. Do not restructure the layout — add them into the existing structure.

---

### What does NOT change

- No changes to the lead table/list views — these fields do not need to appear as columns in the leads table. They are detail-level data, not summary data.
- No changes to the commission page, reconciliation, PDF export, notifications, or audit log.
- No changes to the campaign settings page.
- No changes to how quote numbers are generated, how financial fields are calculated, or how status transitions work.
- No changes to the Google Sheet backup — that is configured entirely in n8n and is outside Jobbly's scope.
- No changes to any other existing field mappings in `webhookFieldMap.ts`.

---

### Testing checklist

After completing all four steps, verify the following before committing:

- [ ] `npx prisma migrate dev` ran successfully — no migration errors
- [ ] `npx prisma studio` (or equivalent) confirms `gutter_guards` and `storey_count` columns exist on the `leads` table
- [ ] Sending a test webhook payload (via curl or Postman) with `gutter_guards: "Yes"` and `property_storeys: "2"` creates a lead with those values stored correctly
- [ ] Sending a test payload without those fields creates a lead with `null` for both — no error thrown
- [ ] Admin lead detail page shows "Storeys: 2" and "Gutter Guards: Yes" for a lead that has both values
- [ ] Admin lead detail page shows "Storeys: —" and "Gutter Guards: —" for a lead with null values
- [ ] Client lead detail page shows the same fields in the same position
- [ ] Subcontractor job detail page shows the same fields in the same position
- [ ] No TypeScript errors — run `npx tsc --noEmit` and confirm clean

---

### Build order for this change

Follow this order exactly:

1. Confirm Pre-Flight checks are complete and webhook handler type fixes from Change 43 are in place
2. Add fields to Prisma schema and run migration
3. Add mappings to `webhookFieldMap.ts`
4. Update webhook handler to write both fields on lead creation — use `toStringOrNull()` from the handler (already defined in Change 43) rather than bare `?? null`
5. Update admin/client lead detail page to display both fields
6. Update subcontractor job detail page to display both fields
7. Run the testing checklist above
8. Bump version in `package.json` — PATCH bump
9. Commit: `v[X.X.X] — add gutter_guards and storey_count to lead record, webhook mapping, and lead detail views`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md — replace the `output` field with a plain-English summary of what was built in this change

---

## Change 41 — Phone Number Normalisation on Webhook Receipt

### Background

Phone numbers arrive in the `customer_phone` field from the n8n webhook in inconsistent formats. The AI voice agent collects numbers from New Zealand customers, and the format varies depending on how the customer stated it and how n8n transcribed it. Numbers currently arrive in at least three different formats:

- `021 123 4567` — local format with leading zero
- `6421 123 4567` — country code without plus sign
- `+6421 123 4567` — already fully normalised

Jobbly must store all phone numbers in a single consistent format: E.164-compatible with a `+64` prefix (e.g. `+6421 123 4567`). This ensures numbers are consistent in the database, display correctly in the UI, and work correctly if they are ever passed to an SMS or calling service.

This normalisation must happen **inside the webhook handler, before the lead record is created** — not at display time, not in the field map. The value written to the database must already be normalised.

---

### Note on build order

`/lib/normalisePhone.ts` is created as part of Change 43 earlier in this session. By the time you reach this change, the file already exists and the function is already wired into the webhook handler. The purpose of this change entry is to confirm the implementation is correct, verify it against the full testing checklist, and ensure it has its own commit and Vibstr entry. Do not recreate the file — check it exists, review the implementation against the spec below, and proceed to the testing checklist.

---

Apply these rules in order. Only the first matching rule applies — do not apply multiple rules to the same number.

| Incoming format | Rule | Example in | Example out |
|---|---|---|---|
| Starts with `+` | Already normalised — leave unchanged | `+6421 123 4567` | `+6421 123 4567` |
| Starts with `64` | Prepend `+` | `6421 123 4567` | `+6421 123 4567` |
| Starts with `0` | Replace leading `0` with `+64` | `021 123 4567` | `+6421 123 4567` |
| Anything else | Leave unchanged — do not attempt to normalise | `021-123-4567` | `021-123-4567` (stored as-is, no error) |

The fourth case (anything else) is a safety net. Do not throw an error, do not drop the lead, and do not null the phone number if the format is unrecognised. Store whatever arrived, unchanged. The lead will be created normally — if the number looks unusual, Frank or the admin will see it and can correct it manually.

---

### Step 1 — Write a phone normalisation utility function

Create a new utility file at `/lib/normalisePhone.ts`.

The function signature must be:

```typescript
export function normalisePhone(raw: string | null | undefined): string | null {
```

The function must:
1. Return `null` immediately if `raw` is null, undefined, or an empty string after trimming
2. Trim leading and trailing whitespace from `raw` before applying any rules
3. Apply the normalisation rules in the order listed in the table above
4. Return the normalised string

The full implementation:

```typescript
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null;

  const trimmed = raw.trim();

  if (trimmed.startsWith('+')) {
    // Already in correct format
    return trimmed;
  }

  if (trimmed.startsWith('64')) {
    // Country code present but missing the plus — prepend it
    return '+' + trimmed;
  }

  if (trimmed.startsWith('0')) {
    // Local format — replace leading 0 with +64
    return '+64' + trimmed.slice(1);
  }

  // Unrecognised format — return as-is, do not error
  return trimmed;
}
```

Do not add any logging inside this function. Do not import any external libraries — this is pure string manipulation with no dependencies.

---

### Step 2 — Call the normalisation function in the webhook handler

Open the webhook handler at `/app/api/webhooks/lead/route.ts` (confirm the actual file path first — match whatever path was confirmed in the Change 40 pre-flight).

After the incoming payload has been processed through the field map (so `customer_phone` has already been resolved from whatever n8n field name was used), and **before** the `prisma.lead.create()` call, apply the normalisation:

```typescript
import { normalisePhone } from '@/lib/normalisePhone';

// After field mapping, before prisma.lead.create:
const normalisedPhone = normalisePhone(mappedPayload.customer_phone);
```

Then use `normalisedPhone` in place of `mappedPayload.customer_phone` when constructing the Prisma create data object:

```typescript
customer_phone: normalisedPhone,
```

**Do not change anything else in the webhook handler.** Only the `customer_phone` value is affected by this change. All other fields are written exactly as before.

---

### What does NOT change

- No changes to the Prisma schema — `customer_phone` is already a `String?` field and stays that way
- No changes to `webhookFieldMap.ts` — field name mapping is unchanged
- No changes to the UI — the normalised number is stored in the database and will display correctly wherever it already appears
- No changes to any other field in the webhook handler
- No changes to how existing leads are stored — this normalisation only applies at the point of creation. Leads already in the database are not backfilled. If a backfill is needed later, that is a separate change.
- No changes to how `customer_phone` is displayed in the UI — it renders whatever is in the database, which will now be normalised

---

### Testing checklist

After completing both steps, verify the following before committing:

- [ ] `/lib/normalisePhone.ts` exists and exports `normalisePhone`
- [ ] `normalisePhone(null)` returns `null`
- [ ] `normalisePhone('')` returns `null`
- [ ] `normalisePhone('021 123 4567')` returns `'+6421 123 4567'`
- [ ] `normalisePhone('6421 123 4567')` returns `'+6421 123 4567'`
- [ ] `normalisePhone('+6421 123 4567')` returns `'+6421 123 4567'` (unchanged)
- [ ] `normalisePhone('  021 456 7890  ')` returns `'+6421 456 7890'` — leading/trailing whitespace trimmed, internal spaces preserved
- [ ] Sending a test webhook payload with `customer_phone: "021 999 8888"` creates a lead with `customer_phone: "+6421 999 8888"` in the database
- [ ] Sending a test payload with `customer_phone: "6421 999 8888"` creates a lead with `customer_phone: "+6421 999 8888"`
- [ ] Sending a test payload with `customer_phone: "+6421 999 8888"` stores it unchanged
- [ ] Sending a test payload with `customer_phone: null` creates a lead with `customer_phone: null` — no error
- [ ] No TypeScript errors — run `npx tsc --noEmit` and confirm clean

---

### Build order for this change

Follow this order exactly:

1. Create `/lib/normalisePhone.ts` with the utility function
2. Import and call `normalisePhone` in the webhook handler
3. Run the testing checklist above
4. Bump version in `package.json` — PATCH bump
5. Commit: `v[X.X.X] — normalise customer_phone to +64 format on webhook receipt`
6. Push to GitHub: `git push origin main`
7. Run Vibstr build report per CLAUDE.md — replace the `output` field with a plain-English summary of what was built in this change

---

## Change 42 — Per-Campaign Customer Email Sender Address

### Background

Currently all emails sent by Jobbly — whether to customers, Frank, or Oli — use the single `EMAIL_FROM` environment variable as the sender address. This means quote emails, booking confirmations, and follow-up reminders all arrive in a customer's inbox from `oli@omnisideai.com` (or whatever `EMAIL_FROM` is set to). This is wrong for customer-facing emails — customers should see the email coming from the business they've dealt with, not from Omniside AI's internal address.

This change introduces a per-campaign sender identity specifically for customer-facing emails. The campaign stores a `customer_from_email` and `customer_from_name` that is used as the `from` address on all outbound emails to customers. All internal and operational emails (to Frank, to Oli, new user welcome emails) continue to use `EMAIL_FROM` unchanged.

If the campaign does not have a `customer_from_email` configured, the system falls back to `EMAIL_FROM` automatically — nothing breaks, no email fails to send.

---

### Which emails this affects

| Email | Recipient | Current sender | After this change |
|---|---|---|---|
| Quote email (initial + follow-ups) | Customer | `EMAIL_FROM` | Campaign `customer_from_email` (fallback: `EMAIL_FROM`) |
| Booking confirmation | Customer | `EMAIL_FROM` | Campaign `customer_from_email` (fallback: `EMAIL_FROM`) |
| New lead notification | Frank / subcontractor | `EMAIL_FROM` | Unchanged — stays as `EMAIL_FROM` |
| Job completed notification | Oli | `EMAIL_FROM` (via `EMAIL_OLI`) | Unchanged |
| New user welcome email | New user | `EMAIL_FROM` | Unchanged |
| Missing customer email alert | Oli | `EMAIL_FROM` | Unchanged |

The rule is simple: **if the recipient is a customer, use the campaign sender. If the recipient is internal (Oli, Frank, a new Jobbly user), use `EMAIL_FROM`.**

---

### Step 1 — Add two new fields to the Campaign model in Prisma

Open `prisma/schema.prisma`. In the `Campaign` model, add the following two fields:

```prisma
customer_from_email  String?   // e.g. "hello@continuousgroup.co.nz" — sender address for customer emails
customer_from_name   String?   // e.g. "Continuous Group" — display name shown to customers in their inbox
```

Both fields are optional (`String?`). Do not set a default value on either — the fallback logic is handled in code, not at the schema level.

After adding the fields, run the migration:

```bash
npx prisma migrate dev --name add_campaign_customer_from_email
```

Confirm the migration runs without errors before proceeding.

---

### Step 2 — Write a helper function to resolve the customer sender address

Create a new utility file at `/lib/getCustomerFromAddress.ts`.

This function takes a campaign object and returns the correct Resend-formatted `from` string for customer-facing emails. If the campaign has a `customer_from_email` set, it uses that. If not, it falls back to the `EMAIL_FROM` environment variable.

```typescript
interface CampaignEmailConfig {
  customer_from_email?: string | null;
  customer_from_name?: string | null;
}

export function getCustomerFromAddress(campaign: CampaignEmailConfig): string {
  const email = campaign.customer_from_email?.trim();
  const name = campaign.customer_from_name?.trim();

  if (email) {
    // Has a configured customer sender — use it
    return name ? `${name} <${email}>` : email;
  }

  // No campaign sender configured — fall back to the environment default
  const fallback = process.env.EMAIL_FROM;
  if (!fallback) {
    throw new Error('EMAIL_FROM environment variable is not set — cannot send customer email');
  }

  return fallback;
}
```

This function must never silently swallow a missing `EMAIL_FROM`. If neither the campaign address nor `EMAIL_FROM` is set, it throws — so the issue surfaces immediately rather than causing a silent send failure.

---

### Step 3 — Update all customer-facing email send calls to use the helper

Locate every place in the codebase where an email is sent **to a customer**. Based on the current email architecture, this includes:

1. **Initial quote email** — triggered when a quote is uploaded (Phase 3 email infrastructure, `P3.3`)
2. **24-hour quote reminder** — scheduled follow-up (`P3.4`)
3. **Final quote reminder** — scheduled follow-up (`P3.4`)
4. **Booking confirmation to customer** — triggered when customer confirms booking (`P3.6`)

For each of these, the send call currently uses `process.env.EMAIL_FROM` (or a hardcoded equivalent) as the `from` field in the Resend call. Replace that with a call to `getCustomerFromAddress(campaign)`.

To do this, the email send function needs access to the campaign record. In most cases the campaign is already in scope (it is required to look up pricing and other lead data). If the campaign object is not already available at the point of the email send, fetch it from the database using the `campaign_id` on the lead record — do not pass the campaign ID down through multiple layers. Fetch it close to where the email is sent.

Example pattern for updating a Resend send call:

```typescript
import { getCustomerFromAddress } from '@/lib/getCustomerFromAddress';

// Before:
from: process.env.EMAIL_FROM,

// After:
from: getCustomerFromAddress(campaign),
```

**Do not change the `from` field on any internal email send.** Only customer-recipient emails are affected.

---

### Step 4 — Add a customer email sender section to the Campaign Settings page

Open the Campaign Settings page (`/settings`). Add a new section between the existing sections. Based on the current settings page structure (General, Commission & Pricing, Campaign Status, Danger Zone), insert this as **Section 2 — Customer Emails**, pushing Commission & Pricing to Section 3.

**Section title:** "Customer Emails"

**Description text** (shown as a subtitle below the section heading):
"The sender name and email address that customers see when they receive quotes and booking confirmations. If left blank, emails will be sent from the default Jobbly address."

**Fields:**

| Field | Label | Input type | Placeholder |
|---|---|---|---|
| `customer_from_name` | Sender name | Text | `e.g. Continuous Group` |
| `customer_from_email` | Sender email address | Email | `e.g. hello@continuousgroup.co.nz` |

**Preview line** (shown below the two inputs, updates live as the user types):
```
Emails will be sent from: Continuous Group <hello@continuousgroup.co.nz>
```
If either field is empty, the preview reads:
```
Emails will be sent from: [default — oli@omnisideai.com]
```
The preview is purely informational — not an editable field.

**Save button:** "Save Email Settings"

**On success:** Inline "Settings saved." confirmation — same pattern as other settings sections.

**Validation:**
- `customer_from_email`, if provided, must be a valid email address format — reject with "Please enter a valid email address" if not
- `customer_from_name` has no validation — any non-empty string is acceptable
- Both fields can be cleared (saved as null) — this is valid and means the fallback kicks in

**API:** The existing `PATCH /api/campaigns/[id]` endpoint must accept and save `customer_from_email` and `customer_from_name` as part of its partial update logic. No new endpoint needed.

**Access:** ADMIN only. CLIENT and SUBCONTRACTOR users do not see this section.

---

### Important — Resend domain verification requirement

Add a comment in the code near the `getCustomerFromAddress` function (and/or in the settings UI as a helper note) reminding that any custom sender domain must be verified in Resend before emails will send successfully. This is not something Jobbly can automate — it requires a one-time DNS setup in both the Resend dashboard and the domain's DNS settings.

Add a small helper note below the email settings fields in the UI:

> ⚠️ **Important:** The sender domain must be verified in Resend before emails will send from this address. Contact Oli to set this up before saving a new address.

This note is always visible when the section is open — not just on hover or error.

---

### What does NOT change

- `EMAIL_FROM` environment variable — still used for all internal/operational emails, and as the fallback for customer emails when `customer_from_email` is not set
- `EMAIL_FRANK` and `EMAIL_OLI` — unchanged, these are recipient addresses, not sender addresses
- The content of any email — only the `from` field changes
- Any email sent to Frank, Oli, or a new Jobbly user — these always use `EMAIL_FROM`
- The webhook handler — no changes needed there for this feature
- The email scheduling / cron logic — no structural changes, only the `from` field in the send call

---

### Testing checklist

After completing all four steps, verify the following before committing:

- [ ] Migration ran successfully — `customer_from_email` and `customer_from_name` columns exist on the `campaigns` table
- [ ] `getCustomerFromAddress({ customer_from_email: 'hello@example.com', customer_from_name: 'Test Co' })` returns `'Test Co <hello@example.com>'`
- [ ] `getCustomerFromAddress({ customer_from_email: 'hello@example.com', customer_from_name: null })` returns `'hello@example.com'`
- [ ] `getCustomerFromAddress({ customer_from_email: null, customer_from_name: null })` returns the value of `EMAIL_FROM` from the environment
- [ ] Campaign Settings page shows the new "Customer Emails" section for admin users
- [ ] CLIENT and SUBCONTRACTOR users do not see the Customer Emails section in Settings
- [ ] Saving a valid name and email updates the campaign record correctly
- [ ] Saving with both fields blank clears both to null — no error
- [ ] Preview line updates live as the user types
- [ ] Invalid email format is rejected with inline error before saving
- [ ] Resend warning note is visible in the settings section
- [ ] Sending a test quote email (where campaign has `customer_from_email` set) shows the campaign address as the sender in the received email
- [ ] Sending a test quote email (where `customer_from_email` is null) falls back to `EMAIL_FROM` — no error thrown
- [ ] New lead notification to Frank still uses `EMAIL_FROM` — not affected by this change
- [ ] Job completed notification to Oli still uses `EMAIL_FROM` — not affected
- [ ] No TypeScript errors — run `npx tsc --noEmit` and confirm clean

---

### Build order for this change

Follow this order exactly:

1. Add `customer_from_email` and `customer_from_name` to Prisma Campaign model and run migration
2. Create `/lib/getCustomerFromAddress.ts` utility function
3. Update all customer-facing email send calls to use the helper
4. Add Customer Emails section to Campaign Settings page
5. Update `PATCH /api/campaigns/[id]` to accept and save the two new fields
6. Run the testing checklist above
7. Bump version in `package.json` — MINOR bump (new user-facing feature)
8. Commit: `v[X.X.0] — add per-campaign customer email sender with fallback to EMAIL_FROM`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md — replace the `output` field with a plain-English summary of what was built in this change

---

## Change 43 — Fix Webhook Handler: Field Type Conversions and Phone Normalisation

### Background

The webhook handler at `/api/webhooks/lead` is crashing with `PrismaClientValidationError` on receipt of real payloads from n8n. Leads are not being created when this occurs. This change is listed first in the build order because Changes 40 and 41 both make further edits to the webhook handler — those changes must land on top of a working, stable handler.

---

### Background

The webhook payload from n8n arrives as raw JSON strings. The handler is currently passing some of those raw string values directly into `prisma.lead.create()` without converting them to the types Prisma expects. Prisma validates types strictly — passing a string like `"2 Stories"` to a field typed `Int?` throws `PrismaClientValidationError` and aborts the entire create call. The lead is lost.

There are three categories of problem to fix:

1. `property_storeys` — Prisma schema defines this as `Int?`, but the incoming value is a string like `"2 Stories"`, `"single"`, `"two-storey"`, `"Unsure"`, or `""`
2. Phone normalisation — `customer_phone` needs to be converted to `+64` format before storage (this overlaps with the utility function described in Change 41 — if Change 41 has already been built, import and use that function here rather than duplicating the logic)
3. Any other field where Prisma expects `Int`, `Float`, or `null` but may be receiving an empty string from the webhook payload

---

### Step 1 — Scan the webhook handler for all type mismatches

Before writing any fix, open the webhook handler and inspect every field being passed to `prisma.lead.create()`. Cross-reference each field against the Prisma schema type. Build a complete list of any field where the incoming value could be a string but Prisma expects a non-string type.

Pay specific attention to:
- Any field typed `Int?` — must receive an integer or `null`, never a string
- Any field typed `Float?` — must receive a float or `null`, never a string
- Any field typed `DateTime?` — must receive a valid Date object or `null`, never a raw string (unless Prisma handles ISO string coercion — check this)
- Any field typed `Boolean?` — must receive `true`/`false` or `null`, never `"true"` or `"false"` as a string

Do this scan first. Do not skip it. The goal is to fix all type issues in a single pass — not just `property_storeys` and phone.

---

### Step 2 — Fix `property_storeys` — extract integer from freeform string

The `property_storeys` field on the `Lead` model is typed `Int?`. The incoming webhook value is a freeform string that may describe the number of storeys in natural language. It must be converted to an integer before being passed to Prisma.

Write a helper function at `/lib/parseStoreys.ts`:

```typescript
export function parseStoreys(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  // If already a number, return it directly (guard against n8n sending a real int)
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }

  const str = String(raw).trim().toLowerCase();

  if (!str || str === 'unsure' || str === 'unknown' || str === 'not sure') return null;

  // Word-to-number mappings
  const wordMap: Record<string, number> = {
    'one': 1, 'single': 1, '1': 1, '1 stor': 1,
    'two': 2, 'double': 2, '2': 2, '2 stor': 2,
    'three': 3, 'triple': 3, '3': 3, '3 stor': 3,
    'split': 1,   // split-level treated as single storey for quoting
    'ground': 1,
  };

  // Check word map first (partial match — "single storey", "two storey", "split-level")
  for (const [key, value] of Object.entries(wordMap)) {
    if (str.includes(key)) return value;
  }

  // Last resort — extract the first digit from the string
  const match = str.match(/\d+/);
  if (match) {
    const n = parseInt(match[0], 10);
    return n > 0 ? n : null;
  }

  return null;
}
```

**Decision rationale for edge cases:**
- `"split-level"` → `1` — split-level properties quote as single storey for gutter cleaning purposes. If this assumption changes, update the word map.
- `"Unsure"` → `null` — stored as null, visible in the UI as `"—"`, Frank can assess on-site.
- Empty string `""` → `null` — treat as not provided.
- A real integer from n8n (if n8n ever sends `2` instead of `"2 Stories"`) → pass through directly.

Use this function in the webhook handler:

```typescript
import { parseStoreys } from '@/lib/parseStoreys';

property_storeys: parseStoreys(mappedPayload.property_storeys),
```

---

### Step 3 — Fix phone normalisation

Change 41 specifies the `normalisePhone` utility function. Create `/lib/normalisePhone.ts` now as part of this change — it is needed here and will be reused by Change 41. When you reach Change 41 later in this session, the file will already exist — skip straight to the testing checklist for that change.

```typescript
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null;

  const trimmed = raw.trim();

  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('64')) return '+' + trimmed;
  if (trimmed.startsWith('0')) return '+64' + trimmed.slice(1);

  return trimmed; // Unrecognised format — store as-is, never error
}
```

Apply in the webhook handler:

```typescript
import { normalisePhone } from '@/lib/normalisePhone';

customer_phone: normalisePhone(mappedPayload.customer_phone),
```

---

### Step 4 — Fix all other empty-string-to-null and string-to-number issues

After scanning the handler in Step 1, fix every other type mismatch found. The pattern for each is the same:

**Empty string → null (for any nullable field):**
Any optional field that Prisma stores as `String?`, `Int?`, or `Float?` must never receive an empty string `""`. An empty string is not the same as `null` in PostgreSQL — it will either throw a validation error or store a blank string when you intended null.

Write and use a small inline helper directly in the handler (no need for a separate file):

```typescript
const toStringOrNull = (val: unknown): string | null =>
  typeof val === 'string' && val.trim() !== '' ? val.trim() : null;

const toFloatOrNull = (val: unknown): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
};

const toIntOrNull = (val: unknown): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
};
```

Apply these to every field in the Prisma create call where the type requires it. For example:

```typescript
property_perimeter_m: toFloatOrNull(mappedPayload.property_perimeter_m),
property_area_m2:     toFloatOrNull(mappedPayload.property_area_m2),
property_storeys:     parseStoreys(mappedPayload.property_storeys),   // uses dedicated function
customer_phone:       normalisePhone(mappedPayload.customer_phone),    // uses dedicated function
customer_name:        toStringOrNull(mappedPayload.customer_name),
customer_email:       toStringOrNull(mappedPayload.customer_email),
customer_address:     toStringOrNull(mappedPayload.property_address),
call_id:              toStringOrNull(mappedPayload.call_id),
```

Apply the appropriate helper to every field. Do not leave any field as a raw `mappedPayload.*` pass-through unless you have confirmed its type matches exactly.

---

### Step 5 — Verify the handler never silently drops a lead on type error

Confirm the webhook handler has a top-level `try/catch` around the entire lead creation block. If `prisma.lead.create()` throws for any reason, the error must be:
1. Logged with the full error message and the incoming payload (masked if it contains sensitive data — but for debugging purposes, the raw payload is valuable)
2. Returned as a `500` response with `{ success: false, message: "Internal server error — lead not created" }`

The lead must never be silently dropped. If it cannot be created, Jobbly must respond with a non-2xx status so n8n knows to retry or alert.

If the existing handler does not have this error handling, add it now as part of this change.

---

### Relationship to Changes 40 and 41

- **Change 40** added `gutter_guards` (`String?`) and `storey_count` (`String?`) as new fields. Those are both strings and require no type conversion. `storey_count` is separate from the existing `property_storeys` (`Int?`) field — do not confuse them. `property_storeys` is the integer field that is crashing. `storey_count` is the new string field added in Change 40.
- **Change 41** specced the `normalisePhone` utility. This change builds it first. When Change 41 is reached, `/lib/normalisePhone.ts` will already exist — skip the file creation step and proceed directly to the testing checklist.
- **Change 42** — no overlap.

---

### What does NOT change

- The webhook endpoint URL, secret validation, or response format — unchanged
- The field mapping in `webhookFieldMap.ts` — unchanged
- The Prisma schema — no new fields, no migrations required for this change
- Any UI components — this is purely a webhook handler and utility layer fix

---

### Testing checklist

After completing all steps, verify the following before committing:

- [ ] `parseStoreys("2 Stories")` returns `2`
- [ ] `parseStoreys("single")` returns `1`
- [ ] `parseStoreys("two-storey")` returns `2`
- [ ] `parseStoreys("split-level")` returns `1`
- [ ] `parseStoreys("Unsure")` returns `null`
- [ ] `parseStoreys("")` returns `null`
- [ ] `parseStoreys(null)` returns `null`
- [ ] `parseStoreys(2)` returns `2` (real integer pass-through)
- [ ] `normalisePhone("021 123 4567")` returns `"+6421 123 4567"`
- [ ] `normalisePhone("6421 123 4567")` returns `"+6421 123 4567"`
- [ ] `normalisePhone("+6421 123 4567")` returns `"+6421 123 4567"`
- [ ] `normalisePhone(null)` returns `null`
- [ ] Sending a test webhook payload with `property_storeys: "2 Stories"` creates the lead successfully — no `PrismaClientValidationError`
- [ ] Sending a test payload with `property_storeys: "Unsure"` creates the lead with `property_storeys: null`
- [ ] Sending a test payload with all fields null or empty creates the lead with all optional fields as `null` — no error
- [ ] Sending a test payload with `property_perimeter_m: ""` creates the lead with `property_perimeter_m: null` — not an empty string
- [ ] Webhook returns `200` on success
- [ ] Webhook returns `500` (not a crash/unhandled exception) if Prisma throws unexpectedly
- [ ] No TypeScript errors — run `npx tsc --noEmit` and confirm clean

---

### Build order for this change

This is the first change to build in this session.

1. Scan the full webhook handler and Prisma schema — identify every type mismatch
2. Create `/lib/parseStoreys.ts`
3. Create `/lib/normalisePhone.ts` (if not already built from Change 41)
4. Update the webhook handler — apply all type conversions and the two utility functions
5. Confirm top-level error handling exists in the handler — add if missing
6. Run the testing checklist above
7. Bump version in `package.json` — PATCH bump
8. Commit: `v[X.X.X] — fix webhook handler type conversions, parseStoreys, phone normalisation`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md — replace the `output` field with a plain-English summary of what was built in this change

---

<!--
  ADD NEW CHANGES BELOW THIS LINE
  Format: ## Change 44 — [Title], then full spec
-->
