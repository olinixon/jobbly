# Jobbly — Change Log 10
### Claude Code Prompt — Paste this in full, read completely before writing any code

---

## Instructions for Claude Code

Read this entire document before touching a single file. There are four changes in this session — two bug fixes, one UI improvement, and one new feature. Complete all four in a single session. Do not mark the session complete until every item in the build checklist at the bottom is ticked off.

After completing all changes, bump the version in `package.json` (MINOR bump), commit with a descriptive message, and run the Vibstr build report as documented in `CLAUDE.md`.

---

## Pre-Flight — Google Service Account Setup (Oli does this before running the prompt)

The Google Sheet used for call stats is private. Jobbly cannot read it without credentials. Before running this prompt, Oli must complete the following one-time setup:

### Step 1 — Create a Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **"New Project"** — name it something like `Jobbly`
3. Select the new project

### Step 2 — Enable the Google Sheets API
1. In the left menu, go to **APIs & Services → Library**
2. Search for **"Google Sheets API"**
3. Click it and hit **"Enable"**

### Step 3 — Create a Service Account
1. Go to **APIs & Services → Credentials**
2. Click **"Create Credentials" → "Service Account"**
3. Name it `jobbly-sheets-reader` — click through and save
4. Click the newly created service account in the list
5. Go to the **"Keys"** tab → **"Add Key" → "Create new key"**
6. Choose **JSON** → click **Create**
7. A `.json` file will download — keep this safe, do not commit it to Git

### Step 4 — Share the Google Sheet with the Service Account
1. Open the JSON file — copy the `client_email` value (looks like `jobbly-sheets-reader@your-project.iam.gserviceaccount.com`)
2. Open the Google Sheet: `https://docs.google.com/spreadsheets/d/1khKKXD3DuFTJxRuL5tlv3gFhSiZCl8VCmCnSbdptip4`
3. Click **Share** — paste in the service account email
4. Set permission to **Viewer** — click Send

### Step 5 — Add credentials to environment variables
From the downloaded JSON file, add these two values to **both** `.env.local` and the **Vercel dashboard** (Settings → Environment Variables):

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the JSON file>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private_key from the JSON file>
```

**Important for the private key:** The value in the JSON file contains literal `\n` characters. When pasting into Vercel, paste the raw value as-is — Vercel handles the newline escaping. In `.env.local`, wrap it in double quotes.

**Also add both variable names (without values) to `.env.example`** so the project's required env vars stay documented.

Once these steps are done, proceed with the build.

---

## Change 1 — [#154] Fix Needs Action — Booked Jobs Appearing Incorrectly

### Problem
The Needs Action tab and badge count is showing `JOB_BOOKED` leads for the subcontractor even when those jobs were only recently booked. A job that has just been booked requires no action from the subcontractor yet — they are waiting on scheduling. The subcontractor seeing a +1 on Needs Action immediately after a booking is noise, not signal.

### What the correct rules are

The Needs Action system should only surface a lead when **the required action is genuinely overdue**. The two valid conditions are:

1. **Quotes not sent** — `LEAD_RECEIVED` leads where `created_at` is 24+ hours ago
2. **Jobs not completed** — `JOB_BOOKED` leads where `job_booked_date` is **10 or more days ago** AND `invoice_url IS NULL`

A `JOB_BOOKED` lead with a recent `job_booked_date` (under 10 days) must never appear in Needs Action, regardless of role.

### Root cause — investigate before fixing

Before writing any code, find exactly where the Needs Action query is built. Check:

1. `GET /api/needs-action` — is the `JOB_BOOKED` query correctly applying the 10-day threshold using `job_booked_date`? Or is it returning all `JOB_BOOKED` leads regardless of age?
2. The sidebar badge count — is it reading from the same API, or is it computing its own count separately with a looser query?
3. The Needs Action filter on the jobs table (if active) — is it applying the same threshold?
4. The urgency dot logic on the subcontractor job queue — is it showing a dot on `JOB_BOOKED` rows that are under 10 days old?

Fix whichever of these is wrong. The 10-day threshold must be consistently applied in every place that surfaces Needs Action data.

### Correct query logic (for reference)

```typescript
// Quotes not sent — LEAD_RECEIVED, 24+ hours since created_at
const quotesNotSent = await prisma.lead.findMany({
  where: {
    campaign_id: session.campaignId,
    status: 'LEAD_RECEIVED',
    created_at: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }
});

// Jobs not completed — JOB_BOOKED, 10+ days since job_booked_date, no invoice
const jobsNotCompleted = await prisma.lead.findMany({
  where: {
    campaign_id: session.campaignId,
    status: 'JOB_BOOKED',
    invoice_url: null,
    job_booked_date: { lte: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }
  }
});
```

### Also verify — urgency dot rules on JOB_BOOKED rows

The urgency dot on a `JOB_BOOKED` row in the subcontractor job queue must follow these thresholds:

| Time since `job_booked_date` | Dot |
|---|---|
| Under 10 days | No dot |
| 10–20 days | 🟡 Amber |
| 21+ days | 🔴 Red |

If the dot is appearing on recently booked jobs, fix the urgency calculation to use `job_booked_date` with the correct thresholds — not `updated_at` or `created_at`.

### What must NOT trigger Needs Action
- A `JOB_BOOKED` lead under 10 days old — never
- A `QUOTE_SENT` lead — never
- A `JOB_COMPLETED` lead — never
- Any lead where the required action has already been taken (status moved or invoice uploaded)

---

## Change 2 — Settings Page Layout — Centre and Widen for All Roles

### Problem
The settings page across all roles (Admin, Client, Subcontractor) renders its content in a narrow left-aligned column, leaving a large blank area on the right side of the screen. This wastes space and makes the page feel unfinished — all sections are huddled in the left ~45% of the screen.

### What needs to happen

Centre the settings content on the page and widen the cards so the layout uses the available space properly. This applies to every settings page across all three roles.

### Layout spec

- **Max width:** `max-w-3xl` (Tailwind — 48rem / 768px) — wide enough to feel spacious, narrow enough to stay readable
- **Centering:** `mx-auto` — horizontally centred within the main content area
- **Padding:** `px-6 py-8` on the outer wrapper — consistent breathing room
- **Card width:** Cards stretch to fill the full `max-w-3xl` container — no fixed narrower width
- **Card padding:** `p-6` — current padding is fine, keep it
- Do not change any field layouts, section order, input styles, or save button behaviour — this is a layout-only change

### Where to apply this

- `app/settings/page.tsx` — Admin settings
- Any Client settings page if one exists
- Any Subcontractor settings page if one exists
- If settings sections are rendered from a shared component, apply the layout change to that component so it cascades to all roles automatically

### Implementation

Find the outermost wrapper `<div>` on the settings page content area (inside the sidebar layout, the scrollable main content). Update it to:

```tsx
<div className="max-w-3xl mx-auto px-6 py-8">
  {/* all settings sections */}
</div>
```

Do not touch the sidebar, header, or any other page — settings pages only.

---

## Change 3 — Call Activity Stat Cards on Admin and Client Dashboards

### Overview

Add four new call activity stat cards to both the admin dashboard and the client dashboard. Data is fetched from a Google Sheet that is updated in real-time by the n8n post-call workflow after every AI voice agent call.

The cards must respond to the same date range filter already on the dashboard — when the user changes the date range, the call stats recalculate to only count calls within that period.

The cards show:
- **Total Calls** — total number of calls made (count of non-empty Lead ID rows within the selected date range)
- **Answered** — calls where the lead picked up (count of `TRUE` in Answered column within range)
- **Not Interested** — leads who answered but declined (count of `TRUE` in Not Interested column within range)
- **Transfer Attempted** — calls where a transfer was attempted (count of `TRUE` in Transfer Attempted column within range)

### Google Sheet details

- **Sheet ID:** `1khKKXD3DuFTJxRuL5tlv3gFhSiZCl8VCmCnSbdptip4`
- **Sheet name (tab):** `Sheet1` — confirm this is the correct tab name before building; if the tab is named differently, use whatever the actual tab name is
- **Data range:** `A:F` — columns A through F, all rows

**Column mapping:**

| Column | Header | Used for |
|---|---|---|
| A | Lead ID | Total Calls — count non-empty rows (excluding header row 1) |
| B | Lead Name | Not used |
| C | Call Attempted Time | Date range filtering — parsed as ISO 8601 (e.g. `2026-03-09T16:18:10.894+13:00`) |
| D | Answered | Count rows where value is exactly `TRUE` (string, all caps) |
| E | Not Interested | Count rows where value is exactly `TRUE` (string, all caps) |
| F | Transfer Attempted | Count rows where value is exactly `TRUE` (string, all caps) |

**Counting rules:**
- `TRUE` is the string `"TRUE"` in all caps — not boolean `true`, not `"true"`, not `"True"`
- A blank cell counts as 0, not TRUE
- Row 1 is the header row — always skip it when counting
- Total Calls = number of rows in column A that have a non-empty value AND fall within the selected date range (after skipping row 1)
- Date filtering uses column C (Call Attempted Time) — parse with `new Date(row[2])` — ISO 8601 format with timezone offset is guaranteed

---

### Step 1 — Install the Google Sheets API client library

```bash
npm install @googleapis/sheets
```

Use `@googleapis/sheets` (scoped package) — **not** the full `googleapis` package. The scoped package includes only the Sheets API and is significantly lighter. Flag this package installation to Oli before proceeding as per CLAUDE.md rules.

---

### Step 2 — Create the Google Sheets helper utility

Create `/lib/googleSheets.ts`:

```typescript
import { sheets, auth as googleAuth } from '@googleapis/sheets';

const SHEET_ID = '1khKKXD3DuFTJxRuL5tlv3gFhSiZCl8VCmCnSbdptip4';
const SHEET_RANGE = 'Sheet1!A:F'; // update tab name if different

export interface CallStats {
  totalCalls: number;
  answered: number;
  notInterested: number;
  transferAttempted: number;
}

export async function getCallStats(from?: Date, to?: Date): Promise<CallStats> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error('Google Sheets credentials not configured');
  }

  const authClient = new googleAuth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const client = sheets({ version: 'v4', auth: authClient });

  const response = await client.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  });

  const rows = response.data.values ?? [];

  // Skip header row (index 0), filter to rows with a non-empty Lead ID
  let dataRows = rows.slice(1).filter(row => row[0] && String(row[0]).trim() !== '');

  // Apply date range filter if provided — uses column C (index 2), ISO 8601 timestamp
  if (from || to) {
    dataRows = dataRows.filter(row => {
      const rawDate = row[2];
      if (!rawDate) return false;
      const callDate = new Date(rawDate);
      if (isNaN(callDate.getTime())) return false;
      if (from && callDate < from) return false;
      if (to && callDate > to) return false;
      return true;
    });
  }

  const totalCalls = dataRows.length;
  const answered = dataRows.filter(row => row[3] === 'TRUE').length;
  const notInterested = dataRows.filter(row => row[4] === 'TRUE').length;
  const transferAttempted = dataRows.filter(row => row[5] === 'TRUE').length;

  return { totalCalls, answered, notInterested, transferAttempted };
}
```

---

### Step 3 — Create the API endpoint

Create `app/api/call-stats/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCallStats } from '@/lib/googleSheets';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  // Only ADMIN and CLIENT can see call stats
  if (!session || session.user.role === 'SUBCONTRACTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Read optional date range query params — use the same param names as the existing dashboard filter
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  try {
    const stats = await getCallStats(from, to);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to fetch call stats from Google Sheets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch call stats' },
      { status: 500 }
    );
  }
}
```

**Important:** Before finalising this route, check what query param names the existing dashboard date range filter uses when calling other API endpoints (e.g. `from`/`to`, or `startDate`/`endDate`, or `dateFrom`/`dateTo`). Use exactly the same param names here so the frontend can pass the same values consistently.

---

### Step 4 — Build the CallStatCards component

Create `/components/dashboard/CallStatCards.tsx`:

The component must begin with `'use client'` — it fetches on mount and re-fetches when the date range changes.

**Props:**
```typescript
interface CallStatCardsProps {
  from?: string; // ISO date string — passed down from dashboard date range filter state
  to?: string;   // ISO date string — passed down from dashboard date range filter state
}
```

**Behaviour:**
- On mount, fetch `GET /api/call-stats` with current `from`/`to` params appended if set
- Re-fetch whenever `from` or `to` props change — use `useEffect` with `[from, to]` as the dependency array
- Shows a loading skeleton while fetching — same skeleton style as existing stat cards
- Shows four cards in a single row (same card style as existing stat cards):
  - **Total Calls** — phone icon or similar
  - **Answered** — checkmark icon
  - **Not Interested** — thumbs down or X icon
  - **Transfer Attempted** — forward arrow icon
- If the fetch fails, show a subtle inline error state on the cards: "Call data unavailable" — do not crash the page or affect any other dashboard section
- Cards are read-only — no interactions
- Zero counts display as `0` — not blank, not dash, not error

The card style must exactly match the existing stat cards — same background, font sizes, and spacing. Use the same card component or visual pattern already in use.

---

### Step 5 — Wire CallStatCards into the dashboard date range filter

On both the admin dashboard and client dashboard, `CallStatCards` must receive the current date range from the existing filter and re-fetch when it changes.

Check how the existing dashboard date range filter passes its selected range to the existing stat cards and lead table. Hook `CallStatCards` into the same state or props mechanism — pass `from` and `to` as ISO strings so it can append them as query params when fetching.

---

### Step 6 — Update dashboard card row order

On both the admin dashboard (`/dashboard`) and the client dashboard, reorder the stat card sections so they appear in this order from top to bottom:

**Row 1 — Call Activity** (new, from this change)
Total Calls · Answered · Not Interested · Transfer Attempted

**Row 2 — Pipeline** (existing)
Total Leads · Quotes Sent · Jobs Booked · Jobs Completed

**Row 3 — Financials** (existing)
Total Billed to Customers · Our Margin *(and any other existing financial cards)*

Add a small section label above each row:
```
className="text-xs text-muted-foreground uppercase tracking-wide mb-2"
```
Labels: **"Call Activity"** · **"Pipeline"** · **"Financials"**

**Admin dashboard:** Keep all existing cards exactly as they are — do not add or remove any. Just reorder so Call Activity sits at the top, then add the new Call Activity row.

**Client dashboard:** Same order and same labels.

---

## Change 4 — Rename "Commission" to "Financials" in Client-Facing Views

On the client side only, rename "Commission" to **"Financials"** in all of the following locations:

- Client sidebar nav item label
- The page H1 heading on `/commission` when viewed by a CLIENT role
- Any breadcrumb referencing "Commission" in the client view
- The `<title>` tag on the commission page when viewed by a CLIENT role

Do **not** change:
- The route path `/commission` — stays the same
- Anything the ADMIN sees — admin still sees "Commission" everywhere
- Any underlying data, queries, or component logic

---

## Build Order

1. Investigate and fix the Needs Action query in `GET /api/needs-action` — confirm 10-day threshold on `job_booked_date`
2. Check and fix sidebar badge count if it uses a separate query
3. Check and fix Needs Action filter on the subcontractor jobs table
4. Check and fix urgency dot logic on `JOB_BOOKED` rows — confirm it uses `job_booked_date` with correct thresholds
5. Apply settings page layout fix to all role settings pages — confirm admin, client, and subcontractor all centred
6. Confirm `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` are present in both `.env.local` AND Vercel dashboard — do not proceed to steps 7+ without both
7. Add both variable names (no values) to `.env.example`
8. Install `@googleapis/sheets` package — flag to Oli per CLAUDE.md
9. Create `/lib/googleSheets.ts` utility
10. Confirm the Google Sheet tab name is `Sheet1` — if different, update `SHEET_RANGE` in the utility
11. Confirm what query param names the existing dashboard date range filter uses — update the API route to match
12. Create `GET /api/call-stats/route.ts` with `export const runtime = 'nodejs'`
13. Create `/components/dashboard/CallStatCards.tsx` with `'use client'` directive and `from`/`to` props
14. Wire `CallStatCards` into the existing dashboard date range filter state on admin dashboard
15. Wire `CallStatCards` into the existing dashboard date range filter state on client dashboard
16. Reorder stat card rows on admin dashboard — Call Activity → Pipeline → Financials — add row labels
17. Reorder stat card rows on client dashboard — same
18. Rename "Commission" → "Financials" in client sidebar, H1, breadcrumb, and `<title>`
19. Verify call stats cards update correctly when date range filter is changed
20. Verify graceful error state if credentials are missing or Sheet fetch fails
21. Bump version in `package.json` — MINOR bump
22. Commit: `v[X.X.0] — fix needs action threshold, centre settings layout, add call activity stat cards, rename client commission to financials`
23. Push to GitHub: `git push origin main`
24. Run Vibstr build report as per CLAUDE.md

---

## Build Checklist

**Change 1 — Needs Action bug fix**
- [ ] `GET /api/needs-action` only returns `JOB_BOOKED` leads where `job_booked_date` is 10+ days ago AND `invoice_url` is null
- [ ] A `JOB_BOOKED` lead under 10 days old does not appear in Needs Action
- [ ] Sidebar badge count matches the corrected query — not inflated by recently booked jobs
- [ ] Needs Action filter on subcontractor jobs table applies the same 10-day threshold
- [ ] Urgency dot on `JOB_BOOKED` rows only appears at 10+ days — no dot on recently booked jobs
- [ ] Amber dot on `JOB_BOOKED` at 10–20 days, red dot at 21+ days
- [ ] `QUOTE_SENT`, `JOB_COMPLETED` leads never appear in Needs Action

**Change 2 — Settings page layout**
- [ ] Admin settings page content is centred with `max-w-3xl mx-auto`
- [ ] Client settings page (if exists) is centred with `max-w-3xl mx-auto`
- [ ] Subcontractor settings page (if exists) is centred with `max-w-3xl mx-auto`
- [ ] Cards are wider — no longer huddled in the left portion of the screen
- [ ] No field layouts, section order, inputs, or save buttons changed
- [ ] Sidebar and header unaffected

**Change 3 — Call activity stat cards**
- [ ] `GOOGLE_SERVICE_ACCOUNT_EMAIL` set in `.env.local`
- [ ] `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` set in `.env.local`
- [ ] Both env vars set in Vercel dashboard (Settings → Environment Variables)
- [ ] Both variable names added to `.env.example`
- [ ] Google Sheet shared with service account email as Viewer
- [ ] `@googleapis/sheets` package installed and flagged
- [ ] `GET /api/call-stats` returns correct all-time counts when no date params provided
- [ ] `GET /api/call-stats?from=X&to=Y` correctly filters rows by column C (Call Attempted Time)
- [ ] Date parsing handles ISO 8601 format with timezone offset (`2026-03-09T16:18:10.894+13:00`)
- [ ] Rows with missing or unparseable date in column C are excluded when a date range is active
- [ ] Total Calls = count of non-empty Lead ID rows within range
- [ ] Answered = count of exact string `TRUE` in column D within range
- [ ] Not Interested = count of exact string `TRUE` in column E within range
- [ ] Transfer Attempted = count of exact string `TRUE` in column F within range
- [ ] SUBCONTRACTOR role receives 403 from this endpoint
- [ ] API returns 500 gracefully if Sheets fetch fails — does not crash
- [ ] `export const runtime = 'nodejs'` present on the route
- [ ] Admin dashboard: row order is Call Activity → Pipeline → Financials
- [ ] Admin dashboard: row labels ("Call Activity", "Pipeline", "Financials") visible
- [ ] Client dashboard: same row order and labels
- [ ] Call stat cards match existing stat card visual style exactly
- [ ] `'use client'` directive present on CallStatCards component
- [ ] Cards show loading skeleton while fetching
- [ ] Cards show "Call data unavailable" if fetch fails — rest of dashboard unaffected
- [ ] Zero counts display as `0` — not blank, not error
- [ ] Changing the dashboard date range filter triggers a re-fetch of call stats
- [ ] Call stats correctly reflect only calls within the selected date range after re-fetch

**Change 4 — Client navigation rename**
- [ ] "Commission" renamed to "Financials" in client sidebar
- [ ] Commission page H1 heading shows "Financials" when viewed by CLIENT role
- [ ] Commission page `<title>` tag shows "Financials" when viewed by CLIENT role
- [ ] Route path `/commission` unchanged
- [ ] Admin still sees "Commission" everywhere — label change is client-facing only

**Final**
- [ ] Version bumped in `package.json` — MINOR
- [ ] Committed with correct message format
- [ ] Vibstr build report sent
