# jobbly-webhook-spec.md
### Jobbly — Webhook Specification

---

## Overview

Jobbly receives lead data via a webhook fired by n8n after each AI voice agent call where the lead says yes. This is the primary and only way leads enter Jobbly in the MVP.

---

## n8n Workflow Architecture

After a successful call, the n8n workflow splits into two parallel branches:

```
AI voice agent call ends (lead says yes)
        │
        ▼
   n8n workflow triggers
        │
        ├── Branch 1 → POST to Jobbly /api/webhooks/lead
        │              (real-time, primary source of truth)
        │
        └── Branch 2 → Append row to Google Sheet
                       (backup, human-readable audit trail)
```

Both branches receive identical data. Neither branch depends on the other — if one fails, the other still completes. The Google Sheet is a backup only — Jobbly is the source of truth.

---

## Jobbly Webhook Endpoint

**URL**: `POST /api/webhooks/lead`

**Authentication**: Webhook secret header
- Header name: `x-webhook-secret`
- Value: stored in `.env` as `WEBHOOK_SECRET`
- n8n must include this header on every request
- Requests without a valid secret are rejected with `401 Unauthorized`

**Content type**: `application/json`

---

## What Jobbly Does on Receipt

When a valid payload arrives at `/api/webhooks/lead`, Jobbly:

1. Validates the webhook secret header
2. Stores the full raw payload in `leads.webhook_raw` (JSON) — before any processing
3. Maps incoming fields to internal Jobbly fields (see mapping table below)
4. Auto-generates a quote number (e.g. `JBL-00001`)
5. Auto-generates a Google Maps URL from the property address
6. Calculates and stores all financial fields using the campaign's current rates
7. Sets initial status to `LEAD_RECEIVED`
8. Creates the lead record in the database
9. Sends email notification to the subcontractor (Frank / VA)
10. Returns `200 OK` with the created lead's quote number

If any required field is missing, Jobbly still creates the lead with nulls for missing fields and flags it with a `needs_review` note — it never silently drops a lead.

---

## Expected Payload Structure

Field names from n8n are not yet finalised. The structure below defines what Jobbly **expects internally** — the field mapping layer translates whatever n8n sends into these internal names.

```json
{
  "customer_name": "Jane Smith",
  "customer_phone": "021 123 4567",
  "customer_email": "jane@example.com",
  "property_address": "14 Rata Street, Remuera, Auckland 1050",
  "property_perimeter_m": 85.4,
  "property_area_m2": 210.0,
  "property_storeys": 2,
  "contractor_rate": null,
  "call_id": "abc-123-xyz",
  "call_timestamp": "2025-03-26T09:15:00Z"
}
```

**Required fields** (lead flagged for review if missing):
- `customer_name`
- `customer_phone`
- `property_address`

**Optional fields** (null if not provided):
- `customer_email`
- `property_perimeter_m`
- `property_area_m2`
- `property_storeys`
- `contractor_rate` — almost always null on arrival, populated later via invoice upload
- `call_id` — stored for cross-reference with the voice agent platform
- `call_timestamp` — used as `created_at` if provided, otherwise server time

---

## Field Mapping Layer

Because n8n field names are not yet confirmed, Jobbly has a field mapping configuration in `/lib/webhookFieldMap.ts`. This file translates incoming webhook field names to Jobbly's internal field names without touching any other code.

Example structure:

```typescript
// /lib/webhookFieldMap.ts
export const webhookFieldMap: Record<string, string> = {
  // "incoming n8n field name": "jobbly internal field name"
  "customer_name": "customer_name",
  "full_name": "customer_name",           // alternative if n8n uses this
  "phone": "customer_phone",
  "mobile": "customer_phone",             // alternative
  "address": "property_address",
  "property_address": "property_address", // alternative
  "perimeter": "property_perimeter_m",
  "area": "property_area_m2",
  "storeys": "property_storeys",
  "floors": "property_storeys",           // alternative
  "call_id": "call_id",
  "timestamp": "call_timestamp",
}
```

To update field mappings when n8n field names are confirmed, only this file needs to change — no other code is affected.

---

## Auto-Generated Fields on Lead Creation

These fields are never in the webhook payload — Jobbly generates them:

| Field | How it's generated |
|---|---|
| `quote_number` | Sequential per campaign: `JBL-` + zero-padded number (e.g. `JBL-00001`) |
| `google_maps_url` | `https://www.google.com/maps/search/?api=1&query=` + URL-encoded `property_address` |
| `customer_price` | `contractor_rate × (1 + campaign.markup_percentage / 100)` — only if `contractor_rate` is present |
| `gross_markup` | `customer_price − contractor_rate` — only if `contractor_rate` is present |
| `omniside_commission` | `gross_markup × (campaign.commission_percentage / 100)` — only if `contractor_rate` is present |
| `client_margin` | `gross_markup − omniside_commission` — only if `contractor_rate` is present |
| `status` | Always `LEAD_RECEIVED` on creation |
| `source` | Always `"n8n_webhook"` |
| `created_at` | Server timestamp (or `call_timestamp` from payload if provided) |

**Note on financial fields**: Because `contractor_rate` is almost always null on lead arrival (it comes from the invoice later), financial fields will also be null at creation. They are calculated and stored when the contractor rate is added — either manually or via Phase 2 invoice parsing.

---

## Webhook Response

**Success:**
```json
{
  "success": true,
  "quote_number": "JBL-00001",
  "message": "Lead created successfully"
}
```

**Missing required fields (lead still created, flagged):**
```json
{
  "success": true,
  "quote_number": "JBL-00002",
  "message": "Lead created with missing fields — flagged for review",
  "missing_fields": ["customer_phone"]
}
```

**Invalid webhook secret:**
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**Server error:**
```json
{
  "success": false,
  "message": "Internal server error — lead not created"
}
```

---

## Google Sheet Backup (Branch 2)

The Google Sheet receives identical data from n8n simultaneously. It is configured entirely in n8n — Jobbly has no knowledge of or connection to the Sheet.

Recommended Sheet columns (mirrors Jobbly's lead fields):
- Timestamp
- Quote number ← n8n should write the quote number back here after Jobbly responds
- Customer name
- Customer phone
- Customer email
- Property address
- Property perimeter (m)
- Property area (m²)
- Storeys
- Call ID
- Status (initial: "Lead Received")
- Notes

**Important**: n8n should fire Branch 1 (Jobbly) first, capture the returned `quote_number` from Jobbly's response, and include it when writing Branch 2 (Google Sheet). This ensures the Sheet and Jobbly share the same quote number for cross-referencing.

---

## Testing the Webhook

To test during development without a live n8n workflow, use a tool like Postman or curl:

```bash
curl -X POST http://localhost:3000/api/webhooks/lead \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your_secret_here" \
  -d '{
    "customer_name": "Test Customer",
    "customer_phone": "021 000 0000",
    "property_address": "1 Queen Street, Auckland CBD, Auckland 1010",
    "property_perimeter_m": 72.0,
    "property_area_m2": 180.0,
    "property_storeys": 2
  }'
```

A test endpoint at `/api/webhooks/test` should be available in development only (disabled in production) that fires a sample payload to simulate a real call coming in.

---

## Security Rules

- Webhook secret must be a minimum 32-character random string
- Secret stored in `.env.local` — never committed to Git
- Rate limiting on the webhook endpoint: max 10 requests per minute per IP
- All webhook requests logged with timestamp and IP for debugging
- Raw payload stored but never exposed via the API to non-admin users
