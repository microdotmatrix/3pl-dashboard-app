# ShipStation V2 Shipments Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull shipments from three ShipStation V2 accounts on demand, persist them to Postgres under per-account rows, and keep a delta-sync cursor so repeat runs only touch changed data.

**Architecture:** One schema module (`shipstation_account`, `shipstation_shipment`, `shipstation_sync_cursor`) + one data-access module (`src/lib/shipstation/`) built around a typed HTTP client that speaks V2 (page-based pagination, `API-Key` header, `modified_at_start` delta filter). Sync is triggered by a bearer-guarded cron route and an admin-only server action. No customer-order records exist in V2 — shipments are the row-of-record.

**Tech Stack:** Next.js 16 (App Router), React 19, Drizzle ORM 0.45 on Neon HTTP, Zod 4, t3-env, Better Auth (already wired). No new runtime deps required — `fetch` + Zod cover the client.

---

## Scope guardrails

- **V2-only.** The V2 REST API does not expose customer/sales orders (confirmed via https://docs.shipstation.com/getting-started.md and the OpenAPI path inventory at https://docs.shipstation.com/apis/openapi). This plan persists **shipments only**. Anything order-shaped (order_number, customer email, line items, totals) is out of scope for this milestone. If a future phase needs that, V1 REST (`https://ssapi.shipstation.com/orders`) is the escape hatch — not part of this plan.
- **Read-only.** No label creation, no mutations. Reads `/v2/shipments` and writes to Postgres.
- **No transactions.** The Drizzle client uses `drizzle-orm/neon-http`, which does not support transactions. Upserts run per-row; the cursor row is updated last so an interrupted sync resumes safely (with small re-fetch overlap).
- **No test framework in the codebase.** The repo has no unit-test runner wired up (see `package.json` — only `lint`, `format`, `build`, `db:*` scripts exist). This plan verifies via `pnpm build` typechecks, `pnpm db:generate`/`db:migrate`, and manual `curl` against a live dev Neon branch. Do **not** add a test runner as part of this plan.

## File structure — what each new file owns

- `src/db/schema/shipstation.ts` — all three tables (account registry, shipment rows, per-account per-resource cursor). Types re-exported from here.
- `src/lib/shipstation/client.ts` — V2 HTTP client factory. Handles `API-Key` header, pagination, 429/`Retry-After` backoff, Zod validation at the response boundary. Pure HTTP — no DB access.
- `src/lib/shipstation/accounts.ts` — joins env-provided API keys with `shipstation_account` rows. One function: `getShipStationAccounts()`. Cached with React `cache()` like `src/lib/auth/session.ts`.
- `src/lib/shipstation/sync.ts` — `syncAccountShipments(slug)`. Reads cursor, calls the client, upserts, advances cursor. One function per sync unit.
- `src/lib/shipstation/queries.ts` — read helpers the UI will later consume: `listPendingShipments`, `listShippedShipments`, `getShipmentByLocalId`. Thin Drizzle wrappers only.
- `src/lib/shipstation/actions.ts` — `triggerShipStationSync` server action. Gated by `requireAdmin()`. Calls `sync.ts`; returns per-account summary.
- `src/app/api/cron/shipstation/route.ts` — `POST` handler. Validates `Authorization: Bearer <CRON_SECRET>`. Runs all three accounts sequentially. Returns JSON summary.

**Modified:**

- `src/env.ts` — adds the four new env vars.
- `.env.example` — documents them.
- `src/db/schema/index.ts` — swap `./shipments` export for `./shipstation`.
- `src/app/page.tsx` — drop the `shipments`-based DB demo (not replaced; a real UI comes in a later phase).

**Deleted:**

- `src/db/schema/shipments.ts` — the 13-line placeholder.

---

## Task 1: Add ShipStation env vars

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend `src/env.ts` with the four new server vars**

Replace the whole `createEnv` call with:

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
    ADMIN_EMAIL: z.string().email().optional(),
    SHIPSTATION_API_KEY_DIP: z.string().min(1),
    SHIPSTATION_API_KEY_FATASS: z.string().min(1),
    SHIPSTATION_API_KEY_RYOT: z.string().min(1),
    CRON_SECRET: z.string().min(16),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    SHIPSTATION_API_KEY_DIP: process.env.SHIPSTATION_API_KEY_DIP,
    SHIPSTATION_API_KEY_FATASS: process.env.SHIPSTATION_API_KEY_FATASS,
    SHIPSTATION_API_KEY_RYOT: process.env.SHIPSTATION_API_KEY_RYOT,
    CRON_SECRET: process.env.CRON_SECRET,
  },
});
```

Rationale for `CRON_SECRET.min(16)`: the bearer-guarded route does a constant-time compare; short secrets make the guard theatrical. 16+ chars is a sane floor.

- [ ] **Step 2: Add the four entries to `.env.example`**

Append below the existing block in `.env.example`:

```
# ShipStation V2 API keys — one per client brand. Generate at
# Settings > Account > API Settings > Generate API key in each account.
SHIPSTATION_API_KEY_DIP=""
SHIPSTATION_API_KEY_FATASS=""
SHIPSTATION_API_KEY_RYOT=""

# Bearer token required by POST /api/cron/shipstation. Generate with:
#   openssl rand -hex 32
CRON_SECRET=""
```

- [ ] **Step 3: Populate local `.env` so the build passes**

If the engineer has real V2 keys, set them. Otherwise set placeholder non-empty strings for now — `pnpm build` needs the vars to parse, not to actually work against ShipStation. Example local:

```
SHIPSTATION_API_KEY_DIP="placeholder-dip"
SHIPSTATION_API_KEY_FATASS="placeholder-fatass"
SHIPSTATION_API_KEY_RYOT="placeholder-ryot"
CRON_SECRET="0123456789abcdef0123456789abcdef"
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm build`
Expected: completes without type errors. The build will still render the old shipments page — that's fine, we rip it out in Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/env.ts .env.example
git commit -m "feat(env): add ShipStation V2 keys and CRON_SECRET"
```

(Do NOT commit local `.env`.)

---

## Task 2: Replace `shipments` schema with `shipstation` schema

**Files:**
- Create: `src/db/schema/shipstation.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/app/page.tsx`
- Delete: `src/db/schema/shipments.ts`

Column choices are deliberately narrow: only fields documented in the V2 list-shipments sample response (https://docs.shipstation.com/list-shipments.md). Unknown/undocumented fields live in `raw` jsonb so we never lose them.

- [ ] **Step 1: Write `src/db/schema/shipstation.ts`**

```ts
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const shipstationAccount = pgTable("shipstation_account", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shipstationShipment = pgTable(
  "shipstation_shipment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => shipstationAccount.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    externalShipmentId: text("external_shipment_id"),
    status: text("status").notNull(),
    carrierId: text("carrier_id"),
    serviceCode: text("service_code"),
    shipDate: timestamp("ship_date", { withTimezone: true }),
    createdAtRemote: timestamp("created_at_remote", {
      withTimezone: true,
    }).notNull(),
    modifiedAtRemote: timestamp("modified_at_remote", {
      withTimezone: true,
    }).notNull(),
    shipTo: jsonb("ship_to"),
    shipFrom: jsonb("ship_from"),
    warehouseId: text("warehouse_id"),
    tags: jsonb("tags").$type<Array<{ name: string }>>(),
    totalWeight: jsonb("total_weight"),
    packageCount: integer("package_count"),
    raw: jsonb("raw").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("shipstation_shipment_account_external_idx").on(
      t.accountId,
      t.externalId,
    ),
    index("shipstation_shipment_account_status_idx").on(t.accountId, t.status),
    index("shipstation_shipment_modified_at_idx").on(t.modifiedAtRemote),
  ],
);

export const shipstationSyncCursor = pgTable(
  "shipstation_sync_cursor",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => shipstationAccount.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.resource] })],
);

export const shipstationAccountRelations = relations(
  shipstationAccount,
  ({ many }) => ({
    shipments: many(shipstationShipment),
    cursors: many(shipstationSyncCursor),
  }),
);

export const shipstationShipmentRelations = relations(
  shipstationShipment,
  ({ one }) => ({
    account: one(shipstationAccount, {
      fields: [shipstationShipment.accountId],
      references: [shipstationAccount.id],
    }),
  }),
);

export const shipstationSyncCursorRelations = relations(
  shipstationSyncCursor,
  ({ one }) => ({
    account: one(shipstationAccount, {
      fields: [shipstationSyncCursor.accountId],
      references: [shipstationAccount.id],
    }),
  }),
);

export type ShipstationAccount = typeof shipstationAccount.$inferSelect;
export type ShipstationShipment = typeof shipstationShipment.$inferSelect;
export type ShipstationSyncCursor = typeof shipstationSyncCursor.$inferSelect;
export type ShipstationSyncResource = "shipments";
```

Notes the engineer should not second-guess:
- `status` is free text (not a pg enum). V2 values today are `pending | processing | label_purchased | cancelled`, but keeping it text avoids a migration every time ShipStation adds a state.
- `shipTo`/`shipFrom`/`totalWeight`/`tags` are `jsonb` because the V2 docs don't guarantee a stable flat schema and we promote only what the UI needs.
- `raw` is `notNull` — every row carries its full API payload so we can add columns later without re-syncing.
- `ShipstationSyncResource` is typed as the literal `"shipments"` so the codebase can grow `"fulfillments"` later without breaking callers that destructure the enum.

- [ ] **Step 2: Swap the barrel export in `src/db/schema/index.ts`**

Replace the file contents with:

```ts
export * from "./auth";
export * from "./invites";
export * from "./password-reset-links";
export * from "./shipstation";
```

- [ ] **Step 3: Drop the old DB demo from `src/app/page.tsx`**

Replace the file contents with:

```tsx
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { requireApprovedUser } from "@/lib/auth/access";

const HomePage = async () => {
  const ctx = await requireApprovedUser();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            3PL Dashboard
          </p>
          <h1 className="font-heading text-xl font-semibold">
            Welcome back, {ctx.user.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {ctx.user.role === "admin" ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">Admin</Link>
            </Button>
          ) : null}
          <SignOutButton />
        </div>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Shipments</h2>
        <p className="text-xs/relaxed text-muted-foreground">
          Shipments sync from ShipStation is wired up. A dashboard UI lands in a
          later phase.
        </p>
      </section>
    </main>
  );
};

export default HomePage;
```

Reason: we delete `shipments.ts` in the next step; this page imports it. Easiest to just strip the stub.

- [ ] **Step 4: Delete the old schema file**

```bash
rm src/db/schema/shipments.ts
```

- [ ] **Step 5: Verify typecheck + build**

Run: `pnpm build`
Expected: build succeeds. If it fails on a stale import, grep for `"@/db/schema/shipments"` and `"from \"./shipments\""` and remove any stragglers.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/shipstation.ts src/db/schema/index.ts src/app/page.tsx
git rm src/db/schema/shipments.ts
git commit -m "feat(db): replace shipments stub with shipstation schema"
```

---

## Task 3: Generate migration and seed the three brand accounts

**Files:**
- Create: `drizzle/00XX_<auto-generated-suffix>.sql` (name assigned by drizzle-kit)

- [ ] **Step 1: Generate the migration**

Run: `pnpm db:generate`
Expected output: a new file under `drizzle/` named like `0003_<word>_<word>.sql` with `DROP TABLE "shipments"`, `CREATE TABLE "shipstation_account"`, `CREATE TABLE "shipstation_shipment"`, `CREATE TABLE "shipstation_sync_cursor"`, plus the three indexes. No warnings in the output.

If drizzle-kit prompts interactively (it sometimes asks to rename vs. drop-and-create when a table name changes), choose **drop/create** — the old `shipments` table has no data worth keeping.

- [ ] **Step 2: Append seed rows to the generated migration**

Open the newly generated `drizzle/0003_*.sql` and append at the bottom (preserve whatever drizzle-kit wrote above):

```sql
--> statement-breakpoint
INSERT INTO "shipstation_account" ("slug", "display_name")
VALUES ('dip', 'DIP')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shipstation_account" ("slug", "display_name")
VALUES ('fatass', 'FATASS')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shipstation_account" ("slug", "display_name")
VALUES ('ryot', 'RYOT')
ON CONFLICT ("slug") DO NOTHING;
```

The `--> statement-breakpoint` marker is drizzle-kit's own convention — keep the format consistent with the auto-generated statements above it.

- [ ] **Step 3: Apply the migration to the dev Neon branch**

Run: `pnpm db:migrate`
Expected: all statements apply with no errors. If you get `relation "shipments" does not exist` on the DROP, that means the table was already gone on this branch — safe to ignore, or edit the SQL to `DROP TABLE IF EXISTS`.

- [ ] **Step 4: Confirm via Drizzle Studio**

Run: `pnpm db:studio`
In the opened UI:
- `shipstation_account` has exactly 3 rows with slugs `dip`, `fatass`, `ryot`.
- `shipstation_shipment` and `shipstation_sync_cursor` exist and are empty.
- `shipments` is gone.

Close studio when verified.

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "feat(db): migrate to shipstation schema and seed accounts"
```

---

## Task 4: ShipStation V2 HTTP client

**Files:**
- Create: `src/lib/shipstation/client.ts`

This is the one file where correctness matters most — everything downstream trusts its types.

- [ ] **Step 1: Write `src/lib/shipstation/client.ts`**

```ts
import "server-only";

import { z } from "zod";

const BASE_URL = "https://api.shipstation.com/v2";

const shipToSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    company_name: z.string().nullable().optional(),
    address_line1: z.string().nullable().optional(),
    address_line2: z.string().nullable().optional(),
    address_line3: z.string().nullable().optional(),
    city_locality: z.string().nullable().optional(),
    state_province: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
    address_residential_indicator: z
      .enum(["yes", "no", "unknown"])
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

const tagSchema = z.object({ name: z.string() });

const weightSchema = z
  .object({
    value: z.number(),
    // V2 docs disagree: list response uses `units`, get-by-id uses `unit`.
    // Accept either and normalize at the call site if ever needed.
    units: z.string().optional(),
    unit: z.string().optional(),
  })
  .nullable()
  .optional();

export const shipstationShipmentSchema = z.object({
  shipment_id: z.string(),
  external_shipment_id: z.string().nullable().optional(),
  shipment_status: z.string(),
  carrier_id: z.string().nullable().optional(),
  service_code: z.string().nullable().optional(),
  ship_date: z.string().nullable().optional(),
  created_at: z.string(),
  modified_at: z.string(),
  ship_to: shipToSchema,
  ship_from: shipToSchema,
  warehouse_id: z.string().nullable().optional(),
  tags: z.array(tagSchema).nullable().optional(),
  total_weight: weightSchema,
  packages: z.array(z.unknown()).nullable().optional(),
});

export type ShipstationShipmentPayload = z.infer<
  typeof shipstationShipmentSchema
>;

const linksSchema = z.object({
  first: z.object({ href: z.string() }).optional().or(z.object({}).strict()),
  last: z.object({ href: z.string() }).optional().or(z.object({}).strict()),
  prev: z.object({ href: z.string() }).optional().or(z.object({}).strict()),
  next: z.object({ href: z.string() }).optional().or(z.object({}).strict()),
});

export const shipstationListResponseSchema = z.object({
  shipments: z.array(shipstationShipmentSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
  links: linksSchema,
});

export type ShipstationListResponse = z.infer<
  typeof shipstationListResponseSchema
>;

export type ListShipmentsParams = {
  modifiedAtStart?: string; // ISO-8601
  modifiedAtEnd?: string;
  shipmentStatus?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "modified_at" | "created_at";
  sortDir?: "asc" | "desc";
};

export type ShipstationClient = {
  accountSlug: string;
  listShipments: (params?: ListShipmentsParams) => Promise<ShipstationListResponse>;
  listShipmentsByUrl: (url: string) => Promise<ShipstationListResponse>;
};

const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildListUrl = (params: ListShipmentsParams): string => {
  const url = new URL(`${BASE_URL}/shipments`);
  const {
    modifiedAtStart,
    modifiedAtEnd,
    shipmentStatus,
    page,
    pageSize,
    sortBy,
    sortDir,
  } = params;
  if (modifiedAtStart) url.searchParams.set("modified_at_start", modifiedAtStart);
  if (modifiedAtEnd) url.searchParams.set("modified_at_end", modifiedAtEnd);
  if (shipmentStatus) url.searchParams.set("shipment_status", shipmentStatus);
  if (page) url.searchParams.set("page", String(page));
  if (pageSize) url.searchParams.set("page_size", String(pageSize));
  if (sortBy) url.searchParams.set("sort_by", sortBy);
  if (sortDir) url.searchParams.set("sort_dir", sortDir);
  return url.toString();
};

const fetchWithRetry = async (
  url: string,
  apiKey: string,
): Promise<unknown> => {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      const waitMs = Math.max(1, retryAfter) * 1000;
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        throw new Error(
          `ShipStation rate limit exhausted after ${MAX_RETRIES} retries for ${url}`,
        );
      }
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable>");
      throw new Error(
        `ShipStation ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 500)}`,
      );
    }

    return response.json();
  }
};

export const createShipstationClient = ({
  apiKey,
  accountSlug,
}: {
  apiKey: string;
  accountSlug: string;
}): ShipstationClient => {
  const fetchList = async (
    url: string,
  ): Promise<ShipstationListResponse> => {
    const raw = await fetchWithRetry(url, apiKey);
    return shipstationListResponseSchema.parse(raw);
  };

  return {
    accountSlug,
    listShipments: (params = {}) => fetchList(buildListUrl(params)),
    listShipmentsByUrl: (url) => fetchList(url),
  };
};
```

What to notice (don't change these without reason):
- `cache: "no-store"` — this endpoint is always dynamic; we don't want Next's fetch cache in front of it.
- `API-Key` header (capital K), not `Authorization: Bearer`. The V2 docs are explicit.
- `linksSchema` accepts either `{href: "..."}` or `{}` per the docs' example response.
- `listShipmentsByUrl` exists so `sync.ts` can follow `links.next.href` verbatim without re-building query params.
- The retry loop handles only 429. 5xx errors bubble up; the cron caller decides whether to retry the whole sync.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm build`
Expected: passes. If Zod complains about `.nullable().optional()` ordering or union syntax differences between Zod 3 and Zod 4, swap to `z.union([z.object({href: z.string()}), z.object({}).strict()]).optional()` — functionally identical.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shipstation/client.ts
git commit -m "feat(shipstation): add V2 HTTP client with Zod boundary"
```

---

## Task 5: Account registry

**Files:**
- Create: `src/lib/shipstation/accounts.ts`

- [ ] **Step 1: Write `src/lib/shipstation/accounts.ts`**

```ts
import "server-only";

import { cache } from "react";

import { db } from "@/db";
import {
  type ShipstationAccount,
  shipstationAccount,
} from "@/db/schema/shipstation";
import { env } from "@/env";

export type ShipstationAccountWithKey = ShipstationAccount & {
  apiKey: string;
};

const API_KEYS: Record<string, string> = {
  dip: env.SHIPSTATION_API_KEY_DIP,
  fatass: env.SHIPSTATION_API_KEY_FATASS,
  ryot: env.SHIPSTATION_API_KEY_RYOT,
};

export const getShipstationAccounts = cache(
  async (): Promise<ShipstationAccountWithKey[]> => {
    const rows = await db.select().from(shipstationAccount);
    return rows.map((row) => {
      const apiKey = API_KEYS[row.slug];
      if (!apiKey) {
        throw new Error(
          `No ShipStation API key configured for account slug "${row.slug}". Check env and src/lib/shipstation/accounts.ts.`,
        );
      }
      return { ...row, apiKey };
    });
  },
);

export const getShipstationAccountBySlug = async (
  slug: string,
): Promise<ShipstationAccountWithKey | null> => {
  const accounts = await getShipstationAccounts();
  return accounts.find((account) => account.slug === slug) ?? null;
};
```

Why `cache()` here: it mirrors `getSessionWithProfile` in `src/lib/auth/access.ts`. The three rows are stable within a request; we don't want to re-query per sync step.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shipstation/accounts.ts
git commit -m "feat(shipstation): add account registry"
```

---

## Task 6: Sync logic

**Files:**
- Create: `src/lib/shipstation/sync.ts`

- [ ] **Step 1: Write `src/lib/shipstation/sync.ts`**

```ts
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  type ShipstationShipment,
  shipstationShipment,
  shipstationSyncCursor,
} from "@/db/schema/shipstation";

import {
  type ShipstationAccountWithKey,
  getShipstationAccountBySlug,
  getShipstationAccounts,
} from "./accounts";
import {
  type ShipstationShipmentPayload,
  createShipstationClient,
} from "./client";

const RESOURCE = "shipments" as const;
const OVERLAP_MS = 2 * 60 * 1000; // re-scan last 2min on each run
const PAGE_SIZE = 100;

export type SyncResult = {
  accountSlug: string;
  upserted: number;
  pagesFetched: number;
  cursorAdvancedTo: string | null;
  error: string | null;
};

const toTimestamp = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const mapShipmentRow = (
  account: ShipstationAccountWithKey,
  payload: ShipstationShipmentPayload,
): Omit<ShipstationShipment, "id" | "syncedAt"> => {
  const createdAt = toTimestamp(payload.created_at);
  const modifiedAt = toTimestamp(payload.modified_at);
  if (!createdAt || !modifiedAt) {
    throw new Error(
      `Shipment ${payload.shipment_id} missing required created_at/modified_at`,
    );
  }
  return {
    accountId: account.id,
    externalId: payload.shipment_id,
    externalShipmentId: payload.external_shipment_id ?? null,
    status: payload.shipment_status,
    carrierId: payload.carrier_id ?? null,
    serviceCode: payload.service_code ?? null,
    shipDate: toTimestamp(payload.ship_date),
    createdAtRemote: createdAt,
    modifiedAtRemote: modifiedAt,
    shipTo: (payload.ship_to ?? null) as ShipstationShipment["shipTo"],
    shipFrom: (payload.ship_from ?? null) as ShipstationShipment["shipFrom"],
    warehouseId: payload.warehouse_id ?? null,
    tags: payload.tags ?? null,
    totalWeight:
      (payload.total_weight ?? null) as ShipstationShipment["totalWeight"],
    packageCount: payload.packages ? payload.packages.length : null,
    raw: payload as unknown as ShipstationShipment["raw"],
  };
};

const readCursor = async (accountId: string): Promise<Date | null> => {
  const [row] = await db
    .select()
    .from(shipstationSyncCursor)
    .where(
      and(
        eq(shipstationSyncCursor.accountId, accountId),
        eq(shipstationSyncCursor.resource, RESOURCE),
      ),
    )
    .limit(1);
  return row?.lastModifiedAt ?? null;
};

const writeCursor = async (
  accountId: string,
  lastModifiedAt: Date | null,
  status: "ok" | "error",
  error: string | null,
) => {
  const now = new Date();
  await db
    .insert(shipstationSyncCursor)
    .values({
      accountId,
      resource: RESOURCE,
      lastModifiedAt,
      lastRunAt: now,
      lastStatus: status,
      lastError: error,
    })
    .onConflictDoUpdate({
      target: [shipstationSyncCursor.accountId, shipstationSyncCursor.resource],
      set: {
        lastModifiedAt,
        lastRunAt: now,
        lastStatus: status,
        lastError: error,
      },
    });
};

export const syncAccountShipments = async (
  slug: string,
): Promise<SyncResult> => {
  const account = await getShipstationAccountBySlug(slug);
  if (!account) {
    return {
      accountSlug: slug,
      upserted: 0,
      pagesFetched: 0,
      cursorAdvancedTo: null,
      error: `Unknown account slug "${slug}"`,
    };
  }

  const client = createShipstationClient({
    apiKey: account.apiKey,
    accountSlug: account.slug,
  });

  const cursor = await readCursor(account.id);
  const modifiedAtStart = cursor
    ? new Date(cursor.getTime() - OVERLAP_MS).toISOString()
    : undefined;

  let upserted = 0;
  let pagesFetched = 0;
  let maxModifiedAt = cursor;

  try {
    let page: Awaited<ReturnType<typeof client.listShipments>> =
      await client.listShipments({
        modifiedAtStart,
        page: 1,
        pageSize: PAGE_SIZE,
        sortBy: "modified_at",
        sortDir: "asc",
      });

    while (true) {
      pagesFetched += 1;

      for (const payload of page.shipments) {
        const row = mapShipmentRow(account, payload);
        await db
          .insert(shipstationShipment)
          .values(row)
          .onConflictDoUpdate({
            target: [
              shipstationShipment.accountId,
              shipstationShipment.externalId,
            ],
            set: {
              externalShipmentId: row.externalShipmentId,
              status: row.status,
              carrierId: row.carrierId,
              serviceCode: row.serviceCode,
              shipDate: row.shipDate,
              createdAtRemote: row.createdAtRemote,
              modifiedAtRemote: row.modifiedAtRemote,
              shipTo: row.shipTo,
              shipFrom: row.shipFrom,
              warehouseId: row.warehouseId,
              tags: row.tags,
              totalWeight: row.totalWeight,
              packageCount: row.packageCount,
              raw: row.raw,
              syncedAt: new Date(),
            },
          });
        upserted += 1;
        if (!maxModifiedAt || row.modifiedAtRemote > maxModifiedAt) {
          maxModifiedAt = row.modifiedAtRemote;
        }
      }

      const nextHref =
        "href" in page.links.next ? page.links.next.href : undefined;
      if (!nextHref) break;
      page = await client.listShipmentsByUrl(nextHref);
    }

    await writeCursor(account.id, maxModifiedAt, "ok", null);

    return {
      accountSlug: account.slug,
      upserted,
      pagesFetched,
      cursorAdvancedTo: maxModifiedAt?.toISOString() ?? null,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeCursor(account.id, cursor, "error", message);
    return {
      accountSlug: account.slug,
      upserted,
      pagesFetched,
      cursorAdvancedTo: null,
      error: message,
    };
  }
};

export const syncAllAccounts = async (): Promise<SyncResult[]> => {
  const accounts = await getShipstationAccounts();
  const results: SyncResult[] = [];
  for (const account of accounts) {
    // Sequential: three V2 keys share no rate limit bucket, but sequential keeps
    // logs readable and avoids spiking the DB with concurrent writes.
    results.push(await syncAccountShipments(account.slug));
  }
  return results;
};
```

Design points worth understanding:
- **Cursor semantics:** we store `max(modified_at)` from the last successful run. Next run starts at `cursor - 2min` to tolerate ShipStation clock skew. Duplicate upserts inside the overlap are idempotent.
- **Error isolation:** an error on one account doesn't abort the others — `syncAllAccounts` collects results and the caller decides.
- **No transaction:** neon-http can't transact. Row-level upserts are individually idempotent, and the cursor updates last. An interrupted sync leaves rows partially updated but cursor not advanced → next run re-syncs the same window. Acceptable.
- **`onConflictDoUpdate` set list is explicit** — not `set: row` — to avoid overwriting `id` or `syncedAt`'s default.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm build`
Expected: passes. If Drizzle complains about jsonb type assignments (`shipTo`, `totalWeight`), the `as ShipstationShipment[...]` casts in `mapShipmentRow` are load-bearing — don't remove them.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shipstation/sync.ts
git commit -m "feat(shipstation): add delta sync"
```

---

## Task 7: Read-side query helpers

**Files:**
- Create: `src/lib/shipstation/queries.ts`

- [ ] **Step 1: Write `src/lib/shipstation/queries.ts`**

```ts
import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  shipstationAccount,
  shipstationShipment,
} from "@/db/schema/shipstation";

const PENDING_STATUSES = ["pending", "processing"] as const;
const SHIPPED_STATUSES = ["label_purchased"] as const;

type ListShipmentsFilter = {
  accountSlug?: string;
  limit?: number;
};

const resolveAccountId = async (slug: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: shipstationAccount.id })
    .from(shipstationAccount)
    .where(eq(shipstationAccount.slug, slug))
    .limit(1);
  return row?.id ?? null;
};

export const listPendingShipments = async ({
  accountSlug,
  limit = 100,
}: ListShipmentsFilter = {}) => {
  const filters = [
    inArray(shipstationShipment.status, [...PENDING_STATUSES]),
  ];
  if (accountSlug) {
    const accountId = await resolveAccountId(accountSlug);
    if (!accountId) return [];
    filters.push(eq(shipstationShipment.accountId, accountId));
  }
  return db
    .select()
    .from(shipstationShipment)
    .where(and(...filters))
    .orderBy(desc(shipstationShipment.modifiedAtRemote))
    .limit(limit);
};

export const listShippedShipments = async ({
  accountSlug,
  limit = 100,
}: ListShipmentsFilter = {}) => {
  const filters = [
    inArray(shipstationShipment.status, [...SHIPPED_STATUSES]),
  ];
  if (accountSlug) {
    const accountId = await resolveAccountId(accountSlug);
    if (!accountId) return [];
    filters.push(eq(shipstationShipment.accountId, accountId));
  }
  return db
    .select()
    .from(shipstationShipment)
    .where(and(...filters))
    .orderBy(desc(shipstationShipment.shipDate))
    .limit(limit);
};

export const getShipmentByLocalId = async (id: string) => {
  const [row] = await db
    .select()
    .from(shipstationShipment)
    .where(eq(shipstationShipment.id, id))
    .limit(1);
  return row ?? null;
};
```

These are thin wrappers. The UI layer lands in a future phase; these exist so that phase has a stable import surface.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shipstation/queries.ts
git commit -m "feat(shipstation): add shipment query helpers"
```

---

## Task 8: Cron route handler

**Files:**
- Create: `src/app/api/cron/shipstation/route.ts`

Before writing: the Next.js 16 convention (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`) is plain `export async function POST(request: Request)` returning a Web `Response`. No middleware, no special bodyParser. Nothing exotic.

- [ ] **Step 1: Write `src/app/api/cron/shipstation/route.ts`**

```ts
import { env } from "@/env";
import { syncAllAccounts } from "@/lib/shipstation/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (!constantTimeEqual(authHeader, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await syncAllAccounts();
  const hasError = results.some((result) => result.error !== null);

  return Response.json(
    { ok: !hasError, results },
    { status: hasError ? 207 : 200 },
  );
}
```

Choices:
- `dynamic = "force-dynamic"` + `runtime = "nodejs"`: this route hits the DB and fetches external APIs; it must not be statically rendered and it wants the Node runtime (Neon HTTP works on both, but Node is safer for long fetches).
- Constant-time header compare: token-compare timing attacks are a real class of bug; the helper is ~10 lines and removes a footgun.
- `207` on partial failure: HTTP Multi-Status — signals "some succeeded, some didn't" without masking the summary.

- [ ] **Step 2: Verify typecheck + build**

Run: `pnpm build`
Expected: passes. Next 16 should report the new route under the build output's routes table as `ƒ /api/cron/shipstation`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/shipstation/route.ts
git commit -m "feat(shipstation): add cron sync route"
```

---

## Task 9: Admin-only manual trigger server action

**Files:**
- Create: `src/lib/shipstation/actions.ts`

- [ ] **Step 1: Write `src/lib/shipstation/actions.ts`**

```ts
"use server";

import { requireAdmin } from "@/lib/auth/access";

import { type SyncResult, syncAllAccounts } from "./sync";

export const triggerShipstationSync = async (): Promise<{
  ok: boolean;
  results: SyncResult[];
}> => {
  await requireAdmin();
  const results = await syncAllAccounts();
  return {
    ok: results.every((result) => result.error === null),
    results,
  };
};
```

Notes:
- `"use server"` at the top of the file is required for server actions in Next 16. `requireAdmin()` already calls `notFound()` for non-admins, so unauthorized callers get a thrown error — that's the intended guard.
- No UI form hookup in this plan. The action exists so a later phase's admin page can import it directly.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shipstation/actions.ts
git commit -m "feat(shipstation): add admin-triggered sync action"
```

---

## Task 10: End-to-end verification against a real ShipStation account

This task doesn't change code. It confirms the thing actually works before we call the phase done. **Only run if the engineer has at least one real V2 API key in their local `.env`.** If all three keys are placeholders, skip to Task 11.

- [ ] **Step 1: Boot the dev server**

Run: `pnpm dev`
Expected: starts on http://localhost:3000 without errors. Leave it running in a separate terminal.

- [ ] **Step 2: Hit the cron route**

In a new terminal, with `CRON_SECRET` matching `.env`:

```bash
curl -i -X POST http://localhost:3000/api/cron/shipstation \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: HTTP 200 (or 207 if one of the placeholder keys is still in place and errors). Body is JSON with `ok` and a `results` array of length 3. Each result has `accountSlug`, `upserted`, `pagesFetched`, `cursorAdvancedTo`, `error`.

If 401: the secret is wrong. Check that `Bearer ` has a trailing space and the secret matches `.env`.
If Zod parse error in the result: the V2 response shape differs from our schema. Capture the offending JSON (from the server logs) and loosen the relevant field in `client.ts` — likely a new enum value for `shipment_status` or a nullable field we didn't mark nullable.

- [ ] **Step 3: Confirm rows via Drizzle Studio**

Run: `pnpm db:studio` (in a fourth terminal)

- `shipstation_shipment` has rows for each account that succeeded. `raw` is populated. `modified_at_remote` populated.
- `shipstation_sync_cursor` has one row per account that ran, with `last_status = 'ok'` and `last_modified_at` set.

- [ ] **Step 4: Run the sync a second time**

```bash
curl -i -X POST http://localhost:3000/api/cron/shipstation \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: second response's `upserted` counts are small (only shipments modified in the overlap window, or zero). `pagesFetched` small. No duplicate rows in `shipstation_shipment` — the unique `(account_id, external_id)` index prevents that. `cursorAdvancedTo` is >= first run's value.

- [ ] **Step 5: Spot-check against the ShipStation UI**

Pick any shipment ID visible in Drizzle Studio. Look it up in the corresponding ShipStation account's native UI. Confirm `status`, `ship_to.name`, `ship_date`, `carrier_id` match.

- [ ] **Step 6: No commit**

This task produces no code changes. Move to Task 11.

---

## Task 11: Final quality gate

**Files:** none

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: passes. Fix any Biome complaints in the new files before moving on.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: passes, no type errors, new cron route listed in the build output.

- [ ] **Step 3: Confirm git is clean**

Run: `git status`
Expected: clean working tree. Every change from Tasks 1–9 is committed.

- [ ] **Step 4: Quick grep for stragglers**

```bash
grep -r --include='*.ts' --include='*.tsx' 'from "@/db/schema/shipments"' src/
grep -r --include='*.ts' --include='*.tsx' 'shipments\b' src/db/
```

Expected: no hits.

---

## Out of scope (explicitly deferred)

- V1 REST for customer orders. Revisit only if the UI phase needs order-level data that shipments don't carry.
- Webhooks (`/v2/environment/webhooks`). Polling is fine until volume makes it not fine.
- Labels / fulfillments / tracking resources. Tracking number lives on the label, not the shipment — add a `shipstation_label` table when the UI needs it.
- Server-action UI integration. `triggerShipstationSync` exists but no form calls it yet.
- Neon-serverless migration (for real transactions). The current design is correct under neon-http's constraints; move only if we need atomic multi-row writes.
