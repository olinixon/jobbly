# jobbly-change-log-23.md
### Jobbly — Change Log 23

---

## Change 1 — Investigate and Fix Call Activity Stat Cards

### Context

The call activity stat cards on the dashboard show "Call data unavailable" on the live site at `jobbly.nz`. All environment variables (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`) are confirmed present in Vercel. The Google Sheet (ID: `1khKKXD3DuFTJxRuL5tlv3gFhSiZCl8VCmCnSbdptip4`, tab: `Sheet1`) is shared with the service account and contains real data. The most likely cause is private key newline formatting in Vercel.

---

### Step 1 — Add temporary diagnostic logging

Open `lib/googleSheets.ts`. Inside `getCallStats()`, add these logs before the Sheets API call:

```ts
console.log('[CallStats] EMAIL present:', !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
console.log('[CallStats] KEY present:', !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
console.log('[CallStats] KEY prefix:', process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.substring(0, 40))
```

Wrap the Sheets API call in a try/catch (if not already) and log the full error:

```ts
} catch (err) {
  console.error('[CallStats] Sheets API error:', err)
  throw err
}
```

Deploy (`git push origin main`), then open Vercel function logs and hit `https://jobbly.nz/api/call-stats` in the browser to trigger the logs. **Report what you see before proceeding.**

---

### Step 2 — Fix private key newline formatting

This is the most likely root cause. When a private key is pasted into Vercel's UI, the `\n` characters are often stored as the literal two-character string `\n` rather than actual newlines — breaking PEM format and causing silent auth failure.

In `lib/googleSheets.ts`, find where the private key is passed into the Google auth client. Ensure this replacement is applied:

```ts
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
```

The regex must be `/\\n/g` (escaped backslash) to match the literal `\n` string that Vercel stores — not `/\n/g`. Pass `privateKey` (post-replacement) into the auth client, not the raw env var.

If this line already exists, verify the regex is correct.

---

### Step 3 — Verify sheet range

Confirm the range in the Sheets API call is exactly `Sheet1!A:F`. The sheet columns are: Lead ID, Lead Name, Call Attempted Time, Answered, Not Interested, Transfer Attempted — 6 columns, A through F.

Correct it if different.

---

### Step 4 — Verify boolean parsing

The sheet stores `TRUE` as a string in columns D, E, F. Confirm the parsing logic uses strict string equality:

```ts
const answered = rows.filter(row => row[3] === 'TRUE').length
const notInterested = rows.filter(row => row[4] === 'TRUE').length
const transferAttempted = rows.filter(row => row[5] === 'TRUE').length
```

Fix if using anything other than `=== 'TRUE'`.

---

### Step 5 — Remove logging, confirm, and ship

Once cards show real numbers on `jobbly.nz`:

1. Remove all temporary `console.log` statements added in Step 1
2. Bump version — PATCH
3. Commit: `vX.X.X — fix call activity cards: correct Google Sheets private key formatting for Vercel`
4. Push to GitHub: `git push origin main`
5. Run Vibstr build report per CLAUDE.md
