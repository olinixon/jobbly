# Jobbly — Change Log 21
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

Read this entire document before touching a single file. There are four changes in this session. Complete all four in the order listed. Each change gets its own commit, GitHub push, and Vibstr report — do not batch them.

---

## Pre-Flight Check — Required Before Starting

**1. Read CLAUDE.md in full.**

**2. Sync production database:**
```bash
DATABASE_URL="[production DATABASE_URL]" npx prisma db push
```
If in sync — proceed. If changes applied — confirm app loads before continuing. If error — stop and report.

**3. Read these files in full before writing any code:**
- `PATCH /api/jobs/[quoteNumber]/book` — read the ACTUAL role check currently in this file
- `POST /api/jobs/[quoteNumber]/complete` — the job completion endpoint
- The job report upload endpoint — find the route that handles job report file uploads
- `POST /api/portal/[token]/create-checkout` — the portal Stripe checkout creator
- The `BillingProfile` model in `prisma/schema.prisma`
- The `CustomerPaymentProfile` model in `prisma/schema.prisma`
- `/lib/encryption.ts` — the AES-256 decrypt utility
- The admin lead detail page (`/leads/[quoteNumber]`) — read the full component

**4. Confirm current version in `package.json` — all four changes are PATCH bumps.**

---

## Build Order

1. **Change 1** — Fix job report upload validation bug
2. **Change 2** — Ensure admin can book jobs (investigate first, fix if needed)
3. **Change 3** — Admin can see and use the "Complete This Job" upload section
4. **Change 4** — Restore Stripe homeowner payment fallback using BillingProfile

---

## Change 1 — Fix Job Report Upload Validation Bug

### What is broken
When uploading a job report on a lead at `JOB_BOOKED` status, the error "Job report can only be uploaded when the job is booked" appears — even though the job IS booked. This error should not appear.

### What to fix
Find every place — both in the API endpoint that handles job report uploads AND in any client-side validation — where the lead status is checked before allowing a job report upload. The correct condition is: allow the upload when `status === 'JOB_BOOKED'`. Fix whatever incorrect condition is causing the error to fire when the status is correct. Do not change anything else about the upload flow.

### Build order for Change 1

1. Find the job report upload API endpoint — read it in full
2. Find any client-side status validation for job report uploads
3. Identify and fix the incorrect condition
4. Run `npx tsc --noEmit` — confirm no TypeScript errors
5. Apply PATCH version bump in `package.json`
6. Commit: `v[version] — fix job report upload status validation`
7. Push to GitHub: `git push origin main`
8. Run Vibstr build report per CLAUDE.md

### Checklist
- [ ] Job report upload works when lead status is `JOB_BOOKED`
- [ ] Error no longer appears for a booked lead
- [ ] Upload flow otherwise unchanged
- [ ] No TypeScript errors

---

## Change 2 — Ensure Admin Can Book Jobs

### Background
CL17 was meant to allow ADMIN and CLIENT to book jobs. Read the actual `PATCH /api/jobs/[quoteNumber]/book` endpoint in the codebase RIGHT NOW before writing any code. Check whether the role already allows ADMIN.

- If ADMIN is already allowed in the role check but the booking is still failing — investigate why and fix the root cause. Do not add a duplicate role check.
- If ADMIN is NOT in the role check — add it. Allow ADMIN, CLIENT, and SUBCONTRACTOR. Block no other roles.

Also confirm the admin lead detail page shows the booking form (BookThisJobCard or equivalent) at `LEAD_RECEIVED` status. If it does not appear, import and render it — same as it appears on the subcontractor view.

The audit log must record the actual logged-in user's name for all roles.

### Build order for Change 2

1. Read `PATCH /api/jobs/[quoteNumber]/book` in full — document current role check
2. If ADMIN already allowed: investigate why booking still fails and fix root cause
3. If ADMIN not allowed: update role check to allow ADMIN, CLIENT, SUBCONTRACTOR
4. Confirm admin lead detail shows booking form at `LEAD_RECEIVED` — add if missing
5. Confirm audit log writes correct user name for all roles
6. Run `npx tsc --noEmit` — confirm no TypeScript errors
7. Apply PATCH version bump in `package.json`
8. Commit: `v[version] — ensure admin can book jobs, confirm booking UI on admin view`
9. Push to GitHub: `git push origin main`
10. Run Vibstr build report per CLAUDE.md

### Checklist
- [ ] ADMIN can book a job — no Unauthorised error
- [ ] CLIENT can book a job
- [ ] SUBCONTRACTOR unaffected
- [ ] Booking form visible on admin lead detail at `LEAD_RECEIVED` status
- [ ] Audit log records correct user name for all roles
- [ ] No TypeScript errors

---

## Change 3 — Admin Can See and Use the "Complete This Job" Upload Section

### Background
CL18 allowed the admin role to call `POST /api/jobs/[quoteNumber]/complete` (the API). However, the admin lead detail page does not show the document upload section or Submit Job button at `JOB_BOOKED` status. This means Oli cannot complete jobs from the admin view during testing — the UI is missing even though the API allows it.

### What to fix
On the admin lead detail page (`/leads/[quoteNumber]`), at `JOB_BOOKED` status, show the same document upload section that appears on the subcontractor job detail page. This includes:

- Invoice upload slot (show existing invoice if already uploaded, with Replace option)
- Job report upload slot (show existing job report if already uploaded, with Replace option)
- Submit Job button — enabled only when both files are uploaded, disabled with tooltip otherwise

The upload behaviour, file validation, R2 storage paths, and Submit Job API call are all identical to the subcontractor view — do not rebuild them, reuse the existing components and endpoints. Admin calls the same `POST /api/jobs/[quoteNumber]/complete` endpoint that the subcontractor uses.

On Submit Job success: show the same "Job submitted. The customer has been notified." banner. Refresh lead data so status updates to `JOB_COMPLETED` and the upload section hides.

CLIENT must remain read-only at `JOB_BOOKED` — sees document download links only, no upload or submit actions. Do not change the client view.

### Build order for Change 3

1. Read the admin lead detail page in full — understand current `JOB_BOOKED` state rendering
2. Read the subcontractor job detail upload section — understand the components used
3. Import and render the upload section on the admin lead detail at `JOB_BOOKED` status
4. Confirm Submit Job button calls `POST /api/jobs/[quoteNumber]/complete`
5. Confirm success banner and page refresh behave identically to subcontractor view
6. Confirm client lead detail is unchanged — read-only download links only
7. Run `npx tsc --noEmit` — confirm no TypeScript errors
8. Apply PATCH version bump in `package.json`
9. Commit: `v[version] — show complete job upload section on admin lead detail at JOB_BOOKED`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

### Checklist
- [ ] Admin lead detail shows invoice upload slot at `JOB_BOOKED`
- [ ] Admin lead detail shows job report upload slot at `JOB_BOOKED`
- [ ] Submit Job button present — disabled until both files uploaded
- [ ] Admin can successfully submit a job — lead advances to `JOB_COMPLETED`
- [ ] Success banner shown after submit
- [ ] Client view unchanged — read-only download links only
- [ ] No TypeScript errors

---

## Change 4 — Restore Stripe Homeowner Payment Fallback Using BillingProfile

### Plain English explanation for Oli

Before today's payment platform build, Jobbly automatically created a Stripe payment link for the homeowner using Continuous Group's connected Stripe account. Today's build replaced that with the new Customer Payment Platform system. Since no Customer Payment Platform is set up yet, new jobs are getting no payment link at all — the homeowner's portal page shows "Payment link not yet available."

This change adds a fallback: if no Customer Payment Platform is configured, Jobbly uses the existing B2B Stripe account (already connected in client Settings) to create the homeowner payment link. This means the Pay Invoice button will work for the next few jobs with zero extra setup. You absorb the ~3% Stripe fee for now and deal with MYOB or a dedicated setup later.

### Important technical notes before building

**Do NOT call `createCustomerPaymentCheckout` in this fallback.** That utility reads the Stripe key from `CustomerPaymentProfile` — which does not exist in the fallback scenario. Calling it will throw an error. Instead, inline the Stripe Checkout Session creation directly in the fallback block, using the decrypted key from the CLIENT `BillingProfile`.

**GST treatment:** `customer_price` on the Lead model is ex-GST. The Stripe checkout must charge the GST-inclusive amount. Multiply by 1.15 when calculating the Stripe unit_amount: `Math.round(lead.customer_price * 1.15 * 100)`.

### What to fix

In `POST /api/jobs/[quoteNumber]/complete`, after the existing `CustomerPaymentProfile` block, add the following fallback. Do not modify the `CustomerPaymentProfile` block — it must remain untouched and take priority when configured.

```typescript
// Fallback: if no CustomerPaymentProfile payment was created, try CLIENT BillingProfile
if (!stripeCustomerPaymentUrl && !myobInvoiceUrl) {
  try {
    const billingProfile = await prisma.billingProfile.findFirst({
      where: {
        campaign_id: lead.campaign_id,
        role: 'CLIENT',
        stripe_verified: true,
      },
    });

    if (billingProfile?.stripe_secret_key) {
      // Import Stripe and decrypt the key — do NOT call createCustomerPaymentCheckout
      // that utility reads from CustomerPaymentProfile which doesn't exist here
      const { decrypt } = await import('@/lib/encryption');
      const Stripe = (await import('stripe')).default;

      const secretKey = decrypt(billingProfile.stripe_secret_key);
      const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

      // customer_price is ex-GST — multiply by 1.15 for GST-inclusive checkout amount
      const amountInclGst = Math.round(lead.customer_price * 1.15 * 100); // in cents

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'nzd',
            product_data: {
              name: `Gutter Clean — ${lead.property_address}`,
              description: `Invoice ref: ${lead.quote_number}`,
            },
            unit_amount: amountInclGst,
          },
          quantity: 1,
        }],
        mode: 'payment',
        customer_email: lead.customer_email ?? undefined,
        client_reference_id: customerPortalToken,
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/${customerPortalToken}?paid=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/${customerPortalToken}`,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
      });

      stripeCustomerPaymentUrl = session.url;

      await prisma.lead.update({
        where: { id: lead.id },
        data: { stripe_customer_payment_url: stripeCustomerPaymentUrl },
      });

      console.log(`[Payment] BillingProfile fallback used for ${lead.quote_number}`);
    }
  } catch (error) {
    // Do not throw — job completion must succeed regardless
    console.error(`[Payment] BillingProfile fallback failed for ${lead.quote_number}:`, error);
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        notes: `${lead.notes ?? ''}\n[Payment Fallback Error — ${new Date().toISOString()}] ${String(error)}`.trim(),
      },
    });
  }
}
```

**After adding the fallback:** also confirm that `POST /api/portal/[token]/create-checkout` still has its existing fallback to the BillingProfile for the portal page on-demand checkout creation (from CL18/CL20). If the `stripe_customer_payment_url` is not set on the lead for any reason, the portal page should still be able to generate a checkout on load using this endpoint. Read the endpoint and confirm this path is intact — do not modify it if it is.

### Build order for Change 4

1. Read `POST /api/jobs/[quoteNumber]/complete` in full
2. Read `/lib/encryption.ts` — confirm the `decrypt` function signature
3. Add the BillingProfile fallback block as specified — inline Stripe creation, do not call `createCustomerPaymentCheckout`
4. Confirm GST multiplication is applied: `lead.customer_price * 1.15 * 100`
5. Confirm job completion never fails due to this fallback — all errors caught and logged to lead notes
6. Read `POST /api/portal/[token]/create-checkout` — confirm BillingProfile fallback is intact
7. Run `npx tsc --noEmit` — confirm no TypeScript errors
8. Apply PATCH version bump in `package.json`
9. Commit: `v[version] — restore BillingProfile Stripe fallback for homeowner payment, fix GST calculation`
10. Push to GitHub: `git push origin main`
11. Run Vibstr build report per CLAUDE.md

### Checklist
- [ ] When no `CustomerPaymentProfile` is set up, fallback uses CLIENT `BillingProfile` Stripe key
- [ ] `createCustomerPaymentCheckout` is NOT called in the fallback — Stripe session created inline
- [ ] Stripe charge amount uses `customer_price * 1.15` — GST-inclusive
- [ ] `stripe_customer_payment_url` set on the lead when fallback succeeds
- [ ] Portal page Pay Invoice button active for new jobs
- [ ] Fallback failure logged to lead notes — does not block job completion
- [ ] `CustomerPaymentProfile` path unchanged — still takes priority when configured
- [ ] `POST /api/portal/[token]/create-checkout` BillingProfile fallback confirmed intact
- [ ] No TypeScript errors

---

## Full Build Checklist

**Pre-flight**
- [ ] CLAUDE.md read in full
- [ ] Production DB synced
- [ ] All listed files read in full before writing any code
- [ ] Current version confirmed in `package.json`

**Change 1 — Job Report Upload Fix**
- [ ] Upload works at `JOB_BOOKED` — error no longer appears
- [ ] No TypeScript errors
- [ ] PATCH bump, commit, push, Vibstr ✓

**Change 2 — Admin Booking**
- [ ] Root cause of admin booking failure identified and fixed
- [ ] Admin can book jobs without error
- [ ] Booking form visible on admin lead detail at `LEAD_RECEIVED`
- [ ] Audit log correct for all roles
- [ ] No TypeScript errors
- [ ] PATCH bump, commit, push, Vibstr ✓

**Change 3 — Admin Complete Job UI**
- [ ] Upload section visible on admin lead detail at `JOB_BOOKED`
- [ ] Admin can submit a job successfully
- [ ] Client view unchanged
- [ ] No TypeScript errors
- [ ] PATCH bump, commit, push, Vibstr ✓

**Change 4 — Stripe Fallback**
- [ ] BillingProfile fallback creates Stripe checkout for homeowner when no CustomerPaymentProfile set
- [ ] GST calculation correct — `customer_price * 1.15`
- [ ] Portal Pay Invoice button works for new jobs
- [ ] Fallback failure handled gracefully
- [ ] No TypeScript errors
- [ ] PATCH bump, commit, push, Vibstr ✓
