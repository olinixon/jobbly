# jobbly-user-stories.md
### Jobbly — User Stories

---

## Overview

Jobbly has three user roles. Everyone hits the same `/login` page. After authentication, the app routes each user to the correct view based on their role and campaign assignment.

**Admin (Oli — Omniside AI)**
Sees all campaigns. After login, lands on a campaign selector. Selects a campaign to enter its full admin view. Can switch between campaigns freely. Has access to everything: leads, financials, audit logs, user management.

**Client View (e.g. Continuous Group)**
Scoped to one campaign at the point of account creation. After login, automatically routed to their campaign dashboard. Read-only. Cannot see any other campaign or any financial data beyond customer-facing revenue numbers.

**Subcontractor (e.g. Frank / Pro Water Blasting VA)**
Scoped to one campaign at the point of account creation. After login, automatically routed to their job queue for that campaign. Can update job status and attach invoices. Cannot see commission data, other campaigns, or other subcontractors' jobs.

---

## Login & Routing Flow

```
All users → /login (email + password)
                |
                ├── ADMIN → Campaign Selector → Select campaign → Admin Dashboard
                |
                ├── CLIENT → Auto-routed → Campaign Stats Dashboard (read-only)
                |
                └── SUBCONTRACTOR → Auto-routed → Job Queue (their campaign only)
```

- No public signup — only Admin can create users
- Non-admin users are assigned to a campaign at account creation
- Campaign scoping is enforced at the API level, not just the UI

---

## User Management (Admin Only)

Oli is the only person who can create, edit, or remove user accounts.

**Creating a user:**
- Navigate to User Management (admin only)
- Enter: name, email, temporary password
- Select role: Admin / Client View / Subcontractor
- Select campaign assignment (required for Client View and Subcontractor roles)
- User is created immediately and can log in with those credentials
- Oli sends login details manually

**Editing / removing users:**
- Oli can change a user's role, campaign assignment, or reset their password
- Oli can deactivate or delete a user at any time

**Post-MVP:** Magic invite link — Oli adds email, system sends invite, user sets own password.

---

## Role Permissions Matrix

| Feature | Admin (Oli) | Client View | Subcontractor |
|---|---|---|---|
| Campaign selector on login | ✅ | ❌ | ❌ |
| Lead dashboard — all leads | ✅ | ❌ | ❌ |
| Lead search by quote number | ✅ | ❌ | ✅ |
| Quote details & pricing | ✅ | ❌ | ✅ (own campaign) |
| Google Maps property link | ✅ | ❌ | ✅ |
| Commission & financials | ✅ | ❌ | ❌ |
| Campaign stats dashboard | ✅ | ✅ | ❌ |
| Update job status | ✅ | ❌ | ✅ |
| Attach invoice | ✅ | ❌ | ✅ |
| User management | ✅ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ |
| Webhook lead ingestion | System only | ❌ | ❌ |

---

## Lead Status Pipeline

Every lead moves through these stages in order:

```
Lead Received → Quote Sent → Job Booked → Job Completed
```

- Status updated manually by Frank's VA (or Oli) by searching the quote number
- **Job Completed** requires an invoice attachment before the status saves
- Every status change writes to the audit log: lead ID, user ID, old status, new status, timestamp

---

## Revenue Logic (Stored, Not Computed)

Calculated once at lead creation and stored immutably. Never recomputed — stored values are the permanent record.

| Field | Formula | Example |
|---|---|---|
| Contractor rate | Subcontractor's price | $200 |
| Customer price | Contractor rate × 1.25 | $250 |
| Gross markup | Customer price − Contractor rate | $50 |
| Omniside commission | Gross markup × 0.40 | $20 |
| Client margin | Gross markup × 0.60 | $30 |

Markup percentage (25%) and commission percentage (40%) are configurable per campaign — not hardcoded.

---

## User Stories

### Oli — Admin

> As Oli, after logging in I want to see a campaign selector showing all my active campaigns, so I can choose which client's dashboard to enter.

> As Oli, within a campaign I want to see every lead with property details, quote number, calculated pricing, and current status — all in one dashboard without touching a spreadsheet.

> As Oli, I want a Google Maps link on every lead so I can sanity-check the property address and size in seconds.

> As Oli, I want a commission tracker showing: quotes sent, jobs booked, jobs completed, total commission earned, and total commission pending — updated in real time.

> As Oli, I want to filter and search leads by quote number, status, date range, or customer name.

> As Oli, when a job is marked completed and an invoice is attached, I want an email notification so I can verify and reconcile without manually checking.

> As Oli, I want a full audit log of every status change — who changed it, when, and from what to what — so any dispute with a subcontractor can be resolved by pulling the quote number.

> As Oli, I want a User Management screen where I can create users, assign them a role and campaign, reset passwords, and remove access at any time.

> As Oli, I want to be able to add a new campaign to Jobbly when I onboard a new client, without any code changes.

---

### Frank / Pro Water Blasting VA — Subcontractor

> As Frank's VA, when I log in I want to land directly on my job queue for my campaign — no navigation required.

> As Frank's VA, when a new lead arrives I want an immediate email notification so I can act without waiting to hear from Oli.

> As Frank's VA, I want to search for a job by quote number so I can find the right lead in seconds.

> As Frank's VA, I want to update job status through the pipeline (Quote Sent → Job Booked → Job Completed) so everyone can see where each job is at.

> As Frank's VA, when marking a job as Job Completed, I want to attach the invoice so Oli has the contractor rate on record.

> As Frank's VA, I only want to see jobs for my campaign — no other leads, no financial breakdown, no commission data.

---

### Continuous Group — Client View

> As Continuous Group, when I log in I want to land directly on my campaign dashboard — no navigation required.

> As Continuous Group, I want to see headline campaign numbers at a glance: leads called, quotes sent, jobs booked, jobs completed, and total revenue generated.

> As Continuous Group, I don't need to see contractor rates, Omniside commission figures, or subcontractor details — just the customer-facing performance numbers.

---

## Notifications

| Trigger | Recipient | Method |
|---|---|---|
| New lead arrives in Jobbly | Frank / VA | Email (immediate) |
| Job marked as Completed + invoice attached | Oli | Email (immediate) |
| Push / SMS notifications | — | Post-MVP |

---

## Out of Scope for MVP

- AI-assisted quote editing
- Magic invite links (post-MVP)
- Oli manually approving quotes before they send
- Integration with Continuous Group's internal systems
- Customer-facing portal
- SMS / push notifications
- Multiple subcontractors per campaign
