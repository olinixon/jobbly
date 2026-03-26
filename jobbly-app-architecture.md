# jobbly-app-architecture.md
### Jobbly — App Architecture

---

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript throughout — no plain JS files
- **Styling**: Tailwind CSS — no third-party UI component libraries
- **Auth**: NextAuth.js with credentials provider (email + password)
- **ORM**: Prisma
- **Database**: SQLite (local dev) → PostgreSQL (production)
- **Email**: Resend
- **File storage**: Local filesystem (dev) → S3-compatible (production)

---

## Authentication Flow

```
/login
  │
  ├── ADMIN → /campaigns (campaign selector)
  │
  ├── CLIENT → /dashboard (auto-scoped to their campaign)
  │
  └── SUBCONTRACTOR → /jobs (auto-scoped to their campaign)
```

- All roles hit the same `/login` page
- NextAuth session stores: `userId`, `role`, `campaignId` (null for ADMIN)
- Middleware checks role and campaign scope on every protected route
- Unauthenticated requests redirect to `/login`
- After login, role-based redirect fires automatically

---

## Route Protection Middleware

Enforced in `middleware.ts` at the Next.js edge layer — not just in UI:

| Route pattern | Allowed roles |
|---|---|
| `/campaigns` | ADMIN only |
| `/dashboard/*` | ADMIN, CLIENT |
| `/leads/*` | ADMIN, CLIENT, SUBCONTRACTOR |
| `/jobs/*` | SUBCONTRACTOR only |
| `/settings/*` | ADMIN only |
| `/users/*` | ADMIN only |
| `/audit/*` | ADMIN only |
| `/commission/*` | ADMIN only |
| `/notifications/*` | ADMIN only |
| `/api/webhooks/*` | System only (webhook secret header) |

CLIENT and SUBCONTRACTOR routes are also scoped by `campaignId` from session — enforced at API level.

---

## URL Structure

### Admin
Campaign context is set once at `/campaigns` and carried through the session. All subsequent URLs are clean and campaign-context-aware without the campaign ID in every URL.

```
/login                          → Login page (all roles)
/campaigns                      → Campaign selector (ADMIN only)
/dashboard                      → Lead table + stat cards
/leads/[quoteNumber]            → Lead detail page
/commission                     → Commission reconciliation view
/audit                          → Audit log
/notifications                  → Notifications / activity feed
/settings                       → Campaign settings (sectioned)
/users                          → User management
```

### Client (Continuous Group)
```
/login                          → Login page
/dashboard                      → Campaign stats dashboard (read-only)
```

### Subcontractor (Frank / VA)
```
/login                          → Login page
/jobs                           → Job queue (their campaign only)
/jobs/[quoteNumber]             → Job detail + status update + invoice upload
```

---

## Pages — Full Spec

---

### `/login`
**Access**: All roles (unauthenticated)

**Layout**: Centred card on full-page background. Jobbly wordmark above card.

**Components**:
- Email input
- Password input
- Sign In button
- Error message (invalid credentials)

**Behaviour**:
- On success: role-based redirect fires
- No "forgot password" on MVP — Oli resets passwords manually via User Management

---

### `/campaigns` — Campaign Selector
**Access**: ADMIN only

**Layout**: Full page. Jobbly wordmark top left. Grid of campaign cards.

**Components**:
- Campaign card per campaign: name, industry, client company, status badge, start date, "Enter Campaign" button
- "New Campaign" button (top right) → opens campaign creation form
- Campaign status badge (Active / Paused / Completed) visible on each card

**Behaviour**:
- Clicking "Enter Campaign" sets campaign context in session and redirects to `/dashboard`
- "New Campaign" opens a full-page form or modal to create a new campaign with all settings fields

---

### `/dashboard` — Lead Table + Stats
**Access**: ADMIN, CLIENT

**Layout**: Standard page layout with sidebar. Stat cards row at top. Lead table below.

**Stat cards (ADMIN sees all, CLIENT sees subset):**

| Card | ADMIN | CLIENT |
|---|---|---|
| Total leads | ✅ | ✅ |
| Quotes sent | ✅ | ✅ |
| Jobs booked | ✅ | ✅ |
| Jobs completed | ✅ | ✅ |
| Total revenue | ✅ | ✅ |
| Commission earned | ✅ | ❌ |
| Commission pending | ✅ | ❌ |

**Lead table columns (ADMIN):**
- Quote number
- Customer name
- Property address
- Phone number
- Status (colour-coded badge)
- Date received
- Customer price
- Contractor rate (populated after invoice upload)
- Omniside commission
- Google Maps link (icon button → opens in new tab)
- Actions column (view detail)

**Lead table columns (CLIENT):**
- Quote number
- Customer name
- Property address
- Status (colour-coded badge)
- Date received
- Customer price

**Table features:**
- Search bar: filter by quote number, customer name, address
- Status filter dropdown: All / Lead Received / Quote Sent / Job Booked / Job Completed
- Date range filter
- Sortable columns (click header to sort)
- Pagination (50 rows per page default)
- Clicking any row → navigates to `/leads/[quoteNumber]`

---

### `/leads/[quoteNumber]` — Lead Detail Page
**Access**: ADMIN, CLIENT (limited view)

**Layout**: Back button (← Leads) top left. Two-column layout on desktop — left: customer + property details. Right: status timeline + financial summary + invoice.

**Left column — Customer & Property:**
- Customer name, phone, email
- Property address + Google Maps button
- Property perimeter, area, storeys
- Quote number
- Date received
- Source (e.g. "n8n webhook")
- Notes field (ADMIN editable)

**Right column — Status & Financials:**
- Status pipeline visualisation (horizontal steps: Lead Received → Quote Sent → Job Booked → Job Completed) — current step highlighted
- Financial breakdown (ADMIN only):
  - Contractor rate
  - Customer price
  - Gross markup
  - Omniside commission
  - Client margin
  - Commission reconciled toggle
- Invoice attachment: file name, upload date, uploaded by, download button
- Audit log for this lead (collapsible): each status change with user name, timestamp

**ADMIN actions:**
- Update status button (opens status change modal)
- Attach / replace invoice button
- Edit notes

**CLIENT actions:**
- Read-only — no action buttons

---

### `/jobs` — Subcontractor Job Queue
**Access**: SUBCONTRACTOR only

**Layout**: Standard page layout with minimal sidebar (Jobs only, no other nav items). Search bar at top. Job list below.

**Job list columns:**
- Quote number
- Customer name
- Property address
- Status (colour-coded badge)
- Date received
- Google Maps link

**Features:**
- Search by quote number
- Status filter
- Clicking a row → `/jobs/[quoteNumber]`

---

### `/jobs/[quoteNumber]` — Job Detail (Subcontractor)
**Access**: SUBCONTRACTOR only

**Layout**: Back button top left. Single column, focused layout.

**Sections:**
- Customer details: name, phone, address, Google Maps link
- Property details: perimeter, area, storeys
- Quote number + date received
- Current status (badge, large)
- Status update button → opens modal with next valid status only (can only move forward)
- Invoice section:
  - If no invoice: upload button (PDF or image, max 10MB)
  - If invoice uploaded: file name, upload date, download button, replace button
  - Note: invoice upload is required before Job Completed status is selectable

**Subcontractor does NOT see:**
- Financial breakdown (contractor rate, commission, markup)
- Audit log
- Notes

---

### `/commission` — Commission Reconciliation
**Access**: ADMIN only

**Layout**: Stat summary cards at top. Filterable table below.

**Stat cards:**
- Total commission earned (reconciled jobs)
- Total commission pending (completed but not reconciled)
- Total jobs completed
- Average commission per job

**Table columns:**
- Quote number
- Customer name
- Property address
- Completed date
- Contractor rate
- Customer price
- Omniside commission
- Reconciled (checkbox toggle — ADMIN marks off when payment received)
- Invoice (download link)

**Filters:**
- Reconciled / Unreconciled / All
- Date range

---

### `/audit` — Audit Log
**Access**: ADMIN only

**Layout**: Filter bar at top. Full-width table below.

**Table columns:**
- Timestamp
- Quote number
- Customer name
- Changed by (user name)
- From status
- To status

**Filters:**
- Search by quote number or user name
- Date range
- Status change type filter

---

### `/notifications` — Activity Feed
**Access**: ADMIN only

**Layout**: Chronological list of notifications, newest first.

**Notification types:**
- New lead received (quote number + customer name)
- Job marked completed + invoice attached (quote number + customer name)

**Features:**
- Mark as read / unread
- Click notification → navigates to relevant lead detail page
- Unread count badge on sidebar nav item

---

### `/settings` — Campaign Settings
**Access**: ADMIN only

**Layout**: Single page with four clearly labelled sections. Save button per section (not one global save).

**Section 1 — General**
- Campaign name
- Industry
- Client company name
- Subcontractor company name
- Campaign start date

**Section 2 — Commission & Pricing**
- Client markup percentage (%)
- Omniside commission percentage (%)
- Client margin percentage (%) — auto-calculated display: `100 - commission %`, not editable directly
- Note displayed: "Changes apply to future leads only. Existing lead records are not affected."

**Section 3 — Campaign Status**
- Status selector: Active / Paused / Completed (large, clear toggle — same control as on campaign card)
- Description of each status shown below selector

**Section 4 — Danger Zone**
- Deactivate campaign button (requires confirmation modal)

---

### `/users` — User Management
**Access**: ADMIN only

**Layout**: "Add User" button top right. User table below.

**Table columns:**
- Name
- Email
- Role (badge)
- Campaign assignment
- Status (Active / Inactive badge)
- Last login
- Actions: Edit, Deactivate/Reactivate, Delete

**Add / Edit User form (modal):**
- Name (text input)
- Email (text input)
- Password (text input — shown once, ADMIN sends manually)
- Role (dropdown: Admin / Client View / Subcontractor)
- Campaign assignment (dropdown — required for Client and Subcontractor roles, hidden for Admin)
- Save button

---

## Sidebar Navigation

### Admin sidebar
```
[Jobbly wordmark]

📊  Dashboard
📋  Leads           ← same as Dashboard, direct link to lead table
💰  Commission
🔔  Notifications   ← unread badge count
📁  Audit Log
⚙️  Settings
👥  Users

─────────────────
🔀  Switch Campaign  ← returns to /campaigns selector
👤  [User name]
🚪  Log out
```

### Client sidebar
```
[Jobbly wordmark]

📊  Dashboard

─────────────────
👤  [User name]
🚪  Log out
```

### Subcontractor sidebar
```
[Jobbly wordmark]

🔧  Jobs

─────────────────
👤  [User name]
🚪  Log out
```

---

## Component Architecture

```
/app
  layout.tsx                  → Root layout (font, theme provider)
  /login
    page.tsx                  → Login page
  /campaigns
    page.tsx                  → Campaign selector
  /dashboard
    page.tsx                  → Lead table + stat cards
  /leads
    /[quoteNumber]
      page.tsx                → Lead detail page
  /jobs
    page.tsx                  → Subcontractor job queue
    /[quoteNumber]
      page.tsx                → Job detail + status update
  /commission
    page.tsx                  → Commission reconciliation
  /audit
    page.tsx                  → Audit log
  /notifications
    page.tsx                  → Activity feed
  /settings
    page.tsx                  → Campaign settings (sectioned)
  /users
    page.tsx                  → User management

/components
  /layout
    Sidebar.tsx               → Role-aware sidebar
    PageHeader.tsx            → Page title + action buttons
    Footer.tsx                → Version number + Jobbly credit
  /ui
    Button.tsx
    Badge.tsx                 → Status badges
    Card.tsx                  → Stat cards
    Table.tsx                 → Reusable table component
    Modal.tsx                 → Confirmation + form modals
    Input.tsx
    Select.tsx
    EmptyState.tsx
    LoadingSpinner.tsx
  /leads
    LeadTable.tsx             → Full lead table with filters
    LeadStatCards.tsx         → Stat card row
    LeadStatusPipeline.tsx    → Visual status progress bar
    StatusUpdateModal.tsx     → Status change modal
    InvoiceUpload.tsx         → Invoice attachment component
  /campaigns
    CampaignCard.tsx          → Campaign selector card
    CampaignForm.tsx          → New/edit campaign form
  /users
    UserTable.tsx
    UserForm.tsx              → Add/edit user modal form

/lib
  auth.ts                     → NextAuth config
  prisma.ts                   → Prisma client singleton
  generateQuoteNumber.ts      → Quote number generation logic
  generateMapsUrl.ts          → Google Maps URL generator
  calculateCommission.ts      → Commission calculation logic
  notifications.ts            → Email notification helpers

/api
  /webhooks
    /lead                     → POST — n8n lead ingestion
  /leads
    /[quoteNumber]            → GET, PATCH
  /campaigns                  → GET, POST, PATCH
  /users                      → GET, POST, PATCH, DELETE
  /audit                      → GET
  /commission                 → GET, PATCH (reconciliation)
  /notifications              → GET, PATCH (mark read)

middleware.ts                 → Route protection + role enforcement
```

---

## Key Behaviour Rules

1. Campaign context for ADMIN is stored in the session after selecting from `/campaigns` — not in the URL
2. All API routes validate campaign scope from the session — a CLIENT user cannot query leads from another campaign by manipulating the request
3. Lead status can only move forward — the status update modal only shows the next valid status, never previous ones
4. Invoice upload on Job Completed — the "Mark as Job Completed" option is disabled in the status modal until an invoice is attached
5. Quote numbers in URLs use the human-readable format (`JBL-00001`) not the UUID — cleaner URLs, easier for Frank's VA to reference
6. Google Maps links open in a new tab — never navigate away from Jobbly
7. Dark/light mode preference stored in localStorage and applied before first paint to prevent flash
8. Unread notification count shown as a badge on the sidebar nav item — updates in real time or on page load
