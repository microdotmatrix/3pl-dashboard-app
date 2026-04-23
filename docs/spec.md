# ShipStation V2 Data Layer & Schema (Draft — awaiting API research)

## Context

The app is a 3PL dashboard for a company that fulfills orders on behalf of three client brands. Each brand has its own ShipStation account (with its own V2 API key). Warehouse employees currently have to switch between accounts to see what's pending vs. shipped; this project unifies all three accounts into one dashboard.

Scope for this milestone:

- **Read-only** against ShipStation — no label creation, no mutations upstream (yet).
- Pull orders + shipments from all three accounts on a schedule, persist them to Postgres, and keep the local copy in sync.
- Persisted data is the source of truth the UI reads from. It also anchors internal annotations (tags, notes, saved views) that employees add in our app — those FK to the local order rows, not ShipStation IDs directly.

Out of scope now: UI surfaces, tag/note/saved-view schema (separate task), webhooks (polling is fine to start).

---

## Current state (from exploration)

Stack: Next.js 16.2.4 (App Router, async `params`/`cookies`/`headers`, `proxy.ts` not middleware), React 19.2.4, Drizzle 0.45.2 on Neon HTTP, Better Auth 1.6.7 with admin plugin and a pending/approved status workflow.

Key files:

- `src/db/index.ts` — Neon HTTP Drizzle client (`db`).
- `src/db/schema/index.ts` — barrel re-export of all schema files.
- `src/db/schema/shipments.ts` — a 13-line placeholder `shipments` table (id, reference, status, timestamps). Nothing references it except `src/app/page.tsx`'s `getDbStatus()` demo. **Safe to replace.**
- `src/db/schema/auth.ts` — `user.id` is `text` (Better Auth IDs), use that for FK.
- `src/env.ts` — t3-env Zod validation; no ShipStation vars yet.
- `.env.example` — no ShipStation vars yet.
- `drizzle.config.ts` — schema at `./src/db/schema/index.ts`, migrations in `./drizzle/`.
- No existing external-API fetch code; no cron; no `lib/api/` or `lib/shipstation/`. This is first-mover pattern.

Conventions to mirror:

- Server-only modules, `"use server"` for actions.
- `db.select().from(...)` directly (no repository abstraction).
- Zod validation at system boundaries.
- React `cache()` for request-scoped memoization (`src/lib/auth/session.ts`).

---

## Proposed approach

### 1. Environment variables

Add three V2 API keys + a cron bearer secret to `src/env.ts` and `.env.example`. Three brands: **DIP, FATASS, RYOT**.

```
SHIPSTATION_API_KEY_DIP
SHIPSTATION_API_KEY_FATASS
SHIPSTATION_API_KEY_RYOT
CRON_SECRET
```

All four registered in `src/env.ts` under `server` + `runtimeEnv`. Zod validates each as a non-empty string.

### 2. Database schema

New file: `src/db/schema/shipstation.ts` (and delete `src/db/schema/shipments.ts` + its barrel export + fix `src/app/page.tsx`'s stub usage).

Tables:

- **`shipstation_account`** — one row per client brand. Columns: `id` (uuid), `slug` (text, unique — matches env key suffix), `display_name`, `created_at`. Seeded via a one-off SQL insert in the migration or a small seed script. This is what we join against so orders/shipments know which client they belong to.
- **`shipstation_order`** — one row per ShipStation order, per account. Columns (tentative — finalized once API research lands):
  - `id` (uuid, local PK)
  - `account_id` → `shipstation_account.id`
  - `external_id` (text) — ShipStation's order id
  - `order_number` (text) — human-facing
  - `order_status` (text) — `awaiting_shipment` / `shipped` / `cancelled` / `on_hold` / etc.
  - `order_date`, `ship_by_date`, `created_at_remote`, `modified_at_remote`
  - `customer_email`, `customer_name`, `ship_to` (jsonb)
  - `order_total` (numeric), `item_count` (int)
  - `raw` (jsonb) — full API payload, for fields we don't promote yet
  - `synced_at` (timestamp) — local, updated on every upsert
  - unique `(account_id, external_id)`
  - indexes on `(account_id, order_status)`, `modified_at_remote` (for delta sync cursor)
- **`shipstation_order_item`** — line items, FK to `shipstation_order` with cascade delete. Columns: `sku`, `name`, `quantity`, `unit_price`, `raw`.
- **`shipstation_shipment`** — one row per shipment. Columns: `account_id`, `external_id`, `order_id` (nullable FK → `shipstation_order`), `tracking_number`, `carrier_code`, `service_code`, `shipped_at`, `status`, `raw`, `synced_at`. Unique `(account_id, external_id)`.
- **`shipstation_sync_cursor`** — per-account, per-resource sync state. Columns: `account_id`, `resource` (`orders` | `shipments`), `last_modified_at` (timestamp), `last_run_at`, `last_status` (`ok` | `error`), `last_error` (text). PK `(account_id, resource)`. Lets delta sync resume cleanly.

### 3. Data-access layer

New directory: `src/lib/shipstation/`

- **`client.ts`** — typed HTTP client. `createShipStationClient({ apiKey, accountSlug })` returns `{ listOrders(params), listShipments(params), getOrder(id) }`. Handles:
  - Base URL + auth header (shape confirmed by research agent).
  - Rate-limit handling (respect `X-Rate-Limit-*` headers, `429` backoff).
  - Pagination (cursor or page-based — research-dependent).
  - Zod parsing at the boundary.
- **`accounts.ts`** — maps env keys → account records. `getShipStationAccounts()` returns `[{ slug, displayName, apiKey }]` by joining the env with the `shipstation_account` table. Cached with React `cache()`.
- **`sync.ts`** — `syncAccount(accountSlug, { resource })`. For orders: reads the cursor, calls `listOrders({ modifiedAfter: cursor })`, upserts into `shipstation_order` + `shipstation_order_item` inside a transaction, advances the cursor. For shipments: same pattern.
- **`queries.ts`** — read helpers the UI will use later: `listPendingOrders({ accountSlug? })`, `listShippedOrders(...)`, `getOrderByLocalId(id)`. Thin Drizzle wrappers, nothing fancy.

### 4. Sync trigger

Route handler: `src/app/api/cron/shipstation/route.ts` (POST). Validates `Authorization: Bearer <CRON_SECRET>`, runs `syncAccount` for each of the three accounts sequentially, returns a JSON summary. Triggered by any external cron (Vercel Cron, GitHub Actions, a cronjob.org hit — user's choice, not wired in this milestone).

Also expose a manual `triggerShipStationSync` server action in `src/lib/shipstation/actions.ts` gated by `requireAdmin()`, so an admin can kick off a sync from the UI while we're building.

### 5. Migration + seed

Run `pnpm db:generate` to produce the migration. Append three idempotent `INSERT ... ON CONFLICT (slug) DO NOTHING` rows at the bottom of the generated migration for slugs `dip`, `fatass`, `ryot` (display names: "DIP", "FATASS", "RYOT" — we can rename via `display_name` later without touching slugs or env vars).

---

## Critical files to modify / create

Modify:

- `src/env.ts` — add the four new env vars.
- `.env.example` — document them.
- `src/db/schema/index.ts` — swap `./shipments` export for `./shipstation`.
- `src/app/page.tsx` — replace the `getDbStatus()` usage of the old `shipments` table (or drop the demo entirely).

Create:

- `src/db/schema/shipstation.ts`
- `src/lib/shipstation/client.ts`
- `src/lib/shipstation/accounts.ts`
- `src/lib/shipstation/sync.ts`
- `src/lib/shipstation/queries.ts`
- `src/lib/shipstation/actions.ts`
- `src/app/api/cron/shipstation/route.ts`
- `drizzle/00XX_shipstation.sql` (auto-generated, plus a manual account seed insert)

Delete:

- `src/db/schema/shipments.ts` (replaced).

---

## Verification

1. `pnpm db:generate` produces a clean migration with no warnings.
2. `pnpm db:migrate` applies cleanly to a dev Neon branch; `pnpm db:studio` shows the new tables and three seeded `shipstation_account` rows.
3. Hit `POST /api/cron/shipstation` locally with the cron bearer; confirm rows appear in `shipstation_order` and `shipstation_shipment` for each account, and `shipstation_sync_cursor` advances.
4. Run the sync twice and confirm the second run only touches modified rows (delta cursor working) and that upserts don't duplicate.
5. Spot-check a ShipStation order in its native UI and confirm the fields match what we persisted.
6. `pnpm lint` and `pnpm build` pass.

---

## Decisions locked in with user

- **Brands**: DIP, FATASS, RYOT (slugs lowercased: `dip`, `fatass`, `ryot`).
- **Payload depth**: promoted columns + full `raw` jsonb per row.
- **Trigger**: bearer-guarded cron route + admin-only manual server action. No webhook stub this pass.

## Pending before locking final field list

- [ ] ShipStation V2 auth header shape, base URL, rate limits, pagination style, delta-sync param. Documentation here: https://docs.shipstation.com/apis/openapi
