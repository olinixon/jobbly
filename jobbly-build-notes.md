# jobbly-build-notes.md
### Jobbly — Build Notes & Operational Details

---

## 1. Environment Variables

A complete `.env.example` must be created at project root. Claude Code must never hardcode any of these values.

```bash
# Database
DATABASE_URL="file:./dev.db"                  # SQLite for local dev
# DATABASE_URL="postgresql://..."             # PostgreSQL for production

# NextAuth
NEXTAUTH_SECRET="your-nextauth-secret-here"   # Min 32 chars, random string
NEXTAUTH_URL="http://localhost:3000"           # Change to production URL on deploy

# Webhook
WEBHOOK_SECRET="your-webhook-secret-here"     # Min 32 chars, random string

# Email (Resend)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxx"
EMAIL_FROM="Jobbly <notifications@yourdomain.com>"
EMAIL_FRANK="frank@prowater.co.nz"            # Subcontractor notification recipient
EMAIL_OLI="oli@omnisideai.com"                # Admin notification recipient

# File Storage (local dev)
UPLOAD_DIR="./uploads"                        # Local file storage path

# File Storage (production — S3-compatible)
# S3_BUCKET=""
# S3_REGION=""
# S3_ACCESS_KEY=""
# S3_SECRET_KEY=""
# S3_ENDPOINT=""                              # For non-AWS S3-compatible storage
```

**Rules:**
- `.env.local` is used for local development — never committed to Git
- `.env.example` is committed to Git with all variable names but no values
- Production environment variables are set in the hosting platform (e.g. Vercel, Railway)
- If any required variable is missing at startup, the app should throw a clear error immediately

---

## 2. Database Seed Script

Because there is no public signup, the database must be seeded with an initial admin account before the app is usable. Claude Code must create a seed script at `/prisma/seed.ts`.

**The seed script must:**
1. Create the first admin user (Oli) with a known temporary password
2. Create the first campaign (Continuous Group) with default settings
3. Be idempotent — running it twice must not create duplicate records

**Seed data:**

```typescript
// Admin user
{
  name: "Oli",
  email: "oli@omnisideai.com",
  password: "changeme123",       // Hashed with bcrypt before storing
  role: "ADMIN",
  campaign_id: null,
  is_active: true
}

// First campaign
{
  name: "Continuous Group Guttering",
  industry: "Guttering",
  client_company_name: "Continuous Group",
  subcontractor_company_name: "Pro Water Blasting",
  markup_percentage: 25.00,
  commission_percentage: 40.00,
  client_margin_percentage: 60.00,
  status: "ACTIVE",
  start_date: "2025-01-01"
}
```

**How to run:**
```bash
npx prisma db seed
```

**Package.json must include:**
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

**First login instructions** (include in README.md):
1. Run `npx prisma db seed`
2. Log in at `/login` with `oli@omnisideai.com` / `changeme123`
3. Go to `/users` and reset your password immediately
4. Add campaign users (Continuous Group, Frank's VA) from `/users`

---

## 3. Error States & Edge Cases

These are the specific scenarios Claude Code must handle explicitly — not leave as unhandled exceptions.

### Webhook Edge Cases

| Scenario | Expected behaviour |
|---|---|
| Webhook arrives with valid secret but campaign is PAUSED | Accept the lead, create it with status `LEAD_RECEIVED`, flag with a note: "Received while campaign paused" |
| Webhook arrives with valid secret but campaign is COMPLETED | Reject the lead, return `400` with message: "Campaign is no longer active" |
| Webhook arrives with missing required fields | Create the lead with nulls, add `needs_review: true` note, still send Frank's notification |
| Two webhooks arrive simultaneously (race condition on quote number) | Use a database transaction with row locking to guarantee sequential quote numbers — never skip or duplicate |
| Webhook payload is not valid JSON | Return `400` with message: "Invalid payload" — do not crash |
| File upload fails mid-invoice-attach | Return error to user, do not update lead record, do not change status — lead stays in previous state |

### Status Update Edge Cases

| Scenario | Expected behaviour |
|---|---|
| User tries to move status backwards | API returns `400` — "Status can only move forward" |
| User tries to mark Job Completed without invoice | API returns `400` — "Attach an invoice before marking this job complete" |
| Two users update the same lead simultaneously | Last write wins — no special handling needed for MVP |
| Audit log write fails during status update | Roll back the status change — both succeed or neither does (use database transaction) |

### Auth Edge Cases

| Scenario | Expected behaviour |
|---|---|
| Deactivated user tries to log in | Show: "Your account has been deactivated. Contact Oli at Omniside AI." |
| User with no campaign assignment tries to access /dashboard | Redirect to `/login` with error: "Account not configured. Contact your administrator." |
| Session expires mid-session | Redirect to `/login` — no data loss, just re-authenticate |
| Admin tries to delete their own account | Block with message: "You cannot delete your own account." |

### File Upload Edge Cases

| Scenario | Expected behaviour |
|---|---|
| File exceeds 10MB | Reject before upload with: "File must be under 10MB." |
| File is wrong type (not PDF, JPG, PNG) | Reject with: "Only PDF, JPG, and PNG files are accepted." |
| Invoice already exists on a lead | Allow replacement — store new file, update `invoice_url`, `invoice_uploaded_at`, `invoice_uploaded_by` |

---

## 4. Email Notification Content

All emails are sent via Resend. Plain text is acceptable for MVP — no HTML templates required.

---

### Email 1: New Lead Notification → Frank / VA

**Trigger**: New lead created via webhook

**To**: `EMAIL_FRANK` (from environment variable)

**Subject**:
```
New job lead — [Quote Number] — [Customer Name]
```

**Body**:
```
Hi Frank,

A new lead has come in from the AI campaign. Here are the details:

Quote number: [JBL-00001]
Customer name: [Jane Smith]
Phone: [021 123 4567]
Property address: [14 Rata Street, Remuera, Auckland 1050]
Google Maps: [https://maps.google.com/...]
Property perimeter: [85.4m]
Property area: [210m²]
Storeys: [2]

Please log in to Jobbly to view the full details and update the status as the job progresses.

[Link to job in Jobbly: https://yourapp.com/jobs/JBL-00001]

Jobbly by Omniside AI
```

---

### Email 2: Job Completed Notification → Oli

**Trigger**: Lead status changed to `JOB_COMPLETED` and invoice attached

**To**: `EMAIL_OLI` (from environment variable)

**Subject**:
```
Job completed — [Quote Number] — [Customer Name]
```

**Body**:
```
Hi Oli,

A job has been marked as completed and an invoice has been attached.

Quote number: [JBL-00001]
Customer name: [Jane Smith]
Property address: [14 Rata Street, Remuera, Auckland 1050]
Contractor rate: [$200.00]
Customer price: [$250.00]
Omniside commission: [$20.00]
Invoice: [Download link]

Log in to Jobbly to verify and mark this commission as reconciled.

[Link to lead in Jobbly: https://yourapp.com/leads/JBL-00001]

Jobbly by Omniside AI
```

---

## 5. README.md Requirements

Claude Code must generate a `README.md` at project root covering:

```markdown
# Jobbly

Campaign tracking and commission dashboard for Omniside AI.

## Local Setup

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in all values
3. Run `npm install`
4. Run `npx prisma generate`
5. Run `npx prisma db push`
6. Run `npx prisma db seed`
7. Run `npm run dev`
8. Open http://localhost:3000
9. Log in with oli@omnisideai.com / changeme123
10. Reset your password immediately via User Management

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- NextAuth.js
- Prisma ORM
- SQLite (dev) / PostgreSQL (production)
- Resend (email)

## Version

Current version is tracked in `package.json`. See footer of app for current version.
```

---

## 6. Build Checklist

Claude Code must verify all of these before considering any session complete:

- [ ] `.env.example` exists with all required variable names
- [ ] `.env.local` is in `.gitignore`
- [ ] `prisma/seed.ts` exists and runs without errors
- [ ] `README.md` exists with local setup instructions
- [ ] App footer displays version from `package.json`
- [ ] All routes are protected by middleware — test each role manually
- [ ] Webhook endpoint rejects requests without valid secret
- [ ] Invoice upload blocks Job Completed status if no file attached
- [ ] Status cannot move backwards — test via API directly
- [ ] Audit log writes on every status change — verify in database
- [ ] Git repo initialised, `.gitignore` in place, initial commit made
- [ ] Version bumped in `package.json` and committed
