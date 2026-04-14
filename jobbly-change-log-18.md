# Jobbly — Change Log 18
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Starter Prompt

Open the Jobbly project at `/Users/oliver/Claude Code/jobbly` and read this changelog in full before writing a single line of code. There are three changes in this session. Complete them in order. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

Each change gets its own commit, GitHub push, and Vibstr report — do not batch them into one commit at the end.

---

## Context

Three targeted fixes and improvements following live testing of the CL16 build. No new database migrations required. Read all three changes before starting.

---

## Pre-Flight Check — Required Before Starting

**1. Read CLAUDE.md**
Load versioning rules, coding standards, and the Vibstr reporting command into context.

**2. Read the current version**
Open `package.json` and note the current version. All three changes are **PATCH bumps** — increment the PATCH number for each.

**3. Locate and read these files before starting**

- `POST /api/jobs/[quoteNumber]/complete` — the Submit Job endpoint
- `POST /api/portal/[token]/create-checkout` — the Stripe Checkout Session endpoint
- The BillingProfile model and the Stripe verify endpoint (`POST /api/settings/stripe/verify`)
- The customer notification email send function — wherever it lives
- The Resend email utility

**4. Sync production database**

```bash
DATABASE_URL="postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres" npx prisma db push
```

If this reports any errors — stop and report to Oli before proceeding.

Only after all four checks pass — begin building in the order listed below.

---

## Change 1 — [BUG] Admin Cannot Trigger Submit Job — 403 Forbidden

### Background

The `POST /api/jobs/[quoteNumber]/complete` endpoint was built in CL16 with SUBCONTRACTOR-only access. When an ADMIN user taps "Submit Job" on a JOB_BOOKED lead, the server returns 403 Forbidden and nothing is submitted. This needs to be opened to ADMIN as well.

This is a **PATCH bump**.

---

### What to change

In `POST /api/jobs/[quoteNumber]/complete`:

- Find the role check that currently only permits SUBCONTRACTOR
- Update it to permit both ADMIN and SUBCONTRACTOR
- CLIENT must remain blocked — return 403 if the requesting user is CLIENT
- No other logic in this endpoint changes — only the role gate

Also check `POST /api/jobs/[quoteNumber]/complete` for any other places where the role is read and used to branch behaviour. If any logic currently only runs for SUBCONTRACTOR that should also run for ADMIN (e.g. auto-advancing status, writing the audit log), confirm it runs for both. Do not silently skip steps for ADMIN.

---

### Build order for Change 1

1. Locate the role check in `POST /api/jobs/[quoteNumber]/complete`
2. Update to allow ADMIN and SUBCONTRACTOR — block CLIENT
3. Verify no other SUBCONTRACTOR-only branches exist in the same endpoint that should also apply to ADMIN
4. Run `npx tsc --noEmit` — confirm no TypeScript errors
5. Apply PATCH version bump in `package.json`
6. Commit: `v[version] — allow admin to trigger Submit Job endpoint`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

---

## Change 2 — [BUG] Stripe Payment Link Shows "Not Yet Available" Despite Client Stripe Key Being Set

### Background

On the customer portal page (`/portal/[token]`), the "Pay Your Invoice" section shows "Payment link not yet available" even though the client (Continuous Group) has already entered their Stripe secret key in Settings and the connection appeared to save. This means the `POST /api/portal/[token]/create-checkout` endpoint is returning `{ checkoutUrl: null }` — either because the BillingProfile record is not being found, or because `stripe_verified` is `false` on the record.

This is a **PATCH bump**.

---

### Step 1 — Investigate and fix the BillingProfile lookup

Read `POST /api/portal/[token]/create-checkout` in full. Find the query that looks up the CLIENT BillingProfile for the lead's campaign.

The query should be:
```typescript
prisma.billingProfile.findFirst({
  where: {
    campaign_id: lead.campaign_id,
    role: 'CLIENT'
  }
})
```

**Check for these specific failure modes — investigate each one before writing any fix:**

**Failure mode A — Wrong role value stored**
The `POST /api/settings/stripe/verify` endpoint sets the role on the BillingProfile when creating or upserting it. Read that endpoint and confirm the role is being stored as the string `'CLIENT'` (matching the enum value exactly), not as a different casing or value. If the stored value doesn't match what the checkout endpoint is querying for, the lookup returns null.

**Failure mode B — stripe_verified not being set to true**
The verify endpoint calls Stripe to validate the key. If the Stripe API call succeeds, it should set `stripe_verified: true` on the BillingProfile. Confirm this is actually happening — read the verify endpoint and trace the code path from a successful key validation to the database update. If `stripe_verified` is being left as `false` after a successful verify, fix the update logic.

**Failure mode C — campaign_id mismatch**
The BillingProfile is scoped to a campaign. Confirm the `campaign_id` stored on the BillingProfile (set during the verify step) matches the `campaign_id` on the lead being completed. If the client's session had a different campaign in context when they verified their Stripe key, the BillingProfile will be scoped to the wrong campaign. Fix: the verify endpoint must read `campaignId` from the session (this should already be in place from CL15 — confirm it is).

**After identifying the failure mode:**
- Fix the root cause
- Add a console.log in the checkout endpoint (development only — guarded by `process.env.NODE_ENV === 'development'`) that logs the BillingProfile lookup result so future debugging is easier
- Do not add the log in production

**If all three failure modes check out as correct and the lookup should be working**, stop and report to Oli with a description of what you found before making any changes.

---

### Step 2 — Add an admin diagnostic view for the Stripe connection status

On the admin lead detail page (`/leads/[quoteNumber]`), in the Customer Portal section (added in CL16), add a small status indicator showing whether the Stripe payment link is active:

```
Customer Portal
[Copy Link]    [Resend Email]

Payment status:  ✅ Stripe connected — payment link active
             or  ⚠️  Stripe not connected — payment link unavailable
```

- This reads from the same BillingProfile lookup used by the checkout endpoint
- "Stripe connected" = a CLIENT BillingProfile exists with `stripe_verified: true`
- "Stripe not connected" = no verified profile found
- This is for Oli's visibility only — it does not appear on the portal page itself or on any other role view

---

### Step 3 — Add helper text beneath the disabled payment button on the portal page

On the customer portal page (`/portal/[token]`), when `checkoutUrl` is null, the disabled "Payment link not yet available" button currently shows with no explanation. Add a short line of helper text directly beneath it:

```
[  Payment link not yet available  ]  ← disabled, greyed out

Payment is being set up. Please contact auckland@continuous.co.nz
directly or reply to the original email to arrange payment now.
```

- The helper text sits directly below the disabled button
- Style it in a small, subdued font — not bold, not red, just informational
- `auckland@continuous.co.nz` should be a `mailto:` link so the customer can tap it directly on mobile
- This text only appears when `checkoutUrl` is null — hidden when the Pay Invoice button is active

---

### Build order for Change 2

1. Read `POST /api/portal/[token]/create-checkout` in full
2. Read `POST /api/settings/stripe/verify` in full
3. Investigate all three failure modes — document which one is the cause
4. Fix the root cause
5. Add development-only diagnostic log to checkout endpoint
6. Add Stripe connection status indicator to admin lead detail Customer Portal section
7. Add helper text beneath disabled payment button on portal page
8. Run `npx tsc --noEmit` — confirm no TypeScript errors
9. Apply PATCH version bump in `package.json`
10. Commit: `v[version] — fix Stripe BillingProfile lookup, add portal payment fallback text`
11. Push to GitHub: `git push origin main`
12. Run Vibstr build report per CLAUDE.md

---

## Change 3 — Improve Customer Notification Email — Warmer Copy + PDF Attachments

### Background

The customer notification email sent when a job is completed currently has minimal, functional copy and just a link to the portal page. Two improvements:

1. **Warmer, more personal copy** — the email should feel like it's coming from a real business, not a system notification
2. **PDF attachments** — both the invoice and the job report should be attached directly to the email so the customer has them in their inbox regardless of whether they click the link

This applies to both the initial send (from `POST /api/jobs/[quoteNumber]/complete`) and the resend (from `POST /api/leads/[quoteNumber]/resend-customer-email`).

This is a **PATCH bump**.

---

### Step 1 — Update the email copy

Replace the current customer notification email body with the following warmer version.

**Subject:** `Your gutter clean is complete — [property_address]`

*(Including the address in the subject line makes the email feel personal and helps the customer identify which property it relates to immediately.)*

**Body (styled HTML — match existing Jobbly email templates):**

```
Hi [customer_name],

Your gutter clean at [property_address] is now complete.

We hope everything went smoothly and that you're happy with the service.
Your invoice and job report are attached to this email for your records.

You can also view them online and pay your invoice securely by clicking
the button below.

[  View Documents & Pay Invoice  ]

Clicking the button takes you to a secure page where you can:
• View and download your invoice
• View and download your job report
• Pay your invoice online via Stripe

If you have any questions about the work carried out or your invoice,
please don't hesitate to get in touch.

Thank you for choosing [client_company_name]. We look forward to
helping you again in the future.

Warm regards,
The [client_company_name] Team
```

- `[customer_name]` — `lead.customer_name`
- `[property_address]` — `lead.property_address`
- `[client_company_name]` — `campaign.client_company_name`
- Button URL: `https://[NEXT_PUBLIC_BASE_URL]/portal/[customer_portal_token]`
- Button label: "View Documents & Pay Invoice"

---

### Step 2 — Attach both PDFs to the email

Resend supports file attachments. When sending the customer notification email, fetch both the invoice and the job report from their R2 URLs and attach them to the email.

**Implementation:**

```typescript
// Fetch both files from R2 as buffers
const invoiceBuffer = await fetch(lead.invoice_url).then(r => r.arrayBuffer());
const jobReportBuffer = await fetch(lead.job_report_url).then(r => r.arrayBuffer());

// Determine filename from the R2 URL (last segment after the final slash)
const invoiceFilename = lead.invoice_url.split('/').pop() ?? 'invoice.pdf';
const jobReportFilename = lead.job_report_url.split('/').pop() ?? 'job-report.pdf';

// Pass to Resend as attachments:
await resend.emails.send({
  from: ...,
  to: lead.customer_email,
  subject: ...,
  html: ...,
  attachments: [
    {
      filename: invoiceFilename,
      content: Buffer.from(invoiceBuffer),
    },
    {
      filename: jobReportFilename,
      content: Buffer.from(jobReportBuffer),
    },
  ],
});
```

**Error handling:**
- If fetching either file from R2 fails: log the error, send the email anyway without that attachment, and append a note to the lead: `[Attachment Error — {date}] Failed to attach [invoice/job report] to customer email. File may still be accessible via the portal link.`
- If both files fail to fetch: send the email without any attachments — the portal link still works
- Do not block email sending because of an attachment fetch failure
- The email itself must always send if `customer_email` is present

**File size consideration:**
- Resend has a 40MB total attachment limit per email
- Individual invoice and job report PDFs are expected to be well under this limit
- No special handling needed for size limits in this build

---

### Step 3 — Apply the same changes to the resend endpoint

The `POST /api/leads/[quoteNumber]/resend-customer-email` endpoint sends the same email template. Apply the same updated copy and attachment logic to this endpoint as well — it must be identical to the initial send.

Do not create a separate email template for the resend. Extract the email build logic (copy, attachments) into a shared helper function that both endpoints call — avoid duplicating the same code in two places.

**Suggested helper:** Create `/lib/buildCustomerNotificationEmail.ts` that accepts the lead and campaign and returns the full Resend email payload (subject, html, attachments). Both endpoints import and call this function.

---

### Build order for Change 3

1. Create `/lib/buildCustomerNotificationEmail.ts` helper with updated copy and attachment logic
2. Update `POST /api/jobs/[quoteNumber]/complete` to use the new helper
3. Update `POST /api/leads/[quoteNumber]/resend-customer-email` to use the same helper
4. Confirm attachment error handling does not block email send
5. Confirm both endpoints produce identical emails
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply PATCH version bump in `package.json`
8. Commit: `v[version] — warmer customer email copy, attach invoice and job report PDFs`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

---

## Build Checklist

**Change 1 — Admin Submit Job fix**
- [ ] `POST /api/jobs/[quoteNumber]/complete` accepts ADMIN role
- [ ] `POST /api/jobs/[quoteNumber]/complete` accepts SUBCONTRACTOR role — unchanged
- [ ] `POST /api/jobs/[quoteNumber]/complete` blocks CLIENT — returns 403
- [ ] All logic inside the endpoint (status advance, audit log, email send) runs for ADMIN same as SUBCONTRACTOR — no skipped steps
- [ ] No TypeScript errors

**Change 2 — Stripe payment link fix**
- [ ] Root cause of BillingProfile lookup failure identified and documented in commit message
- [ ] `POST /api/portal/[token]/create-checkout` returns a valid checkout URL when CLIENT BillingProfile exists with `stripe_verified: true`
- [ ] "Pay Invoice" button active and linking to Stripe Checkout on the portal page
- [ ] Development-only diagnostic log added to checkout endpoint
- [ ] Admin lead detail Customer Portal section shows Stripe connection status indicator
- [ ] "Stripe connected" shown when verified CLIENT BillingProfile exists
- [ ] "Stripe not connected" shown when no verified profile found
- [ ] Status indicator not visible on portal page or any non-admin view
- [ ] Helper text appears beneath disabled payment button when checkoutUrl is null
- [ ] Helper text includes mailto link to auckland@continuous.co.nz
- [ ] Helper text hidden when Pay Invoice button is active
- [ ] No TypeScript errors

**Change 3 — Customer email improvements**
- [ ] `/lib/buildCustomerNotificationEmail.ts` helper created
- [ ] Helper accepts lead and campaign — returns full Resend email payload
- [ ] Email subject includes property address: "Your gutter clean is complete — [property_address]"
- [ ] Email body uses updated warmer copy as specced
- [ ] Email copy references client_company_name correctly
- [ ] Button label reads "View Documents & Pay Invoice"
- [ ] Button links to correct portal URL
- [ ] Invoice PDF fetched from R2 and attached to email
- [ ] Job report PDF fetched from R2 and attached to email
- [ ] Filenames extracted from R2 URLs and used as attachment filenames
- [ ] If invoice fetch fails: email sends without that attachment, note appended to lead
- [ ] If job report fetch fails: email sends without that attachment, note appended to lead
- [ ] Email always sends even if both attachment fetches fail
- [ ] `POST /api/jobs/[quoteNumber]/complete` uses the new helper
- [ ] `POST /api/leads/[quoteNumber]/resend-customer-email` uses the same helper
- [ ] Both endpoints produce identical email output
- [ ] No TypeScript errors

**Final**
- [ ] Each of the three changes has its own commit, GitHub push, and Vibstr report
- [ ] All three are PATCH bumps — version incremented correctly for each
- [ ] Commit messages follow format in CLAUDE.md
- [ ] Vibstr build report run after every commit per CLAUDE.md
