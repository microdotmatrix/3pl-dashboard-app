# Revert Finalized Monthly Billing Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an end-to-end "revert finalization" path so an ops manager can undo a mistakenly-finalized monthly billing report, void the linked Zoho invoice, edit the metrics, and create a fresh invoice.

**Architecture:** A single new server action (`revertMonthlyBillingReportAction`) calls a new core function (`revertMonthlyBillingReport`) which voids the Zoho invoice (when one exists), then runs a `SELECT … FOR UPDATE` transaction that flips the report back to `draft`, clears `finalizedAt` and `zohoInvoiceId`, and writes audit fields (`lastRevertedAt`, `lastRevertedBy`, `lastRevertReason`, plus an append to `previousZohoInvoiceIds`). The action is exposed through an alert-dialog button on the report-actions toolbar and through an explicit-confirmation tool on the BillingAssistantDrawer's AI agent.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM (postgres-core, Neon serverless), Better-Auth for sessions, Membrane for Zoho proxy, AI SDK v6 for the agent, shadcn/ui (alert-dialog, button, textarea), sonner toasts, biome for lint, drizzle-kit for migrations. **No test framework** — verification is type-check + lint + manual run-through (see Task 9).

**Spec:** `docs/superpowers/specs/2026-05-07-revert-finalized-report-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/db/schema/billing.ts` | Modify | Add 4 columns to `monthly_billing_report`; FK on `lastRevertedBy` → `user.id` |
| `drizzle/0XXX_<auto-name>.sql` | Create (auto) | Generated migration for the schema change |
| `src/lib/zoho/books.ts` | Modify | Add exported `voidZohoInvoice(invoiceId)` helper |
| `src/lib/billing/reports.ts` | Modify | Extend `MonthlyBillingReportDetail` type and `getMonthlyBillingReport` query (add user join + new fields); add `revertMonthlyBillingReport` core function |
| `src/lib/billing/actions.ts` | Modify | Add `revertMonthlyBillingReportAction` server action wrapper |
| `src/components/admin/monthly-report-actions.tsx` | Modify | Add "Revert finalization" button + AlertDialog with reason textarea |
| `src/app/admin/reports/monthly/page.tsx` | Modify | Render revert-history strip below metrics when present; pass new fields through to `MonthlyReportActions` if needed |
| `src/app/api/admin/billing/agent/route.ts` | Modify | Add `revertMonthlyBillingReport` agent tool with `confirm: z.literal("CONFIRM REVERT")` guard; append revert paragraph to system prompt; thread session user id |

---

## Task 1: Schema columns + migration

**Files:**
- Modify: `src/db/schema/billing.ts`
- Create (auto): a new file under `drizzle/`

- [ ] **Step 1: Edit schema**

In `src/db/schema/billing.ts`, add the import for `user` (currently absent) right after the existing import block:

```ts
import { user } from "./auth";
```

Then in the `monthlyBillingReport` table definition, replace the line:

```ts
    zohoInvoiceId: text("zoho_invoice_id"),
  },
```

with:

```ts
    zohoInvoiceId: text("zoho_invoice_id"),
    previousZohoInvoiceIds: jsonb("previous_zoho_invoice_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    lastRevertedAt: timestamp("last_reverted_at", { withTimezone: true }),
    lastRevertedBy: text("last_reverted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    lastRevertReason: text("last_revert_reason"),
  },
```

`jsonb`, `text`, `timestamp` are already imported at the top of the file.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`

Expected: a new file appears under `drizzle/` (e.g. `drizzle/0009_<auto-name>.sql`) and `drizzle/meta/_journal.json` updates. The SQL should `ALTER TABLE "monthly_billing_report"` to add the four columns plus a foreign key on `last_reverted_by`.

Read the generated SQL file. Verify it contains:
- `ADD COLUMN "previous_zoho_invoice_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`
- `ADD COLUMN "last_reverted_at" timestamp with time zone`
- `ADD COLUMN "last_reverted_by" text`
- `ADD COLUMN "last_revert_reason" text`
- A foreign-key constraint referencing `"user"."id"` with `ON DELETE SET NULL`

If anything looks off (e.g. missing default, wrong nullability), fix the schema and regenerate. Do not hand-edit the SQL.

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`

Expected output: drizzle-kit reports the migration applied without errors. If the migration fails, do **not** retry destructively — read the error, fix the schema definition, regenerate, and re-apply.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors. The new columns flow through `typeof monthlyBillingReport.$inferSelect`, so `MonthlyBillingReport` automatically has the four new fields.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/billing.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(db): add revert audit columns to monthly_billing_report

previousZohoInvoiceIds (jsonb), lastRevertedAt, lastRevertedBy (FK on
user with set-null), lastRevertReason. Backs the revert-finalization
flow described in 2026-05-07-revert-finalized-report-design.md.
EOF
)"
```

---

## Task 2: Extend report detail type + query

**Files:**
- Modify: `src/lib/billing/reports.ts`

This task wires the new schema columns into the read path so downstream UI/agent code can see them. Done before adding the revert function so subsequent tasks consume the same enriched detail shape.

- [ ] **Step 1: Add the `user` import**

At the top of `src/lib/billing/reports.ts`, the existing imports include:

```ts
import {
  shipstationAccount,
  shipstationShipment,
} from "@/db/schema/shipstation";
```

Add this line directly below it:

```ts
import { user } from "@/db/schema/auth";
```

- [ ] **Step 2: Extend the `MonthlyBillingReportDetail` type**

Find the `report` shape inside `MonthlyBillingReportDetail` (around lines 232-257 — the object literal with `id`, `account`, `periodStart`, ..., `zohoInvoiceId: string | null;`).

Replace the line `zohoInvoiceId: string | null;` and the closing brace `};` of the `report` shape with:

```ts
    zohoInvoiceId: string | null;
    previousZohoInvoiceIds: string[];
    lastRevertedAt: Date | null;
    lastRevertedBy: string | null;
    lastRevertedByName: string | null;
    lastRevertReason: string | null;
  };
```

- [ ] **Step 3: Extend the `getMonthlyBillingReport` query**

Find the `db.select({ … })` block inside `getMonthlyBillingReport` (around line 574). The existing select ends with the `account: { … }` sub-object and the `.from(monthlyBillingReport).innerJoin(shipstationAccount, …)` chain.

Replace:

```ts
      zohoInvoiceId: monthlyBillingReport.zohoInvoiceId,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(monthlyBillingReport)
    .innerJoin(
      shipstationAccount,
      eq(monthlyBillingReport.accountId, shipstationAccount.id),
    )
    .where(eq(monthlyBillingReport.id, reportId))
    .limit(1);
```

with:

```ts
      zohoInvoiceId: monthlyBillingReport.zohoInvoiceId,
      previousZohoInvoiceIds: monthlyBillingReport.previousZohoInvoiceIds,
      lastRevertedAt: monthlyBillingReport.lastRevertedAt,
      lastRevertedBy: monthlyBillingReport.lastRevertedBy,
      lastRevertReason: monthlyBillingReport.lastRevertReason,
      reverterName: user.name,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(monthlyBillingReport)
    .innerJoin(
      shipstationAccount,
      eq(monthlyBillingReport.accountId, shipstationAccount.id),
    )
    .leftJoin(user, eq(monthlyBillingReport.lastRevertedBy, user.id))
    .where(eq(monthlyBillingReport.id, reportId))
    .limit(1);
```

- [ ] **Step 4: Wire the new fields into the returned shape**

Below the query, find the `return { report: { ...reportRow, … }, shipments }` block (around line 663). The existing return spreads `reportRow` and overrides a few fields.

Replace:

```ts
  return {
    report: {
      ...reportRow,
      status: reportRow.status as BillingReportStatus,
      unitsPickedTotal,
      packagingCostTotal: moneyToNumber(reportRow.packagingCostTotal),
      manualMetrics,
      orderChannelSummary,
    },
    shipments,
  };
};
```

with:

```ts
  const { reverterName, ...reportRest } = reportRow;

  return {
    report: {
      ...reportRest,
      status: reportRow.status as BillingReportStatus,
      unitsPickedTotal,
      packagingCostTotal: moneyToNumber(reportRow.packagingCostTotal),
      manualMetrics,
      orderChannelSummary,
      previousZohoInvoiceIds: reportRow.previousZohoInvoiceIds ?? [],
      lastRevertedByName: reverterName ?? null,
    },
    shipments,
  };
};
```

The destructuring removes `reverterName` from the spread so it isn't accidentally exposed under that key — it's surfaced as `lastRevertedByName` instead.

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors. The new fields propagate to every consumer of `getMonthlyBillingReport`. Existing consumers (page, agent route, invoice builder) won't break — they just gain access to optional new fields they currently ignore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/reports.ts
git commit -m "$(cat <<'EOF'
feat(billing): expose revert audit fields on report detail

Joins the user table to resolve lastRevertedBy → display name
(lastRevertedByName) and surfaces previousZohoInvoiceIds, lastRevertedAt,
and lastRevertReason on MonthlyBillingReportDetail.
EOF
)"
```

---

## Task 3: Add `voidZohoInvoice` helper

**Files:**
- Modify: `src/lib/zoho/books.ts`

- [ ] **Step 1: Add the helper at the end of the file**

Append after the `getZohoInvoice` definition (currently the last export, ending around line 335):

```ts
export const voidZohoInvoice = async (invoiceId: string): Promise<void> => {
  const proxy = getZohoProxy();

  try {
    await proxy.post(`${ZOHO_INVOICES_PATH}/${invoiceId}/status/void`, {});
  } catch (error) {
    const message = getErrorMessage(error);
    const lowered = message.toLowerCase();

    // Idempotent successes: invoice already voided or no longer exists.
    if (lowered.includes("already") && lowered.includes("void")) {
      return;
    }

    if (
      lowered.includes("invoice does not exist") ||
      lowered.includes("invalid invoice id") ||
      lowered.includes("invoice not found")
    ) {
      console.warn(
        `voidZohoInvoice: invoice ${invoiceId} not found in Zoho; treating as already gone.`,
      );
      return;
    }

    throw new Error(message);
  }
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`

Expected: biome reports no issues for `src/lib/zoho/books.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/zoho/books.ts
git commit -m "$(cat <<'EOF'
feat(zoho): add voidZohoInvoice helper

POSTs to /invoices/{id}/status/void. Idempotent: 'already voided' and
'not found' responses are treated as success so revert retries after
partial failures don't double-error.
EOF
)"
```

---

## Task 4: Add `revertMonthlyBillingReport` core function

**Files:**
- Modify: `src/lib/billing/reports.ts`

- [ ] **Step 1: Add the void import**

In `src/lib/billing/reports.ts`, the file currently has no import from `@/lib/zoho`. Add this line in the import block, alphabetically near the other `@/lib` imports — directly below the existing `import { matchShipmentPackages }` line and above `import { loadBillingRateSheet }`:

```ts
import { voidZohoInvoice } from "@/lib/zoho/books";
```

- [ ] **Step 2: Add the new function**

Insert this function in `src/lib/billing/reports.ts` directly **after** `finalizeMonthlyBillingReport` (which ends at line 483) and **before** `updateMonthlyBillingReportManualMetrics`:

```ts
export const revertMonthlyBillingReport = async ({
  reportId,
  reason,
  userId,
}: {
  reportId: string;
  reason: string;
  userId: string;
}): Promise<MonthlyBillingReportDetail> => {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    throw new Error("Provide a reason of at least 3 characters.");
  }

  const [existing] = await db
    .select({
      id: monthlyBillingReport.id,
      status: monthlyBillingReport.status,
      zohoInvoiceId: monthlyBillingReport.zohoInvoiceId,
    })
    .from(monthlyBillingReport)
    .where(eq(monthlyBillingReport.id, reportId))
    .limit(1);

  if (!existing) {
    throw new Error("Monthly billing report not found.");
  }

  if (existing.status !== "finalized") {
    throw new Error("Only finalized reports can be reverted.");
  }

  if (existing.zohoInvoiceId) {
    await voidZohoInvoice(existing.zohoInvoiceId);
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        status: monthlyBillingReport.status,
        zohoInvoiceId: monthlyBillingReport.zohoInvoiceId,
        previousZohoInvoiceIds: monthlyBillingReport.previousZohoInvoiceIds,
      })
      .from(monthlyBillingReport)
      .where(eq(monthlyBillingReport.id, reportId))
      .for("update")
      .limit(1);

    if (!locked || locked.status !== "finalized") {
      throw new Error("Only finalized reports can be reverted.");
    }

    const previousIds = locked.previousZohoInvoiceIds ?? [];
    const nextHistory = locked.zohoInvoiceId
      ? [...previousIds, locked.zohoInvoiceId]
      : previousIds;

    await tx
      .update(monthlyBillingReport)
      .set({
        status: "draft",
        finalizedAt: null,
        zohoInvoiceId: null,
        previousZohoInvoiceIds: nextHistory,
        lastRevertedAt: new Date(),
        lastRevertedBy: userId,
        lastRevertReason: trimmedReason,
      })
      .where(eq(monthlyBillingReport.id, reportId));
  });

  return getMonthlyBillingReport({ reportId });
};
```

Notes for the implementer:
- The pre-load (`existing`) is intentionally outside the transaction. We only enter the transaction after Zoho has acknowledged the void, so we don't hold a row lock across a network call.
- Inside the transaction, the `.for("update")` re-select serializes against any concurrent revert. If a competing revert committed first, the second sees `status="draft"` and throws.
- `previousZohoInvoiceIds: nextHistory` is the entire array. Drizzle's jsonb update replaces the column, so we don't need a SQL-level append — the in-memory concat is correct because we hold the row lock.

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors.

- [ ] **Step 4: Lint**

Run: `pnpm lint`

Expected: biome clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/reports.ts
git commit -m "$(cat <<'EOF'
feat(billing): add revertMonthlyBillingReport

Voids the linked Zoho invoice (when present), then runs a row-locked
transaction that flips status back to draft, clears finalizedAt and
zohoInvoiceId, appends the old invoice id to previousZohoInvoiceIds,
and stamps lastRevertedAt/By/Reason. Concurrent reverts are serialized
by SELECT ... FOR UPDATE; the second caller throws.
EOF
)"
```

---

## Task 5: Add `revertMonthlyBillingReportAction` server action

**Files:**
- Modify: `src/lib/billing/actions.ts`

- [ ] **Step 1: Update imports**

In `src/lib/billing/actions.ts`, the existing import block has:

```ts
import {
  finalizeMonthlyBillingReport,
  generateMonthlyBillingReport,
  getMonthlyBillingReport,
  updateMonthlyBillingReportManualMetrics,
} from "./reports";
```

Replace it with (alphabetical, includes the new function):

```ts
import {
  finalizeMonthlyBillingReport,
  generateMonthlyBillingReport,
  getMonthlyBillingReport,
  revertMonthlyBillingReport,
  updateMonthlyBillingReportManualMetrics,
} from "./reports";
```

- [ ] **Step 2: Add the result type**

Below the existing `CreateZohoInvoiceActionResult` type definition (around line 32-34), add:

```ts
export type RevertMonthlyBillingReportActionResult =
  | {
      ok: true;
      message: string;
      reportId: string;
      voidedInvoiceId: string | null;
    }
  | { ok: false; message: string };
```

- [ ] **Step 3: Add the action**

Append at the end of `src/lib/billing/actions.ts` (after `createZohoInvoiceAction`):

```ts
export const revertMonthlyBillingReportAction = async ({
  reportId,
  reason,
}: {
  reportId: string;
  reason: string;
}): Promise<RevertMonthlyBillingReportActionResult> => {
  const session = await requireAdmin();

  try {
    const detail = await getMonthlyBillingReport({ reportId });
    const voidedInvoiceId = detail.report.zohoInvoiceId;

    const updated = await revertMonthlyBillingReport({
      reportId,
      reason,
      userId: session.user.id,
    });

    revalidateBillingPages();

    return {
      ok: true,
      message: voidedInvoiceId
        ? `Report reverted. Invoice ${voidedInvoiceId} voided in Zoho.`
        : "Report reverted. Metrics are editable again.",
      reportId: updated.report.id,
      voidedInvoiceId,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to revert the monthly billing report.",
    };
  }
};
```

Note: the pre-fetch via `getMonthlyBillingReport` is just to capture `voidedInvoiceId` for the success message. The actual revert (including its own pre-validation) happens inside `revertMonthlyBillingReport`. If the pre-fetch fails (e.g. report not found), the catch turns it into a structured error result.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors.

- [ ] **Step 5: Lint**

Run: `pnpm lint`

Expected: biome clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/actions.ts
git commit -m "$(cat <<'EOF'
feat(billing): add revertMonthlyBillingReportAction

Server action that gates on requireAdmin, threads session.user.id
into revertMonthlyBillingReport, and revalidates the monthly reports
page. Returns the voided invoice id in the success payload so the UI
can word the toast precisely.
EOF
)"
```

---

## Task 6: Revert button + dialog on report-actions toolbar

**Files:**
- Modify: `src/components/admin/monthly-report-actions.tsx`

- [ ] **Step 1: Update imports**

In `src/components/admin/monthly-report-actions.tsx`, the existing import line is:

```ts
import {
  createZohoInvoiceAction,
  finalizeMonthlyBillingReportAction,
  generateMonthlyBillingReportAction,
  type CreateZohoInvoiceActionResult,
  type MonthlyBillingActionResult,
} from "@/lib/billing/actions";
```

Replace it with:

```ts
import {
  createZohoInvoiceAction,
  finalizeMonthlyBillingReportAction,
  generateMonthlyBillingReportAction,
  revertMonthlyBillingReportAction,
  type CreateZohoInvoiceActionResult,
  type MonthlyBillingActionResult,
  type RevertMonthlyBillingReportActionResult,
} from "@/lib/billing/actions";
```

Add a `Textarea` import directly below the existing `Button` import:

```ts
import { Textarea } from "@/components/ui/textarea";
```

If `@/components/ui/textarea` does not yet exist in the project, run `pnpm dlx shadcn@latest add textarea` to add it via shadcn before continuing. Verify the file `src/components/ui/textarea.tsx` is present afterwards.

- [ ] **Step 2: Extend the result discriminated union**

Find the `AnyResult` type definition (around line 47-48):

```ts
type AnyResult =
  | { kind: "report"; result: MonthlyBillingActionResult }
  | { kind: "invoice"; result: CreateZohoInvoiceActionResult };
```

Replace it with:

```ts
type AnyResult =
  | { kind: "report"; result: MonthlyBillingActionResult }
  | { kind: "invoice"; result: CreateZohoInvoiceActionResult }
  | { kind: "revert"; result: RevertMonthlyBillingReportActionResult };
```

- [ ] **Step 3: Add revert state hooks**

After the existing transition hooks (around line 65 — `const [isCreatingInvoice, startCreatingInvoice] = useTransition();`), add:

```ts
  const [isReverting, startReverting] = useTransition();
  const [revertReason, setRevertReason] = useState("");
  const [revertOpen, setRevertOpen] = useState(false);
```

`useState` is already imported.

- [ ] **Step 4: Add the revert handler**

After `handleCreateInvoice` (around line 107), add:

```ts
  const handleRevert = () => {
    if (!reportId) return;
    const trimmed = revertReason.trim();
    if (trimmed.length < 3) return;

    startReverting(async () => {
      const result = await revertMonthlyBillingReportAction({
        reportId,
        reason: trimmed,
      });

      setLatest({ kind: "revert", result });
      if (result.ok) {
        setRevertReason("");
        setRevertOpen(false);
        router.refresh();
      }
    });
  };
```

- [ ] **Step 5: Compute revert visibility**

After the existing `showOpenInvoice` line (around line 116), add:

```ts
  const showRevert = reportStatus === "finalized" && Boolean(reportId);
  const revertSubmitDisabled = isReverting || revertReason.trim().length < 3;
  const revertDescription = zohoInvoiceId
    ? `This will void invoice ${zohoInvoiceId} in Zoho and reopen the ${periodLabel} report so metrics can be edited. The voided invoice ID will be recorded in this report's history.`
    : `This will reopen the ${periodLabel} report for editing. No Zoho cleanup is needed because no invoice has been linked yet.`;
```

- [ ] **Step 6: Render the revert banner branch**

Find the `banner` IIFE (around line 118-159). The existing block has `if (latest.kind === "report") { ... }` and falls through to invoice rendering. Replace the entire IIFE body with:

```ts
  const banner = (() => {
    if (!latest) {
      return null;
    }

    if (latest.kind === "report") {
      const result = latest.result;
      return (
        <Alert variant={result.ok ? "default" : "destructive"}>
          <AlertTitle>
            {result.ok ? "Report updated" : "Action failed"}
          </AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      );
    }

    if (latest.kind === "revert") {
      const result = latest.result;
      return (
        <Alert variant={result.ok ? "default" : "destructive"}>
          <AlertTitle>
            {result.ok ? "Report reverted" : "Revert failed"}
          </AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      );
    }

    const result = latest.result;

    return result.ok ? (
      <Alert>
        <AlertTitle>Zoho draft invoice created</AlertTitle>
        <AlertDescription>
          Invoice ID {result.invoiceId} —{" "}
          <a
            href={result.invoiceUrl}
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
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    );
  })();
```

- [ ] **Step 7: Add the revert button + dialog**

Inside the toolbar div (`<div className="flex flex-wrap items-center gap-2">` around line 163), insert the revert dialog as a new sibling AFTER the existing finalize `<AlertDialog>` block (which ends with `</AlertDialog>` around line 199) and BEFORE the `Export CSV` block (`{reportId ? (` around line 200).

```tsx
        {showRevert ? (
          <AlertDialog
            open={revertOpen}
            onOpenChange={(next) => {
              if (!isReverting) {
                setRevertOpen(next);
                if (!next) {
                  setRevertReason("");
                }
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={isReverting}
              >
                {isReverting ? "Reverting…" : "Revert finalization"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revert finalization?</AlertDialogTitle>
                <AlertDialogDescription>
                  {revertDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="revert-reason"
                  className="text-sm font-medium"
                >
                  Reason (required)
                </label>
                <Textarea
                  id="revert-reason"
                  value={revertReason}
                  onChange={(event) => setRevertReason(event.target.value)}
                  placeholder="What needs to change?"
                  rows={3}
                  disabled={isReverting}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isReverting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    handleRevert();
                  }}
                  disabled={revertSubmitDisabled}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isReverting ? "Reverting…" : "Revert finalization"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
```

- [ ] **Step 8: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors.

- [ ] **Step 9: Lint**

Run: `pnpm lint`

Expected: biome clean.

- [ ] **Step 10: Commit**

```bash
git add src/components/admin/monthly-report-actions.tsx src/components/ui/textarea.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add revert finalization button and dialog

Visible only on finalized reports. AlertDialog with required reason
textarea (>=3 chars), destructive styling, dynamic copy that names the
voided invoice id when one is linked. Calls
revertMonthlyBillingReportAction and surfaces the result in the existing
banner area.
EOF
)"
```

---

## Task 7: Revert history strip on report page

**Files:**
- Modify: `src/app/admin/reports/monthly/page.tsx`

- [ ] **Step 1: Add a date-relative formatter import**

Open `src/app/admin/reports/monthly/page.tsx`. The project already depends on `date-fns`. If the file does not already import from `date-fns`, add this near the top with the other imports:

```ts
import { formatDistanceToNow } from "date-fns";
```

If `date-fns` already has imports in the file, append `formatDistanceToNow` to the existing import (alphabetical).

- [ ] **Step 2: Find the insertion point and add a `buildZohoInvoiceUrl` import**

Find the `<Card>` block whose `CardTitle` renders `{selectedAccount.displayName} · {monthFormatter.format(...)}` (around lines 386-403). The history strip will go in `CardContent` — just below the existing `unmatchedShipmentCount > 0` Alert and above the shipment Table.

If `buildZohoInvoiceUrl` is not already imported in this file, add to imports:

```ts
import { buildZohoInvoiceUrl } from "@/lib/zoho/urls";
```

- [ ] **Step 3: Render the history strip**

Inside the `CardContent` block (around line 404 — `<CardContent className="flex flex-col gap-4">`), immediately AFTER the closing `) : null}` of the unmatched-shipment Alert and BEFORE the `<Table>` block, insert:

```tsx
              {currentReport.report.lastRevertedAt ||
              currentReport.report.previousZohoInvoiceIds.length > 0 ? (
                <div className="rounded-md border border-muted-foreground/20 bg-muted/30 p-3 text-xs text-muted-foreground">
                  {currentReport.report.lastRevertedAt ? (
                    <p>
                      Last reverted{" "}
                      {formatDistanceToNow(
                        currentReport.report.lastRevertedAt,
                        { addSuffix: true },
                      )}{" "}
                      by{" "}
                      <span className="font-medium">
                        {currentReport.report.lastRevertedByName ??
                          currentReport.report.lastRevertedBy ??
                          "unknown user"}
                      </span>
                      {currentReport.report.lastRevertReason
                        ? ` — reason: "${currentReport.report.lastRevertReason}"`
                        : ""}
                      .
                    </p>
                  ) : null}
                  {currentReport.report.previousZohoInvoiceIds.length > 0 ? (
                    <p className="mt-1">
                      Previous invoices:{" "}
                      {currentReport.report.previousZohoInvoiceIds.map(
                        (id, index) => (
                          <span key={id}>
                            {index > 0 ? ", " : ""}
                            <a
                              href={buildZohoInvoiceUrl(id)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                            >
                              {id}
                            </a>
                          </span>
                        ),
                      )}
                      .
                    </p>
                  ) : null}
                </div>
              ) : null}
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors. The new fields on `currentReport.report` were added in Task 2.

- [ ] **Step 5: Lint**

Run: `pnpm lint`

Expected: biome clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/reports/monthly/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): show revert history on monthly report page

Renders 'Last reverted X ago by Y — reason: ...' plus a list of
previously-linked Zoho invoice ids (each linking to its now-voided Zoho
page) when the report has been reverted at least once.
EOF
)"
```

---

## Task 8: AI agent revert tool

**Files:**
- Modify: `src/app/api/admin/billing/agent/route.ts`

- [ ] **Step 1: Update imports**

In `src/app/api/admin/billing/agent/route.ts`, the existing `@/lib/billing/actions` import currently brings in only `createZohoInvoiceAction`. Replace it with:

```ts
import {
  createZohoInvoiceAction,
  revertMonthlyBillingReportAction,
} from "@/lib/billing/actions";
```

- [ ] **Step 2: Append the revert paragraph to the system prompt**

`requireAdmin()` is already called at the top of the `POST` handler. The action layer (`revertMonthlyBillingReportAction`) calls it again to pull `session.user.id`, so the agent route does not need to thread the user id into the tool. Skip touching the `POST` body and the `buildAgent` signature.

Inside `buildSystemPrompt` (lines 43-74), find the `Rules:` array entries:

```ts
    "Rules:",
    "- Invoices are ALWAYS drafts. Never confirm, send, or email an invoice.",
    "- Refuse to create an invoice if the report is not finalized.",
    "- Be direct and operational. No filler, no apologies.",
    "- Use tools to read live data; never invent invoice IDs or totals.",
    "",
```

Replace with:

```ts
    "Rules:",
    "- Invoices are ALWAYS drafts. Never confirm, send, or email an invoice.",
    "- Refuse to create an invoice if the report is not finalized.",
    "- Be direct and operational. No filler, no apologies.",
    "- Use tools to read live data; never invent invoice IDs or totals.",
    "",
    "Revert protocol:",
    "- When a user asks to revert a finalized report, you MUST: (1) state which invoice will be voided in Zoho and which vendor/period the report is for; (2) ask the user to provide a written reason and to reply with the exact phrase CONFIRM REVERT; (3) only then call the revertMonthlyBillingReport tool with both fields.",
    "- Never call the revert tool on the first turn. Never paraphrase the confirmation phrase.",
    "- If voiding fails (e.g., paid invoice), surface the error verbatim and do not retry. Tell the user to resolve the payment in Zoho first.",
    "",
```

- [ ] **Step 3: Add the revert tool**

Inside the `tools: { ... }` object (line 103), after `createDraftInvoice` (which ends at line 121 with `}),`), add:

```ts
      revertMonthlyBillingReport: tool({
        description:
          "Revert the current finalized report back to draft and void the linked Zoho invoice. Requires a written reason and the exact confirmation phrase.",
        inputSchema: z.object({
          reason: z
            .string()
            .min(3, "Reason must be at least 3 characters."),
          confirm: z.literal("CONFIRM REVERT"),
        }),
        execute: async ({ reason }) => {
          const result = await revertMonthlyBillingReportAction({
            reportId,
            reason,
          });

          if (!result.ok) {
            return { ok: false, message: result.message };
          }

          return {
            ok: true,
            message: result.message,
            voidedInvoiceId: result.voidedInvoiceId,
          };
        },
      }),
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`

Expected: zero errors.

- [ ] **Step 5: Lint**

Run: `pnpm lint`

Expected: biome clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/billing/agent/route.ts
git commit -m "$(cat <<'EOF'
feat(ai): expose revert tool to billing agent with confirm guard

inputSchema requires confirm: z.literal('CONFIRM REVERT') so a
hallucinated single-turn invocation is rejected by Zod before any
side effect. System prompt instructs the model to surface what will
be voided and require the literal phrase before calling.
EOF
)"
```

---

## Task 9: Manual sanity check on real April data

This is the verification step from the spec. No code changes — execute against the live admin dashboard once Tasks 1-8 are committed and the dev server is running (`pnpm dev`).

- [ ] **Step 1: Confirm the build passes end-to-end**

Run: `pnpm build`

Expected: Next.js build completes with zero TypeScript errors and zero lint errors. (`pnpm build` runs both type-check and biome.)

- [ ] **Step 2: Happy-path revert on the stuck April report**

1. Open the admin dashboard. Navigate to the April monthly report for the vendor that is currently stuck in finalized state.
2. Verify the "Revert finalization" button is visible alongside the existing toolbar buttons. Verify Finalize and Generate are disabled (existing behavior).
3. Click "Revert finalization." Verify the dialog body names the linked invoice id and the period + vendor correctly.
4. Try to submit with an empty reason. Verify the action button is disabled.
5. Type a 1-character reason. Verify the action button is still disabled.
6. Type a real reason (e.g. "April metrics off — needs to include late shipments"). Verify the action button enables.
7. Submit. While the request is in flight, verify the dialog stays open with a spinner and Cancel is disabled.
8. After completion, verify:
   - A success Alert says: `Report reverted. Invoice INV-XXXX voided in Zoho.`
   - The dialog has closed.
   - The page status flag now reads `draft`.
   - The metrics form inputs are editable.
   - A muted block under the metrics card reads: `Last reverted just now by {your name} — reason: "April metrics off — needs to include late shipments". Previous invoices: INV-XXXX.` and the invoice id links to Zoho.
9. Open the linked Zoho invoice in a separate tab. Verify it shows as **Void**.

- [ ] **Step 3: Re-finalize and re-invoice**

1. Edit the metrics on the now-draft April report (e.g. correct one of the bin counts).
2. Click "Generate draft" — confirm it regenerates from source without throwing.
3. Click "Finalize report" — confirm it finalizes successfully.
4. Click "Create draft invoice" — confirm a NEW Zoho invoice is created (different invoice id from the voided one).
5. Reload the report page. Verify:
   - The new invoice id appears in the Open-in-Zoho button.
   - The history strip still shows the previously-voided invoice id under "Previous invoices."

- [ ] **Step 4: Agent-driven revert**

1. Repeat Steps 2-3 setup if needed (or use a different vendor's draft → finalize → invoice).
2. Open the BillingAssistantDrawer.
3. Type: `Please revert this report.`
4. Verify the agent does NOT call the revert tool on the first turn. It should respond by stating which invoice will be voided and asking for a reason plus the literal `CONFIRM REVERT` phrase.
5. Type: `Reason: testing the agent path. CONFIRM REVERT`
6. Verify the agent calls the tool and the same revert flow runs. The drawer should reflect updated state after the tool result.
7. Verify the Zoho invoice is voided in the Zoho UI tab.

- [ ] **Step 5: Negative-path — voiding a paid invoice**

This step requires a throwaway fixture; do not run it on production-relevant data.

1. Pick a draft test report (or generate one for a vendor with low traffic). Finalize it. Create a Zoho invoice via the "Create draft invoice" button.
2. Open the invoice in Zoho Books and manually mark it as paid (record a full payment) — or alter its state so Zoho refuses voiding.
3. Click "Revert finalization" in the admin dashboard. Provide a reason. Submit.
4. Verify:
   - The success toast is NOT shown.
   - A destructive Alert appears with a verbatim Zoho error (e.g. `Cannot revert: Cannot void this invoice as a payment has been recorded against it.`).
   - The report status remains `finalized`.
   - The `zohoInvoiceId` on the row remains intact (visible because the Open-in-Zoho button still links to it).

- [ ] **Step 6: Negative-path — revert with no invoice yet**

1. Generate a fresh draft report on any vendor. Finalize it WITHOUT creating an invoice.
2. Click "Revert finalization." Verify the dialog copy reads `This will reopen the {Period} report for editing. No Zoho cleanup is needed because no invoice has been linked yet.`
3. Submit with a reason. Verify:
   - Toast: `Report reverted. Metrics are editable again.`
   - Status flips to draft.
   - History strip shows `Last reverted ... by ... — reason: "..."` and **no** "Previous invoices" line (the array is empty).

- [ ] **Step 7: Final sign-off**

If all six checks above pass, the feature is verified. If any step fails, capture the error message and the specific step number, then stop and address before reporting the work complete. Do not proceed to merge with any check failing.

Once verified, this task can be marked complete by appending a short verification note to the bottom of the spec file (`docs/superpowers/specs/2026-05-07-revert-finalized-report-design.md`) under a new `## Verification log` heading, with date and tester initials. Commit:

```bash
git add docs/superpowers/specs/2026-05-07-revert-finalized-report-design.md
git commit -m "docs: log manual verification of revert-finalized-report feature"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-05-07-revert-finalized-report-design.md`):

| Spec section | Implemented by |
|---|---|
| Decisions table row 1 (void in Zoho) | Task 3 (`voidZohoInvoice`), Task 4 (called from `revertMonthlyBillingReport`) |
| Decisions row 2 (block on void failure) | Task 4 (errors propagate; transaction not entered) |
| Decisions row 3 (audit fields, required reason) | Task 1 (schema), Task 4 (validation + writes) |
| Decisions row 4 (agent confirm-literal) | Task 8 (`z.literal("CONFIRM REVERT")` + system prompt) |
| Decisions row 5 (single button, no-invoice case) | Task 6 (single dialog), Task 4 (skips Zoho when `zohoInvoiceId` is null) |
| Data model (4 columns) | Task 1 |
| `voidZohoInvoice` helper | Task 3 |
| `revertMonthlyBillingReport` (load → void → tx with FOR UPDATE) | Task 4 |
| `revertMonthlyBillingReportAction` (auth gate, vendor scope, revalidate) | Task 5 |
| Report actions toolbar button + dialog | Task 6 |
| Toast feedback (success / failure / no-invoice) | Task 6 (banner branches) |
| Revert history strip on report page | Task 7 |
| Agent tool + system prompt addition | Task 8 |
| Edge case table (all rows) | Task 3 (Zoho idempotency cases), Task 4 (status / reason / not-found / concurrency), Task 6 (UI gating) |
| Verification (manual checks) | Task 9 |

No spec rows are unimplemented.

**Placeholder scan:** No "TBD," "TODO," or "implement later" markers in the plan. Every code-changing step shows the exact code. Every command has expected output described.

**Type consistency:** `revertMonthlyBillingReport`'s parameter shape is `{ reportId, reason, userId }` everywhere it appears (Tasks 4, 5, 8). `RevertMonthlyBillingReportActionResult` has the same field set in its definition (Task 5) and consumers (Tasks 6, 8). The new schema column names (`previousZohoInvoiceIds`, `lastRevertedAt`, `lastRevertedBy`, `lastRevertReason`) are used identically in Tasks 1, 2, 4, 6, 7. `lastRevertedByName` (the resolved display name) is added by Task 2 and consumed by Task 7 only.

**One known soft point:** Task 8's Step 5 introduces `userId` into `buildAgent` then notes it's unused and may need to be dropped. Left as a soft instruction with a fallback rather than removed entirely so the implementer has a visible spot to thread session id if future tools need it. If biome/tsc complain, drop the param per the inline note.
