# Special Use Case Orders Metric (Fat Ass Glass) — Design

**Date:** 2026-06-11
**Status:** Approved

## Problem

Some Fat Ass Glass (`fatass`) sales orders are combined shipments fulfilled from
both their 3PL inventory and our warehouse's drop-ship inventory. When one of
these combined shipments goes out, the sales order in Zoho Books gets a custom
field **Special Use Case** (field ID `3195387000008653629`) with the value
`"Contains 3PL SKUs"`.

The monthly billing report for fatass must count these orders for the report
month and bill them on the Zoho invoice as a line item.

## Decisions (confirmed with user)

| Question | Decision |
|---|---|
| Purpose | Billable metric — appears on the report AND as an invoice line item |
| Invoice item | SKU `3PL-HANDLING-RETAIL`, "Special Handling Fee – Retail Order", Zoho item ID `3195387000147963306` |
| Month attribution | Sales order `date` falls within the report month |
| Status filter | Exclude `draft` and `void`; count all other statuses |
| UI behavior | Identical to existing Monday-pulled metrics: auto-pulled on generate/refresh, manually overridable, frozen on finalize |
| Invoice line presence | Fatass invoices only; always present (qty 0 allowed); never on dip/ryot |
| Rate | Defer to the rate configured on the Zoho item (same as `3PL-RECV-PALLET`); can be pinned in `LINE_RATES` later if desired |

## Approach

Fold the count into the existing manual-metrics pipeline as a 9th metric
(`specialUseCaseOrdersCount`). It reuses the snapshot / override / freeze /
invoice machinery with zero new infrastructure. Alternatives considered and
rejected: a parallel Zoho snapshot system (duplicates machinery for one
number) and computing live at invoice time (not visible, overridable, or
frozen).

## Design

### 1. Data model

- `src/lib/billing/types.ts`: add `specialUseCaseOrdersCount: number` to
  `BillingManualMetrics`; append to `ALL_METRIC_KEYS` and `EMPTY_OVERRIDES`.
- `src/db/schema/billing.ts`: new column
  `special_use_case_orders_count` (`integer`, not null, default 0) on
  `monthly_billing_report`; add the key to the `manualMetricsOverrides` JSONB
  default. One Drizzle migration.
- `BillingMondayMetricsWarning.board` union gains `"zoho-sales-orders"`.
- The snapshot type (`BillingMondayMetricsSnapshot`) is keyed by metric key
  and needs no structural change.

### 2. Zoho query — `src/lib/zoho/sales-orders.ts` (new)

`countSpecialUseCaseSalesOrders({ customerId, year, month }): Promise<number>`
following the `books.ts` Membrane-proxy idiom (`getZohoProxy`, `buildZohoPath`,
defensive parsing, `getErrorMessage`).

- `GET /salesorders` with `customer_id`, `date_start` / `date_end` (first and
  last day of the report month), `per_page=200`, paginated via
  `page_context.has_more_page` with a `MAX_PAGES` guard.
- Count rows where the custom field `3195387000008653629` equals
  `"Contains 3PL SKUs"` (case-insensitive, trimmed) AND `status` is not
  `draft` or `void`.
- **Filtering strategy:** verify against the live API (Membrane CLI) whether
  the list endpoint honors a custom-field query param. If yes, send it as an
  optimization — but ALWAYS re-check the custom field client-side, because
  Zoho silently ignores unknown query params and a dropped filter must not
  overcount. If not honored, paginate the customer+month window and filter
  client-side on the row's custom field data (`custom_fields` array or
  `cf_*` keys — confirm shape during implementation).
- Field ID and expected value live as named constants at the top of the file.

### 3. Pull integration — `src/lib/billing/monday-metrics.ts`

`pullMondayMetricsForPeriod` gains a fourth parallel load, executed only when
`accountSlug === "fatass"`:

- Resolve customer ID via `getZohoContactIdForSlug("fatass")`
  (`3195387000000546623`).
- On success merge `{ specialUseCaseOrdersCount: count }` into the snapshot.
- On failure append a `{ board: "zoho-sales-orders", severity: "error" }`
  warning instead of throwing — same graceful degradation as Monday boards.

For dip/ryot the key is absent from the snapshot, so `applySnapshotToMetrics`
leaves their stored value untouched (existing behavior; no changes needed).

### 4. Persistence — `reports.ts`, `actions.ts`

Mechanical extension of the existing 8-metric plumbing: read/write the new
column everywhere `retailReturnsTotal` etc. appear (generate, refresh
metrics, save manual metrics, detail row mapping,
`getManualMetricsFromRow`). The save action validates the field as a
non-negative integer like the other count fields.

### 5. UI — `monthly-report-metrics-form.tsx`, `reports/monthly/page.tsx`

- The form gains an `accountSlug` prop (the page already has it).
- New `MetricField`: key `specialUseCaseOrdersCount`, label
  "Special use case orders", description "Sales orders marked 'Contains 3PL
  SKUs' (combined 3PL + drop-ship shipments)." Integer input, numeric mode.
- Rendered only when `accountSlug === "fatass"` (its section hidden for
  other accounts).
- Source badge: generalize the "Monday" badge so this field's
  snapshot-sourced badge reads "Zoho"; override badge behavior unchanged.
- Overridable while draft, frozen when finalized, re-pulled by the existing
  refresh action — all inherited.

### 6. Invoice — `invoice-builder.ts`

`buildInvoiceParams` appends, only when `accountSlug === "fatass"`:

```ts
{
  sku: "3PL-HANDLING-RETAIL",
  name: "Special Handling Fee – Retail Order",
  quantity: report.manualMetrics.specialUseCaseOrdersCount,
}
```

No `rate` → `resolveZohoItemIds` falls back to the rate configured on the
Zoho item. The SKU shares the `3PL-` prefix, so existing item-ID resolution
works untouched.

### 7. Error handling

- Zoho unreachable or response unparseable → warning surfaced in the
  existing warnings UI; report generation still succeeds; metric keeps its
  current value and can be set manually.
- Ambiguous/unverified server-side filtering is treated as absent: client-side
  re-checking is mandatory so the count can never silently include
  non-special-use-case orders.

### 8. Testing

- Unit tests for `countSpecialUseCaseSalesOrders`: status exclusion
  (draft/void), custom-field matching (exact, case-variant, absent),
  pagination across pages, error mapping — with mocked proxy responses.
- Unit tests for `buildInvoiceParams`: fatass includes the line with the
  metric quantity; dip/ryot do not include the SKU.
- Snapshot/override behavior is covered by the existing
  `applySnapshotToMetrics` semantics; add a case asserting an absent key
  leaves the current value untouched.

## Out of scope

- Backfilling counts into previously finalized reports.
- Making the metric available for other vendors.
- Changing how the other eight metrics are pulled or billed.
