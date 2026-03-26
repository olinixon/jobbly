# Jobbly

Campaign tracking and commission dashboard for Omniside AI guttering campaigns.

## Stack

- **Next.js 16** (App Router)
- **Prisma 7** + SQLite (dev) / PostgreSQL (prod)
- **NextAuth v5** — JWT sessions, credentials provider
- **Tailwind CSS v4**
- **Resend** — transactional email
- **TypeScript** strict mode

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLite path, e.g. `file:./dev.db` |
| `NEXTAUTH_SECRET` | Random 32-char string — run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` in dev |
| `WEBHOOK_SECRET` | Shared secret for the n8n lead webhook |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) |
| `EMAIL_FROM` | Sender address, e.g. `Jobbly <notifications@yourdomain.com>` |
| `EMAIL_FRANK` | Subcontractor notification address |
| `EMAIL_OLI` | Admin notification address |

### 3. Push schema and seed

```bash
npx prisma db push
npx tsx --env-file=.env.local prisma/seed.ts
```

This creates the database and seeds:
- Admin user: `oli@omnisideai.com` / `changeme123` — **change this in prod**
- Continuous Group Guttering campaign

### 4. Generate Prisma client

```bash
npx prisma generate
```

### 5. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## n8n webhook

`POST /api/webhooks/lead` — requires `x-webhook-secret` header matching `WEBHOOK_SECRET`.

Expected payload:

```json
{
  "customerName": "Jane Smith",
  "customerEmail": "jane@example.com",
  "customerPhone": "021 123 4567",
  "propertyAddress": "12 Sample St, Auckland",
  "jobDescription": "Full roof re-guttering",
  "estimatedValue": 1800,
  "campaignId": "<uuid>"
}
```

## User roles

| Role | Access |
|---|---|
| `ADMIN` | Full access — all campaigns, commission, audit log, user management |
| `CLIENT` | Dashboard + leads for their campaign only |
| `SUBCONTRACTOR` | Jobs board for their campaign only |

## File uploads

Supported types: PDF, JPG, PNG — max 10 MB. Stored at `UPLOAD_DIR` (default `./uploads`). For production, swap the upload handler for S3-compatible storage.
