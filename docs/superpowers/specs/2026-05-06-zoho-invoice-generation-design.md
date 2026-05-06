# Zoho Books Invoice Generation — Design Spec

**Date:** 2026-05-06
**Branch:** codex/invoice-generation-with-zoho
**Status:** Approved, pending implementation plan

---

## Overview

Add two surfaces to the monthly billing reports page that allow admins to create Zoho Books draft invoices from finalized monthly billing reports and interact with a conversational billing assistant:

1. **"Create Draft Invoice" button** — one-click, deterministic server action that maps a finalized report to a Zoho Books draft invoice via Membrane.
2. **Billing Assistant drawer** — slide-out conversational AI agent (Vercel AI SDK + OpenRouter) with Zoho Books tools and report context, for special requests, modifications, and ad-hoc questions.

Both surfaces share a common `src/lib/zoho/` tool layer backed by the Membrane SDK.

---

## Constraints

- Invoice creation is only available on **finalized** reports.
- All invoices are created as **drafts** in Zoho Books — never auto-confirmed or sent.
- If a report already has a `zoho_invoice_id`, the button shows "Open in Zoho Books" instead — no duplicate creation.
- The Billing Assistant drawer is available on both draft and finalized reports for Q&A, but `createDraftInvoice` tool refuses if the report is not finalized.

---

## Architecture

```
src/
  lib/
    zoho/
      client.ts          # server-side Membrane client factory (JWT generated directly)
      books.ts           # Zoho Books operations: createInvoice, listInvoices, getInvoice
      contact-map.ts     # static slug → Zoho contact ID config (committed, non-secret)
    billing/
      invoice-builder.ts # pure fn: maps finalized report → Zoho invoice params
  app/
    api/
      membrane-token/
        route.ts         # GET, admin-gated, returns short-lived Membrane JWT
      admin/
        billing/
          agent/
            route.ts     # POST streaming route: Vercel AI SDK + OpenRouter + Zoho tools
  components/
    admin/
      monthly-report-actions.tsx      # gains "Create Draft Invoice" button + drawer trigger
      billing-assistant-drawer.tsx    # new slide-out Sheet with useChat
```

**Modified files:**
- `src/lib/billing/types.ts` — add `additionalCartonsCount` to `BillingManualMetrics`
- `src/db/schema/billing.ts` — add `additional_carton_count` (int, default 0) and `zoho_invoice_id` (text, nullable) to `monthly_billing_report`
- `src/components/admin/monthly-report-metrics-form.tsx` — add `additionalCartonsCount` field
- `src/lib/billing/actions.ts` — add `createZohoInvoiceAction` (file already updated with `additionalCartonsCount` parsing)
- `src/env.ts` — add Membrane + OpenRouter env vars
- `src/app/admin/reports/monthly/page.tsx` — pass `zohoInvoiceId` to `MonthlyReportActions`

---

## Data Layer

### Schema additions (`monthly_billing_report`)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `additional_carton_count` | integer | 0 | Manual metric: full cartons in storage at month end (Storage – Carton line item) |
| `zoho_invoice_id` | text | null | Zoho Books invoice ID, set after successful draft creation |

### Type update (`BillingManualMetrics`)

Add `additionalCartonsCount: number` alongside the existing manual metric fields.

### Metrics form update

Add `additionalCartonsCount` to `METRIC_FIELDS` in `monthly-report-metrics-form.tsx`:
- **Label:** "Storage cartons"
- **Description:** "Full cartons in storage at month end."
- Position: between `largeBinCount` and `cartonsReceivedTotal`

---

## Membrane / Zoho Books Tool Layer

### `src/lib/zoho/client.ts`

Server-only. Exports `getMembraneClient()` that generates a JWT directly from `MEMBRANE_WORKSPACE_KEY` + `MEMBRANE_WORKSPACE_SECRET` (no fetch round-trip) and returns an initialized `MembraneClient`. Token identifies the app as a single internal customer.

### `src/lib/zoho/books.ts`

Server-only. Three exported functions:

- **`createZohoInvoice(params)`** — calls Membrane → Zoho Books create_invoice action. Accepts customer ID, line items, date, reference, terms. Returns `{ invoiceId, invoiceUrl }`.
- **`listZohoInvoices(customerId)`** — lists recent invoices for a contact. Used by the agent.
- **`getZohoInvoice(invoiceId)`** — retrieves a single invoice. Used by the agent.

All three use `MEMBRANE_ZOHO_CONNECTION_ID` to scope requests to the correct Zoho Books connection.

### `src/lib/zoho/contact-map.ts`

Static config object mapping account slugs (lowercase) to Zoho Books contact IDs. Committed to source, filled in before execution:

```ts
export const ZOHO_CONTACT_IDS: Record<string, string> = {
  dip: "",
  fatass: "",
  ryot: "",
}
```

### `src/app/api/membrane-token/route.ts`

`GET` handler. Requires admin auth. Generates and returns a short-lived Membrane JWT for potential client-side SDK use in the drawer.

---

## Invoice Builder

### `src/lib/billing/invoice-builder.ts`

Pure function `buildInvoiceParams(report, accountSlug)`. No side effects.

**Line item mapping** (all 11 lines always included; 0-quantity lines remain in the draft):

| # | Zoho SKU | Name | Source | Rate |
|---|---|---|---|---|
| 1 | `3PL-STORAGE-SM` | Storage – Small Bin | `smallBinCount` | $1.50 |
| 2 | `3PL-STORAGE-MD` | Storage – Medium Bin | `mediumBinCount` | $1.75 |
| 3 | `3PL-STORAGE-LG` | Storage – Large Bin | `largeBinCount` | $2.25 |
| 4 | `3PL-STORAGE-CARTON` | Storage – Carton | `additionalCartonsCount` | $2.75 |
| 5 | `3PL-ORDER-RETAIL` | Order Processing – Retail | `orderChannelSummary.d2cShipmentCount` (fallback: `shipmentCount`) | $1.00 |
| 6 | `3PL-ORDER-WHOLESALE-PACKAGE` | Order Processing – Wholesale | `orderChannelSummary.b2bShipmentCount` (fallback: 0) | $3.00 |
| 7 | `3PL-PICK-PER-ITEM-STANDARD` | Pick & Pack Fee – Per Item | `unitsPickedTotal` | $0.30 |
| 8 | `3PL-MATERIALS-COST` | Materials / Packaging | qty=1, rate=`packagingCostTotal` | variable |
| 9 | `3PL-RECV-CARTON` | Receiving – Carton | `cartonsReceivedTotal` | $2.75 |
| 10 | `3PL-RETURN-RETAIL` | Return Processing – Retail | `retailReturnsTotal` | $4.00 |
| 11 | `3PL-SPECIAL-HOURLY` | Special Project – Per Hour | `specialProjectHours` | $50.00 |

**Invoice metadata:**
- Customer ID: `ZOHO_CONTACT_IDS[accountSlug]`
- Date: today (UTC) at time of creation
- Terms: Net 30
- Reference: `3PL - {Mon} {YEAR}` (e.g. "3PL - Apr 2026")
- Status: draft

---

## Create Invoice Button Flow

### `createZohoInvoiceAction({ reportId })` (server action)

1. `requireAdmin()`
2. Load report from DB; reject if `status !== "finalized"` or `zoho_invoice_id` already set
3. `buildInvoiceParams(report, accountSlug)`
4. `createZohoInvoice(params)` via `zoho/books.ts`
5. Write `zoho_invoice_id` to the report row in DB
6. `revalidatePath("/admin/reports/monthly")`
7. Return `{ ok: true, invoiceId, invoiceUrl }` or `{ ok: false, message }`

### UI state in `MonthlyReportActions`

| Condition | Button shown |
|---|---|
| Report not finalized | Button hidden |
| Finalized, no Zoho invoice | "Create Draft Invoice" button |
| Creating in progress | "Creating…" (disabled) |
| Finalized, Zoho invoice exists | "Open in Zoho Books" link button |
| Error | Destructive alert with message |

---

## Billing Assistant Drawer

### `src/app/api/admin/billing/agent/route.ts`

- `POST`, admin-auth-gated
- Accepts `{ messages: CoreMessage[], reportId: string }`
- Loads report from DB at request time to inject fresh context into system prompt
- Uses `streamText` from Vercel AI SDK with OpenRouter (model: `anthropic/claude-sonnet-4-6`)
- Returns streaming response

**System prompt includes:**
- Client name, period, report status, all metric values (injected at request time)
- Instruction: create invoices as drafts only, never confirm or send
- Tone: direct and operational, no filler

**Agent tools:**

| Tool | Description |
|---|---|
| `createDraftInvoice` | Creates Zoho draft from current report. Refuses if not finalized or invoice already exists. On success, returns invoiceId + URL and signals the UI to refresh. |
| `listRecentInvoices` | Lists recent Zoho invoices for the current client via Membrane. |
| `getInvoiceDetails` | Retrieves a Zoho invoice by ID. |
| `getReportData` | Returns structured report data for ad-hoc metric questions. |

### `src/components/admin/billing-assistant-drawer.tsx`

- Client component using `useChat` from Vercel AI SDK
- Trigger: "Assistant" button in `MonthlyReportActions`
- Renders as a shadcn `Sheet` from the right
- Props: `reportId`, `accountSlug`, `reportStatus`, `periodLabel`, `zohoInvoiceId`
- On `createDraftInvoice` tool success response: calls `router.refresh()` to sync parent page
- Available on all report statuses; invoice creation tool self-guards on status

---

## Environment Variables

Add to `src/env.ts` (all server-side):

| Variable | Purpose |
|---|---|
| `MEMBRANE_WORKSPACE_KEY` | Membrane workspace identifier (JWT issuer) |
| `MEMBRANE_WORKSPACE_SECRET` | Membrane JWT signing secret |
| `MEMBRANE_ZOHO_CONNECTION_ID` | Zoho Books connection ID in Membrane workspace |
| `OPENROUTER_API_KEY` | OpenRouter API key for billing agent LLM calls |

---

## Out of Scope (this iteration)

- Email sending or invoice confirmation from within the app
- Per-client rate overrides (rates are fixed as in the template)
- Invoice editing UI within the app (handled in Zoho Books directly)
- Membrane connection setup UI (assumed pre-configured in Membrane workspace)
- Storing Zoho invoice URL in the DB (ID is sufficient; URL is constructable)
