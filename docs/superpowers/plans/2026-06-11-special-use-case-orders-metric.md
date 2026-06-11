# Special Use Case Orders Metric (Fat Ass Glass) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count fatass sales orders in Zoho Books that carry the "Special Use Case = Contains 3PL SKUs" custom field for the report month, surface the count as a 9th billing metric, and bill it on the Zoho invoice as `3PL-HANDLING-RETAIL`.

**Architecture:** The count becomes a new key (`specialUseCaseOrdersCount`) in the existing manual-metrics pipeline — pulled during report generation/refresh alongside Monday metrics, stored on `monthly_billing_report`, overridable in the metrics form, frozen on finalize, and appended as a fatass-only invoice line. Zoho access reuses the Membrane proxy pattern from `src/lib/zoho/books.ts`. Pure logic (row matching, pagination, snapshot merge) lives in import-light files so it can be unit tested.

**Tech Stack:** Next.js 16 / React 19, Drizzle ORM (Postgres), Membrane SDK proxy to Zoho Books API v3, vitest (added by this plan), pnpm, Biome.

**Spec:** `docs/superpowers/specs/2026-06-11-special-use-case-orders-metric-design.md`

**Key constants:**
- Custom field ID: `3195387000008653629`, value: `"Contains 3PL SKUs"`
- fatass Zoho customer ID: `3195387000000546623` (already in `src/lib/zoho/contact-map.ts`)
- Invoice item: SKU `3PL-HANDLING-RETAIL`, name `Special Handling Fee - Retail Order` (Zoho item ID `3195387000147963306`; rate comes from the Zoho item, not code)
- Excluded sales order statuses: `draft`, `void`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/verify-zoho-salesorders.mjs` | Create (temp) | One-off live-API verification; deleted after Task 1 |
| `vitest.config.ts` | Create | Test runner config (`@` alias + `server-only` stub) |
| `src/test/server-only-stub.ts` | Create | Empty module so server-only files can be unit tested |
| `src/lib/zoho/sales-orders-matching.ts` | Create | PURE: row matcher + page-loop counter (no env/server-only imports) |
| `src/lib/zoho/sales-orders.ts` | Create | Server-only: Membrane-proxy fetcher wired into the pure counter |
| `src/lib/zoho/books.ts` | Modify | Export existing private helpers `getZohoProxy`, `buildZohoPath`, `getErrorMessage` |
| `src/lib/billing/types.ts` | Modify | New metric key, warning board union |
| `src/db/schema/billing.ts` | Modify | New column + overrides default key |
| `drizzle/00XX_*.sql` | Generate | Migration |
| `src/lib/billing/metrics-merge.ts` | Create | PURE: `applySnapshotToMetrics` / `computeOverridesAgainstSnapshot` moved out of monday-metrics for testability |
| `src/lib/billing/zoho-metrics.ts` | Create | PURE-testable: fatass gate + error→warning mapping (counter injected) |
| `src/lib/billing/monday-metrics.ts` | Modify | Re-export merge fns; add Zoho load to the parallel pull |
| `src/lib/billing/reports.ts` | Modify | Mechanical 9th-metric plumbing (5 spots) + CSV row |
| `src/lib/billing/actions.ts` | Modify | Parse/validate the new form field |
| `src/lib/billing/invoice-builder.ts` | Modify | Fatass-only invoice line |
| `src/components/admin/monthly-report-metrics-form.tsx` | Modify | `accountSlug` prop, source-label badges, fatass-only section |
| `src/app/admin/reports/monthly/page.tsx` | Modify | Pass `accountSlug` to the form |
| `src/lib/zoho/sales-orders-matching.test.ts` | Create | Matcher + pagination tests |
| `src/lib/billing/metrics-merge.test.ts` | Create | Absent-key snapshot behavior |
| `src/lib/billing/zoho-metrics.test.ts` | Create | Gate + warning mapping tests |
| `src/lib/billing/invoice-builder.test.ts` | Create | Fatass line present / others absent |

---

### Task 1: Verify Zoho Books sales-order API behavior (live)

The whole feature hinges on three unverified API behaviors. Verify them BEFORE writing implementation code. Zoho silently ignores unknown query params, so never trust a filter you haven't observed working.

**Files:**
- Create (temporary): `scripts/verify-zoho-salesorders.mjs`

- [ ] **Step 1: Confirm env vars exist**

Run: `grep -E "MEMBRANE_(WORKSPACE_KEY|WORKSPACE_SECRET|TENANT_KEY|ZOHO_CONNECTION_ID)" .env .env.local 2>/dev/null | sed 's/=.*/=<set>/'`
Expected: all four vars present (values masked).

- [ ] **Step 2: Create the verification script**

```js
// scripts/verify-zoho-salesorders.mjs — TEMPORARY, delete after Task 1
import "dotenv/config";
import { MembraneClient } from "@membranehq/sdk";
import jwt from "jsonwebtoken";

const now = Math.floor(Date.now() / 1000);
const token = jwt.sign(
  {
    iss: process.env.MEMBRANE_WORKSPACE_KEY,
    id: process.env.MEMBRANE_TENANT_KEY,
    iat: now,
    exp: now + 1800,
  },
  process.env.MEMBRANE_WORKSPACE_SECRET,
  { algorithm: "HS256" },
);

const proxy = new MembraneClient({ token }).connection(
  process.env.MEMBRANE_ZOHO_CONNECTION_ID,
).proxy;

const FATASS_CUSTOMER_ID = "3195387000000546623";
// Use the most recent COMPLETED month so data exists.
const DATE_START = "2026-05-01";
const DATE_END = "2026-05-31";

const list = await proxy.get(
  `/salesorders?customer_id=${FATASS_CUSTOMER_ID}&date_start=${DATE_START}&date_end=${DATE_END}&per_page=5&page=1`,
);

console.log("--- page_context ---");
console.log(JSON.stringify(list.page_context, null, 2));
console.log("--- first row keys ---");
console.log(Object.keys(list.salesorders?.[0] ?? {}));
console.log("--- first row ---");
console.log(JSON.stringify(list.salesorders?.[0], null, 2));

const firstId = list.salesorders?.[0]?.salesorder_id;
if (firstId) {
  const detail = await proxy.get(`/salesorders/${firstId}`);
  console.log("--- detail custom_fields ---");
  console.log(JSON.stringify(detail.salesorder?.custom_fields, null, 2));
}
```

- [ ] **Step 3: Run it and record findings**

Run: `node scripts/verify-zoho-salesorders.mjs`

Record answers to these three questions (paste findings into the task notes / commit message body):
1. **Do `date_start`/`date_end` filter?** Check that every returned row's `date` is within May 2026. If the params are ignored, rows from other months appear → use `date_start`/`date_end` variants documented for the connected API version (try `date.start`/`date.end` if needed) and re-verify.
2. **Do list rows carry the custom field?** Look for either a `custom_fields` array or a flattened `cf_*` key (e.g. `cf_special_use_case`) on the row whose value is `"Contains 3PL SKUs"`. If no May order has the field, query a month known to contain one.
3. **What does the row `status` look like?** Confirm lowercase strings (`draft`, `open`, `void`, ...).

- [ ] **Step 4: Decision gate**

- If list rows DO carry the custom field (expected): proceed — the matcher in Task 3 handles both the `custom_fields` array shape and flattened `cf_*` keys.
- If list rows do NOT carry the custom field: **STOP and report back to the user.** Counting would require one detail fetch per sales order (potentially hundreds of API calls/month against Zoho's rate limit) — that changes the design and needs sign-off.

- [ ] **Step 5: Delete the script**

Run: `rm scripts/verify-zoho-salesorders.mjs`
(Nothing to commit; this task produces knowledge, not code.)

---

### Task 2: Add vitest test infrastructure

The repo has no test runner. Add the minimum needed: vitest + an alias so files importing `server-only` can be tested.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/server-only-stub.ts`

- [ ] **Step 1: Install vitest**

Run: `pnpm add -D vitest`
Expected: exits 0, `vitest` appears in `devDependencies`.

- [ ] **Step 2: Add the test script to package.json**

In `package.json` `scripts`, after `"format": "biome format --write",` add:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Create the server-only stub**

```ts
// src/test/server-only-stub.ts
// Vitest replaces the `server-only` package with this empty module so
// server-only files can be unit tested outside a Next.js server context.
export {};
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Verify the runner works**

Run: `pnpm test`
Expected: "No test files found" (exit code may be non-zero — that's fine, the runner resolved config without error).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/server-only-stub.ts
git commit -m "chore(test): add vitest with server-only stub alias"
```

---

### Task 3: Pure sales-order matching + pagination counter (TDD)

**Files:**
- Create: `src/lib/zoho/sales-orders-matching.ts`
- Test: `src/lib/zoho/sales-orders-matching.test.ts`

This file must import NOTHING from the app (no `server-only`, no `@/env`) so tests run with zero mocking.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/zoho/sales-orders-matching.test.ts
import { describe, expect, test } from "vitest";

import {
  countSpecialUseCaseSalesOrdersFromPages,
  isSpecialUseCaseSalesOrder,
  MAX_SALES_ORDER_PAGES,
  type SalesOrdersPage,
} from "./sales-orders-matching";

const FIELD_ID = "3195387000008653629";

const matchingRow = (overrides: Record<string, unknown> = {}) => ({
  salesorder_id: "so-1",
  status: "open",
  custom_fields: [{ customfield_id: FIELD_ID, value: "Contains 3PL SKUs" }],
  ...overrides,
});

describe("isSpecialUseCaseSalesOrder", () => {
  test("matches an open order with the custom field in custom_fields", () => {
    expect(isSpecialUseCaseSalesOrder(matchingRow())).toBe(true);
  });

  test("matches case- and whitespace-insensitively", () => {
    expect(
      isSpecialUseCaseSalesOrder(
        matchingRow({
          custom_fields: [
            { customfield_id: FIELD_ID, value: "  contains 3pl skus  " },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("matches via flattened cf_* key when custom_fields is absent", () => {
    expect(
      isSpecialUseCaseSalesOrder({
        salesorder_id: "so-2",
        status: "invoiced",
        cf_special_use_case: "Contains 3PL SKUs",
      }),
    ).toBe(true);
  });

  test("excludes draft and void statuses regardless of field", () => {
    expect(isSpecialUseCaseSalesOrder(matchingRow({ status: "draft" }))).toBe(
      false,
    );
    expect(isSpecialUseCaseSalesOrder(matchingRow({ status: "void" }))).toBe(
      false,
    );
    expect(isSpecialUseCaseSalesOrder(matchingRow({ status: "Void" }))).toBe(
      false,
    );
  });

  test("ignores orders without the field or with other values", () => {
    expect(
      isSpecialUseCaseSalesOrder({ salesorder_id: "so-3", status: "open" }),
    ).toBe(false);
    expect(
      isSpecialUseCaseSalesOrder(
        matchingRow({
          custom_fields: [{ customfield_id: FIELD_ID, value: "Other" }],
        }),
      ),
    ).toBe(false);
    expect(
      isSpecialUseCaseSalesOrder(
        matchingRow({
          custom_fields: [{ customfield_id: "999", value: "Contains 3PL SKUs" }],
        }),
      ),
    ).toBe(false);
  });

  test("ignores non-record rows", () => {
    expect(isSpecialUseCaseSalesOrder(null)).toBe(false);
    expect(isSpecialUseCaseSalesOrder("nope")).toBe(false);
    expect(isSpecialUseCaseSalesOrder([matchingRow()])).toBe(false);
  });
});

describe("countSpecialUseCaseSalesOrdersFromPages", () => {
  test("sums matches across pages and stops when has_more_page is false", async () => {
    const pages: SalesOrdersPage[] = [
      {
        rows: [matchingRow(), matchingRow({ status: "draft" }), {}],
        hasMorePage: true,
      },
      { rows: [matchingRow(), matchingRow()], hasMorePage: false },
    ];
    const fetched: number[] = [];
    const count = await countSpecialUseCaseSalesOrdersFromPages(
      async (page) => {
        fetched.push(page);
        return pages[page - 1];
      },
    );
    expect(count).toBe(3);
    expect(fetched).toEqual([1, 2]);
  });

  test("throws instead of silently undercounting past the page cap", async () => {
    await expect(
      countSpecialUseCaseSalesOrdersFromPages(async () => ({
        rows: [matchingRow()],
        hasMorePage: true,
      })),
    ).rejects.toThrow(`${MAX_SALES_ORDER_PAGES}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/zoho/sales-orders-matching.test.ts`
Expected: FAIL — cannot resolve `./sales-orders-matching`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/zoho/sales-orders-matching.ts
// Pure matching/pagination logic for the fatass "Special Use Case" metric.
// Keep this file free of server-only / env imports so it stays unit-testable.

export const SPECIAL_USE_CASE_FIELD_ID = "3195387000008653629";
export const SPECIAL_USE_CASE_VALUE = "Contains 3PL SKUs";
export const MAX_SALES_ORDER_PAGES = 50;

const EXCLUDED_STATUSES = new Set(["draft", "void"]);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalize = (value: string) => value.trim().toLowerCase();

const matchesSpecialUseCaseValue = (value: unknown): boolean =>
  typeof value === "string" &&
  normalize(value) === normalize(SPECIAL_USE_CASE_VALUE);

const hasSpecialUseCaseCustomField = (row: UnknownRecord): boolean => {
  // Detail payloads (and some list rows) expose a custom_fields array.
  if (Array.isArray(row.custom_fields)) {
    const matched = row.custom_fields.some(
      (field) =>
        isRecord(field) &&
        String(field.customfield_id ?? "") === SPECIAL_USE_CASE_FIELD_ID &&
        matchesSpecialUseCaseValue(field.value),
    );
    if (matched) {
      return true;
    }
  }

  // List rows flatten custom fields into cf_<label> keys. The value is
  // specific enough that any cf_* match identifies the field.
  return Object.entries(row).some(
    ([key, value]) =>
      key.startsWith("cf_") && matchesSpecialUseCaseValue(value),
  );
};

export const isSpecialUseCaseSalesOrder = (row: unknown): boolean => {
  if (!isRecord(row)) {
    return false;
  }

  const status = typeof row.status === "string" ? normalize(row.status) : "";
  if (EXCLUDED_STATUSES.has(status)) {
    return false;
  }

  return hasSpecialUseCaseCustomField(row);
};

export type SalesOrdersPage = {
  rows: unknown[];
  hasMorePage: boolean;
};

export type FetchSalesOrdersPage = (page: number) => Promise<SalesOrdersPage>;

export const countSpecialUseCaseSalesOrdersFromPages = async (
  fetchPage: FetchSalesOrdersPage,
): Promise<number> => {
  let count = 0;

  for (let page = 1; page <= MAX_SALES_ORDER_PAGES; page += 1) {
    const { rows, hasMorePage } = await fetchPage(page);
    count += rows.filter(isSpecialUseCaseSalesOrder).length;

    if (!hasMorePage) {
      return count;
    }
  }

  throw new Error(
    `Zoho returned more than ${MAX_SALES_ORDER_PAGES} pages of sales orders; refusing to return a partial count.`,
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/zoho/sales-orders-matching.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/zoho/sales-orders-matching.ts src/lib/zoho/sales-orders-matching.test.ts
git commit -m "feat(zoho): add special use case sales order matching logic"
```

---

### Task 4: Metric key, schema column, migration, and mechanical plumbing

Everything that must change together for `tsc` to stay green when `BillingManualMetrics` gains its 9th key. All edits are mechanical clones of the `retailReturnsTotal` pattern.

**Files:**
- Modify: `src/lib/billing/types.ts`
- Modify: `src/db/schema/billing.ts`
- Modify: `src/lib/billing/reports.ts`
- Modify: `src/lib/billing/actions.ts`
- Modify: `src/components/admin/monthly-report-metrics-form.tsx` (draft-value plumbing only; UI section comes in Task 7)
- Generate: new file under `drizzle/`

- [ ] **Step 1: types.ts — metric key, ordering constant, empty overrides, warning board**

In `src/lib/billing/types.ts`:

Add to `BillingManualMetrics` (after `specialProjectHours: number;`):
```ts
  specialUseCaseOrdersCount: number;
```

Add to `ALL_METRIC_KEYS` (after `"specialProjectHours",`):
```ts
  "specialUseCaseOrdersCount",
```

Add to `EMPTY_OVERRIDES` (after `specialProjectHours: false,`):
```ts
  specialUseCaseOrdersCount: false,
```

Change the `BillingMondayMetricsWarning` board union from:
```ts
  board: "storage-tracking" | "receiving" | "special-projects" | "connection";
```
to:
```ts
  board:
    | "storage-tracking"
    | "receiving"
    | "special-projects"
    | "zoho-sales-orders"
    | "connection";
```

- [ ] **Step 2: schema — column + overrides default**

In `src/db/schema/billing.ts`, after the `specialProjectHours` column definition add:

```ts
    specialUseCaseOrdersCount: integer("special_use_case_orders_count")
      .notNull()
      .default(0),
```

And in the `manualMetricsOverrides` `.default({...})` object add (after `specialProjectHours: false,`):

```ts
        specialUseCaseOrdersCount: false,
```

- [ ] **Step 3: Generate and run the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/00XX_*.sql` containing `ALTER TABLE "monthly_billing_report" ADD COLUMN "special_use_case_orders_count" integer DEFAULT 0 NOT NULL;` (plus the jsonb default change). Inspect the SQL before applying.

Run: `pnpm db:migrate`
Expected: exits 0.

- [ ] **Step 4: reports.ts — five mechanical spots**

In `src/lib/billing/reports.ts`:

a) `getManualMetricsFromRow` (~line 283): add to the row parameter type:
```ts
  specialUseCaseOrdersCount: number | null;
```
and to the returned object:
```ts
  specialUseCaseOrdersCount: row.specialUseCaseOrdersCount ?? 0,
```

b) `generateMonthlyBillingReport` — the `existingMetricsRow` select (~line 498): add
```ts
        specialUseCaseOrdersCount: monthlyBillingReport.specialUseCaseOrdersCount,
```
and the subsequent `.set({...})` (~line 531): add
```ts
        specialUseCaseOrdersCount: nextMetrics.specialUseCaseOrdersCount,
```

c) `updateMonthlyBillingReportManualMetrics` — the `.set({...})` (~line 729): add
```ts
      specialUseCaseOrdersCount: manualMetrics.specialUseCaseOrdersCount,
```

d) `refreshMondayMetricsForReport` — the row select (~line 754): add
```ts
      specialUseCaseOrdersCount: monthlyBillingReport.specialUseCaseOrdersCount,
```
and its `.set({...})` (~line 808): add
```ts
      specialUseCaseOrdersCount: nextMetrics.specialUseCaseOrdersCount,
```

e) `getMonthlyBillingReport` — the report select (~line 890): add
```ts
      specialUseCaseOrdersCount: monthlyBillingReport.specialUseCaseOrdersCount,
```

- [ ] **Step 5: actions.ts — parse the new form field**

In `getManualMetricsFromFormData` in `src/lib/billing/actions.ts`, after the `retailReturnsTotal` parse add:

```ts
  const specialUseCaseOrdersCount = parseIntegerField(
    formData,
    "specialUseCaseOrdersCount",
    "Special use case orders",
    fieldErrors,
  );
```

Add `specialUseCaseOrdersCount === null ||` to the null-check chain, and `specialUseCaseOrdersCount,` to the returned `manualMetrics` object (after `retailReturnsTotal,` — order within the object doesn't matter, keep it next to the other counts).

- [ ] **Step 6: metrics form — draft-value plumbing only**

In `src/components/admin/monthly-report-metrics-form.tsx`:

a) `buildDraftValues` (~line 66): add
```ts
  specialUseCaseOrdersCount: String(metrics.specialUseCaseOrdersCount),
```

b) The `useEffect` that rebuilds draft values (~line 325): add to the object
```ts
        specialUseCaseOrdersCount: String(currentMetrics.specialUseCaseOrdersCount),
```
and to the dependency array:
```ts
    currentMetrics.specialUseCaseOrdersCount,
```

- [ ] **Step 7: Type-check and lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.
Run: `pnpm lint`
Expected: no new issues (run `pnpm format` if Biome complains about formatting).

- [ ] **Step 8: Commit**

```bash
git add src/lib/billing/types.ts src/db/schema/billing.ts drizzle src/lib/billing/reports.ts src/lib/billing/actions.ts src/components/admin/monthly-report-metrics-form.tsx
git commit -m "feat(billing): add specialUseCaseOrdersCount metric column and plumbing"
```

---

### Task 5: Extract pure snapshot-merge helpers + absent-key test (TDD)

`applySnapshotToMetrics` / `computeOverridesAgainstSnapshot` currently live in `monday-metrics.ts`, which transitively imports `@/env` (untestable). Move them verbatim to a pure module; re-export from `monday-metrics.ts` so `reports.ts` imports don't change.

**Files:**
- Create: `src/lib/billing/metrics-merge.ts`
- Modify: `src/lib/billing/monday-metrics.ts`
- Test: `src/lib/billing/metrics-merge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/billing/metrics-merge.test.ts
import { describe, expect, test } from "vitest";

import { applySnapshotToMetrics } from "./metrics-merge";
import type { BillingManualMetrics } from "./types";
import { EMPTY_OVERRIDES } from "./types";

const METRICS: BillingManualMetrics = {
  smallBinCount: 1,
  mediumBinCount: 2,
  largeBinCount: 3,
  additionalCartonsCount: 4,
  cartonsReceivedTotal: 5,
  palletsReceivedTotal: 6,
  retailReturnsTotal: 7,
  specialProjectHours: 8,
  specialUseCaseOrdersCount: 9,
};

describe("applySnapshotToMetrics", () => {
  test("a key absent from the snapshot leaves the current value untouched", () => {
    const { nextMetrics } = applySnapshotToMetrics({
      currentMetrics: METRICS,
      currentOverrides: EMPTY_OVERRIDES,
      snapshot: { cartonsReceivedTotal: 50 },
    });

    expect(nextMetrics.specialUseCaseOrdersCount).toBe(9);
    expect(nextMetrics.cartonsReceivedTotal).toBe(50);
  });

  test("an overridden key keeps its manual value even when the snapshot has data", () => {
    const { nextMetrics } = applySnapshotToMetrics({
      currentMetrics: METRICS,
      currentOverrides: {
        ...EMPTY_OVERRIDES,
        specialUseCaseOrdersCount: true,
      },
      snapshot: { specialUseCaseOrdersCount: 42 },
    });

    expect(nextMetrics.specialUseCaseOrdersCount).toBe(9);
  });

  test("a snapshot number replaces a non-overridden value", () => {
    const { nextMetrics } = applySnapshotToMetrics({
      currentMetrics: METRICS,
      currentOverrides: EMPTY_OVERRIDES,
      snapshot: { specialUseCaseOrdersCount: 42 },
    });

    expect(nextMetrics.specialUseCaseOrdersCount).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/billing/metrics-merge.test.ts`
Expected: FAIL — cannot resolve `./metrics-merge`.

- [ ] **Step 3: Create metrics-merge.ts by moving the two functions verbatim**

Create `src/lib/billing/metrics-merge.ts` containing exactly the two functions (and their doc comments) currently at `src/lib/billing/monday-metrics.ts:52-106`, plus imports:

```ts
import type {
  BillingManualMetrics,
  BillingManualMetricsOverrides,
  BillingMondayMetricsSnapshot,
} from "./types";
import { ALL_METRIC_KEYS } from "./types";

/**
 * Overlay a Monday snapshot on top of the report's current state.
 * Per-field: if overridden, keep current; else replace with snapshot value
 * when snapshot has a finite number; else keep current.
 */
export const applySnapshotToMetrics = ({
  currentMetrics,
  currentOverrides,
  snapshot,
}: {
  currentMetrics: BillingManualMetrics;
  currentOverrides: BillingManualMetricsOverrides;
  snapshot: BillingMondayMetricsSnapshot;
}): {
  nextMetrics: BillingManualMetrics;
  nextOverrides: BillingManualMetricsOverrides;
} => {
  const nextMetrics = { ...currentMetrics };
  const nextOverrides = { ...currentOverrides };

  for (const key of ALL_METRIC_KEYS) {
    if (currentOverrides[key]) continue;
    const incoming = snapshot[key];
    if (typeof incoming === "number" && Number.isFinite(incoming)) {
      nextMetrics[key] = incoming;
    }
  }

  return { nextMetrics, nextOverrides };
};

/**
 * Override-flag rule applied at save time: a field is overridden iff its
 * submitted value differs from the current Monday snapshot. If the snapshot
 * is null/absent for a key, any saved value is considered manual.
 */
export const computeOverridesAgainstSnapshot = ({
  submittedMetrics,
  snapshot,
}: {
  submittedMetrics: BillingManualMetrics;
  snapshot: BillingMondayMetricsSnapshot;
}): BillingManualMetricsOverrides => {
  const overrides = {} as BillingManualMetricsOverrides;
  for (const key of ALL_METRIC_KEYS) {
    const submitted = submittedMetrics[key];
    const snap = snapshot[key];
    if (typeof snap === "number" && Number.isFinite(snap)) {
      overrides[key] = submitted !== snap;
    } else {
      overrides[key] = true;
    }
  }
  return overrides;
};
```

In `src/lib/billing/monday-metrics.ts`: delete the two moved functions (lines 52-106) and the now-unused imports (`BillingManualMetrics`, `BillingManualMetricsOverrides`, `ALL_METRIC_KEYS`), then add near the top:

```ts
export {
  applySnapshotToMetrics,
  computeOverridesAgainstSnapshot,
} from "./metrics-merge";
```

- [ ] **Step 4: Run tests + type-check**

Run: `pnpm test src/lib/billing/metrics-merge.test.ts`
Expected: PASS.
Run: `pnpm exec tsc --noEmit`
Expected: no errors (reports.ts still imports from `./monday-metrics`, which re-exports).

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/metrics-merge.ts src/lib/billing/metrics-merge.test.ts src/lib/billing/monday-metrics.ts
git commit -m "refactor(billing): extract pure snapshot merge helpers for testability"
```

---

### Task 6: Server-side Zoho counter

**Files:**
- Modify: `src/lib/zoho/books.ts` (export three existing private helpers)
- Create: `src/lib/zoho/sales-orders.ts`

This is thin I/O glue around the already-tested pure counter — no unit test; Task 1 verified the API shape and Task 10 verifies end-to-end.

- [ ] **Step 1: Export the helpers from books.ts**

In `src/lib/zoho/books.ts`, change three existing declarations to exported ones (no body changes):

- `const getZohoProxy = () =>` → `export const getZohoProxy = () =>`
- `const buildZohoPath = (` → `export const buildZohoPath = (`
- `const getErrorMessage = (error: unknown): string =>` → `export const getErrorMessage = (error: unknown): string =>`

- [ ] **Step 2: Create sales-orders.ts**

```ts
// src/lib/zoho/sales-orders.ts
import "server-only";

import { buildZohoPath, getErrorMessage, getZohoProxy } from "./books";
import {
  countSpecialUseCaseSalesOrdersFromPages,
  type SalesOrdersPage,
} from "./sales-orders-matching";

const ZOHO_SALES_ORDERS_PATH = "/salesorders";
const SALES_ORDERS_PER_PAGE = 200;

const pad = (value: number) => String(value).padStart(2, "0");

const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Counts fatass sales orders dated within the given month that carry the
 * "Special Use Case = Contains 3PL SKUs" custom field, excluding draft and
 * void orders. Filtering happens client-side because Zoho silently ignores
 * unknown query params (verified 2026-06; see the design spec).
 */
export const countSpecialUseCaseSalesOrders = async ({
  customerId,
  year,
  month,
}: {
  customerId: string;
  year: number;
  month: number;
}): Promise<number> => {
  const proxy = getZohoProxy();
  const dateStart = `${year}-${pad(month)}-01`;
  const dateEnd = `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;

  const fetchPage = async (page: number): Promise<SalesOrdersPage> => {
    let response: unknown;
    try {
      response = await proxy.get(
        buildZohoPath(ZOHO_SALES_ORDERS_PATH, {
          customer_id: customerId,
          date_start: dateStart,
          date_end: dateEnd,
          page,
          per_page: SALES_ORDERS_PER_PAGE,
        }),
      );
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }

    const record =
      response && typeof response === "object" && !Array.isArray(response)
        ? (response as Record<string, unknown>)
        : {};
    const rows = Array.isArray(record.salesorders) ? record.salesorders : [];
    const pageContext =
      record.page_context &&
      typeof record.page_context === "object" &&
      !Array.isArray(record.page_context)
        ? (record.page_context as Record<string, unknown>)
        : null;

    return { rows, hasMorePage: pageContext?.has_more_page === true };
  };

  return countSpecialUseCaseSalesOrdersFromPages(fetchPage);
};
```

**Note:** if Task 1 found that `date_start`/`date_end` are NOT the working param names, substitute the verified names here.

- [ ] **Step 3: Type-check + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/zoho/books.ts src/lib/zoho/sales-orders.ts
git commit -m "feat(zoho): add monthly special use case sales order counter"
```

---

### Task 7: Pull integration — fatass gate + warning mapping (TDD)

**Files:**
- Create: `src/lib/billing/zoho-metrics.ts`
- Modify: `src/lib/billing/monday-metrics.ts`
- Test: `src/lib/billing/zoho-metrics.test.ts`

The counter is injected as a parameter so the gate/warning logic tests without touching `@/env`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/billing/zoho-metrics.test.ts
import { describe, expect, test } from "vitest";

import { loadSpecialUseCaseOrdersForPeriod } from "./zoho-metrics";

describe("loadSpecialUseCaseOrdersForPeriod", () => {
  test("returns an empty result for non-fatass accounts without calling the counter", async () => {
    let called = false;
    const result = await loadSpecialUseCaseOrdersForPeriod({
      accountSlug: "ryot",
      year: 2026,
      month: 5,
      counter: async () => {
        called = true;
        return 99;
      },
    });

    expect(result).toEqual({ snapshot: {}, warnings: [] });
    expect(called).toBe(false);
  });

  test("returns the count in the snapshot for fatass", async () => {
    const result = await loadSpecialUseCaseOrdersForPeriod({
      accountSlug: "fatass",
      year: 2026,
      month: 5,
      counter: async ({ customerId, year, month }) => {
        expect(customerId).toBe("3195387000000546623");
        expect(year).toBe(2026);
        expect(month).toBe(5);
        return 17;
      },
    });

    expect(result.snapshot).toEqual({ specialUseCaseOrdersCount: 17 });
    expect(result.warnings).toEqual([]);
  });

  test("maps a counter failure to a zoho-sales-orders warning", async () => {
    const result = await loadSpecialUseCaseOrdersForPeriod({
      accountSlug: "fatass",
      year: 2026,
      month: 5,
      counter: async () => {
        throw new Error("rate limit exceeded");
      },
    });

    expect(result.snapshot).toEqual({});
    expect(result.warnings).toEqual([
      {
        board: "zoho-sales-orders",
        severity: "error",
        message:
          "Zoho Books special use case pull failed: rate limit exceeded",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/billing/zoho-metrics.test.ts`
Expected: FAIL — cannot resolve `./zoho-metrics`.

- [ ] **Step 3: Implement zoho-metrics.ts**

```ts
// src/lib/billing/zoho-metrics.ts
import { getZohoContactIdForSlug } from "@/lib/zoho/contact-map";

import type {
  BillingAccountSlug,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
} from "./types";

export type SpecialUseCaseCounter = (params: {
  customerId: string;
  year: number;
  month: number;
}) => Promise<number>;

const ZOHO_METRIC_ACCOUNT: BillingAccountSlug = "fatass";

/**
 * Loads the fatass-only "special use case orders" count from Zoho Books.
 * Failures degrade to a warning instead of throwing so a Zoho outage never
 * blocks report generation. The counter is injected for testability.
 */
export const loadSpecialUseCaseOrdersForPeriod = async ({
  accountSlug,
  year,
  month,
  counter,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
  counter: SpecialUseCaseCounter;
}): Promise<{
  snapshot: BillingMondayMetricsSnapshot;
  warnings: BillingMondayMetricsWarning[];
}> => {
  if (accountSlug !== ZOHO_METRIC_ACCOUNT) {
    return { snapshot: {}, warnings: [] };
  }

  try {
    const count = await counter({
      customerId: getZohoContactIdForSlug(ZOHO_METRIC_ACCOUNT),
      year,
      month,
    });

    return { snapshot: { specialUseCaseOrdersCount: count }, warnings: [] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Zoho Books error.";

    return {
      snapshot: {},
      warnings: [
        {
          board: "zoho-sales-orders",
          severity: "error",
          message: `Zoho Books special use case pull failed: ${message}`,
        },
      ],
    };
  }
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/billing/zoho-metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into pullMondayMetricsForPeriod**

In `src/lib/billing/monday-metrics.ts`, add imports:

```ts
import { countSpecialUseCaseSalesOrders } from "@/lib/zoho/sales-orders";

import { loadSpecialUseCaseOrdersForPeriod } from "./zoho-metrics";
```

Change the parallel load in `pullMondayMetricsForPeriod` from three loads to four:

```ts
  const [storage, receiving, projects, zohoSalesOrders] = await Promise.all([
    loadStorageTrackingForPeriod({ accountSlug, year, month }),
    loadReceivingForPeriod({ accountSlug, year, month }),
    loadSpecialProjectsForPeriod({ accountSlug, year, month }),
    loadSpecialUseCaseOrdersForPeriod({
      accountSlug,
      year,
      month,
      counter: countSpecialUseCaseSalesOrders,
    }),
  ]);

  const snapshot: BillingMondayMetricsSnapshot = {
    ...(storage?.snapshot ?? {}),
    ...receiving.snapshot,
    ...projects.snapshot,
    ...zohoSalesOrders.snapshot,
  };

  const warnings: BillingMondayMetricsWarning[] = [
    ...(storage?.warnings ?? []),
    ...receiving.warnings,
    ...projects.warnings,
    ...zohoSalesOrders.warnings,
  ];
```

- [ ] **Step 6: Type-check, lint, full test run**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/zoho-metrics.ts src/lib/billing/zoho-metrics.test.ts src/lib/billing/monday-metrics.ts
git commit -m "feat(billing): pull fatass special use case count during metrics pull"
```

---

### Task 8: Metrics form UI — fatass-only section + source-aware badges

**Files:**
- Modify: `src/components/admin/monthly-report-metrics-form.tsx`
- Modify: `src/app/admin/reports/monthly/page.tsx`

- [ ] **Step 1: Add the accountSlug prop**

In `MonthlyReportMetricsFormProps` add:
```ts
  accountSlug: string;
```
and destructure `accountSlug` in the component signature.

In `src/app/admin/reports/monthly/page.tsx`, the `<MonthlyReportMetricsForm` call (~line 374) gains:
```tsx
            accountSlug={selectedAccount.slug}
```

- [ ] **Step 2: Source-aware metric fields**

In the form file, add to the `MetricField` type:
```ts
  sourceLabel?: "Monday" | "Zoho";
```

Define the new field list and section builder after `METRIC_SECTIONS`:

```ts
const SPECIAL_USE_CASE_METRICS: MetricField[] = [
  {
    key: "specialUseCaseOrdersCount",
    label: "Special use case orders",
    description:
      "Sales orders marked 'Contains 3PL SKUs' — combined 3PL + drop-ship shipments. Pulled from Zoho Books.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
    sourceLabel: "Zoho",
  },
];

const FATASS_ACCOUNT_SLUG = "fatass";

const buildMetricSections = (accountSlug: string): MetricSection[] => [
  ...METRIC_SECTIONS,
  ...(accountSlug === FATASS_ACCOUNT_SLUG
    ? [
        {
          title: "Special handling",
          description:
            "Combined-shipment sales orders pulled from Zoho Books custom fields.",
          gridClassName: "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
          fields: SPECIAL_USE_CASE_METRICS,
        },
      ]
    : []),
];
```

In the component body (before the `return`), add:
```ts
  const metricSections = buildMetricSections(accountSlug);
```
and change the render loop `{METRIC_SECTIONS.map((section) => (` to `{metricSections.map((section) => (`.

- [ ] **Step 3: Generalize the badge and hint copy**

`renderFieldBadge` gains a `sourceLabel` param and uses it in both branches:

```ts
const renderFieldBadge = ({
  kind,
  snapshotValue,
  effectiveValue,
  sourceLabel,
}: {
  kind: FieldBadgeKind;
  snapshotValue: number | null | undefined;
  effectiveValue: number;
  sourceLabel: "Monday" | "Zoho";
}) => {
  if (kind === null) return null;
  if (kind === "monday") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {sourceLabel}
      </span>
    );
  }
  const tooltip =
    typeof snapshotValue === "number" && Number.isFinite(snapshotValue)
      ? `${sourceLabel} currently shows: ${snapshotValue}. You've overridden to ${effectiveValue}.`
      : `No data in ${sourceLabel} for this field; using manual value.`;
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400"
      title={tooltip}
    >
      Overridden
    </span>
  );
};
```

`computeEditHint` gains `sourceLabel` and its return becomes:
```ts
  return `Matches ${sourceLabel} — override will clear.`;
```
(add `sourceLabel: "Monday" | "Zoho";` to its params type).

Update all call sites inside the render loop (two `renderFieldBadge` calls, two `computeEditHint` calls) to pass:
```ts
sourceLabel: metric.sourceLabel ?? "Monday",
```

- [ ] **Step 4: Type-check, lint, manual visual check**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

Run: `pnpm dev`, open `/admin/reports/monthly?account=fatass`, confirm:
- a "Special handling" section with the "Special use case orders" field appears for fatass (badge reads "Zoho" once a snapshot exists);
- switching to `?account=ryot` or `?account=dip` hides the section;
- Edit → change the value → Save works and the Overridden badge appears.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/monthly-report-metrics-form.tsx src/app/admin/reports/monthly/page.tsx
git commit -m "feat(billing): show fatass special use case metric in monthly report form"
```

---

### Task 9: Invoice line + CSV row (TDD)

**Files:**
- Modify: `src/lib/billing/invoice-builder.ts`
- Modify: `src/lib/billing/reports.ts` (CSV export)
- Test: `src/lib/billing/invoice-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/billing/invoice-builder.test.ts
import { describe, expect, test } from "vitest";

import { buildInvoiceParams } from "./invoice-builder";
import type { MonthlyBillingReportDetail } from "./reports";
import { EMPTY_OVERRIDES } from "./types";

const makeDetail = (
  slug: string,
  specialUseCaseOrdersCount: number,
): MonthlyBillingReportDetail => ({
  report: {
    id: "report-1",
    account: { id: "acct-1", slug, displayName: slug },
    periodStart: new Date(Date.UTC(2026, 4, 1)),
    periodEnd: new Date(Date.UTC(2026, 5, 1)),
    status: "finalized",
    sheetSourceHash: "hash",
    shipmentCount: 10,
    unitsPickedTotal: 25,
    packageCount: 12,
    packagingCostTotal: 100,
    unmatchedShipmentCount: 0,
    manualMetrics: {
      smallBinCount: 1,
      mediumBinCount: 2,
      largeBinCount: 3,
      additionalCartonsCount: 4,
      cartonsReceivedTotal: 5,
      palletsReceivedTotal: 6,
      retailReturnsTotal: 7,
      specialProjectHours: 8,
      specialUseCaseOrdersCount,
    },
    mondayMetricsSnapshot: {},
    manualMetricsOverrides: EMPTY_OVERRIDES,
    mondayMetricsFetchedAt: null,
    mondayMetricsWarnings: [],
    orderChannelSummary: null,
    generatedAt: new Date(Date.UTC(2026, 5, 1)),
    finalizedAt: null,
    zohoInvoiceId: null,
    previousZohoInvoiceIds: [],
    lastRevertedAt: null,
    lastRevertedBy: null,
    lastRevertedByName: null,
    lastRevertReason: null,
  },
  shipments: [],
});

describe("buildInvoiceParams", () => {
  test("fatass invoices include the special handling line with the metric quantity", () => {
    const params = buildInvoiceParams(makeDetail("fatass", 17), "fatass");
    const line = params.lineItems.find(
      (item) => item.sku === "3PL-HANDLING-RETAIL",
    );

    expect(line).toBeDefined();
    expect(line?.quantity).toBe(17);
    expect(line?.name).toBe("Special Handling Fee - Retail Order");
    expect(line?.rate).toBeUndefined();
  });

  test("fatass line is present even at quantity zero", () => {
    const params = buildInvoiceParams(makeDetail("fatass", 0), "fatass");
    expect(
      params.lineItems.some((item) => item.sku === "3PL-HANDLING-RETAIL"),
    ).toBe(true);
  });

  test("other vendors never get the special handling line", () => {
    for (const slug of ["dip", "ryot"] as const) {
      const params = buildInvoiceParams(makeDetail(slug, 17), slug);
      expect(
        params.lineItems.some((item) => item.sku === "3PL-HANDLING-RETAIL"),
      ).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/billing/invoice-builder.test.ts`
Expected: FAIL — first test's `line` is undefined.

- [ ] **Step 3: Add the invoice line**

In `src/lib/billing/invoice-builder.ts`, rename the existing array `const lineItems: ZohoLineItem[] = [...]` to `const baseLineItems: ZohoLineItem[] = [...]` and after it add:

```ts
  // Fatass-only: combined 3PL + drop-ship shipments counted from Zoho sales
  // orders. No rate — resolveZohoItemIds falls back to the Zoho item's rate.
  const lineItems: ZohoLineItem[] =
    accountSlug === "fatass"
      ? [
          ...baseLineItems,
          {
            sku: "3PL-HANDLING-RETAIL",
            name: "Special Handling Fee - Retail Order",
            quantity: report.manualMetrics.specialUseCaseOrdersCount,
          },
        ]
      : baseLineItems;
```

(The `return { ... lineItems }` statement stays unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/billing/invoice-builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the CSV row**

In `exportMonthlyBillingReportCsv` in `src/lib/billing/reports.ts`, after the `["Special project hours", ...]` entry (~line 1077-1080) add:

```ts
    ...(report.report.account.slug === "fatass"
      ? [
          [
            "Special use case orders",
            report.report.manualMetrics.specialUseCaseOrdersCount,
          ],
        ]
      : []),
```

- [ ] **Step 6: Type-check, lint, full tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/invoice-builder.ts src/lib/billing/invoice-builder.test.ts src/lib/billing/reports.ts
git commit -m "feat(billing): bill fatass special use case orders as 3PL-HANDLING-RETAIL"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full automated pass**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: all green. Fix anything that fails before proceeding.

- [ ] **Step 2: Manual end-to-end check (requires Zoho + Monday connectivity)**

1. `pnpm dev`, open `/admin/reports/monthly?account=fatass&month=<last completed month>`.
2. Generate (or regenerate) the draft report. Confirm the success toast mentions metrics were pulled and no `zoho-sales-orders` warning appears.
3. Confirm "Special use case orders" shows a plausible count with the "Zoho" badge.
4. **Cross-check the count** against Zoho Books UI: filter fatass sales orders for the month where Special Use Case = "Contains 3PL SKUs", excluding draft/void. The numbers must match exactly — if they don't, debug before shipping (most likely cause: date filter or status casing).
5. Override the value, save, confirm "Overridden" badge; click "Refresh from Monday", confirm the override survives.
6. (Optional, creates a real draft invoice — get user OK first) Finalize and create the Zoho invoice; confirm the "Special Handling Fee - Retail Order" line appears with the right quantity and the item's configured rate; revert afterward to void it.

- [ ] **Step 3: Report results to the user**

Summarize: migration applied, tests passing, manual cross-check numbers (yours vs Zoho UI), and whether the optional invoice smoke test was run.
