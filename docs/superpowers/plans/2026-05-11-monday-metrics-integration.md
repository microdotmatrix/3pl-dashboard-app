# Monday.com metrics integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull storage bin counts, receiving counts, and special project hours from three Monday.com boards into the monthly billing report, while preserving manual entry as a fallback and as a per-field override.

**Architecture:** Three per-board loader modules under `src/lib/monday/` parse and aggregate Monday items into typed snapshot slices. An orchestrator in `src/lib/billing/monday-metrics.ts` runs the loaders in parallel and merges the results. The existing `generateMonthlyBillingReport` is extended to pull Monday alongside ShipStation; a new `refreshMondayMetricsForReport` powers a UI button on draft reports. Effective metric values continue to live in the existing eight columns on `monthly_billing_report`; three new columns (`monday_metrics_snapshot`, `manual_metrics_overrides`, `monday_metrics_fetched_at`, `monday_metrics_warnings`) track provenance and let refresh respect per-field overrides.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19 with React Compiler, Drizzle ORM, Postgres (Neon), Zod 4, T3 env, AI SDK v6, Biome, Tailwind v4, pnpm.

**Project conventions:**
- No test framework. Verification is `pnpm lint`, `pnpm build` (which runs `tsc`), and manual smoke testing per the existing project specs.
- Server-only modules import `"server-only"`.
- Server actions live in `src/lib/billing/actions.ts` and use `requireAdmin()`.
- Drizzle migrations: edit schema, then `pnpm db:generate` (writes `drizzle/0014_<random>.sql` + meta snapshot), then `pnpm db:migrate`.
- One commit per task. Conventional-commits prefixes (`feat(billing):`, `feat(monday):`, `feat(db):`).

**Reference spec:** [`docs/superpowers/specs/2026-05-11-monday-metrics-integration-design.md`](../specs/2026-05-11-monday-metrics-integration-design.md)

---

## File Structure

**New files**
- `src/lib/monday/vendor-map.ts` — `BillingAccountSlug` ↔ Monday vendor-status label.
- `src/lib/monday/storage-tracking.ts` — `loadStorageTrackingForPeriod`.
- `src/lib/monday/receiving.ts` — `loadReceivingForPeriod`.
- `src/lib/monday/special-projects.ts` — `loadSpecialProjectsForPeriod`.
- `src/lib/billing/monday-metrics.ts` — `pullMondayMetricsForPeriod`, `applySnapshotToReport`.
- `drizzle/0014_<random>.sql` + `drizzle/meta/0014_snapshot.json` — auto-generated migration.

**Modified files**
- `src/env.ts` — three new env vars.
- `src/lib/billing/types.ts` — `BillingMetricKey`, `BillingManualMetricsOverrides`, `BillingMondayMetricsSnapshot`, `BillingMondayMetricsWarning`.
- `src/db/schema/billing.ts` — four new columns.
- `src/lib/billing/reports.ts` — extend generate, getter, save; add `refreshMondayMetricsForReport`.
- `src/lib/billing/actions.ts` — `refreshMondayMetricsAction`; updated generate-action message.
- `src/lib/billing/action-state.ts` — extend metrics action state with overrides.
- `src/components/admin/monthly-report-metrics-form.tsx` — new props, refresh button, badges, warnings panel, edit-time hint.
- `src/app/admin/reports/monthly/page.tsx` — thread new props into the form.
- `src/app/api/admin/billing/agent/route.ts` — `refresh_monday_metrics` tool + system-prompt sentence.

---

## Task 1: Add types for Monday metrics integration

**Files:**
- Modify: `src/lib/billing/types.ts`

- [ ] **Step 1: Add types**

Append to `src/lib/billing/types.ts`:

```ts
export type BillingMetricKey = keyof BillingManualMetrics;

export type BillingManualMetricsOverrides = Record<BillingMetricKey, boolean>;

export type BillingMondayMetricsSnapshot = Partial<
  Record<BillingMetricKey, number | null>
>;

export type BillingMondayMetricsWarning = {
  board: "storage-tracking" | "receiving" | "special-projects" | "connection";
  severity: "warning" | "error";
  message: string;
};

export const ALL_METRIC_KEYS: readonly BillingMetricKey[] = [
  "smallBinCount",
  "mediumBinCount",
  "largeBinCount",
  "additionalCartonsCount",
  "cartonsReceivedTotal",
  "palletsReceivedTotal",
  "retailReturnsTotal",
  "specialProjectHours",
] as const;

export const EMPTY_OVERRIDES: BillingManualMetricsOverrides = {
  smallBinCount: false,
  mediumBinCount: false,
  largeBinCount: false,
  additionalCartonsCount: false,
  cartonsReceivedTotal: false,
  palletsReceivedTotal: false,
  retailReturnsTotal: false,
  specialProjectHours: false,
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: build succeeds (or fails only on the *other* spots that still need the new types).

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/types.ts
git commit -m "feat(billing): types for Monday metrics snapshot and per-field overrides"
```

---

## Task 2: Add env vars for the three Monday boards

**Files:**
- Modify: `src/env.ts`

- [ ] **Step 1: Add the three vars to the server schema**

In `src/env.ts`, find the `server` block and add the three vars after `MONDAY_PACKAGE_BOARD_ID`:

```ts
MONDAY_PACKAGE_BOARD_ID: z.string().min(1),
MONDAY_STORAGE_TRACKING_BOARD_ID: z.string().min(1),
MONDAY_RECEIVING_BOARD_ID: z.string().min(1),
MONDAY_SPECIAL_PROJECTS_BOARD_ID: z.string().min(1),
```

And in the `runtimeEnv` block:

```ts
MONDAY_PACKAGE_BOARD_ID: process.env.MONDAY_PACKAGE_BOARD_ID,
MONDAY_STORAGE_TRACKING_BOARD_ID: process.env.MONDAY_STORAGE_TRACKING_BOARD_ID,
MONDAY_RECEIVING_BOARD_ID: process.env.MONDAY_RECEIVING_BOARD_ID,
MONDAY_SPECIAL_PROJECTS_BOARD_ID: process.env.MONDAY_SPECIAL_PROJECTS_BOARD_ID,
```

- [ ] **Step 2: Set values locally**

Append to `.env.local` (or whichever local env file is in use — `.env.development.local`, `.env`, etc.; check with `ls -la .env*`):

```
MONDAY_STORAGE_TRACKING_BOARD_ID=18412633530
MONDAY_RECEIVING_BOARD_ID=18412647233
MONDAY_SPECIAL_PROJECTS_BOARD_ID=18412659898
```

These are the live board IDs verified against the Monday API.

- [ ] **Step 3: Verify env parses**

Run: `pnpm build`
Expected: success (`@t3-oss/env-nextjs` validates at module load).

- [ ] **Step 4: Commit**

```bash
git add src/env.ts
git commit -m "feat(env): add board IDs for storage tracking, receiving, special projects"
```

(Do not commit `.env.local`.)

---

## Task 3: Add the vendor label map

**Files:**
- Create: `src/lib/monday/vendor-map.ts`

- [ ] **Step 1: Write the file**

```ts
import { isVendorSlug } from "@/lib/shipments/vendor-colors";

import type { BillingAccountSlug } from "@/lib/billing/types";

const VENDOR_LABEL: Record<BillingAccountSlug, string> = {
  ryot: "RYOT",
  fatass: "Fat Ass Glass",
  dip: "Dip Devices",
};

export const getMondayVendorLabel = (
  accountSlug: string,
): string => {
  if (!isVendorSlug(accountSlug)) {
    throw new Error(`Unsupported billing account slug "${accountSlug}".`);
  }

  return VENDOR_LABEL[accountSlug];
};

export const isMondayVendorLabelForSlug = (
  label: string,
  accountSlug: BillingAccountSlug,
): boolean => label === VENDOR_LABEL[accountSlug];
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/monday/vendor-map.ts
git commit -m "feat(monday): add vendor-slug-to-Monday-label mapping"
```

---

## Task 4: Add Drizzle schema columns and run the migration

**Files:**
- Modify: `src/db/schema/billing.ts`
- Auto-generated: `drizzle/0014_<random>.sql`, `drizzle/meta/0014_snapshot.json`

- [ ] **Step 1: Extend the schema**

Open `src/db/schema/billing.ts`. Import the new types at the top:

```ts
import type {
  BillingManualMetricsOverrides,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
  BillingPackageMatch,
  BillingReportStatus,
  BillingShipmentMatchStatus,
} from "@/lib/billing/types";
```

Then add four columns inside the `monthlyBillingReport` `pgTable(...)` call. Insert these after the existing `specialProjectHours` numeric column and before `generatedAt`:

```ts
mondayMetricsSnapshot: jsonb("monday_metrics_snapshot")
  .$type<BillingMondayMetricsSnapshot>()
  .notNull()
  .default({}),
manualMetricsOverrides: jsonb("manual_metrics_overrides")
  .$type<BillingManualMetricsOverrides>()
  .notNull()
  .default({
    smallBinCount: false,
    mediumBinCount: false,
    largeBinCount: false,
    additionalCartonsCount: false,
    cartonsReceivedTotal: false,
    palletsReceivedTotal: false,
    retailReturnsTotal: false,
    specialProjectHours: false,
  }),
mondayMetricsFetchedAt: timestamp("monday_metrics_fetched_at", {
  withTimezone: true,
}),
mondayMetricsWarnings: jsonb("monday_metrics_warnings")
  .$type<BillingMondayMetricsWarning[]>()
  .notNull()
  .default([]),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `drizzle/0014_<some_slug>.sql` and `drizzle/meta/0014_snapshot.json`. Also expected: `drizzle/meta/_journal.json` updates (it's already dirty in this workspace; that's fine).

- [ ] **Step 3: Inspect the generated SQL**

Open `drizzle/0014_<slug>.sql`. It should contain four `ALTER TABLE "monthly_billing_report" ADD COLUMN` statements and nothing else. The columns should match:

- `"monday_metrics_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL`
- `"manual_metrics_overrides" jsonb DEFAULT '{...all eight keys false...}'::jsonb NOT NULL`
- `"monday_metrics_fetched_at" timestamp with time zone`
- `"monday_metrics_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL`

If Drizzle generated anything else (a rename, a drop, an unrelated change), stop and investigate.

- [ ] **Step 4: Apply the migration**

Run: `pnpm db:migrate`
Expected: success message, no errors.

- [ ] **Step 5: Confirm the migration via Drizzle Studio or psql**

Run: `pnpm db:studio` (then close it) OR if `psql` is configured, run `psql $DATABASE_URL -c "\d monthly_billing_report"` and verify the four new columns appear.

- [ ] **Step 6: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema/billing.ts drizzle/0014_*.sql drizzle/meta/0014_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(db): add Monday metrics snapshot, overrides, fetched-at, warnings columns"
```

---

## Task 5: Implement the Storage Tracking loader

**Files:**
- Create: `src/lib/monday/storage-tracking.ts`

- [ ] **Step 1: Write the loader**

```ts
import "server-only";

import { z } from "zod";

import { env } from "@/env";
import { createMondayClient } from "@/lib/monday/client";
import { getMondayVendorLabel } from "@/lib/monday/vendor-map";

import type {
  BillingAccountSlug,
  BillingManualMetrics,
  BillingMondayMetricsWarning,
} from "@/lib/billing/types";

const COLUMN_IDS = {
  timeline: "timerange_mm38e8gg",
  smallBins: "numeric_mm38jqfe",
  mediumBins: "numeric_mm385gdh",
  largeBins: "numeric_mm38ccar",
  additionalCartons: "numeric_mm388h6h",
  vendor: "color_mm385exr",
} as const;

const PAGE_SIZE = 500;

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  column_values: z.array(
    z.object({
      id: z.string(),
      text: z.string().nullable(),
    }),
  ),
});

type MondayItem = z.infer<typeof itemSchema>;

const firstPageSchema = z.object({
  boards: z.array(
    z.object({
      items_page: z.object({
        cursor: z.string().nullable(),
        items: z.array(itemSchema),
      }),
    }),
  ),
});

const nextPageSchema = z.object({
  next_items_page: z.object({
    cursor: z.string().nullable(),
    items: z.array(itemSchema),
  }),
});

const FIRST_PAGE_QUERY = `
  query GetStorageTracking($boardId: ID!, $columnIds: [String!], $limit: Int!) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
          }
        }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query NextStorageTracking($cursor: String!, $columnIds: [String!], $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items {
        id
        name
        column_values(ids: $columnIds) {
          id
          text
        }
      }
    }
  }
`;

const fetchAllItems = async (boardId: string): Promise<MondayItem[]> => {
  const client = createMondayClient({ apiToken: env.MONDAY_API_TOKEN });
  const columnIds = Object.values(COLUMN_IDS);

  const first = await client.query({
    query: FIRST_PAGE_QUERY,
    variables: { boardId, columnIds, limit: PAGE_SIZE },
    schema: firstPageSchema,
  });

  const board = first.boards[0];
  if (!board) {
    throw new Error(`Monday board "${boardId}" was not found.`);
  }

  const items: MondayItem[] = [...board.items_page.items];
  let cursor = board.items_page.cursor;

  while (cursor) {
    const next = await client.query({
      query: NEXT_PAGE_QUERY,
      variables: { cursor, columnIds, limit: PAGE_SIZE },
      schema: nextPageSchema,
    });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  return items;
};

const parseNumber = (value: string | null): number | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTimelineRange = (
  value: string | null,
): { start: Date; end: Date } | null => {
  if (!value) return null;
  // Monday timeline column text comes back as "YYYY-MM-DD - YYYY-MM-DD".
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];
  if (!startStr || !endStr) return null;
  const start = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return { start, end };
};

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const parseItemNamePeriod = (
  name: string,
): { year: number; month: number } | null => {
  // Tolerant of whitespace and commas: "January 2026", "January, 2026",
  // "  January  2026  ", etc.
  const cleaned = name.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  const match = cleaned.match(/^([a-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const monthName = match[1];
  const yearStr = match[2];
  if (!monthName || !yearStr) return null;
  const monthIndex = MONTH_NAMES.indexOf(monthName);
  if (monthIndex === -1) return null;
  const year = Number(yearStr);
  if (!Number.isFinite(year)) return null;
  return { year, month: monthIndex + 1 };
};

export const loadStorageTrackingForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<{
  snapshot: Partial<
    Pick<
      BillingManualMetrics,
      "smallBinCount" | "mediumBinCount" | "largeBinCount" | "additionalCartonsCount"
    >
  >;
  warnings: BillingMondayMetricsWarning[];
} | null> => {
  const warnings: BillingMondayMetricsWarning[] = [];
  const vendorLabel = getMondayVendorLabel(accountSlug);
  const items = await fetchAllItems(env.MONDAY_STORAGE_TRACKING_BOARD_ID);

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  type Candidate = MondayItem & {
    columns: Map<string, string | null>;
    timeline: { start: Date; end: Date } | null;
    nameParsed: { year: number; month: number } | null;
  };

  const vendorMatches: Candidate[] = items
    .map((item) => {
      const columns = new Map(
        item.column_values.map((c) => [c.id, c.text]),
      );
      return {
        ...item,
        columns,
        timeline: parseTimelineRange(columns.get(COLUMN_IDS.timeline) ?? null),
        nameParsed: parseItemNamePeriod(item.name),
      };
    })
    .filter((item) => item.columns.get(COLUMN_IDS.vendor) === vendorLabel);

  const timelineMatches = vendorMatches.filter((item) => {
    if (!item.timeline) return false;
    // timelineStart < periodEnd AND timelineEnd >= periodStart
    return (
      item.timeline.start < periodEnd && item.timeline.end >= periodStart
    );
  });

  const nameMatches =
    timelineMatches.length === 0
      ? vendorMatches.filter(
          (item) =>
            item.nameParsed?.year === year && item.nameParsed?.month === month,
        )
      : [];

  const matches = timelineMatches.length > 0 ? timelineMatches : nameMatches;

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    const ids = matches.map((m) => `"${m.name}" (id ${m.id})`).join(", ");
    throw new Error(
      `Storage Tracking has duplicate entries for ${vendorLabel} in ${year}-${String(month).padStart(2, "0")}: ${ids}. Remove the duplicate in Monday and try again.`,
    );
  }

  const match = matches[0];
  if (!match) {
    return null;
  }

  if (match.timeline && match.nameParsed) {
    const sameMonth =
      match.nameParsed.year === year && match.nameParsed.month === month;
    if (!sameMonth) {
      warnings.push({
        board: "storage-tracking",
        severity: "warning",
        message: `Storage Tracking item name "${match.name}" parses to ${match.nameParsed.year}-${String(match.nameParsed.month).padStart(2, "0")} but its Timeline overlaps ${year}-${String(month).padStart(2, "0")}. Using Timeline; please update the item name in Monday.`,
      });
    }
  }

  const small = parseNumber(match.columns.get(COLUMN_IDS.smallBins) ?? null);
  const medium = parseNumber(match.columns.get(COLUMN_IDS.mediumBins) ?? null);
  const large = parseNumber(match.columns.get(COLUMN_IDS.largeBins) ?? null);
  const extra = parseNumber(
    match.columns.get(COLUMN_IDS.additionalCartons) ?? null,
  );

  return {
    snapshot: {
      smallBinCount: small,
      mediumBinCount: medium,
      largeBinCount: large,
      additionalCartonsCount: extra,
    },
    warnings,
  };
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Open a Node REPL or temporarily wire a call from a server-only context (e.g., a Next.js Route Handler) and call `loadStorageTrackingForPeriod({ accountSlug: "ryot", year: 2026, month: 1 })`. Expected against the live boards seeded earlier today: a `null` return (RYOT has one item for January 2026, but every numeric column is `null`, so the function returns `{ snapshot: { all-null }, warnings: [] }` — not null. Pre-flight, expect that shape).

- [ ] **Step 4: Commit**

```bash
git add src/lib/monday/storage-tracking.ts
git commit -m "feat(monday): storage tracking loader with Timeline/name period matching"
```

---

## Task 6: Implement the Receiving loader

**Files:**
- Create: `src/lib/monday/receiving.ts`

- [ ] **Step 1: Write the loader**

```ts
import "server-only";

import { z } from "zod";

import { env } from "@/env";
import { createMondayClient } from "@/lib/monday/client";
import { getMondayVendorLabel } from "@/lib/monday/vendor-map";

import type {
  BillingAccountSlug,
  BillingManualMetrics,
  BillingMondayMetricsWarning,
} from "@/lib/billing/types";

const COLUMN_IDS = {
  type: "color_mm38w0b1",
  packagesReceived: "numeric_mm38z1b3",
  date: "date_mm383r6a",
  packageType: "color_mm38haqd",
  vendor: "color_mm38r7t",
} as const;

const PAGE_SIZE = 500;

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  column_values: z.array(
    z.object({
      id: z.string(),
      text: z.string().nullable(),
    }),
  ),
});

type MondayItem = z.infer<typeof itemSchema>;

const firstPageSchema = z.object({
  boards: z.array(
    z.object({
      items_page: z.object({
        cursor: z.string().nullable(),
        items: z.array(itemSchema),
      }),
    }),
  ),
});

const nextPageSchema = z.object({
  next_items_page: z.object({
    cursor: z.string().nullable(),
    items: z.array(itemSchema),
  }),
});

const FIRST_PAGE_QUERY = `
  query GetReceiving($boardId: ID!, $columnIds: [String!], $limit: Int!) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
          }
        }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query NextReceiving($cursor: String!, $columnIds: [String!], $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items {
        id
        name
        column_values(ids: $columnIds) {
          id
          text
        }
      }
    }
  }
`;

const fetchAllItems = async (boardId: string): Promise<MondayItem[]> => {
  const client = createMondayClient({ apiToken: env.MONDAY_API_TOKEN });
  const columnIds = Object.values(COLUMN_IDS);

  const first = await client.query({
    query: FIRST_PAGE_QUERY,
    variables: { boardId, columnIds, limit: PAGE_SIZE },
    schema: firstPageSchema,
  });

  const board = first.boards[0];
  if (!board) {
    throw new Error(`Monday board "${boardId}" was not found.`);
  }

  const items: MondayItem[] = [...board.items_page.items];
  let cursor = board.items_page.cursor;

  while (cursor) {
    const next = await client.query({
      query: NEXT_PAGE_QUERY,
      variables: { cursor, columnIds, limit: PAGE_SIZE },
      schema: nextPageSchema,
    });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  return items;
};

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parsePackages = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const loadReceivingForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<{
  snapshot: Pick<
    BillingManualMetrics,
    "cartonsReceivedTotal" | "palletsReceivedTotal" | "retailReturnsTotal"
  >;
  warnings: BillingMondayMetricsWarning[];
}> => {
  const warnings: BillingMondayMetricsWarning[] = [];
  const vendorLabel = getMondayVendorLabel(accountSlug);
  const items = await fetchAllItems(env.MONDAY_RECEIVING_BOARD_ID);

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  let cartonsReceivedTotal = 0;
  let palletsReceivedTotal = 0;
  let retailReturnsTotal = 0;

  for (const item of items) {
    const columns = new Map(item.column_values.map((c) => [c.id, c.text]));
    if (columns.get(COLUMN_IDS.vendor) !== vendorLabel) continue;

    const date = parseDate(columns.get(COLUMN_IDS.date) ?? null);
    if (!date) continue;
    if (date < periodStart || date >= periodEnd) continue;

    const type = columns.get(COLUMN_IDS.type) ?? null;
    const packageType = columns.get(COLUMN_IDS.packageType) ?? null;
    const packages = parsePackages(columns.get(COLUMN_IDS.packagesReceived) ?? null);

    if (!type) {
      warnings.push({
        board: "receiving",
        severity: "warning",
        message: `Receiving row "${item.name}" (id ${item.id}) has no TYPE — skipped.`,
      });
      continue;
    }

    if (packages === null || packages <= 0) {
      warnings.push({
        board: "receiving",
        severity: "warning",
        message: `Receiving row "${item.name}" (id ${item.id}) has no/zero Packages Received — skipped.`,
      });
      continue;
    }

    if (type === "Retail Return" || type === "B2B Return") {
      retailReturnsTotal += packages;
      continue;
    }

    if (type === "Inbound PO") {
      if (!packageType) {
        warnings.push({
          board: "receiving",
          severity: "warning",
          message: `Receiving row "${item.name}" (id ${item.id}) is an Inbound PO with no Package Type — skipped.`,
        });
        continue;
      }
      if (packageType === "Pallet") {
        palletsReceivedTotal += packages;
      } else if (packageType === "Packages" || packageType === "Carton") {
        cartonsReceivedTotal += packages;
      } else {
        warnings.push({
          board: "receiving",
          severity: "warning",
          message: `Receiving row "${item.name}" (id ${item.id}) has unknown Package Type "${packageType}" — skipped.`,
        });
      }
      continue;
    }

    warnings.push({
      board: "receiving",
      severity: "warning",
      message: `Receiving row "${item.name}" (id ${item.id}) has unknown TYPE "${type}" — skipped.`,
    });
  }

  return {
    snapshot: {
      cartonsReceivedTotal,
      palletsReceivedTotal,
      retailReturnsTotal,
    },
    warnings,
  };
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/monday/receiving.ts
git commit -m "feat(monday): receiving loader aggregating cartons/pallets/returns by TYPE + Package Type"
```

---

## Task 7: Implement the Special Projects loader

**Files:**
- Create: `src/lib/monday/special-projects.ts`

- [ ] **Step 1: Write the loader**

```ts
import "server-only";

import { z } from "zod";

import { env } from "@/env";
import { createMondayClient } from "@/lib/monday/client";
import { getMondayVendorLabel } from "@/lib/monday/vendor-map";

import type {
  BillingAccountSlug,
  BillingManualMetrics,
  BillingMondayMetricsWarning,
} from "@/lib/billing/types";

const COLUMN_IDS = {
  date: "date_mm38ate7",
  duration: "duration_mm38waxr",
  billed: "boolean_mm38eg88",
  vendor: "color_mm385wz6",
} as const;

const PAGE_SIZE = 500;

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  column_values: z.array(
    z.object({
      id: z.string(),
      text: z.string().nullable(),
    }),
  ),
});

type MondayItem = z.infer<typeof itemSchema>;

const firstPageSchema = z.object({
  boards: z.array(
    z.object({
      items_page: z.object({
        cursor: z.string().nullable(),
        items: z.array(itemSchema),
      }),
    }),
  ),
});

const nextPageSchema = z.object({
  next_items_page: z.object({
    cursor: z.string().nullable(),
    items: z.array(itemSchema),
  }),
});

const FIRST_PAGE_QUERY = `
  query GetSpecialProjects($boardId: ID!, $columnIds: [String!], $limit: Int!) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
          }
        }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query NextSpecialProjects($cursor: String!, $columnIds: [String!], $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items {
        id
        name
        column_values(ids: $columnIds) {
          id
          text
        }
      }
    }
  }
`;

const fetchAllItems = async (boardId: string): Promise<MondayItem[]> => {
  const client = createMondayClient({ apiToken: env.MONDAY_API_TOKEN });
  const columnIds = Object.values(COLUMN_IDS);

  const first = await client.query({
    query: FIRST_PAGE_QUERY,
    variables: { boardId, columnIds, limit: PAGE_SIZE },
    schema: firstPageSchema,
  });

  const board = first.boards[0];
  if (!board) {
    throw new Error(`Monday board "${boardId}" was not found.`);
  }

  const items: MondayItem[] = [...board.items_page.items];
  let cursor = board.items_page.cursor;

  while (cursor) {
    const next = await client.query({
      query: NEXT_PAGE_QUERY,
      variables: { cursor, columnIds, limit: PAGE_SIZE },
      schema: nextPageSchema,
    });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  return items;
};

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseDurationHours = (value: string | null): number | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hStr = match[1];
  const mStr = match[2];
  const sStr = match[3];
  if (!hStr || !mStr || !sStr) return null;
  const hours = Number(hStr);
  const minutes = Number(mStr);
  const seconds = Number(sStr);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return null;
  }
  return hours + minutes / 60 + seconds / 3600;
};

const isBilled = (value: string | null): boolean => {
  if (!value) return false;
  // Monday's checkbox column returns "v" (truthy) or empty/null (falsy) in text form.
  const trimmed = value.trim().toLowerCase();
  return trimmed === "v" || trimmed === "true" || trimmed === "checked";
};

export const loadSpecialProjectsForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<{
  snapshot: Pick<BillingManualMetrics, "specialProjectHours">;
  warnings: BillingMondayMetricsWarning[];
}> => {
  const warnings: BillingMondayMetricsWarning[] = [];
  const vendorLabel = getMondayVendorLabel(accountSlug);
  const items = await fetchAllItems(env.MONDAY_SPECIAL_PROJECTS_BOARD_ID);

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  let totalHours = 0;

  for (const item of items) {
    const columns = new Map(item.column_values.map((c) => [c.id, c.text]));
    if (columns.get(COLUMN_IDS.vendor) !== vendorLabel) continue;

    if (isBilled(columns.get(COLUMN_IDS.billed) ?? null)) continue;

    const date = parseDate(columns.get(COLUMN_IDS.date) ?? null);
    if (!date) continue;
    if (date < periodStart || date >= periodEnd) continue;

    const hours = parseDurationHours(columns.get(COLUMN_IDS.duration) ?? null);
    if (hours === null) {
      warnings.push({
        board: "special-projects",
        severity: "warning",
        message: `Special Projects row "${item.name}" (id ${item.id}) has unparseable Time Tracking — skipped.`,
      });
      continue;
    }

    totalHours += hours;
  }

  return {
    snapshot: { specialProjectHours: Math.round(totalHours * 100) / 100 },
    warnings,
  };
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/monday/special-projects.ts
git commit -m "feat(monday): special projects loader summing unbilled Time Tracking hours"
```

---

## Task 8: Implement the orchestrator

**Files:**
- Create: `src/lib/billing/monday-metrics.ts`

- [ ] **Step 1: Write the orchestrator**

```ts
import "server-only";

import { loadReceivingForPeriod } from "@/lib/monday/receiving";
import { loadSpecialProjectsForPeriod } from "@/lib/monday/special-projects";
import { loadStorageTrackingForPeriod } from "@/lib/monday/storage-tracking";

import type {
  BillingAccountSlug,
  BillingManualMetrics,
  BillingManualMetricsOverrides,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
} from "./types";
import { ALL_METRIC_KEYS } from "./types";

export type MondayMetricsPullResult = {
  snapshot: BillingMondayMetricsSnapshot;
  warnings: BillingMondayMetricsWarning[];
  fetchedAt: Date;
};

export const pullMondayMetricsForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<MondayMetricsPullResult> => {
  const [storage, receiving, projects] = await Promise.all([
    loadStorageTrackingForPeriod({ accountSlug, year, month }),
    loadReceivingForPeriod({ accountSlug, year, month }),
    loadSpecialProjectsForPeriod({ accountSlug, year, month }),
  ]);

  const snapshot: BillingMondayMetricsSnapshot = {
    ...(storage?.snapshot ?? {}),
    ...receiving.snapshot,
    ...projects.snapshot,
  };

  const warnings: BillingMondayMetricsWarning[] = [
    ...(storage?.warnings ?? []),
    ...receiving.warnings,
    ...projects.warnings,
  ];

  return { snapshot, warnings, fetchedAt: new Date() };
};

/**
 * Compute new effective metric values + override flags by overlaying a
 * Monday snapshot on top of the report's current state. Per-field rule:
 *   - if overrides[key] is true, the effective value is preserved.
 *   - if overrides[key] is false and snapshot[key] is a number,
 *     the effective value is replaced with snapshot[key].
 *   - if overrides[key] is false and snapshot[key] is null/absent,
 *     the effective value is preserved.
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
 * Override-flag rule applied at save time: for each metric, the override
 * flag is true iff the saved value does not equal the current Monday
 * snapshot for that key (after numeric coercion). If snapshot[key] is
 * null/absent, override is true whenever the saved value is anything
 * other than... well, there's nothing to align to, so any saved value
 * is considered "manual".
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

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/monday-metrics.ts
git commit -m "feat(billing): orchestrator for Monday metrics pull + snapshot apply logic"
```

---

## Task 9: Extend `getMonthlyBillingReport` to return new fields

**Files:**
- Modify: `src/lib/billing/reports.ts`

- [ ] **Step 1: Add the new fields to the detail-row select**

In `src/lib/billing/reports.ts`, find the big `db.select({ ... })` inside `getMonthlyBillingReport`. Add four entries alongside the existing ones (after `specialProjectHours` and before `generatedAt`):

```ts
mondayMetricsSnapshot: monthlyBillingReport.mondayMetricsSnapshot,
manualMetricsOverrides: monthlyBillingReport.manualMetricsOverrides,
mondayMetricsFetchedAt: monthlyBillingReport.mondayMetricsFetchedAt,
mondayMetricsWarnings: monthlyBillingReport.mondayMetricsWarnings,
```

- [ ] **Step 2: Update the `MonthlyBillingReportDetail` shape**

In the same file, extend the `MonthlyBillingReportDetail.report` type:

```ts
manualMetrics: BillingManualMetrics;
mondayMetricsSnapshot: BillingMondayMetricsSnapshot;
manualMetricsOverrides: BillingManualMetricsOverrides;
mondayMetricsFetchedAt: Date | null;
mondayMetricsWarnings: BillingMondayMetricsWarning[];
```

Import the new types at the top of the file from `./types`:

```ts
import type {
  BillingManualMetrics,
  BillingManualMetricsOverrides,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
  BillingPackageMatch,
  BillingReportStatus,
  BillingShipmentMatchStatus,
} from "./types";
import { EMPTY_OVERRIDES } from "./types";
```

- [ ] **Step 3: Thread the values through the return at the bottom of `getMonthlyBillingReport`**

Find the final `return { report: { ...reportRest, ... }, shipments }` and add:

```ts
return {
  report: {
    ...reportRest,
    status: reportRow.status as BillingReportStatus,
    unitsPickedTotal,
    packagingCostTotal: moneyToNumber(reportRow.packagingCostTotal),
    manualMetrics,
    mondayMetricsSnapshot:
      (reportRow.mondayMetricsSnapshot as BillingMondayMetricsSnapshot) ?? {},
    manualMetricsOverrides:
      (reportRow.manualMetricsOverrides as BillingManualMetricsOverrides) ??
      EMPTY_OVERRIDES,
    mondayMetricsFetchedAt: reportRow.mondayMetricsFetchedAt ?? null,
    mondayMetricsWarnings:
      (reportRow.mondayMetricsWarnings as BillingMondayMetricsWarning[]) ?? [],
    orderChannelSummary,
    previousZohoInvoiceIds: reportRow.previousZohoInvoiceIds ?? [],
    lastRevertedByName: reverterName ?? null,
  },
  shipments,
};
```

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/reports.ts
git commit -m "feat(billing): expose Monday snapshot, overrides, fetched-at, warnings on report detail"
```

---

## Task 10: Extend `generateMonthlyBillingReport` to pull Monday

**Files:**
- Modify: `src/lib/billing/reports.ts`

- [ ] **Step 1: Import the new helpers**

At the top of `src/lib/billing/reports.ts`, add:

```ts
import {
  applySnapshotToMetrics,
  pullMondayMetricsForPeriod,
} from "./monday-metrics";
import type { BillingAccountSlug } from "./types";
```

- [ ] **Step 2: Define a result type that carries the Monday outcome**

Just above the existing `generateMonthlyBillingReport` declaration, add:

```ts
export type GenerateMonthlyBillingReportResult = {
  detail: MonthlyBillingReportDetail;
  mondayPull:
    | { ok: true; warningsCount: number; fetchedAt: Date }
    | { ok: false; error: string };
};
```

- [ ] **Step 3: Change `generateMonthlyBillingReport` to return that shape**

Replace the existing function's signature and final return to use the new shape. Wrap the existing function body up through the final `await db.update(...)` unchanged. Then add a Monday-pull pass below the existing ShipStation update:

```ts
export const generateMonthlyBillingReport = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: string;
  year: number;
  month: number;
}): Promise<GenerateMonthlyBillingReportResult> => {
  // ...existing body up to the existing
  // `await db.update(monthlyBillingReport).set({ status: "draft", ... })`
  // remains unchanged.

  // After the existing update completes, pull Monday and apply.
  let mondayPull: GenerateMonthlyBillingReportResult["mondayPull"];

  try {
    const pull = await pullMondayMetricsForPeriod({
      accountSlug: account.slug as BillingAccountSlug,
      year,
      month,
    });

    const [existingMetricsRow] = await db
      .select({
        smallBinCount: monthlyBillingReport.smallBinCount,
        mediumBinCount: monthlyBillingReport.mediumBinCount,
        largeBinCount: monthlyBillingReport.largeBinCount,
        additionalCartonsCount: monthlyBillingReport.additionalCartonsCount,
        cartonsReceivedTotal: monthlyBillingReport.cartonsReceivedTotal,
        palletsReceivedTotal: monthlyBillingReport.palletsReceivedTotal,
        retailReturnsTotal: monthlyBillingReport.retailReturnsTotal,
        specialProjectHours: monthlyBillingReport.specialProjectHours,
        manualMetricsOverrides: monthlyBillingReport.manualMetricsOverrides,
      })
      .from(monthlyBillingReport)
      .where(eq(monthlyBillingReport.id, reportId))
      .limit(1);

    if (!existingMetricsRow) {
      throw new Error("Report row vanished mid-generation.");
    }

    const currentMetrics = getManualMetricsFromRow(existingMetricsRow);
    const currentOverrides =
      (existingMetricsRow.manualMetricsOverrides as BillingManualMetricsOverrides) ??
      EMPTY_OVERRIDES;

    const { nextMetrics } = applySnapshotToMetrics({
      currentMetrics,
      currentOverrides,
      snapshot: pull.snapshot,
    });

    await db
      .update(monthlyBillingReport)
      .set({
        smallBinCount: nextMetrics.smallBinCount,
        mediumBinCount: nextMetrics.mediumBinCount,
        largeBinCount: nextMetrics.largeBinCount,
        additionalCartonsCount: nextMetrics.additionalCartonsCount,
        cartonsReceivedTotal: nextMetrics.cartonsReceivedTotal,
        palletsReceivedTotal: nextMetrics.palletsReceivedTotal,
        retailReturnsTotal: nextMetrics.retailReturnsTotal,
        specialProjectHours: moneyToStorage(nextMetrics.specialProjectHours),
        mondayMetricsSnapshot: pull.snapshot,
        mondayMetricsFetchedAt: pull.fetchedAt,
        mondayMetricsWarnings: pull.warnings,
      })
      .where(eq(monthlyBillingReport.id, reportId));

    mondayPull = {
      ok: true,
      warningsCount: pull.warnings.length,
      fetchedAt: pull.fetchedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Monday pull failed.";
    console.error("generateMonthlyBillingReport: Monday pull failed", {
      reportId,
      accountSlug: account.slug,
      year,
      month,
      message,
    });
    mondayPull = { ok: false, error: message };
  }

  return {
    detail: await getMonthlyBillingReport({ reportId }),
    mondayPull,
  };
};
```

Important: the ShipStation half stays committed regardless of whether Monday succeeds. On Monday failure, the existing snapshot/fetched-at/warnings columns are not touched.

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/reports.ts
git commit -m "feat(billing): pull Monday metrics during report generation"
```

---

## Task 11: Add `refreshMondayMetricsForReport`

**Files:**
- Modify: `src/lib/billing/reports.ts`

- [ ] **Step 1: Add the function**

In `src/lib/billing/reports.ts`, add after `updateMonthlyBillingReportManualMetrics`:

```ts
export const refreshMondayMetricsForReport = async ({
  reportId,
}: {
  reportId: string;
}): Promise<{
  detail: MonthlyBillingReportDetail;
  warningsCount: number;
  fetchedAt: Date;
}> => {
  const [row] = await db
    .select({
      id: monthlyBillingReport.id,
      status: monthlyBillingReport.status,
      periodStart: monthlyBillingReport.periodStart,
      smallBinCount: monthlyBillingReport.smallBinCount,
      mediumBinCount: monthlyBillingReport.mediumBinCount,
      largeBinCount: monthlyBillingReport.largeBinCount,
      additionalCartonsCount: monthlyBillingReport.additionalCartonsCount,
      cartonsReceivedTotal: monthlyBillingReport.cartonsReceivedTotal,
      palletsReceivedTotal: monthlyBillingReport.palletsReceivedTotal,
      retailReturnsTotal: monthlyBillingReport.retailReturnsTotal,
      specialProjectHours: monthlyBillingReport.specialProjectHours,
      manualMetricsOverrides: monthlyBillingReport.manualMetricsOverrides,
      accountSlug: shipstationAccount.slug,
    })
    .from(monthlyBillingReport)
    .innerJoin(
      shipstationAccount,
      eq(monthlyBillingReport.accountId, shipstationAccount.id),
    )
    .where(eq(monthlyBillingReport.id, reportId))
    .limit(1);

  if (!row) {
    throw new Error("Monthly billing report not found.");
  }

  if (row.status === "finalized") {
    throw new Error("Finalized reports cannot refresh Monday metrics.");
  }

  const year = row.periodStart.getUTCFullYear();
  const month = row.periodStart.getUTCMonth() + 1;

  const pull = await pullMondayMetricsForPeriod({
    accountSlug: row.accountSlug as BillingAccountSlug,
    year,
    month,
  });

  const currentMetrics = getManualMetricsFromRow(row);
  const currentOverrides =
    (row.manualMetricsOverrides as BillingManualMetricsOverrides) ??
    EMPTY_OVERRIDES;

  const { nextMetrics } = applySnapshotToMetrics({
    currentMetrics,
    currentOverrides,
    snapshot: pull.snapshot,
  });

  await db
    .update(monthlyBillingReport)
    .set({
      smallBinCount: nextMetrics.smallBinCount,
      mediumBinCount: nextMetrics.mediumBinCount,
      largeBinCount: nextMetrics.largeBinCount,
      additionalCartonsCount: nextMetrics.additionalCartonsCount,
      cartonsReceivedTotal: nextMetrics.cartonsReceivedTotal,
      palletsReceivedTotal: nextMetrics.palletsReceivedTotal,
      retailReturnsTotal: nextMetrics.retailReturnsTotal,
      specialProjectHours: moneyToStorage(nextMetrics.specialProjectHours),
      mondayMetricsSnapshot: pull.snapshot,
      mondayMetricsFetchedAt: pull.fetchedAt,
      mondayMetricsWarnings: pull.warnings,
    })
    .where(eq(monthlyBillingReport.id, reportId));

  return {
    detail: await getMonthlyBillingReport({ reportId }),
    warningsCount: pull.warnings.length,
    fetchedAt: pull.fetchedAt,
  };
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/reports.ts
git commit -m "feat(billing): refreshMondayMetricsForReport for on-demand re-pull on draft reports"
```

---

## Task 12: Override-tracking in `updateMonthlyBillingReportManualMetrics`

**Files:**
- Modify: `src/lib/billing/reports.ts`

- [ ] **Step 1: Replace the existing function body to compute overrides**

In `src/lib/billing/reports.ts`, find `updateMonthlyBillingReportManualMetrics`. Add an import at the top of the file (if not already present from Task 8):

```ts
import { computeOverridesAgainstSnapshot } from "./monday-metrics";
```

Replace the function body so it reads the current snapshot before writing:

```ts
export const updateMonthlyBillingReportManualMetrics = async ({
  reportId,
  manualMetrics,
}: {
  reportId: string;
  manualMetrics: BillingManualMetrics;
}) => {
  const [reportRow] = await db
    .select({
      id: monthlyBillingReport.id,
      status: monthlyBillingReport.status,
      mondayMetricsSnapshot: monthlyBillingReport.mondayMetricsSnapshot,
    })
    .from(monthlyBillingReport)
    .where(eq(monthlyBillingReport.id, reportId))
    .limit(1);

  if (!reportRow) {
    throw new Error("Monthly billing report not found.");
  }

  if (reportRow.status === "finalized") {
    throw new Error("Finalized reports cannot be edited.");
  }

  const snapshot =
    (reportRow.mondayMetricsSnapshot as BillingMondayMetricsSnapshot) ?? {};

  const nextOverrides = computeOverridesAgainstSnapshot({
    submittedMetrics: manualMetrics,
    snapshot,
  });

  await db
    .update(monthlyBillingReport)
    .set({
      smallBinCount: manualMetrics.smallBinCount,
      mediumBinCount: manualMetrics.mediumBinCount,
      largeBinCount: manualMetrics.largeBinCount,
      additionalCartonsCount: manualMetrics.additionalCartonsCount,
      cartonsReceivedTotal: manualMetrics.cartonsReceivedTotal,
      palletsReceivedTotal: manualMetrics.palletsReceivedTotal,
      retailReturnsTotal: manualMetrics.retailReturnsTotal,
      specialProjectHours: moneyToStorage(manualMetrics.specialProjectHours),
      manualMetricsOverrides: nextOverrides,
    })
    .where(eq(monthlyBillingReport.id, reportId));

  return getMonthlyBillingReport({ reportId });
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/reports.ts
git commit -m "feat(billing): track per-field overrides when saving manual metrics"
```

---

## Task 13: Add server action for `refreshMondayMetricsAction` and update generate action

**Files:**
- Modify: `src/lib/billing/actions.ts`

- [ ] **Step 1: Update the generate-action to consume the new result shape and surface Monday status**

In `src/lib/billing/actions.ts`, replace `generateMonthlyBillingReportAction`:

```ts
export const generateMonthlyBillingReportAction = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: string;
  year: number;
  month: number;
}): Promise<MonthlyBillingActionResult> => {
  await requireAdmin();

  try {
    const { detail, mondayPull } = await generateMonthlyBillingReport({
      accountSlug,
      year,
      month,
    });

    revalidateBillingPages();

    if (mondayPull.ok) {
      const warningsNote =
        mondayPull.warningsCount > 0
          ? ` ${mondayPull.warningsCount} Monday warning${mondayPull.warningsCount === 1 ? "" : "s"} — review the report.`
          : "";
      return {
        ok: true,
        message: `Draft report generated for ${detail.report.account.displayName}. Pulled metrics from Monday.${warningsNote}`,
        reportId: detail.report.id,
      };
    }

    return {
      ok: false,
      message: `Draft created from ShipStation for ${detail.report.account.displayName}, but Monday is unreachable: ${mondayPull.error}. Open the report to enter metrics manually, or click Refresh from Monday once the connection is restored.`,
      reportId: detail.report.id,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to generate the monthly billing report.",
    };
  }
};
```

- [ ] **Step 2: Add the refresh action**

Below `generateMonthlyBillingReportAction`, add:

```ts
export type RefreshMondayMetricsActionResult =
  | {
      ok: true;
      message: string;
      reportId: string;
      warningsCount: number;
    }
  | { ok: false; message: string };

export const refreshMondayMetricsAction = async ({
  reportId,
}: {
  reportId: string;
}): Promise<RefreshMondayMetricsActionResult> => {
  await requireAdmin();

  try {
    const { detail, warningsCount, fetchedAt } =
      await refreshMondayMetricsForReport({ reportId });

    revalidateBillingPages();

    const warningsNote =
      warningsCount > 0
        ? ` ${warningsCount} warning${warningsCount === 1 ? "" : "s"} — review the report.`
        : "";

    return {
      ok: true,
      message: `Refreshed Monday metrics for ${detail.report.account.displayName} at ${fetchedAt.toLocaleTimeString()}.${warningsNote}`,
      reportId: detail.report.id,
      warningsCount,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to refresh Monday metrics.",
    };
  }
};
```

- [ ] **Step 3: Import `refreshMondayMetricsForReport` at the top**

Add to the existing import block:

```ts
import {
  finalizeMonthlyBillingReport,
  generateMonthlyBillingReport,
  getMonthlyBillingReport,
  refreshMondayMetricsForReport,
  revertMonthlyBillingReport,
  updateMonthlyBillingReportManualMetrics,
} from "./reports";
```

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/actions.ts
git commit -m "feat(billing): refreshMondayMetricsAction + generate action surfaces Monday status"
```

---

## Task 14: Extend metrics-form action state with overrides

**Files:**
- Modify: `src/lib/billing/action-state.ts`

- [ ] **Step 1: Add overrides to the action state**

Replace `src/lib/billing/action-state.ts`:

```ts
import type {
  BillingManualMetrics,
  BillingManualMetricsOverrides,
} from "./types";
import { EMPTY_OVERRIDES } from "./types";

export type MonthlyBillingMetricsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  manualMetrics?: BillingManualMetrics;
  manualMetricsOverrides?: BillingManualMetricsOverrides;
};

export const INITIAL_MONTHLY_BILLING_METRICS_ACTION_STATE: MonthlyBillingMetricsActionState =
  {
    status: "idle",
  };

export { EMPTY_OVERRIDES };
```

- [ ] **Step 2: Update `saveMonthlyBillingReportManualMetricsAction`**

In `src/lib/billing/actions.ts`, find `saveMonthlyBillingReportManualMetricsAction`. After the existing successful update, include the new overrides in the returned state:

```ts
return {
  status: "success",
  message: `Saved month-end metrics for ${report.report.account.displayName}.`,
  manualMetrics: report.report.manualMetrics,
  manualMetricsOverrides: report.report.manualMetricsOverrides,
};
```

And in the error branch where you previously returned `manualMetrics: previousState.manualMetrics ?? manualMetrics`, also pass through `manualMetricsOverrides: previousState.manualMetricsOverrides`. Apply the same change in the "missing report id" early return.

- [ ] **Step 3: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/action-state.ts src/lib/billing/actions.ts
git commit -m "feat(billing): expose overrides in metrics-form action state"
```

---

## Task 15: Thread new props from the report page into the form

**Files:**
- Modify: `src/app/admin/reports/monthly/page.tsx`

- [ ] **Step 1: Pass the new fields**

In `src/app/admin/reports/monthly/page.tsx`, find the `<MonthlyReportMetricsForm ... />` JSX (around line 374). Replace it with:

```tsx
<MonthlyReportMetricsForm
  reportId={currentReport.report.id}
  reportStatus={currentReport.report.status}
  manualMetrics={currentReport.report.manualMetrics}
  mondayMetricsSnapshot={currentReport.report.mondayMetricsSnapshot}
  manualMetricsOverrides={currentReport.report.manualMetricsOverrides}
  mondayMetricsFetchedAt={currentReport.report.mondayMetricsFetchedAt}
  mondayMetricsWarnings={currentReport.report.mondayMetricsWarnings}
/>
```

The Task 17 form-component update adds these props to its TypeScript surface; until that runs, this file will produce a type error. That's expected and fixed in Task 17.

- [ ] **Step 2: Defer commit**

Leave this change uncommitted. It will commit together with Task 17 once the form props match.

---

## Task 16: Build the refresh button + last-refreshed timestamp UI

**Files:**
- Modify: `src/components/admin/monthly-report-metrics-form.tsx`

- [ ] **Step 1: Update component props**

Replace the `MonthlyReportMetricsFormProps` type at the top of `src/components/admin/monthly-report-metrics-form.tsx`:

```ts
import type {
  BillingManualMetrics,
  BillingManualMetricsOverrides,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
  BillingReportStatus,
} from "@/lib/billing/types";

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

- [ ] **Step 2: Accept the new props in the component**

Update the function signature:

```ts
export const MonthlyReportMetricsForm = ({
  reportId,
  reportStatus,
  manualMetrics,
  mondayMetricsSnapshot,
  manualMetricsOverrides,
  mondayMetricsFetchedAt,
  mondayMetricsWarnings,
}: MonthlyReportMetricsFormProps) => {
```

- [ ] **Step 3: Add imports for refresh state**

At the top of the file, update the React imports to include `useTransition` and add an import for the new action. The full top-of-file imports should look like:

```ts
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

// ...existing UI imports unchanged...
import {
  refreshMondayMetricsAction,
  saveMonthlyBillingReportManualMetricsAction,
} from "@/lib/billing/actions";
```

- [ ] **Step 4: Add refresh-action client state inside the component**

After the existing `useActionState` line in the component body, add:

```ts
const [isRefreshing, startRefreshTransition] = useTransition();
const [refreshResult, setRefreshResult] = useState<
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
>({ kind: "idle" });

const handleRefresh = () => {
  startRefreshTransition(async () => {
    const result = await refreshMondayMetricsAction({ reportId });
    if (result.ok) {
      setRefreshResult({ kind: "success", message: result.message });
    } else {
      setRefreshResult({ kind: "error", message: result.message });
    }
  });
};
```

- [ ] **Step 5: Add the refresh button to the header**

Inside `<CardHeader>`, find the existing `<Button>` group with `Edit` / `Save` / `Cancel`. Add the refresh button next to `Edit` (visible on drafts, hidden during edit mode):

```tsx
{!isFinalized && !isEditing ? (
  <Button
    type="button"
    variant="outline"
    onClick={handleRefresh}
    disabled={isRefreshing}
    className="h-9 px-4 text-sm"
  >
    {isRefreshing ? "Refreshing…" : "Refresh from Monday"}
  </Button>
) : null}
```

- [ ] **Step 6: Add the last-refreshed timestamp**

In `<CardHeader>`, just under the existing `<CardDescription>`, add:

```tsx
<p className="text-xs text-muted-foreground">
  {mondayMetricsFetchedAt
    ? `Last refreshed from Monday: ${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(mondayMetricsFetchedAt)}`
    : "Not yet refreshed from Monday."}
</p>
```

- [ ] **Step 7: Surface the refresh result above the form**

Inside `<CardContent>`, just above the existing `<form>`, render:

```tsx
{refreshResult.kind === "success" ? (
  <Alert className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
    <AlertDescription>{refreshResult.message}</AlertDescription>
  </Alert>
) : null}
{refreshResult.kind === "error" ? (
  <Alert variant="destructive">
    <AlertDescription>{refreshResult.message}</AlertDescription>
  </Alert>
) : null}
```

- [ ] **Step 8: Build to confirm types align**

Run: `pnpm build`
Expected: success. (Page page.tsx changes from Task 15 should now compile.)

- [ ] **Step 9: Manual smoke test**

Run: `pnpm dev`. Navigate to `/admin/reports/monthly`, select a draft report. Verify:
- "Refresh from Monday" button shows
- Clicking it shows the spinner, then success or error alert
- Timestamp updates after success

- [ ] **Step 10: Commit (combined with Task 15)**

```bash
git add src/app/admin/reports/monthly/page.tsx src/components/admin/monthly-report-metrics-form.tsx
git commit -m "feat(admin): refresh-from-Monday button and last-refreshed timestamp on metrics form"
```

---

## Task 17: Per-field source badges + warnings panel

**Files:**
- Modify: `src/components/admin/monthly-report-metrics-form.tsx`

- [ ] **Step 1: Add a badge helper**

Inside the file (above the component definition):

```ts
type FieldBadgeKind = "monday" | "overridden" | null;

const computeFieldBadge = ({
  isEditing,
  override,
  snapshotValue,
}: {
  isEditing: boolean;
  override: boolean;
  snapshotValue: number | null | undefined;
}): FieldBadgeKind => {
  if (isEditing) return null;
  if (override) return "overridden";
  if (typeof snapshotValue === "number" && Number.isFinite(snapshotValue)) {
    return "monday";
  }
  return null;
};

const renderFieldBadge = ({
  kind,
  snapshotValue,
  effectiveValue,
}: {
  kind: FieldBadgeKind;
  snapshotValue: number | null | undefined;
  effectiveValue: number;
}) => {
  if (kind === null) return null;
  if (kind === "monday") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Monday
      </span>
    );
  }
  const tooltip =
    typeof snapshotValue === "number" && Number.isFinite(snapshotValue)
      ? `Monday currently shows: ${snapshotValue}. You've overridden to ${effectiveValue}.`
      : "No data in Monday for this field; using manual value.";
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

- [ ] **Step 2: Render the badge in both field layouts**

In the `metric.fields.map(...)` loop, for the split layout (the one with `metric.abbreviation`), find this existing wrapper around the value cell (current line ~386):

```tsx
<div className="flex items-center justify-center px-3 py-4">
```

Change it to `relative`, and inject a positioned badge child as the FIRST element inside it. The existing inner content (the `isEditing ? <InputGroup>...</InputGroup> : <p className="...">{metric.format(currentMetrics[metric.key])}</p>` block) stays exactly as-is below the badge. After the edit, the wrapper opens like this:

```tsx
<div className="relative flex items-center justify-center px-3 py-4">
  <div className="absolute right-2 top-1">
    {renderFieldBadge({
      kind: computeFieldBadge({
        isEditing,
        override: manualMetricsOverrides[metric.key],
        snapshotValue: mondayMetricsSnapshot[metric.key],
      }),
      snapshotValue: mondayMetricsSnapshot[metric.key],
      effectiveValue: currentMetrics[metric.key],
    })}
  </div>
  {/* existing isEditing ? <InputGroup>...</InputGroup> : <p>...</p> block, unmodified */}
</div>
```

For the default (non-split) layout, find the existing `<FieldTitle>{metric.label}</FieldTitle>` line and replace it with a flex wrapper that holds the title plus the badge:

```tsx
<div className="flex items-center justify-between gap-2">
  <FieldTitle>{metric.label}</FieldTitle>
  {renderFieldBadge({
    kind: computeFieldBadge({
      isEditing,
      override: manualMetricsOverrides[metric.key],
      snapshotValue: mondayMetricsSnapshot[metric.key],
    }),
    snapshotValue: mondayMetricsSnapshot[metric.key],
    effectiveValue: currentMetrics[metric.key],
  })}
</div>
```

- [ ] **Step 3: Add the warnings panel above the FieldGroup**

Inside the `<form>` and just above `<FieldGroup>`, render:

```tsx
{mondayMetricsWarnings.length > 0 ? (
  <div className="flex flex-col gap-2">
    {mondayMetricsWarnings
      .slice()
      .sort((a, b) => {
        // connection errors first, then errors, then warnings
        const rank = (w: BillingMondayMetricsWarning) =>
          w.board === "connection" ? 0 : w.severity === "error" ? 1 : 2;
        return rank(a) - rank(b);
      })
      .map((warning, index) => (
        <Alert
          key={`${warning.board}-${index}`}
          variant={warning.severity === "error" ? "destructive" : "default"}
          className={
            warning.severity === "warning"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : undefined
          }
        >
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
  </div>
) : null}
```

Import `BillingMondayMetricsWarning` at the top if not already imported.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev`. Open a draft report. To exercise the badges, temporarily set a value on the Monday Storage Tracking row for the test month + vendor, then click "Refresh from Monday". Verify:
- Fields with Monday-supplied numbers show the "Monday" badge
- Editing a field to a different value and saving shows the "Overridden" badge with the expected tooltip
- Editing the same field back to the Monday value and saving clears the badge
- If a warning was raised during the pull (e.g., a Receiving row with no Package Type), the warnings panel renders it

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/monthly-report-metrics-form.tsx
git commit -m "feat(admin): per-field source badges and warnings panel on metrics form"
```

---

## Task 18: Inline edit-time hint when a typed value matches Monday

**Files:**
- Modify: `src/components/admin/monthly-report-metrics-form.tsx`

- [ ] **Step 1: Add the hint helper above the component**

```ts
const computeEditHint = ({
  draftValue,
  override,
  snapshotValue,
}: {
  draftValue: string;
  override: boolean;
  snapshotValue: number | null | undefined;
}): string | null => {
  if (!override) return null;
  if (typeof snapshotValue !== "number" || !Number.isFinite(snapshotValue)) {
    return null;
  }
  const parsed = Number(draftValue);
  if (!Number.isFinite(parsed)) return null;
  if (parsed !== snapshotValue) return null;
  return "Matches Monday — override will clear.";
};
```

- [ ] **Step 2: Render the hint in both layouts during editing**

In the split layout (where `isEditing` is true), beneath the `<InputGroup>` block, add:

```tsx
{isEditing
  ? (() => {
      const hint = computeEditHint({
        draftValue: draftValues[metric.key],
        override: manualMetricsOverrides[metric.key],
        snapshotValue: mondayMetricsSnapshot[metric.key],
      });
      return hint ? (
        <p className="px-3 pb-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null;
    })()
  : null}
```

In the default layout, render the same hint block right after the closing `</InputGroup>` and before `<FieldDescription>`:

```tsx
{isEditing
  ? (() => {
      const hint = computeEditHint({
        draftValue: draftValues[metric.key],
        override: manualMetricsOverrides[metric.key],
        snapshotValue: mondayMetricsSnapshot[metric.key],
      });
      return hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null;
    })()
  : null}
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: success.

- [ ] **Step 4: Manual smoke test**

`pnpm dev`. With a Monday-sourced value (snapshot = 5, override = true, effective = 8) on a draft report:
- Click Edit
- Change the value back to 5
- Verify the hint "Matches Monday — override will clear." appears
- Verify clicking Save clears the "Overridden" badge

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/monthly-report-metrics-form.tsx
git commit -m "feat(admin): inline hint when an overridden field re-aligns with Monday"
```

---

## Task 19: Add `refresh_monday_metrics` tool to the billing AI agent

**Files:**
- Modify: `src/app/api/admin/billing/agent/route.ts`

- [ ] **Step 1: Import the new action**

At the top of `src/app/api/admin/billing/agent/route.ts`, add to the import block:

```ts
import {
  createZohoInvoiceAction,
  refreshMondayMetricsAction,
  revertMonthlyBillingReportAction,
} from "@/lib/billing/actions";
```

- [ ] **Step 2: Add the tool inside `buildAgent`'s `tools` map**

Add after `revertMonthlyBillingReport` and before `listRecentInvoices`:

```ts
refreshMondayMetrics: tool({
  description:
    "Pull the latest storage bin counts, receiving counts, and special project hours from Monday.com for the current draft report. Applies values only to fields the operator has not manually overridden. No-op on finalized reports.",
  inputSchema: z.object({}),
  execute: async () => {
    const result = await refreshMondayMetricsAction({ reportId });
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return {
      ok: true,
      message: result.message,
      warningsCount: result.warningsCount,
    };
  },
}),
```

- [ ] **Step 3: Add a sentence to the system prompt**

In `buildSystemPrompt`, append to the `Rules:` list (just before the blank line that precedes `Revert protocol:`):

```ts
"- You can refresh the Monday-sourced metrics for a draft report by calling refreshMondayMetrics. This pulls the latest values from Monday and applies them to any field the operator has not manually overridden. Do not call it on finalized reports.",
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Manual smoke test**

`pnpm dev`. Open the billing agent panel on a draft report. Ask "refresh metrics from Monday" and verify the agent calls the tool and reports back. Then ask the same on a finalized report and verify the agent refuses or surfaces the error.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/billing/agent/route.ts
git commit -m "feat(ai): expose refresh_monday_metrics tool on billing agent"
```

---

## Task 20: End-to-end smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Lint and full build**

Run: `pnpm lint && pnpm build`
Expected: both succeed with no errors.

- [ ] **Step 2: Full UAT against the live Monday boards**

`pnpm dev`. Walk through these scenarios on a non-finalized test month (e.g., a fresh report for a vendor with no historical data):

1. **Fresh generate, Monday has data:** Generate a new draft for a month where Storage Tracking has a row, Receiving has shipments, and Special Projects has unbilled entries. Verify all eight metric fields populate from Monday and show the "Monday" badge.
2. **Fresh generate, Monday has no Storage row:** Generate for a vendor + month where Storage Tracking is empty. Verify the four storage fields are blank (or `0` if that's their default) and show no badge; receiving and project fields still populate.
3. **Refresh from Monday:** Update a value on the Storage Tracking board, click "Refresh from Monday" on the report. Verify the badge stays "Monday" and the effective value updates.
4. **Manual override:** Click Edit, change a Monday-sourced field's value, click Save. Verify the badge becomes "Overridden" with the right tooltip.
5. **Refresh after override:** With an overridden field, click "Refresh from Monday". Verify the overridden field is *not* changed but the snapshot updates (the tooltip on "Overridden" should reflect the new Monday value).
6. **Clearing an override:** Click Edit on an overridden field, type the current Monday value, verify the edit-time hint appears, click Save. Verify the badge returns to "Monday".
7. **Receiving aggregation:** Verify cartonsReceivedTotal = sum of Packages Received for rows with `TYPE = Inbound PO` AND `Package Type ∈ {Packages, Carton}`. palletsReceivedTotal = same with `Pallet`. retailReturnsTotal = sum across `Retail Return` + `B2B Return`.
8. **Special Projects "Billed" filter:** Check the Billed checkbox on a Special Projects row in Monday. Refresh. Verify its hours are no longer included.
9. **Storage Tracking duplicate:** Briefly create a duplicate Storage Tracking row for the same vendor + month in Monday. Click Refresh. Verify the red error alert appears with the duplicate names; the previous snapshot is preserved. Remove the duplicate.
10. **Monday outage simulation:** Temporarily set `MONDAY_API_TOKEN=invalid` in `.env.local`, restart dev. Click "Refresh from Monday". Verify the red error banner explains the failure; the previous snapshot is preserved.
11. **Finalized report:** Finalize a report. Verify the "Refresh from Monday" button is no longer visible. Try calling `refreshMondayMetricsAction` directly (e.g., via the AI agent) and verify it returns `ok: false`.
12. **Invoice unchanged:** Create a Zoho draft invoice from a finalized report. Verify the line items still pull from `report.manualMetrics` (no regression).

- [ ] **Step 3: Report verification results**

If any of the above fails, document the failure, root-cause it, and create a follow-up task or fix inline. If all pass, this plan is complete.

- [ ] **Step 4: Final commit only if any incidental fixes were applied**

If any small fixes were applied during UAT, commit them with a focused message.

---

## Open execution notes

- **No tests** — this project has no test framework; per the existing project specs, verification is manual + `pnpm build` for type-checking. If unit tests are added in a future effort, the pure functions in `monday-metrics.ts` (`applySnapshotToMetrics`, `computeOverridesAgainstSnapshot`) are the highest-leverage targets, plus the per-board parsers (`parseTimelineRange`, `parseItemNamePeriod`, `parseDurationHours`, `isBilled`).
- **No mid-implementation Monday writes** — every loader is read-only; this is intentional per spec.
- **No retry-on-failure at the orchestrator level** — the underlying `createMondayClient` already retries 429 / Complexity / RateLimitExceeded with backoff. Anything past those is surfaced verbatim.
- **AI agent confirm guard** — the new `refresh_monday_metrics` tool does NOT need a confirm guard (read-only, idempotent), unlike `revertMonthlyBillingReport`.
