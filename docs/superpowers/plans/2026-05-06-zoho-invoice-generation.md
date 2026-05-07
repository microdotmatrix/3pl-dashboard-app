# Zoho Books Invoice Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic "Create Draft Invoice" server action and a streaming "Billing Assistant" drawer to the monthly billing reports page, both backed by a shared Zoho Books tool layer that talks to Zoho via Membrane.

**Architecture:** A new `src/lib/zoho/` server-only module wraps a JWT-minted `MembraneClient` and exposes three Zoho Books operations (`createInvoice`, `listInvoices`, `getInvoice`). A pure `src/lib/billing/invoice-builder.ts` maps a finalized monthly billing report into Zoho line items. A new server action calls the wrapper. A streaming Next.js route handler (`/api/admin/billing/agent`) instantiates a request-scoped AI SDK v6 `ToolLoopAgent` with OpenRouter and returns `createAgentUIStreamResponse(...)` so the client receives a proper UI message stream with tools. A client `Sheet`-based drawer drives the chat UI via `useChat` from `@ai-sdk/react` and renders messages with the already-installed AI Elements primitives under `src/components/ai-elements/`. The existing actions component sprouts a button + drawer trigger.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Drizzle ORM 0.45 on Neon HTTP, `@membranehq/sdk` 0.28 (already installed), `jsonwebtoken` 9 (already installed), `ai` 6, `@openrouter/ai-sdk-provider` 2.9, `@ai-sdk/react` 3.x (already installed), AI Elements components already installed under `src/components/ai-elements/`, shadcn `Sheet` (already in repo), Better Auth (already wired via `requireAdmin()`), Zod 4 + `@t3-oss/env-nextjs` for env validation.

---

## Scope guardrails

- **No test framework in this repo.** The package.json scripts are `dev | build | start | lint | format | db:*`. Verification is via `pnpm build` (typecheck), `pnpm db:generate` / `pnpm db:migrate`, and manual UI smoke testing in `pnpm dev`. **Do not** add a test runner as part of this plan — follow the precedent set by `docs/superpowers/plans/2026-04-23-shipstation-v2-shipments-sync.md`.
- **Read AGENTS.md first.** Per the repo `CLAUDE.md`/`AGENTS.md`: "This is NOT the Next.js you know." Before writing route handlers or layouts, consult `node_modules/next/dist/docs/` for the version-pinned conventions. In particular, route handler `params` are `Promise`-shaped (see `src/app/api/admin/reports/monthly/[reportId]/csv/route.ts`).
- **Already-completed groundwork.** Commit `0108b6a` already added `additional_cartons_count` to the schema, the type, the form, and the action parser. Migration `drizzle/0010_flowery_scourge.sql` is on disk. **Do not re-add or rename** `additional_cartons_count`. The spec mentions it as `additional_carton_count` (singular) — the actual column is `additional_cartons_count` (plural). That naming is canonical for the rest of the plan.
- **Server-only Zoho code.** Every file in `src/lib/zoho/` and `src/lib/billing/invoice-builder.ts` runs on the server. Use `import "server-only"` at the top of each, matching the pattern in `src/lib/billing/reports.ts`.
- **Drafts only.** Never call `mark_as_sent`, `email`, or any "confirm" action — Zoho Books accepts the invoice as a draft and stays a draft. The system prompt enforces this for the agent.
- **Pre-execution prereq.** Before this plan can be merged, three Zoho Books contact IDs must be filled into `src/lib/zoho/contact-map.ts` (see Task 4, Step 2). The action throws at runtime if any value is empty — that's by design, but the file must be hand-edited before a real invoice is attempted.
- **Use AI SDK v6 compositions, not v5 habits.** For the assistant route, use `ToolLoopAgent` + `createAgentUIStreamResponse(...)` and a dotted model slug (`anthropic/claude-sonnet-4.6`). Do not wire a tool-using assistant with old `CoreMessage` types or raw text streams.
- **Use the installed AI Elements components.** The drawer should compose the local `Conversation`, `Message`, `MessageContent`, `MessageResponse`, `Tool`, and `PromptInput` components in `src/components/ai-elements/`; do not hand-roll markdown or tool-part rendering.
- **AI Elements requires Streamdown CSS discovery.** Add `@source "../node_modules/streamdown/dist/*.js";` to `src/app/globals.css` before relying on `MessageResponse`, otherwise markdown styling will be missing.
- **Membrane action names must be verified against the real connection.** Before implementing `src/lib/zoho/books.ts`, inspect the Zoho connection's available actions and output shapes. Keep constants for the resolved action IDs in code, but do not assume the defaults without checking.

---

## File structure — what each new file owns

**Created:**
- `src/lib/zoho/client.ts` — Server-only. `getMembraneClient()` mints a JWT from `MEMBRANE_WORKSPACE_KEY` + `MEMBRANE_WORKSPACE_SECRET` using `jsonwebtoken`, returns a configured `MembraneClient`. No fetch round-trip.
- `src/lib/zoho/books.ts` — Server-only. Three exported async functions: `createZohoInvoice`, `listZohoInvoices`, `getZohoInvoice`. Each calls a Membrane action via `client.action(...).run(...)`, scoped to `MEMBRANE_ZOHO_CONNECTION_ID`.
- `src/lib/zoho/contact-map.ts` — Plain config object: `{ dip: "...", fatass: "...", ryot: "..." }`. Committed (non-secret IDs).
- `src/lib/billing/invoice-builder.ts` — Pure function `buildInvoiceParams(report, accountSlug)`. No I/O. Maps a `MonthlyBillingReportDetail` into Zoho line items + invoice metadata.
- `src/app/api/admin/billing/agent/route.ts` — `POST`, `requireAdmin()`-gated. Reads `{ messages, reportId }`, hydrates fresh report context, instantiates a request-scoped `ToolLoopAgent` with four tools, and returns `createAgentUIStreamResponse(...)`.
- `src/components/admin/billing-assistant-drawer.tsx` — Client component. Wraps shadcn `Sheet` + `useChat` + AI Elements rendering. Watches the message stream for `createDraftInvoice` tool success and calls `router.refresh()`.

**Modified:**
- `src/env.ts` — Add four env vars (`MEMBRANE_WORKSPACE_KEY`, `MEMBRANE_WORKSPACE_SECRET`, `MEMBRANE_ZOHO_CONNECTION_ID`, `OPENROUTER_API_KEY`).
- `.env.example` — Document them.
- `src/db/schema/billing.ts` — Add nullable `zoho_invoice_id text` column.
- `src/lib/billing/reports.ts` — Select `zoho_invoice_id`, expose `zohoInvoiceId` on `MonthlyBillingReportDetail['report']`.
- `src/lib/billing/actions.ts` — Add `createZohoInvoiceAction({ reportId })`.
- `src/app/globals.css` — Add the required Streamdown source import for AI Elements.
- `src/components/admin/monthly-report-actions.tsx` — Add Create Draft Invoice / Open in Zoho Books / Assistant buttons; mount the drawer.
- `src/app/admin/reports/monthly/page.tsx` — Pass `zohoInvoiceId` (and the `accountSlug`/`periodLabel`/`reportStatus`) into `<MonthlyReportActions>`.

**Migration generated:**
- `drizzle/0011_*_zoho_invoice_id.sql` (filename auto-generated by drizzle-kit).

---

## Task 1: Add Membrane + OpenRouter env vars

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend `src/env.ts` with the four new server vars**

Replace the current `createEnv` call so the `server` and `runtimeEnv` blocks include the four new entries (preserving every existing entry):

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    ADMIN_EMAIL: z.email().optional(),
    SHIPSTATION_API_KEY_DIP: z.string().min(1),
    SHIPSTATION_API_KEY_FATASS: z.string().min(1),
    SHIPSTATION_API_KEY_RYOT: z.string().min(1),
    CRON_SECRET: z.string().min(16),
    BILLING_RATES_SPREADSHEET_ID: z.string().min(1).optional(),
    BILLING_RATES_GID: z.string().min(1).optional(),
    MEMBRANE_WORKSPACE_KEY: z.string().min(1),
    MEMBRANE_WORKSPACE_SECRET: z.string().min(1),
    MEMBRANE_ZOHO_CONNECTION_ID: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
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
    BILLING_RATES_SPREADSHEET_ID: process.env.BILLING_RATES_SPREADSHEET_ID,
    BILLING_RATES_GID: process.env.BILLING_RATES_GID,
    MEMBRANE_WORKSPACE_KEY: process.env.MEMBRANE_WORKSPACE_KEY,
    MEMBRANE_WORKSPACE_SECRET: process.env.MEMBRANE_WORKSPACE_SECRET,
    MEMBRANE_ZOHO_CONNECTION_ID: process.env.MEMBRANE_ZOHO_CONNECTION_ID,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  },
});
```

- [ ] **Step 2: Append documentation to `.env.example`**

Append at the bottom:

```
# Membrane workspace credentials. From the Membrane workspace settings.
# Used to mint short-lived JWTs that authenticate the SDK.
MEMBRANE_WORKSPACE_KEY=""
MEMBRANE_WORKSPACE_SECRET=""

# Membrane connection ID for the Zoho Books connection in this workspace.
MEMBRANE_ZOHO_CONNECTION_ID=""

# OpenRouter API key for the billing assistant agent.
# https://openrouter.ai/keys
OPENROUTER_API_KEY=""
```

- [ ] **Step 3: Populate local `.env` so the build passes**

The four new vars are required (`min(1)`), so the existing `.env` won't validate until they're set. For local development, place real values for the three Membrane vars and OpenRouter key. The build will fail if these aren't present.

- [ ] **Step 4: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`. The env validator will throw at build time if any required var is missing — that's the success signal.

- [ ] **Step 5: Commit**

```bash
git add src/env.ts .env.example
git commit -m "feat(env): add Membrane + OpenRouter env vars for Zoho invoice generation"
```

---

## Task 2: Add `zoho_invoice_id` column to `monthly_billing_report`

**Files:**
- Modify: `src/db/schema/billing.ts`
- Generated: `drizzle/0011_*.sql`

- [ ] **Step 1: Add `zohoInvoiceId` to the schema**

In `src/db/schema/billing.ts`, inside the `monthlyBillingReport` table definition, add the column right after `finalizedAt:` and before the closing `},` of the column block (so it lives next to the other status-tracking columns):

```ts
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    zohoInvoiceId: text("zoho_invoice_id"),
```

No default and no `.notNull()` — null means "not yet pushed to Zoho."

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file appears at `drizzle/0011_<adjective>_<noun>.sql` containing:

```sql
ALTER TABLE "monthly_billing_report" ADD COLUMN "zoho_invoice_id" text;
```

If extra unexpected statements appear (e.g. drops on unrelated tables), stop and reconcile the schema before proceeding — drizzle-kit is reflecting actual divergence.

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`
Expected: `Done` with no errors. The column is now live.

- [ ] **Step 4: Verify the type surface**

Run: `pnpm build`
Expected: `Compiled successfully`. The `MonthlyBillingReport` inferred type now includes `zohoInvoiceId: string | null`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/billing.ts drizzle/0011_*.sql drizzle/meta/_journal.json drizzle/meta/0011_snapshot.json
git commit -m "feat(billing): add zoho_invoice_id column to monthly_billing_report"
```

---

## Task 3: Surface `zohoInvoiceId` through the report read layer

**Files:**
- Modify: `src/lib/billing/reports.ts`

- [ ] **Step 1: Extend `MonthlyBillingReportDetail` to expose `zohoInvoiceId`**

In `src/lib/billing/reports.ts`, in the `MonthlyBillingReportDetail` type (currently around lines 231–258), add `zohoInvoiceId` to the `report` shape:

```ts
export type MonthlyBillingReportDetail = {
  report: {
    id: string;
    account: {
      id: string;
      slug: string;
      displayName: string;
    };
    periodStart: Date;
    periodEnd: Date;
    status: BillingReportStatus;
    sheetSourceHash: string;
    shipmentCount: number;
    unitsPickedTotal: number;
    packageCount: number;
    packagingCostTotal: number;
    unmatchedShipmentCount: number;
    manualMetrics: BillingManualMetrics;
    orderChannelSummary: {
      b2bShipmentCount: number;
      d2cShipmentCount: number;
      totalShipmentCount: number;
    } | null;
    generatedAt: Date;
    finalizedAt: Date | null;
    zohoInvoiceId: string | null;
  };
  shipments: MonthlyBillingReportDetailRow[];
};
```

- [ ] **Step 2: Select the column in `getMonthlyBillingReport`**

In the same file, find the `db.select({...})` call inside `getMonthlyBillingReport` (around line 579). Add `zohoInvoiceId: monthlyBillingReport.zohoInvoiceId,` immediately after `finalizedAt:` so the row carries the value forward. The existing return spread (`...reportRow`) will pick it up automatically — no other changes to the return statement are needed.

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/reports.ts
git commit -m "feat(billing): expose zohoInvoiceId on monthly report detail"
```

---

## Task 4: Add the static Zoho contact map

**Files:**
- Create: `src/lib/zoho/contact-map.ts`

- [ ] **Step 1: Create the file**

```ts
import "server-only";

import type { BillingAccountSlug } from "@/lib/billing/types";

/**
 * Static map from account slug → Zoho Books contact ID.
 *
 * These IDs are non-secret (they identify a customer record in our Zoho
 * Books org) but must be filled in by hand from the Zoho Books admin
 * UI before invoice creation will succeed.
 */
export const ZOHO_CONTACT_IDS: Record<BillingAccountSlug, string> = {
  dip: "",
  fatass: "",
  ryot: "",
};

export const getZohoContactIdForSlug = (slug: BillingAccountSlug): string => {
  const id = ZOHO_CONTACT_IDS[slug];
  if (!id) {
    throw new Error(
      `No Zoho Books contact ID configured for account "${slug}". ` +
        "Edit src/lib/zoho/contact-map.ts and fill in the ID from Zoho Books.",
    );
  }
  return id;
};
```

The `BillingAccountSlug` import keeps the keys in sync with `VendorSlug` ("dip" | "ryot" | "fatass"). Adding a new client triggers a TS error here.

- [ ] **Step 2: Fill in real contact IDs**

This step is required before any invoice can be created in production. For the plan execution itself, leave the strings empty — the typecheck still passes, and the action will throw a clear error at runtime if invoked. **Do not commit** real IDs until they're confirmed against Zoho Books.

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/zoho/contact-map.ts
git commit -m "feat(zoho): add account slug → Zoho Books contact ID map"
```

---

## Task 5: Create the Membrane client factory

**Files:**
- Create: `src/lib/zoho/client.ts`

- [ ] **Step 1: Write the client factory**

```ts
import "server-only";

import { MembraneClient } from "@membranehq/sdk";
import jwt from "jsonwebtoken";

import { env } from "@/env";

const TOKEN_TTL_SECONDS = 60 * 30;

const mintMembraneToken = (): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: env.MEMBRANE_WORKSPACE_KEY,
      sub: "3pl-dashboard-app",
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    },
    env.MEMBRANE_WORKSPACE_SECRET,
    { algorithm: "HS512" },
  );
};

/**
 * Returns an initialized server-side Membrane client.
 * Token is minted directly from workspace credentials — no fetch round-trip.
 * Tokens are short-lived (30 min); regenerate per request.
 */
export const getMembraneClient = (): MembraneClient =>
  new MembraneClient({ token: mintMembraneToken() });
```

The `iss` claim identifies which workspace is calling (Membrane verifies it against `MEMBRANE_WORKSPACE_SECRET`). `sub` identifies our app as a single internal customer — the spec calls for this.

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zoho/client.ts
git commit -m "feat(zoho): add server-side Membrane client factory"
```

---

## Task 6: Create the Zoho Books operations wrapper

**Files:**
- Create: `src/lib/zoho/books.ts`

- [ ] **Step 1: Verify the real Membrane action IDs for the Zoho connection**

Before writing the wrapper, inspect the actual Zoho Books connection and confirm the action IDs and response envelopes for:

- create invoice
- list invoices
- get invoice

If the connection exposes different keys than the defaults below, update the constants in the file to the real values discovered from the connection. Do not merge the implementation on blind assumptions here.

- [ ] **Step 2: Write the wrapper**

```ts
import "server-only";

import { env } from "@/env";

import { getMembraneClient } from "./client";

export type ZohoLineItem = {
  /** SKU as configured in Zoho Books. The Zoho create_invoice action
   *  looks the item up by `name`/`sku` to attach pricing/account mapping. */
  sku: string;
  name: string;
  description?: string;
  rate: number;
  quantity: number;
};

export type CreateZohoInvoiceParams = {
  customerId: string;
  date: string; // ISO date (YYYY-MM-DD)
  paymentTerms?: number; // days, e.g. 30
  reference: string;
  lineItems: ZohoLineItem[];
};

export type CreateZohoInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string;
  total: number;
  /** Best-effort Zoho UI URL. Constructed if the action does not return one. */
  invoiceUrl: string | null;
};

const ZOHO_INTEGRATION_KEY = "zoho-books";
const CREATE_INVOICE_KEY = "create-invoice";
const LIST_INVOICES_KEY = "list-invoices";
const GET_INVOICE_KEY = "get-invoice";

const buildInvoiceUrlGuess = (invoiceId: string): string =>
  `https://books.zoho.com/app#/invoices/${invoiceId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const pickInvoiceFromOutput = (output: unknown): Record<string, unknown> => {
  if (!isRecord(output)) {
    throw new Error("Zoho create_invoice returned an unexpected shape.");
  }
  const candidate = isRecord(output.invoice) ? output.invoice : output;
  return candidate;
};

export const createZohoInvoice = async (
  params: CreateZohoInvoiceParams,
): Promise<CreateZohoInvoiceResult> => {
  const client = getMembraneClient();
  const result = await client.action(CREATE_INVOICE_KEY).run(
    {
      customer_id: params.customerId,
      date: params.date,
      payment_terms: params.paymentTerms ?? 30,
      reference_number: params.reference,
      line_items: params.lineItems.map((item) => ({
        name: item.name,
        sku: item.sku,
        description: item.description,
        rate: item.rate,
        quantity: item.quantity,
      })),
    },
    {
      integrationKey: ZOHO_INTEGRATION_KEY,
      connectionId: env.MEMBRANE_ZOHO_CONNECTION_ID,
    },
  );

  const invoice = pickInvoiceFromOutput(result.output);
  const invoiceId = String(invoice.invoice_id ?? "");
  if (!invoiceId) {
    throw new Error("Zoho create_invoice did not return an invoice_id.");
  }

  return {
    invoiceId,
    invoiceNumber:
      typeof invoice.invoice_number === "string"
        ? invoice.invoice_number
        : null,
    status: typeof invoice.status === "string" ? invoice.status : "draft",
    total: typeof invoice.total === "number" ? invoice.total : 0,
    invoiceUrl: buildInvoiceUrlGuess(invoiceId),
  };
};

export type ZohoInvoiceSummary = {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string;
  total: number;
  date: string | null;
  reference: string | null;
};

export const listZohoInvoices = async (
  customerId: string,
): Promise<ZohoInvoiceSummary[]> => {
  const client = getMembraneClient();
  const result = await client.action(LIST_INVOICES_KEY).run(
    { customer_id: customerId, per_page: 25 },
    {
      integrationKey: ZOHO_INTEGRATION_KEY,
      connectionId: env.MEMBRANE_ZOHO_CONNECTION_ID,
    },
  );

  const output = result.output;
  const rows: unknown =
    isRecord(output) && Array.isArray(output.invoices)
      ? output.invoices
      : Array.isArray(output)
        ? output
        : [];

  return (rows as unknown[]).flatMap((row) => {
    if (!isRecord(row)) return [];
    const invoiceId = String(row.invoice_id ?? "");
    if (!invoiceId) return [];
    return [
      {
        invoiceId,
        invoiceNumber:
          typeof row.invoice_number === "string" ? row.invoice_number : null,
        status: typeof row.status === "string" ? row.status : "unknown",
        total: typeof row.total === "number" ? row.total : 0,
        date: typeof row.date === "string" ? row.date : null,
        reference:
          typeof row.reference_number === "string"
            ? row.reference_number
            : null,
      },
    ];
  });
};

export const getZohoInvoice = async (
  invoiceId: string,
): Promise<Record<string, unknown>> => {
  const client = getMembraneClient();
  const result = await client.action(GET_INVOICE_KEY).run(
    { invoice_id: invoiceId },
    {
      integrationKey: ZOHO_INTEGRATION_KEY,
      connectionId: env.MEMBRANE_ZOHO_CONNECTION_ID,
    },
  );
  const output = result.output;
  return pickInvoiceFromOutput(output);
};

export const buildZohoInvoiceUrl = (invoiceId: string): string =>
  buildInvoiceUrlGuess(invoiceId);
```

The action keys shown here are placeholders until you verify them against the real Zoho Books connection. Keep the constants, but set them to whatever the workspace actually exposes. Also, prefer returning the real invoice URL from Membrane if the action provides it; only fall back to a constructed URL if the connection output does not expose one.

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/zoho/books.ts
git commit -m "feat(zoho): add Zoho Books operations wrapper for invoice CRUD"
```

---

## Task 7: Enable AI Elements message styles

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the Streamdown source import**

Near the top of `src/app/globals.css`, alongside the existing imports, add:

```css
@source "../node_modules/streamdown/dist/*.js";
```

This is required by the installed `src/components/ai-elements/message.tsx` implementation so `MessageResponse` picks up the Streamdown styles.

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "chore(ai): enable Streamdown styles for AI Elements message rendering"
```

---

## Task 8: Create the invoice builder

**Files:**
- Create: `src/lib/billing/invoice-builder.ts`

- [ ] **Step 1: Write the pure builder**

```ts
import "server-only";

import type { MonthlyBillingReportDetail } from "@/lib/billing/reports";
import type { BillingAccountSlug } from "@/lib/billing/types";
import { getZohoContactIdForSlug } from "@/lib/zoho/contact-map";
import type {
  CreateZohoInvoiceParams,
  ZohoLineItem,
} from "@/lib/zoho/books";

/**
 * Per-line rate sheet. All 11 lines are emitted on every invoice so
 * the draft is uniform; quantity-zero lines remain on the draft for
 * manual edits in Zoho Books.
 */
const LINE_RATES = {
  storageSmall: 1.5,
  storageMedium: 1.75,
  storageLarge: 2.25,
  storageCarton: 2.75,
  orderRetail: 1.0,
  orderWholesale: 3.0,
  pickPerItem: 0.3,
  receivingCarton: 2.75,
  returnRetail: 4.0,
  specialHourly: 50.0,
} as const;

const SHORT_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

const formatReference = (periodStart: Date): string => {
  const month = SHORT_MONTH.format(periodStart);
  const year = periodStart.getUTCFullYear();
  return `3PL - ${month} ${year}`;
};

const today = (): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const resolveRetailQty = (
  report: MonthlyBillingReportDetail["report"],
): number =>
  report.orderChannelSummary?.d2cShipmentCount ?? report.shipmentCount;

const resolveWholesaleQty = (
  report: MonthlyBillingReportDetail["report"],
): number => report.orderChannelSummary?.b2bShipmentCount ?? 0;

export const buildInvoiceParams = (
  detail: MonthlyBillingReportDetail,
  accountSlug: BillingAccountSlug,
): CreateZohoInvoiceParams => {
  const report = detail.report;
  const lineItems: ZohoLineItem[] = [
    {
      sku: "3PL-STORAGE-SM",
      name: "Storage – Small Bin",
      rate: LINE_RATES.storageSmall,
      quantity: report.manualMetrics.smallBinCount,
    },
    {
      sku: "3PL-STORAGE-MD",
      name: "Storage – Medium Bin",
      rate: LINE_RATES.storageMedium,
      quantity: report.manualMetrics.mediumBinCount,
    },
    {
      sku: "3PL-STORAGE-LG",
      name: "Storage – Large Bin",
      rate: LINE_RATES.storageLarge,
      quantity: report.manualMetrics.largeBinCount,
    },
    {
      sku: "3PL-STORAGE-CARTON",
      name: "Storage – Carton",
      rate: LINE_RATES.storageCarton,
      quantity: report.manualMetrics.additionalCartonsCount,
    },
    {
      sku: "3PL-ORDER-RETAIL",
      name: "Order Processing – Retail",
      rate: LINE_RATES.orderRetail,
      quantity: resolveRetailQty(report),
    },
    {
      sku: "3PL-ORDER-WHOLESALE-PACKAGE",
      name: "Order Processing – Wholesale",
      rate: LINE_RATES.orderWholesale,
      quantity: resolveWholesaleQty(report),
    },
    {
      sku: "3PL-PICK-PER-ITEM-STANDARD",
      name: "Pick & Pack Fee – Per Item",
      rate: LINE_RATES.pickPerItem,
      quantity: report.unitsPickedTotal,
    },
    {
      sku: "3PL-MATERIALS-COST",
      name: "Materials / Packaging",
      rate: report.packagingCostTotal,
      quantity: 1,
    },
    {
      sku: "3PL-RECV-CARTON",
      name: "Receiving – Carton",
      rate: LINE_RATES.receivingCarton,
      quantity: report.manualMetrics.cartonsReceivedTotal,
    },
    {
      sku: "3PL-RETURN-RETAIL",
      name: "Return Processing – Retail",
      rate: LINE_RATES.returnRetail,
      quantity: report.manualMetrics.retailReturnsTotal,
    },
    {
      sku: "3PL-SPECIAL-HOURLY",
      name: "Special Project – Per Hour",
      rate: LINE_RATES.specialHourly,
      quantity: report.manualMetrics.specialProjectHours,
    },
  ];

  return {
    customerId: getZohoContactIdForSlug(accountSlug),
    date: today(),
    paymentTerms: 30,
    reference: formatReference(report.periodStart),
    lineItems,
  };
};
```

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/invoice-builder.ts
git commit -m "feat(billing): add pure invoice-builder mapping report → Zoho line items"
```

---

## Task 9: Add `createZohoInvoiceAction`

**Files:**
- Modify: `src/lib/billing/actions.ts`

- [ ] **Step 1: Add the new action and write a tiny helper**

Append the following at the bottom of `src/lib/billing/actions.ts` (the file already has the `"use server"` directive and `requireAdmin` import):

```ts
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { monthlyBillingReport } from "@/db/schema/billing";
import { buildInvoiceParams } from "@/lib/billing/invoice-builder";
import { getMonthlyBillingReport } from "@/lib/billing/reports";
import type { BillingAccountSlug } from "@/lib/billing/types";
import { isVendorSlug } from "@/lib/shipments/vendor-colors";
import { buildZohoInvoiceUrl, createZohoInvoice } from "@/lib/zoho/books";

export type CreateZohoInvoiceActionResult =
  | { ok: true; invoiceId: string; invoiceUrl: string }
  | { ok: false; message: string };

export const createZohoInvoiceAction = async ({
  reportId,
}: {
  reportId: string;
}): Promise<CreateZohoInvoiceActionResult> => {
  await requireAdmin();

  try {
    const detail = await getMonthlyBillingReport({ reportId });

    if (detail.report.status !== "finalized") {
      return {
        ok: false,
        message: "Finalize the report before creating a Zoho invoice.",
      };
    }

    if (detail.report.zohoInvoiceId) {
      return {
        ok: true,
        invoiceId: detail.report.zohoInvoiceId,
        invoiceUrl: buildZohoInvoiceUrl(detail.report.zohoInvoiceId),
      };
    }

    const slug = detail.report.account.slug;
    if (!isVendorSlug(slug)) {
      return {
        ok: false,
        message: `Account slug "${slug}" is not a configured billing account.`,
      };
    }

    const params = buildInvoiceParams(detail, slug as BillingAccountSlug);
    const invoice = await createZohoInvoice(params);

    await db
      .update(monthlyBillingReport)
      .set({ zohoInvoiceId: invoice.invoiceId })
      .where(eq(monthlyBillingReport.id, reportId));

    revalidateBillingPages();

    return {
      ok: true,
      invoiceId: invoice.invoiceId,
      invoiceUrl: invoice.invoiceUrl ?? buildZohoInvoiceUrl(invoice.invoiceId),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to create Zoho invoice.",
    };
  }
};
```

The imports go at the top of the file with the other imports — group them logically next to the existing ones. (Drizzle's `eq` and `db` may need to be added; they're not currently imported in actions.ts.)

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/actions.ts
git commit -m "feat(billing): add createZohoInvoiceAction server action"
```

---

## Task 10: Verify the installed AI SDK UI dependencies

**Files:** None.

- [ ] **Step 1: Confirm the repo is on the correct AI SDK UI package versions**

Check `package.json` and confirm:

- `ai` is on v6
- `@ai-sdk/react` is on v3.x
- the AI Elements components already exist under `src/components/ai-elements/`

At the time this plan was revised, the repo already had:

- `"ai": "^6.0.175"`
- `"@ai-sdk/react": "^3.0.177"`
- installed AI Elements components including `conversation.tsx`, `message.tsx`, `prompt-input.tsx`, and `tool.tsx`

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

Run: `node -e "console.log(Object.keys(require('@ai-sdk/react')))"` (only if it doesn't fail TypeScript build).
Expected: `useChat` appears in the export list.

- [ ] **Step 3: Commit**

No commit is needed if nothing changed. If you had to repair dependency versions or reinstall missing AI Elements components, commit those changes with a dependency-focused message.

---

## Task 11: Create the agent API route

**Files:**
- Create: `src/app/api/admin/billing/agent/route.ts`

- [ ] **Step 1: Write the streaming route with `ToolLoopAgent`**

```ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  createAgentUIStreamResponse,
  stepCountIs,
  tool,
  ToolLoopAgent,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { env } from "@/env";
import { requireAdmin } from "@/lib/auth/access";
import { createZohoInvoiceAction } from "@/lib/billing/actions";
import { getMonthlyBillingReport } from "@/lib/billing/reports";
import {
  buildZohoInvoiceUrl,
  getZohoInvoice,
  listZohoInvoices,
} from "@/lib/zoho/books";
import { getZohoContactIdForSlug } from "@/lib/zoho/contact-map";
import { isVendorSlug } from "@/lib/shipments/vendor-colors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  reportId: z.string().min(1),
  messages: z.array(z.any()),
});

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const periodFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

const buildSystemPrompt = (
  detail: Awaited<ReturnType<typeof getMonthlyBillingReport>>,
): string => {
  const r = detail.report;
  const channel = r.orderChannelSummary
    ? `B2B ${r.orderChannelSummary.b2bShipmentCount} / D2C ${r.orderChannelSummary.d2cShipmentCount} / Total ${r.orderChannelSummary.totalShipmentCount}`
    : `Total ${r.shipmentCount}`;

  return [
    "You are the billing assistant for the 3PL admin dashboard. Help an internal operator review and manage the current month's billing report and create Zoho Books draft invoices.",
    "",
    "Rules:",
    "- Invoices are ALWAYS drafts. Never confirm, send, or email an invoice.",
    "- Refuse to create an invoice if the report is not finalized.",
    "- Be direct and operational. No filler, no apologies.",
    "- Use tools to read live data; never invent invoice IDs or totals.",
    "",
    "Current report:",
    `- Client: ${r.account.displayName} (${r.account.slug})`,
    `- Period: ${periodFmt.format(r.periodStart)}`,
    `- Status: ${r.status}${r.zohoInvoiceId ? ` (Zoho invoice ${r.zohoInvoiceId})` : ""}`,
    `- Shipments: ${channel}`,
    `- Units picked: ${r.unitsPickedTotal}`,
    `- Packaging total: ${currencyFmt.format(r.packagingCostTotal)}`,
    `- Unmatched shipments: ${r.unmatchedShipmentCount}`,
    `- Storage bins: small ${r.manualMetrics.smallBinCount}, medium ${r.manualMetrics.mediumBinCount}, large ${r.manualMetrics.largeBinCount}`,
    `- Storage cartons: ${r.manualMetrics.additionalCartonsCount}`,
    `- Cartons received: ${numberFmt.format(r.manualMetrics.cartonsReceivedTotal)}`,
    `- Retail returns: ${numberFmt.format(r.manualMetrics.retailReturnsTotal)}`,
    `- Special project hours: ${numberFmt.format(r.manualMetrics.specialProjectHours)}`,
  ].join("\n");
};

const buildAgent = ({
  detail,
  reportId,
  customerId,
}: {
  detail: Awaited<ReturnType<typeof getMonthlyBillingReport>>;
  reportId: string;
  customerId: string | null;
}) => {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

  return new ToolLoopAgent({
    model: openrouter("anthropic/claude-sonnet-4.6"),
    instructions: buildSystemPrompt(detail),
    stopWhen: stepCountIs(5),
    tools: {
      createDraftInvoice: tool({
        description:
          "Create a Zoho Books draft invoice from the current finalized monthly report. Refuses if the report is not finalized or already has an invoice.",
        inputSchema: z.object({}),
        execute: async () => {
          const result = await createZohoInvoiceAction({ reportId });
          if (!result.ok) {
            return { ok: false, message: result.message };
          }
          return {
            ok: true,
            invoiceId: result.invoiceId,
            invoiceUrl: result.invoiceUrl,
            message: "Draft invoice created in Zoho Books.",
          };
        },
      }),
      listRecentInvoices: tool({
        description:
          "List the most recent Zoho Books invoices for the current client.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!customerId) {
            return {
              ok: false,
              message: "No Zoho contact ID configured for this client.",
            };
          }
          const invoices = await listZohoInvoices(customerId);
          return { ok: true, invoices };
        },
      }),
      getInvoiceDetails: tool({
        description: "Retrieve a single Zoho Books invoice by its ID.",
        inputSchema: z.object({
          invoiceId: z.string().min(1),
        }),
        execute: async ({ invoiceId }) => {
          const invoice = await getZohoInvoice(invoiceId);
          return {
            ok: true,
            invoice,
            invoiceUrl: buildZohoInvoiceUrl(invoiceId),
          };
        },
      }),
      getReportData: tool({
        description:
          "Return the structured monthly billing report data for ad-hoc metric questions.",
        inputSchema: z.object({}),
        execute: async () => ({
          ok: true,
          report: {
            ...detail.report,
            periodStart: detail.report.periodStart.toISOString(),
            periodEnd: detail.report.periodEnd.toISOString(),
            generatedAt: detail.report.generatedAt.toISOString(),
            finalizedAt: detail.report.finalizedAt?.toISOString() ?? null,
          },
          shipmentCount: detail.shipments.length,
        }),
      }),
    },
  });
};

export const POST = async (request: Request) => {
  await requireAdmin();

  const body = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { reportId, messages } = parsed.data;

  const detail = await getMonthlyBillingReport({ reportId });
  const accountSlug = detail.report.account.slug;
  const customerId = isVendorSlug(accountSlug)
    ? getZohoContactIdForSlug(accountSlug)
    : null;

  return createAgentUIStreamResponse({
    agent: buildAgent({ detail, reportId, customerId }),
    uiMessages: messages as UIMessage[],
  });
};
```

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`. The important v6 checks here are: `ToolLoopAgent` and `createAgentUIStreamResponse` resolve from `ai`, the model slug uses dots (`anthropic/claude-sonnet-4.6`), and the route no longer manually converts messages or returns a raw text stream.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/billing/agent/route.ts
git commit -m "feat(billing): add streaming billing-assistant agent route with Zoho tools"
```

---

## Task 12: Build the billing assistant drawer

**Files:**
- Create: `src/components/admin/billing-assistant-drawer.tsx`

- [ ] **Step 1: Write the drawer with AI Elements**

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { BillingAccountSlug, BillingReportStatus } from "@/lib/billing/types";

type BillingAssistantDrawerProps = {
  reportId: string;
  accountSlug: BillingAccountSlug;
  reportStatus: BillingReportStatus | null;
  periodLabel: string;
  zohoInvoiceId: string | null;
};

const isToolPart = (part: UIMessage["parts"][number]): part is ToolPart =>
  part.type === "dynamic-tool" || part.type.startsWith("tool-");

const hasCreatedInvoice = (messages: UIMessage[]): string | null => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (
        part.type === "tool-createDraftInvoice" &&
        part.state === "output-available" &&
        part.output &&
        typeof part.output === "object" &&
        "ok" in part.output &&
        (part.output as { ok: unknown }).ok === true &&
        "invoiceId" in part.output
      ) {
        return String((part.output as { invoiceId: unknown }).invoiceId);
      }
    }
  }
  return null;
};

const renderPart = (part: UIMessage["parts"][number], key: string) => {
  if (part.type === "text") {
    return <MessageResponse key={key}>{part.text}</MessageResponse>;
  }

  if (isToolPart(part)) {
    return (
      <Tool key={key}>
        {part.type === "dynamic-tool" ? (
          <ToolHeader
            state={part.state}
            toolName={part.toolName}
            type={part.type}
          />
        ) : (
          <ToolHeader state={part.state} type={part.type} />
        )}
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput errorText={part.errorText} output={part.output} />
        </ToolContent>
      </Tool>
    );
  }

  return null;
};

export const BillingAssistantDrawer = ({
  reportId,
  accountSlug,
  reportStatus,
  periodLabel,
  zohoInvoiceId,
}: BillingAssistantDrawerProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const seenInvoiceRef = useRef<string | null>(zohoInvoiceId);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/admin/billing/agent",
        body: { reportId },
      }),
    [reportId],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  useEffect(() => {
    const invoiceId = hasCreatedInvoice(messages as UIMessage[]);
    if (invoiceId && invoiceId !== seenInvoiceRef.current) {
      seenInvoiceRef.current = invoiceId;
      router.refresh();
    }
  }, [messages, router]);

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim()) return;
    setInput("");
    await sendMessage({ text: message.text });
  };

  const greeting = `Ask about ${accountSlug.toUpperCase()} for ${periodLabel}. Status: ${reportStatus ?? "no report"}.`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          Assistant
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Billing Assistant</SheetTitle>
          <SheetDescription>{greeting}</SheetDescription>
        </SheetHeader>

        <Conversation className="min-h-0 flex-1 px-6 pb-2">
          <ConversationContent className="pt-4">
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Start a billing conversation"
                description='Try "create the draft invoice", "what is the packaging total?", or "list recent invoices for this client".'
              />
            ) : (
              messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, index) =>
                      renderPart(part, `${message.id}-${index}`),
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {error ? (
          <p className="px-6 pb-2 text-xs text-destructive">{error.message}</p>
        ) : null}

        <PromptInput
          className="border-t px-6 py-4"
          onSubmit={handleSubmit}
        >
          <PromptInputTextarea
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Ask about this month's billing…"
            value={input}
          />
          <PromptInputSubmit onStop={stop} status={status} />
        </PromptInput>
      </SheetContent>
    </Sheet>
  );
};
```

This composition uses the installed AI Elements building blocks instead of raw `<p>` text and JSON dumps. `MessageResponse` renders markdown correctly, while `Tool`/`ToolHeader`/`ToolContent`/`ToolInput`/`ToolOutput` render tool calls and results from the AI SDK UI message stream.

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`. The important checks are: `DefaultChatTransport` accepts the custom `body: { reportId }`, the AI Elements imports resolve from `src/components/ai-elements/`, and markdown/tool output is no longer rendered as raw strings / raw JSON.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/billing-assistant-drawer.tsx
git commit -m "feat(billing): add billing-assistant drawer with useChat + Zoho tools"
```

---

## Task 13: Wire the new buttons into `MonthlyReportActions`

**Files:**
- Modify: `src/components/admin/monthly-report-actions.tsx`

- [ ] **Step 1: Replace the file with the extended version**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BillingAssistantDrawer } from "@/components/admin/billing-assistant-drawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  createZohoInvoiceAction,
  finalizeMonthlyBillingReportAction,
  generateMonthlyBillingReportAction,
  type CreateZohoInvoiceActionResult,
  type MonthlyBillingActionResult,
} from "@/lib/billing/actions";
import { buildZohoInvoiceUrl } from "@/lib/zoho/books";
import type {
  BillingAccountSlug,
  BillingReportStatus,
} from "@/lib/billing/types";

type MonthlyReportActionsProps = {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
  reportId: string | null;
  reportStatus: BillingReportStatus | null;
  zohoInvoiceId: string | null;
  periodLabel: string;
  canFinalize: boolean;
  sheetConfigured: boolean;
};

type AnyResult =
  | { kind: "report"; result: MonthlyBillingActionResult }
  | { kind: "invoice"; result: CreateZohoInvoiceActionResult };

export const MonthlyReportActions = ({
  accountSlug,
  year,
  month,
  reportId,
  reportStatus,
  zohoInvoiceId,
  periodLabel,
  canFinalize,
  sheetConfigured,
}: MonthlyReportActionsProps) => {
  const router = useRouter();
  const [isGenerating, startGenerating] = useTransition();
  const [isFinalizing, startFinalizing] = useTransition();
  const [isCreatingInvoice, startCreatingInvoice] = useTransition();
  const [latest, setLatest] = useState<AnyResult | null>(null);

  const handleGenerate = () => {
    startGenerating(async () => {
      const result = await generateMonthlyBillingReportAction({
        accountSlug,
        year,
        month,
      });
      setLatest({ kind: "report", result });
      if (result.ok) router.refresh();
    });
  };

  const handleFinalize = () => {
    if (!reportId) return;
    startFinalizing(async () => {
      const result = await finalizeMonthlyBillingReportAction({ reportId });
      setLatest({ kind: "report", result });
      if (result.ok) router.refresh();
    });
  };

  const handleCreateInvoice = () => {
    if (!reportId) return;
    startCreatingInvoice(async () => {
      const result = await createZohoInvoiceAction({ reportId });
      setLatest({ kind: "invoice", result });
      if (result.ok) router.refresh();
    });
  };

  const generateLabel =
    reportStatus === "draft" ? "Regenerate draft" : "Generate draft";
  const finalizeDisabled =
    !reportId || !canFinalize || reportStatus === "finalized" || isFinalizing;
  const showCreateInvoice =
    reportStatus === "finalized" && reportId && !zohoInvoiceId;
  const showOpenInvoice =
    reportStatus === "finalized" && reportId && zohoInvoiceId;

  const banner = (() => {
    if (!latest) return null;
    if (latest.kind === "report") {
      const r = latest.result;
      return (
        <Alert variant={r.ok ? "default" : "destructive"}>
          <AlertTitle>{r.ok ? "Report updated" : "Action failed"}</AlertTitle>
          <AlertDescription>{r.message}</AlertDescription>
        </Alert>
      );
    }
    const r = latest.result;
    return r.ok ? (
      <Alert>
        <AlertTitle>Zoho draft invoice created</AlertTitle>
        <AlertDescription>
          Invoice ID {r.invoiceId} —{" "}
          <a
            href={r.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            open in Zoho Books
          </a>
          .
        </AlertDescription>
      </Alert>
    ) : (
      <Alert variant="destructive">
        <AlertTitle>Invoice creation failed</AlertTitle>
        <AlertDescription>{r.message}</AlertDescription>
      </Alert>
    );
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={
            !sheetConfigured || isGenerating || reportStatus === "finalized"
          }
          onClick={handleGenerate}
        >
          {isGenerating ? "Generating…" : generateLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={finalizeDisabled}
          onClick={handleFinalize}
        >
          {isFinalizing ? "Finalizing…" : "Finalize report"}
        </Button>
        {reportId ? (
          <Button asChild type="button" variant="outline">
            <a href={`/api/admin/reports/monthly/${reportId}/csv`}>
              Export CSV
            </a>
          </Button>
        ) : null}

        {showCreateInvoice ? (
          <Button
            type="button"
            variant="default"
            disabled={isCreatingInvoice}
            onClick={handleCreateInvoice}
          >
            {isCreatingInvoice ? "Creating…" : "Create draft invoice"}
          </Button>
        ) : null}

        {showOpenInvoice ? (
          <Button asChild type="button" variant="outline">
            <a
              href={buildZohoInvoiceUrl(zohoInvoiceId as string)}
              target="_blank"
              rel="noreferrer"
            >
              Open in Zoho Books
            </a>
          </Button>
        ) : null}

        {reportId ? (
          <BillingAssistantDrawer
            reportId={reportId}
            accountSlug={accountSlug}
            reportStatus={reportStatus}
            periodLabel={periodLabel}
            zohoInvoiceId={zohoInvoiceId}
          />
        ) : null}
      </div>

      {banner}
    </div>
  );
};
```

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`. The new prop set is type-checked against the page in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/monthly-report-actions.tsx
git commit -m "feat(billing): add Zoho invoice + assistant buttons to MonthlyReportActions"
```

---

## Task 14: Pass new props from the page

**Files:**
- Modify: `src/app/admin/reports/monthly/page.tsx`

- [ ] **Step 1: Update the `<MonthlyReportActions>` call site**

In `src/app/admin/reports/monthly/page.tsx`, find the existing block (around lines 223–231) and replace it with:

```tsx
<MonthlyReportActions
  accountSlug={selectedAccount.slug as BillingAccountSlug}
  year={selectedMonth.year}
  month={selectedMonth.month}
  reportId={currentReport?.report.id ?? null}
  reportStatus={currentReport?.report.status ?? null}
  zohoInvoiceId={currentReport?.report.zohoInvoiceId ?? null}
  periodLabel={
    currentReport
      ? monthFormatter.format(currentReport.report.periodStart)
      : `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}`
  }
  canFinalize={canFinalize}
  sheetConfigured={sheetConfigured}
/>
```

- [ ] **Step 2: Add the type import**

At the top of the same file, alongside the existing imports, add:

```ts
import type { BillingAccountSlug } from "@/lib/billing/types";
```

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/reports/monthly/page.tsx
git commit -m "feat(billing): wire zohoInvoiceId + accountSlug into MonthlyReportActions"
```

---

## Task 15: End-to-end smoke test

**Files:** None.

This task verifies the full feature in a browser. It does not write code or run tests.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: Next dev server boots on `http://localhost:3000` with no env validation errors.

- [ ] **Step 2: Navigate to the monthly reports page as an admin**

Sign in as an admin user, then visit `http://localhost:3000/admin/reports/monthly`. Pick a client + month that has a draft report.
Expected: the page renders, "Create draft invoice" is **not** visible (status is draft), "Assistant" button **is** visible if a report exists.

- [ ] **Step 3: Open the assistant drawer**

Click "Assistant". Type "what's the packaging total?" and submit.
Expected: drawer opens from the right, the agent streams a response that quotes the report's `packagingCostTotal`, markdown renders cleanly via AI Elements, and the Network tab shows a POST to `/api/admin/billing/agent` with chunked transfer.

- [ ] **Step 4: Try to create an invoice on a draft report**

Type "create the draft invoice".
Expected: agent refuses, citing that the report must be finalized.

- [ ] **Step 5: Finalize the report and create the invoice via the button**

Close the drawer. Resolve any unmatched shipments, click "Finalize report", then click "Create draft invoice".
Expected: a green banner appears with the invoice ID + a link. The button toggles to "Open in Zoho Books".

- [ ] **Step 6: Re-open the drawer and ask for recent invoices**

Type "list recent invoices for this client".
Expected: agent calls `listRecentInvoices` and renders the result. The just-created invoice is in the list with status `draft`.

- [ ] **Step 7: Confirm the page state syncs after agent-triggered creation**

(Optional, requires a second draft report on a different month.) Finalize that second report, open the assistant on it, ask "create the draft invoice".
Expected: agent reports success; the page auto-refreshes (via `router.refresh()` triggered by the `useEffect` watcher); the "Create draft invoice" button is replaced by "Open in Zoho Books" without a manual reload.

- [ ] **Step 8: Document any deviations**

If any step fails, capture the error in the commit log of the next fix and re-run from the failing step. **Do not** mark the plan complete until steps 1–7 all pass on at least one client.

---

## Self-review notes

- **Spec coverage:** Every spec section maps to a task — env vars (1), schema (2, 3), `client.ts` (5), `books.ts` (6), `contact-map.ts` (4), AI Elements styling (`globals.css`, 7), `invoice-builder.ts` (8), `createZohoInvoiceAction` (9), agent route (11), drawer (12), button states (13), page wiring (14). Spec sections "Constraints" and "Out of Scope" do not require code; the action and agent enforce the constraints.
- **Type names line up across tasks:** `MonthlyBillingReportDetail`, `BillingAccountSlug`, `CreateZohoInvoiceParams`, `CreateZohoInvoiceActionResult`, `ZohoLineItem`, `BillingAssistantDrawer`, `buildZohoInvoiceUrl`, `getZohoContactIdForSlug` — all defined in the task that introduces them, all referenced consistently.
- **Already-done work is not re-done:** the `additional_cartons_count` column, type field, form field, and parsing logic from commit `0108b6a` are preserved as-is. Only `zoho_invoice_id` is added to the schema. The form labels diverge slightly from the spec (current: "Additional cartons" / "Additional storage cartons on hand at month end"; spec wanted "Storage cartons" / "Full cartons in storage at month end") — this is left as-is per "Don't refactor beyond the task." If a future PR wants to align labels, it's a one-line change.
- **No stale AI SDK guidance remains.** The plan now assumes `@ai-sdk/react` 3.x, AI SDK v6 UI message streams, a dotted OpenRouter model slug, and AI Elements-based rendering rather than raw markdown / JSON dumps.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-zoho-invoice-generation.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
