# jobbly-change-log-22.md
### Jobbly — Change Log 22

---

## Change 1 — Investigate and Fix New Lead Email Notification

### Problem

During live testing, only 2 out of 4 leads triggered a new lead email notification to the admin. The leads that did not send emails had the same phone number and property address as earlier leads — suggesting the system is either suppressing emails for duplicate-looking leads, or the email is being conditionally skipped somewhere in the webhook handler.

Additionally, the emails that did send arrived approximately 5 minutes after the lead was created — the email should fire immediately on webhook receipt.

Both issues need to be diagnosed and fixed. Every single lead that arrives via webhook must trigger an email notification — no exceptions, regardless of whether the phone number, address, or any other field matches an existing lead.

---

### Step 1 — Investigate before touching anything

Open `app/api/webhooks/lead/route.ts` (or wherever the webhook handler lives) and read the full lead creation flow carefully. Look for:

1. **Any duplicate detection logic** — is there a check like "if a lead with this phone number already exists, skip"? If so, is the email send inside or outside that check?
2. **Any conditional email sending** — is the `sendEmail` / Resend call wrapped in an `if` statement that could evaluate to false?
3. **Any early returns before the email fires** — are there code paths that return early (e.g. on a database error or missing field) before reaching the email send?
4. **Where the email send sits in the flow** — is it before or after the database write? Is it awaited properly?
5. **Any error suppression** — is the email call wrapped in a try/catch that swallows errors silently?

Do not make any changes yet. Report findings before proceeding.

---

### Step 2 — Fix duplicate suppression affecting email sends

If any duplicate detection logic exists (matching on phone, address, or any other field), confirm that:

- The duplicate check only affects whether a new lead record is created — it must **never** suppress the email notification
- Even if the system decides to skip creating a duplicate lead record, the email must still fire
- If the logic is currently `if (!duplicate) { createLead(); sendEmail(); }` — refactor so email always fires regardless

The correct structure is:

```typescript
// Always create the lead (Jobbly never drops leads)
const lead = await createLead(payload);

// Always send email — no conditions, no duplicate checks
await sendNewLeadEmail(lead);

return Response.json({ success: true, quoteNumber: lead.quoteNumber });
```

---

### Step 3 — Fix email send delay

If the email is being sent after a slow operation (e.g. after a Google Maps URL generation, after a file operation, or after multiple sequential database writes), check whether it can be moved earlier in the flow — ideally immediately after the lead record is confirmed saved.

Also confirm the Resend call is properly `await`ed. If it is not awaited, the response may return before the email actually sends, and if the serverless function terminates early, the email never fires.

If the email send is currently fire-and-forget (not awaited), change it to awaited:

```typescript
// Wrong — fire and forget, may never complete
sendNewLeadEmail(lead);

// Correct — awaited, guaranteed to complete before response
await sendNewLeadEmail(lead);
```

---

### Step 4 — Add error logging to email send

Wrap the email send in a try/catch that logs clearly on failure — do not silently swallow errors:

```typescript
try {
  await sendNewLeadEmail(lead);
} catch (emailError) {
  console.error('[Webhook] Failed to send new lead email:', emailError);
  // Do NOT throw — email failure must not cause the webhook to return an error
  // The lead is already created; log and continue
}
```

This ensures:
- Email failures are visible in Vercel logs
- A failed email does not cause n8n to think the webhook failed (which would trigger retries)

---

### Step 5 — Verify the fix with a test webhook

After making changes, fire a test webhook with a payload that matches an existing lead's phone number and address. Confirm:

- [ ] The lead is created in the database with a new quote number
- [ ] The email notification fires immediately (within seconds, not minutes)
- [ ] The email appears in Resend logs with a `delivered` status
- [ ] A second test with a different phone/address also sends correctly
- [ ] No errors appear in Vercel function logs

---

### Build order

1. Investigate the webhook handler — read and report findings (Step 1)
2. Fix any duplicate suppression affecting email (Step 2)
3. Fix email send delay if found (Step 3)
4. Add error logging (Step 4)
5. Test with duplicate payload (Step 5)
6. Bump version — PATCH bump
7. Commit: `v[X.X.X] — fix new lead email: always fire on webhook receipt regardless of duplicates`
8. Push to GitHub: `git push origin main`
9. Run Vibstr build report per CLAUDE.md
