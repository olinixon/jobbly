# Jobbly — Full Session Change Log
Generated: 2026-03-28

This document covers every change, investigation, finding, and fix made across the full development session for Jobbly. It is intended as a handover document so anyone can understand exactly what was built, what broke, and what was done to fix it.

---

## Part 1 — What Was Built (v1.6.0)

### Context
The session recovered from a cancelled previous conversation mid-build. The full build prompt (`jobbly-full-build-prompt.md`) was analysed and all remaining work was completed.

### Booking System — Phases 2–5

**Database models added (prisma/schema.prisma):**
- `JobType` — name, durationMinutes, sortOrder per campaign
- `AvailabilitySlot` — date, startTime, endTime per campaign
- `Booking` — links lead + slot, supports HELD and CONFIRMED statuses with heldUntil + heldByToken for 10-minute reservation windows
- `Lead` model extended with: `bookingToken`, `jobTypeId`, `jobBookedDate`
- Enums added: `BookingStatus` (HELD, CONFIRMED)

**API routes created:**
- `app/api/campaigns/[id]/job-types/` — CRUD for job types per campaign
- `app/api/book/[token]/slots/route.ts` — public endpoint, no auth, returns available time windows for a booking token
- `app/api/book/[token]/hold/route.ts` — creates a 10-minute hold; in-memory rate limiting (20 req/min per IP)
- `app/api/book/[token]/confirm/route.ts` — validates hold, confirms booking, updates lead to JOB_BOOKED, fires confirmation emails

**Pages and components created:**
- `app/book/[token]/page.tsx` — public booking page (no auth), server-renders initial slots
- `components/booking/BookingSlotPicker.tsx` — client component with countdown timer, slot selection, hold + confirm flow
- `components/campaigns/JobTypesSection.tsx` — admin UI for managing job types in campaign settings
- `components/campaigns/AvailabilitySection.tsx` — admin UI for managing availability slots in campaign settings

**Email functions added to lib/notifications.ts:**
- `sendBookingConfirmationCustomer` — sends booking confirmation to customer
- `sendBookingNotificationPWB` — sends new booking notification to subcontractors
- `sendQuoteEmail` — sends quote PDF to customer immediately on upload
- `sendMissingEmailAlert` — alerts admin when a lead has no customer email

---

## Part 2 — Email Queue Removal (v1.6.1)

### What Was Changed
The previous architecture had a scheduled email queue (`ScheduledEmail` model, cron job at `/api/cron/process-emails`, `vercel.json` for scheduling). This was removed and replaced with immediate fire-and-forget email sending.

**Files deleted:**
- `app/api/cron/process-emails/route.ts`
- `vercel.json`

**Database:**
- `ScheduledEmail` model removed from `prisma/schema.prisma`
- Migration created: `prisma/migrations/20260328120000_remove_scheduled_emails/migration.sql` (DROP TABLE)

**Code changes:**
- `app/api/upload/quote/route.ts` — simplified to call `sendQuoteEmail` immediately after saving PDF, no queue
- `app/api/leads/[quoteNumber]/route.ts` — removed scheduled email cancellation logic
- `lib/fileStorage.ts` — simplified (removed `getFileBuffer` function)
- `lib/notifications.ts` — removed `sendQuoteReminder24h` and `sendQuoteFinalReminder`

---

## Part 3 — Vercel Build Fix (v1.6.2)

### Problem
Vercel build was failing because the Prisma client (`app/generated/prisma/`) is gitignored and didn't exist in the build environment.

### Fix
`package.json` build script changed from:
```
"build": "next build"
```
to:
```
"build": "prisma generate && next build"
```

This ensures the Prisma client is generated fresh on every Vercel build before Next.js compiles.

---

## Part 4 — Production Login Investigation

### Symptom
Production Vercel deployment at `jobbly-eta.vercel.app` returning "Invalid email or password" on every login attempt, even with correct credentials.

### Investigation Steps and Findings

#### Step 1 — PrismaPg Constructor Bug (commit 64a0b90)
**Finding:** `lib/prisma.ts` was calling `new PrismaPg({ connectionString: process.env.DATABASE_URL })` — passing an object instead of a string.

**Root cause:** Reading the `@prisma/adapter-pg` source (`node_modules/@prisma/adapter-pg/dist/index.js`):
```js
constructor(poolOrConfig, options) {
  if (poolOrConfig instanceof Pool) {
    this.externalPool = poolOrConfig;
  } else {
    this.externalPool = null;
    this.config = { connectionString: poolOrConfig }; // expects a STRING
  }
}
```
Passing `{ connectionString: '...' }` resulted in `this.config = { connectionString: { connectionString: '...' } }` — a nested object. The Pool was created with an invalid connection string.

**Fix:** Changed to `new PrismaPg(process.env.DATABASE_URL!)` — passing the string directly.

#### Step 2 — Debug Logging Added (commits bdfc12a, e949df1)
Added `console.log` statements to `auth.ts`:
- Module-level: `[AUTH] auth.ts module loaded, DATABASE_URL set: true/false`
- First line of authorize: `[AUTH] authorize called, email: ...`
- Around DB query: `[AUTH] DB query result: ...` or `[AUTH] DB query error: ...`
- Around bcrypt: `[AUTH] bcrypt compare result: true/false`

**Finding from Vercel logs:** `[AUTH] auth.ts module loaded, DATABASE_URL set: true` appeared. `[AUTH] authorize called` never appeared. `[auth][error] CredentialsSignin` appeared.

#### Step 3 — NextAuth v5 Source Code Analysis
Investigated `@auth/core` v0.41.0 internals to understand why `authorize` was never called despite the module loading.

Key finding from `lib/index.js` (AuthInternal):
```js
case "callback":
  if (options.provider.type === "credentials")
    validateCSRF(action, csrfTokenVerified); // throws MissingCSRF if CSRF fails
  return await actions.callback(request, options, sessionStore, cookies);
```

And from `csrf-token.js` — CSRF is verified by hashing the token with the secret. Both `MissingCSRF` and `CredentialsSignin` are "client-safe" errors. Since logs showed `CredentialsSignin` (not `MissingCSRF`), CSRF was NOT the problem.

Confirmed that `CredentialsSignin` is only thrown after `authorize` returns null — meaning `authorize` IS being called, the DB query is throwing, the try/catch catches it and returns null.

#### Step 4 — Wrong Database Password (scripts/test-auth.ts)
Created `scripts/test-auth.ts` to directly test the Supabase connection, user existence, and password hash.

**Finding:** Running the test script against the stored connection string:
```
ERROR: error: password authentication failed for user "postgres"
code: '28P01'
```

The password `Jobbly1505!` stored in `.env.local` (as `SUPABASE_DATABASE_URL`) was wrong. This was also the password set in Vercel's `DATABASE_URL` — so every DB query in production was failing with an auth error.

**Resolution:** Supabase database password was reset. New password: `wyddyh-0goXdo-xychak`.

**Test script re-run with new password:**
```
1. Testing DB connection... ✅
Users in DB: 1
2. Looking for oli@omnisideai.com... ✅
User found: { id: '0935955d-...', email: 'oli@omnisideai.com', role: 'ADMIN', isActive: true }
Password hash exists: true
Hash value: $2b$12$UWdBbQej48o3DvGlv6Q2qu...
3. Testing password changeme123... ✅
Password valid: true
```

Note: the test script initially used `FROM users` — PostgreSQL is case-sensitive; corrected to `FROM "User"` (Prisma uses PascalCase table names).

#### Step 5 — SSL Configuration (commit e5ab948)
Even with the correct password, login still failed. Added SSL configuration to `lib/prisma.ts`:

**Before:**
```ts
const adapter = new PrismaPg(process.env.DATABASE_URL!)
```

**After:**
```ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.NODE_ENV === 'production' && {
    ssl: { rejectUnauthorized: false },
  }),
})
const adapter = new PrismaPg(pool)
```

Also removed `secret: process.env.NEXTAUTH_SECRET` from `auth.config.ts` — NextAuth v5 reads `AUTH_SECRET` automatically; having an explicit reference to `NEXTAUTH_SECRET` created a risk of mismatch between CSRF token signing and verification.

#### Step 6 — Vercel Cannot Reach Supabase Direct Connection
**Finding from Vercel logs after DATABASE_URL diagnostic log was added:**
```
[PRISMA] DATABASE_URL starts with: postgresql://postgres:wyddyh-0goXdo...
Can't reach database server at db.ziwjvyuomzcadbldzxnp.supabase.co
```

DATABASE_URL was correct, but Vercel serverless functions cannot reach Supabase on port 5432 (direct connection). This is a known network restriction with Vercel's serverless infrastructure.

**Fix:** Switch to Supabase's connection pooler (PgBouncer, transaction mode) on port 6543, which is designed for serverless environments.

**Pooler connection string format:**
```
postgresql://postgres.ziwjvyuomzcadbldzxnp:wyddyh-0goXdo-xychak@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Note the username changes: `postgres` → `postgres.ziwjvyuomzcadbldzxnp` (project ref appended — this is how Supabase's pooler identifies which project to route to).

#### Step 7 — Prisma Schema directUrl Build Failure
Attempted to add `url` and `directUrl` to `prisma/schema.prisma` datasource block — this caused a build failure:
```
"The datasource property `url` is no longer supported in schema files"
"The datasource property `directUrl` is no longer supported in schema files"
```

In Prisma 7, connection URL configuration was moved OUT of `schema.prisma` and INTO `prisma.config.ts`.

**Fix:** Reverted `schema.prisma` to `provider = "postgresql"` only (no url/directUrl). Attempted to add `directUrl` to `prisma.config.ts` — also failed with TypeScript error:
```
'directUrl' does not exist in type '{ url?: string | undefined }'
```

`directUrl` is not supported by this version of `prisma.config.ts`. Removed it. `prisma.config.ts` only supports `url`.

---

## Part 5 — Current State (as of end of session)

### What is deployed
- Commit `c29bef4` on `main` branch
- `prisma.config.ts` — `datasource.url: process.env["DATABASE_URL"]` (pooler URL)
- `lib/prisma.ts` — uses `pg.Pool` with SSL for production, `PrismaPg` adapter
- `auth.config.ts` — `trustHost: true`, no explicit `secret` field
- `auth.ts` — clean Credentials provider, no debug logging
- All debug logs removed

### Vercel environment variables required
| Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.ziwjvyuomzcadbldzxnp:wyddyh-0goXdo-xychak@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Runtime DB queries via pooler |
| `DIRECT_URL` | `postgresql://postgres:wyddyh-0goXdo-xychak@db.ziwjvyuomzcadbldzxnp.supabase.co:5432/postgres` | Not used in production code — for local migrations only |
| `AUTH_SECRET` | (real secret value) | NextAuth v5 JWT signing |
| `NEXTAUTH_SECRET` | (same real secret value) | NextAuth v4 compat |
| `NEXTAUTH_URL` | `https://jobbly-eta.vercel.app` | Auth redirect base URL |

### Login credentials (production)
- Email: `oli@omnisideai.com`
- Password: `changeme123`
- Role: ADMIN

### Known confirmed working
- Supabase database is accessible (password `wyddyh-0goXdo-xychak` confirmed working locally)
- User `oli@omnisideai.com` exists in the database, isActive=true
- Password hash in DB matches `changeme123` (bcrypt compare = true)
- `lib/prisma.ts` correctly creates a `pg.Pool` with SSL and passes it to `PrismaPg`

### Outstanding
- Vercel must have `DATABASE_URL` set to the pooler URL (port 6543) — if it's still set to the direct URL (port 5432), login will continue to fail with "Can't reach database server"
- Build must pass with `c29bef4` changes (prisma.config.ts with url only, schema.prisma with no url/directUrl)

---

## Summary of All Commits Made This Session

| Commit | Message | What it did |
|---|---|---|
| `64a0b90` | fix: pass connection string directly to PrismaPg | Fixed PrismaPg constructor — was passing object instead of string |
| `bdfc12a` | debug: add auth diagnostic logging (TEMPORARY) | Added try/catch + [AUTH] logs to authorize function |
| `e949df1` | debug: add module-load log + first-line authorize log | Added module-level log + very-first-line-of-authorize log |
| `e5ab948` | fix: use explicit pg Pool with SSL for Supabase | Switched to explicit Pool with ssl config; removed NEXTAUTH_SECRET from auth.config.ts; removed all debug logs |
| `9d10a68` | trigger redeploy with new db password | Empty commit to force Vercel redeploy after password update |
| `bf5d73d` | debug: log DATABASE_URL prefix to confirm Vercel env var | Added [PRISMA] log to confirm what DATABASE_URL Vercel was injecting |
| `22007d0` | fix: switch to Supabase connection pooler for Vercel serverless | Added url+directUrl to schema.prisma (later reverted as Prisma 7 doesn't support this) |
| `36e87ed` | fix: revert schema.prisma url/directUrl, configure pooler in prisma.config.ts | Reverted schema; added directUrl to prisma.config.ts (later removed as unsupported) |
| `c29bef4` | fix: remove unsupported directUrl from prisma.config.ts | Final clean state — only url in prisma.config.ts |

---

## Files Modified This Session

| File | Changes |
|---|---|
| `lib/prisma.ts` | PrismaPg constructor fix → explicit Pool with SSL → debug log added/removed |
| `auth.ts` | Debug logging added then removed; clean final state |
| `auth.config.ts` | Removed `secret: process.env.NEXTAUTH_SECRET` |
| `prisma/schema.prisma` | url/directUrl added then reverted; back to provider-only |
| `prisma.config.ts` | directUrl added then removed; back to url-only |
| `.env.local` | SUPABASE_DATABASE_URL updated to new password; pooler URL documented |
| `scripts/test-auth.ts` | Created — standalone Supabase connection + user + bcrypt test script |
| `scripts/check-user.ts` | Created in prior session — basic user existence check |
