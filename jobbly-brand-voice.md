# jobbly-brand-voice.md
### Jobbly — Brand, Visual Design & Tone

---

## Design Reference

The closest visual reference for Jobbly is **Instantly.ai** — a cold email outreach platform known for its clean, approachable, and highly functional dashboard UI. Key qualities to draw from:

- Light backgrounds with soft grey surfaces and clear visual hierarchy
- Left sidebar navigation — compact, icon + label, easy to scan
- Data-dense tables that don't feel overwhelming — good row spacing, clear column labels
- Stat/metric cards at the top of dashboard views — bold numbers, small labels
- Purposeful use of colour — mostly neutral, with colour reserved for status indicators and CTAs
- No decorative elements — every visual element earns its place by serving a function
- Feels modern and professional without being cold or corporate

Jobbly should feel like a tool built by someone who uses tools like this every day — not a generic SaaS template.

---

## Colour Theme

**Default: Light mode**
Light mode is the default experience for all users on first load.

**Toggle: Dark mode available**
Users can switch to dark mode via a toggle in the app header or user settings. Their preference is saved and persists across sessions.

### Light Mode Palette

| Role | Value | Usage |
|---|---|---|
| Background | `#F9FAFB` | Page background |
| Surface | `#FFFFFF` | Cards, panels, modals |
| Border | `#E5E7EB` | Table lines, card borders, dividers |
| Text primary | `#111827` | Headings, key data |
| Text secondary | `#6B7280` | Labels, metadata, captions |
| Brand accent | `#2563EB` | Primary buttons, active nav items, links |
| Success | `#16A34A` | Job Completed status, positive indicators |
| Warning | `#D97706` | Job Booked status, pending indicators |
| Info | `#2563EB` | Quote Sent status |
| Neutral | `#9CA3AF` | Lead Received status, inactive states |
| Danger | `#DC2626` | Destructive actions, error states |

### Dark Mode Palette

| Role | Value | Usage |
|---|---|---|
| Background | `#0F172A` | Page background |
| Surface | `#1E293B` | Cards, panels, modals |
| Border | `#334155` | Table lines, card borders, dividers |
| Text primary | `#F1F5F9` | Headings, key data |
| Text secondary | `#94A3B8` | Labels, metadata, captions |
| Brand accent | `#3B82F6` | Primary buttons, active nav items, links |
| All status colours | Slightly lighter variants | Maintained for readability on dark |

---

## Status Colour Coding

Every lead status has a consistent colour and pill/badge treatment throughout the app:

| Status | Colour | Badge style |
|---|---|---|
| Lead Received | Grey | `bg-gray-100 text-gray-600` |
| Quote Sent | Blue | `bg-blue-100 text-blue-700` |
| Job Booked | Amber | `bg-amber-100 text-amber-700` |
| Job Completed | Green | `bg-green-100 text-green-700` |

These colours are used consistently in the leads table, lead detail page, and any summary cards.

---

## Typography

- **Primary font**: `Inter` — clean, highly legible, standard for SaaS dashboards
- **Fallback**: system-ui, sans-serif
- **Heading sizes**: Use Tailwind's `text-xl`, `text-2xl` for page headings; `text-sm font-medium` for table column headers
- **Data values**: `font-semibold` for numbers that matter (commission amounts, job counts)
- **Labels and metadata**: `text-sm text-gray-500` — understated, not competing with data

---

## Layout & Navigation

### Sidebar (left, fixed)
- Fixed left sidebar on desktop, collapsible on mobile
- Contains: Jobbly logo/wordmark at top, primary nav items, user profile + logout at bottom
- Active nav item: brand accent colour background, full width highlight
- Nav items: icon + label (not icon-only)

### Page structure
- Page title + optional subtitle at top left
- Action buttons (e.g. "Add User", "Export") top right
- Stat cards row below page title on dashboard views
- Main content (table or list) below stat cards
- Footer: version number (`v1.0.0`) + "Jobbly by Omniside AI" — small, secondary text colour, right-aligned

### Spacing
- Generous padding inside cards and panels — nothing cramped
- Table rows: comfortable height, not too tight, easy to scan quickly
- Consistent 4px grid (Tailwind spacing scale)

---

## Branding

**App name**: Jobbly
**Built by**: Omniside AI
**Logo**: Wordmark "Jobbly" in the sidebar — bold, brand accent colour or dark depending on mode. No icon/logo mark needed for MVP — wordmark only.
**Footer credit**: "Jobbly by Omniside AI" — small, subtle, on every page

Jobbly branding is visible throughout the app for all roles — admin, client, and subcontractor all see the Jobbly name. This is not a white-label product.

---

## Tone of Voice

Jobbly is a working tool. The language throughout the app should be:

**Clear over clever** — label things what they are. "Quote Sent" not "Outreach Initiated". "Job Completed" not "Engagement Closed".

**Direct** — button labels are verbs: "Approve", "Update Status", "Attach Invoice", "Add User". Not "Submit" or "Confirm" when something more specific works better.

**Friendly, not formal** — error messages and empty states should feel human. "No leads yet — they'll appear here as calls come in." Not "No records found."

**Concise** — no paragraph explanations inside the UI. If something needs explaining, it's a design problem, not a copy problem.

### Examples

| Situation | ✅ Do this | ❌ Not this |
|---|---|---|
| Empty leads table | "No leads yet. They'll appear here automatically after each call." | "No records found in the database." |
| Successful status update | "Status updated to Job Booked." | "The operation was completed successfully." |
| Invoice required warning | "Attach an invoice before marking this job complete." | "Validation error: required field missing." |
| Deactivating a user | "This user won't be able to log in. You can reactivate them any time." | "Warning: This action will modify user permissions." |
| Loading state | "Loading leads…" | "Please wait while data is being retrieved." |

---

## Component Style Rules

- **Buttons**: Rounded (`rounded-lg`), not pill-shaped. Primary = brand accent fill. Secondary = white with border. Destructive = red.
- **Tables**: Clean, no zebra striping by default — hover highlight on rows only. Sticky header on scroll.
- **Cards/stat blocks**: White surface, soft border, subtle shadow (`shadow-sm`). Number large and bold, label small and muted below.
- **Modals**: Centred, medium width, soft overlay behind. Used sparingly — only for confirmations and short forms.
- **Badges/pills**: Status indicators only. Consistent colour coding as defined above.
- **Forms**: Clean label above input. Inputs full width within their container. Error state: red border + small error message below field.
- **Empty states**: Centred, muted icon or illustration (simple), short friendly message, optional CTA button if relevant.

---

## Mobile Responsiveness

The app must be responsive and usable on mobile — Frank's VA may be updating job statuses from a phone.

- Sidebar collapses to a hamburger menu on mobile
- Leads table scrolls horizontally on small screens — all columns preserved, not hidden
- Stat cards stack vertically on mobile
- Touch targets minimum 44px height on interactive elements
- Dark/light toggle accessible on mobile
