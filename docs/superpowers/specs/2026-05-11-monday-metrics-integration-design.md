# Monday.com metrics integration for monthly billing reports

**Status:** design approved, awaiting implementation plan
**Author:** john@honeybeeherb.com
**Date:** 2026-05-11
**Related:** `docs/superpowers/specs/2026-05-06-zoho-invoice-generation-design.md`, `docs/superpowers/specs/2026-05-07-revert-finalized-report-design.md`

## Problem

The monthly billing report has eight manual-entry metrics that an operator types in by hand each month:

- Storage bin counts: small, medium, large, additional cartons
- Receiving counts: cartons received, pallets received, retail returns
- Special project hours

Those numbers already live on three Monday.com boards that the operations team updates in real time throughout the month ("Storage Tracking", "Receiving", "Special Projects"). The dashboard currently ignores Monday and forces a second round of data entry on the report page, which is error-prone, slow, and decouples the invoice from the source-of-truth.

## Goal

Pull these eight metrics from Monday.com when generating or refreshing a monthly billing report, while preserving manual entry as a fallback for any field Monday doesn't (yet) supply and as an override when the operator knows the Monday value is wrong.

The integration must:

1. Auto-populate manual metrics on report generation from the corresponding Monday board entries for the report's vendor and month.
2. Let an operator override any Monday-sourced field with a manual value that survives subsequent refreshes.
3. Distinguish "Monday says zero" from "Monday has no data, fall through to manual" per field.
4. Fail loudly when Monday is unreachable, without blocking the report — the operator can complete it manually and refresh later.
5. Leave downstream consumers (invoice builder, CSV export, Zoho integration, AI agent) blind to the integration. They keep reading `report.manualMetrics`; the values just happen to come from Monday now.

## Non-goals

- Writing back to Monday (no auto-checking "Billed" on Special Projects after invoicing). Monday remains read-only from this app's perspective.
- Per-board granular toggles in the UI ("use Monday for storage but not receiving"). The per-field override flag covers the same need without UI overhead.
- Server-side Monday GraphQL filtering. Boards are small (largest currently 59 items); client-side filtering after paginated fetch is fine. Re-evaluate if any board exceeds several thousand items.
- Reworking the report status state machine.
- Standing up a unit-test framework. Project has no test infrastructure today; verification is manual.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Override semantics when Monday has a value? | Monday seeds the form on generate/refresh; user can override any field per-metric. Overrides survive subsequent refreshes. |
| 2 | When does the report pull from Monday? | On `Generate` (alongside the ShipStation pass) and via a dedicated `Refresh from Monday` button on draft reports. Not on every page render. |
| 3 | How do we match Monday rows to a report period? | Storage Tracking: Timeline column preferred, item-name parsing as fallback. Receiving / Special Projects: their `Date` column within the report month. |
| 4 | What if Storage Tracking has duplicate rows for the same vendor + month? | Hard error. Refuse to apply the snapshot, surface the conflict, leave the previous successful snapshot in place. |
| 5 | Honor the Special Projects "Billed" checkbox? | Yes — only pull rows where `Billed = false`. No write-back (operator manually checks the box after invoicing). |
| 6 | Storage model for the source-of-each-value? | Effective value lives in the existing 8 metric columns. Track per-field `manualMetricsOverrides` (boolean) and a `mondayMetricsSnapshot` of the last raw pull. Refresh applies snapshot values only where override is `false`. |
| 7 | Behavior when Monday is unreachable on generate? | ShipStation pass still commits the draft. Monday-side state is left untouched. Action returns `ok:false` with a loud, specific error. Operator can enter metrics manually or retry via `Refresh from Monday`. |
| 8 | Empty Receiving / Special Projects period — zero or null? | Zero. Their absence is signal: the operator's job is to log into these boards as receiving / project hours happen. Storage Tracking's missing rows fall through to manual (`null` per field). |
| 9 | Do we surface per-field UI badges showing the value's source? | Yes. `Monday`, `Overridden` (with tooltip showing the Monday value), or no badge when neither side has data. |

## Architecture

### Vendor mapping

All three boards have a `Vendor` status column with three labels: `RYOT`, `Fat Ass Glass`, `Dip Devices`. Each is automatically assigned by the Monday group the item is created in. A single shared utility maps `BillingAccountSlug` ↔ Monday vendor label.

```ts
// src/lib/monday/vendor-map.ts
const VENDOR_LABEL: Record<BillingAccountSlug, string> = {
  ryot: "RYOT",
  fatass: "Fat Ass Glass",
  dip: "Dip Devices",
};
```

### Board metadata (confirmed via Monday API)

**Storage Tracking** — board `18412633530`, vendor-keyed monthly snapshot.

| Column | ID | Type | Use |
|---|---|---|---|
| Name | `name` | text | "January 2026" — fallback period parse |
| Timeline | `timerange_mm38e8gg` | timeline | Authoritative period range |
| Small Bins | `numeric_mm38jqfe` | numbers | `smallBinCount` |
| Medium Bins | `numeric_mm385gdh` | numbers | `mediumBinCount` |
| Large Bins | `numeric_mm38ccar` | numbers | `largeBinCount` |
| Additional Cartons | `numeric_mm388h6h` | numbers | `additionalCartonsCount` |
| Vendor | `color_mm385exr` | status | Filter |

**Receiving** — board `18412647233`, event-style log (one item per shipment).

| Column | ID | Type | Use |
|---|---|---|---|
| TYPE | `color_mm38w0b1` | status | `Retail Return` / `B2B Return` / `Inbound PO` |
| Packages Received | `numeric_mm38z1b3` | numbers | Per-row count to sum |
| Date | `date_mm383r6a` | date | Period filter |
| Package Type | `color_mm38haqd` | status | `Packages` / `Carton` / `Pallet` |
| Vendor | `color_mm38r7t` | status | Filter |

**Special Projects** — board `18412659898`, event-style log.

| Column | ID | Type | Use |
|---|---|---|---|
| Date | `date_mm38ate7` | date | Period filter |
| Time Tracking | `duration_mm38waxr` | time_tracking | Returns `"HH:MM:SS"`; sum into decimal hours |
| Billed | `boolean_mm38eg88` | checkbox | Skip rows where `checked === true` |
| Vendor | `color_mm385wz6` | status | Filter |

Board IDs are injected via three new env vars (`MONDAY_STORAGE_TRACKING_BOARD_ID`, `MONDAY_RECEIVING_BOARD_ID`, `MONDAY_SPECIAL_PROJECTS_BOARD_ID`) so prod/staging boards remain swappable without code changes, matching the existing `MONDAY_PACKAGE_BOARD_ID` pattern.

### Data model

Additive migration on `monthly_billing_report`:

```sql
ALTER TABLE monthly_billing_report
  ADD COLUMN monday_metrics_snapshot   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN manual_metrics_overrides  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN monday_metrics_fetched_at timestamptz,
  ADD COLUMN monday_metrics_warnings   jsonb       NOT NULL DEFAULT '[]'::jsonb;
```

- `monday_metrics_snapshot`: `Partial<Record<BillingMetricKey, number | null>>` — the values from the most recent successful Monday pull. An **absent** key means that loader never ran successfully against this report (e.g., Storage Tracking has never been pulled). A **`null`** value means the loader ran and found no data for that key (e.g., Storage Tracking row exists for the month but the Small Bins column is empty). A **numeric** value (including `0`) means Monday explicitly provided that number. Both `null` and absent are treated identically by the apply logic (the effective column is not overwritten); the distinction exists for UI debugging and future audit needs.
- `manual_metrics_overrides`: `Record<BillingMetricKey, boolean>` — `true` when the operator's effective value differs from `monday_metrics_snapshot[key]`. Refresh respects this flag.
- `monday_metrics_fetched_at`: timestamp of the last successful pull. `null` if never pulled.
- `monday_metrics_warnings`: `BillingMondayMetricsWarning[]` — soft warnings (e.g., name/Timeline disagreement) and hard errors (duplicate rows, connection failures) carried into the UI.

The existing eight metric columns continue to hold the **effective value** — the number that flows to the invoice, CSV, and AI agent. They are unchanged in structure.

New types in `src/lib/billing/types.ts`:

```ts
export type BillingMetricKey = keyof BillingManualMetrics;
export type BillingManualMetricsOverrides = Record<BillingMetricKey, boolean>;
export type BillingMondayMetricsSnapshot = Partial<Record<BillingMetricKey, number | null>>;
export type BillingMondayMetricsWarning = {
  board: "storage-tracking" | "receiving" | "special-projects" | "connection";
  severity: "warning" | "error";
  message: string;
};
```

### Monday board loaders

Three new modules under `src/lib/monday/`, each exposing one function that returns the snapshot slice for its board plus any warnings. They use the existing `createMondayClient` and follow the paginated-fetch + client-side-filter pattern from `src/lib/billing/rate-source.ts`.

```ts
// src/lib/monday/storage-tracking.ts
loadStorageTrackingForPeriod({ accountSlug, year, month }):
  Promise<{
    snapshot: Partial<Pick<BillingManualMetrics,
      "smallBinCount" | "mediumBinCount" | "largeBinCount" | "additionalCartonsCount">>;
    warnings: BillingMondayMetricsWarning[];
  } | null>
```

**Storage Tracking parsing rules**

1. Filter board items by `Vendor == VENDOR_LABEL[accountSlug]`.
2. Among the vendor-matching rows, find rows whose `Timeline` overlaps the report period (`timelineStart < periodEnd` AND `timelineEnd >= periodStart`). Timeline dates are treated as UTC midnight.
3. If no Timeline-overlap matches exist: parse each vendor-matching row's item name as `<MonthName> <YYYY>` (case-insensitive, tolerant of whitespace and commas). A row matches when the parsed month + year equal the report period's UTC month + year.
4. For a single matched row that has both a parseable Timeline and a parseable name disagreeing on the month → keep the row (Timeline took precedence in step 2), append a `warning`-severity entry naming the discrepancy.
5. If more than one row matches under steps 2 or 3 combined → throw a hard error (`severity: "error"`, `board: "storage-tracking"`, message lists the conflicting item names + IDs).
6. If zero rows match → return `null`. The four storage fields fall through to manual.
7. For the matched row, each of the four numeric columns may be `null` (empty cell in Monday) — represented as `null` in the snapshot so refresh does not overwrite the effective column with `0`. A numeric `0` (operator typed `0`) is preserved as `0`.

```ts
// src/lib/monday/receiving.ts
loadReceivingForPeriod({ accountSlug, year, month }):
  Promise<{
    snapshot: Pick<BillingManualMetrics,
      "cartonsReceivedTotal" | "palletsReceivedTotal" | "retailReturnsTotal">;
    warnings: BillingMondayMetricsWarning[];
  }>
```

**Receiving aggregation rules**

1. Filter by `Vendor == VENDOR_LABEL[accountSlug]` and `Date` within `[periodStart, periodEnd)`. Monday's `date` column returns date-only strings (`"YYYY-MM-DD"`); compare against the report period using UTC midnight for both ends, matching the convention in `reports.ts::makePeriod`.
2. For each matched row, classify by `TYPE` and `Package Type`:
   - `TYPE === "Inbound PO"` AND `Package Type ∈ {"Packages", "Carton"}` → contributes to `cartonsReceivedTotal`.
   - `TYPE === "Inbound PO"` AND `Package Type === "Pallet"` → contributes to `palletsReceivedTotal`.
   - `TYPE ∈ {"Retail Return", "B2B Return"}` → contributes to `retailReturnsTotal` (Package Type ignored).
3. Add the row's `Packages Received` to the matching bucket.
4. Rows with missing or unparseable `TYPE`/`Package Type` are skipped and append a `warning`-severity entry naming the row.
5. Empty period → all three sums are `0`. Always returns a snapshot (never `null`).

```ts
// src/lib/monday/special-projects.ts
loadSpecialProjectsForPeriod({ accountSlug, year, month }):
  Promise<{
    snapshot: Pick<BillingManualMetrics, "specialProjectHours">;
    warnings: BillingMondayMetricsWarning[];
  }>
```

**Special Projects aggregation rules**

1. Filter by `Vendor == VENDOR_LABEL[accountSlug]`, `Date` within the period (same UTC-midnight convention as Receiving), and `Billed === false`.
2. Parse each row's `Time Tracking` (`"HH:MM:SS"`) into decimal hours: `hours + minutes/60 + seconds/3600`. Skip rows with empty or unparseable durations and append a `warning`-severity entry naming the row.
3. Sum, round to two decimal places (matches the existing `numeric(12, 2)` column).
4. Empty period → `0`. Always returns a snapshot.

### Orchestrator

A new module wraps the three loaders:

```ts
// src/lib/billing/monday-metrics.ts
export const pullMondayMetricsForPeriod = async ({
  accountSlug, year, month,
}): Promise<{
  snapshot: BillingMondayMetricsSnapshot;
  warnings: BillingMondayMetricsWarning[];
  fetchedAt: Date;
}>
```

Runs all three loaders in `Promise.all`. Merges their snapshots and warnings. If any loader throws, the whole pull rejects with the first error — the caller catches and handles. Per-loader failures are escalated to the orchestrator level so the report layer can decide whether to commit the partial state.

The orchestrator's caller (`generateMonthlyBillingReport` / `refreshMondayMetricsForReport`) decides what to do on failure: report-generation commits the ShipStation half and surfaces the error; manual refresh leaves all Monday state untouched.

### Report integration

**`generateMonthlyBillingReport`** — extended:

1. ShipStation pass commits the draft as it does today.
2. `pullMondayMetricsForPeriod` is invoked.
3. On success: for each metric key, if `overrides[key] === false`, copy `snapshot[key]` (when numeric) into the effective column. Persist snapshot, fetched-at, warnings. Action returns `ok:true`.
4. On failure: ShipStation half stays committed. `monday_metrics_snapshot`, `manual_metrics_overrides`, and `monday_metrics_fetched_at` are left untouched (preserving any prior successful state). Action returns `ok:false` with the specific Monday error.

Regenerating a draft does **not** clobber overrides. If `overrides.smallBinCount === true`, the effective value is preserved across regenerate; only the snapshot updates.

**New: `refreshMondayMetricsForReport({ reportId })`** — pulls Monday for the report's account + period, runs the same apply logic, updates snapshot/fetched-at/warnings. Throws if `status === "finalized"`. On Monday failure the entire database write is skipped (atomic — no partial updates).

**`updateMonthlyBillingReportManualMetrics`** — extended override-tracking:

For each metric key in the submitted form:

- If `submittedValue === snapshot[key]` (after numeric coercion) → `overrides[key] = false`.
- Otherwise → `overrides[key] = true`.

This keeps the override flag honest without any extra UI: typing the same number Monday has clears the override automatically.

**`getMonthlyBillingReport`** — extended return shape:

```ts
report: {
  // ...existing fields,
  mondayMetricsSnapshot: BillingMondayMetricsSnapshot;
  manualMetricsOverrides: BillingManualMetricsOverrides;
  mondayMetricsFetchedAt: Date | null;
  mondayMetricsWarnings: BillingMondayMetricsWarning[];
}
```

### Server actions

**New** in `src/lib/billing/actions.ts`:

```ts
refreshMondayMetricsAction({ reportId }): Promise<{
  ok: boolean;
  message: string;
  warnings?: BillingMondayMetricsWarning[];
}>
```

Calls `requireAdmin`, invokes `refreshMondayMetricsForReport`, revalidates `/admin/reports/monthly`.

**Modified**:

- `generateMonthlyBillingReportAction` — message reflects Monday-pull status (success vs `"Draft created from ShipStation, but Monday is unreachable: <reason>. Open the report to enter metrics manually, or click *Refresh from Monday* once the connection is restored."`).
- `saveMonthlyBillingReportManualMetricsAction` — externally unchanged; the override-tracking happens transparently in the service layer.

### UI changes

All changes live in `src/components/admin/monthly-report-metrics-form.tsx` and the parent report-detail page.

**1. Refresh button**

In the card header on draft reports:

```
[ Refresh from Monday ]   [ Edit ]
```

Calls `refreshMondayMetricsAction`. Spinner while pending; green success / red error banner on completion. Disabled while the form is in edit mode and while the report is finalized.

**2. Last-refreshed timestamp**

Subtle muted text under the existing card description: `"Last refreshed from Monday: May 11, 2026, 2:34 PM"`. Or `"Not yet refreshed from Monday."` when `mondayMetricsFetchedAt === null`.

**3. Per-field source badges**

Each of the eight metric cells shows a small badge indicating its current state when **not** in edit mode:

| State condition | Badge | Tooltip |
|---|---|---|
| `overrides[key] === false` AND `snapshot[key]` is a number | `Monday` (muted neutral) | — |
| `overrides[key] === true` | `Overridden` (amber) | `"Monday currently shows: <snapshot[key]>. You've overridden to <effective[key]>."` (if `snapshot[key] === null`: `"No data in Monday for this field; using manual value."`) |
| `overrides[key] === false` AND `snapshot[key]` is `null`/absent | (no badge) | — |

Badges hide during edit mode to keep the input experience clean.

**4. Inline edit-time hint**

While the user is editing, a field that currently has `overrides[key] === true` AND a numeric `snapshot[key]` shows a small hint when the typed value (after `Number()` coercion) equals `snapshot[key]`: `"Matches Monday — override will clear."` The hint never appears for fields where `snapshot[key]` is `null`/absent (there's nothing to match against).

**5. Warnings panel**

When `mondayMetricsWarnings.length > 0`, a panel sits above the `FieldGroup`:

- `severity === "error"`: red Alert with the message.
- `severity === "warning"`: yellow Alert with the message.
- `board === "connection"` errors take prominence at the top of the panel.

The panel collapses if there are more than 3 entries; clicking expands the full list.

**6. Form props extension**

```ts
type MonthlyReportMetricsFormProps = {
  reportId: string;
  reportStatus: BillingReportStatus;
  manualMetrics: BillingManualMetrics;
  mondayMetricsSnapshot: BillingMondayMetricsSnapshot;
  manualMetricsOverrides: BillingManualMetricsOverrides;
  mondayMetricsFetchedAt: Date | null;
  mondayMetricsWarnings: BillingMondayMetricsWarning[];
};
```

The parent page (`src/app/admin/reports/monthly/...`) reads these from the existing `getMonthlyBillingReport` call and passes them through.

### AI agent integration

`src/app/api/admin/billing/agent/route.ts` gains a `refresh_monday_metrics` tool mirroring the existing tool pattern:

- Input schema: `{ reportId: string }`.
- No confirm guard (operation is idempotent and read-only against Monday).
- Returns the same shape as `refreshMondayMetricsAction`.
- System prompt grows by one sentence: `"You can refresh the Monday-sourced metrics for a draft report by calling refresh_monday_metrics. This pulls the latest values from Monday and applies them to any field the operator has not manually overridden."`

## Behavior matrix

| Scenario | Draft committed? | Monday state updated? | Action result | Operator experience |
|---|---|---|---|---|
| Generate, all boards OK | Yes | Yes | `ok:true` | Green success banner |
| Generate, Monday connection down | Yes (ShipStation only) | No | `ok:false` | Red banner naming the failure; manual entry works |
| Generate, Storage Tracking has duplicate row | Yes (ShipStation only) | No | `ok:false` | Red banner naming the conflict; other boards' data also held back so generate-then-refresh is the cleanest recovery |
| Refresh from Monday, all boards OK | n/a | Yes | `ok:true` | Green banner; overrides preserved |
| Refresh from Monday, connection down | n/a | No | `ok:false` | Red banner; previous snapshot intact |
| User edits a Monday-sourced field to a new value | n/a | n/a | `ok:true` | `Overridden` badge appears |
| User edits an overridden field back to Monday's value | n/a | n/a | `ok:true` | `Overridden` badge disappears |
| Storage Tracking has no row for vendor + month | Yes | Yes (storage keys = `null`) | `ok:true` | Storage fields editable as manual; receiving/projects populated |
| Receiving has no rows for the period | Yes | Yes (`{ cartonsReceivedTotal: 0, palletsReceivedTotal: 0, retailReturnsTotal: 0 }`) | `ok:true` | Receiving fields show `0` with `Monday` badge |

## Implementation surface

**New files**
- `src/lib/monday/vendor-map.ts`
- `src/lib/monday/storage-tracking.ts`
- `src/lib/monday/receiving.ts`
- `src/lib/monday/special-projects.ts`
- `src/lib/billing/monday-metrics.ts`
- `drizzle/0014_<slug>.sql` (auto-generated)

**Modified files**
- `src/db/schema/billing.ts` — four new columns
- `src/env.ts` — three new env vars
- `src/lib/billing/types.ts` — new types
- `src/lib/billing/reports.ts` — extended generate + new refresh function + extended getter
- `src/lib/billing/actions.ts` — new refresh action + updated generate-action message
- `src/components/admin/monthly-report-metrics-form.tsx` — new props, refresh button, badges, warnings panel, edit-time hint
- `src/app/admin/reports/monthly/page.tsx` — pass new props through to `MonthlyReportMetricsForm`
- `src/app/api/admin/billing/agent/route.ts` — new tool + system-prompt sentence

**Unchanged (intentional)**
- `src/lib/billing/invoice-builder.ts` — still reads `report.manualMetrics`
- `src/lib/billing/reports.ts::exportMonthlyBillingReportCsv` — still customer-facing, no Monday provenance
- `src/lib/zoho/books.ts`, `src/lib/zoho/contact-map.ts`
- Revert / finalize flows

## Open questions

None at design time. Concrete column IDs and vendor labels have been verified against the live Monday boards via the connector.
