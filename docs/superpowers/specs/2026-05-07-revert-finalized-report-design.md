# Revert finalized monthly billing report

**Status:** design approved, awaiting implementation plan
**Author:** john@honeybeeherb.com
**Date:** 2026-05-07
**Related:** `docs/superpowers/specs/2026-05-06-zoho-invoice-generation-design.md`

## Problem

The monthly billing pipeline currently has a one-way state transition: a report goes from `draft` to `finalized`, and once finalized its metrics become read-only and `createZohoInvoiceAction` writes a permanent `zohoInvoiceId` onto the row.

There is no way to undo a mistaken finalization. If an ops manager finalizes the wrong month or with bad metrics, the report is locked and the corresponding Zoho invoice is real. The owner's April report for one vendor is currently in this stuck state and was the forcing example for this work.

## Goal

Add a "revert finalization" path that:

1. Voids the linked Zoho invoice (when one exists) so accounting stays clean.
2. Returns the report to `draft` so metrics can be edited or regenerated from source.
3. Records who reverted, when, why, and which Zoho invoice was previously linked.
4. Keeps the door open to re-finalize and create a new Zoho invoice through the existing flow.

## Non-goals

- Changing the existing finalize action.
- Refactoring `status` from a 2-state enum into a richer state machine.
- Building a generalized audit-log table.
- Introducing a new permission role for revert (reuse the gate that protects `finalizeMonthlyBillingReportAction` and `createZohoInvoiceAction`).
- Voiding paid invoices automatically. Paid invoices block revert; user must resolve the payment in Zoho first.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What happens to the Zoho invoice on revert? | Void it automatically via Zoho API. |
| 2 | What if the void call fails (paid invoice, network error)? | Block the revert. Surface the Zoho error verbatim. DB stays untouched. User retries after handling Zoho-side. |
| 3 | What audit fields do we keep? | Add four columns on the report row: `previousZohoInvoiceIds` (jsonb array), `lastRevertedAt`, `lastRevertedBy`, `lastRevertReason`. Reason is required (≥3 non-whitespace chars). |
| 4 | Can the AI billing agent revert a report? | Yes, but the tool input requires `confirm: z.literal("CONFIRM REVERT")` and a reason. Agent system prompt instructs the model never to call the tool on the first turn — it must show the user what will happen and get the literal confirmation phrase typed back. |
| 5 | UX shape | Single "Revert finalization" button in `monthly-report-actions.tsx`. AlertDialog with required reason textarea. Same flow handles "no invoice linked" by skipping the Zoho step. |

## Data model

`monthly_billing_report` (`src/db/schema/billing.ts`) gains four columns:

```ts
previousZohoInvoiceIds: jsonb("previous_zoho_invoice_ids")
  .$type<string[]>().notNull().default([]),
lastRevertedAt: timestamp("last_reverted_at", { withTimezone: true }),
lastRevertedBy: text("last_reverted_by"),
lastRevertReason: text("last_revert_reason"),
```

`finalizedAt` keeps existing semantics (timestamp of *most recent* finalization). It is cleared on revert and overwritten on next finalize. `previousZohoInvoiceIds` accumulates across multiple revert cycles (oldest first). No backfill needed; default empty array works for existing rows.

`status` enum stays `"draft" | "finalized"` (`src/lib/billing/types.ts:5`).

## Server-side flow

### New Zoho helper

`voidZohoInvoice(invoiceId: string): Promise<void>` in `src/lib/zoho/books.ts`.

- POSTs to `${ZOHO_INVOICES_PATH}/{invoiceId}/status/void`.
- Treats responses indicating "already voided" as success.
- Treats 404 / invoice-not-found as success (with a `console.warn`) — covers the case of out-of-band deletion in Zoho.
- Any other non-success error is thrown with the Zoho-supplied message, parsed via the existing `getErrorMessage` helper.

### New core function

`revertMonthlyBillingReport(reportId, { reason, userId }): Promise<MonthlyBillingReport>` in `src/lib/billing/reports.ts`.

Order of operations:

1. **Pre-validate (no DB writes yet).** Reject if `reason.trim().length < 3`.
2. **Load report.** Reject if not found, or if `status !== "finalized"`.
3. **Void in Zoho.** If `report.zohoInvoiceId != null`, call `voidZohoInvoice(report.zohoInvoiceId)`. On error, propagate as `Error("Cannot revert: " + zohoMessage)`. DB still untouched.
4. **DB transaction** (`db.transaction(...)`):
   - Re-select the report row with `.for("update")` to lock it. Re-check `status === "finalized"` — if not (a concurrent revert won), throw `"Only finalized reports can be reverted."`
   - Compute `nextHistory = report.zohoInvoiceId ? [...previousZohoInvoiceIds, report.zohoInvoiceId] : previousZohoInvoiceIds`.
   - Update: `status="draft"`, `finalizedAt=null`, `zohoInvoiceId=null`, `previousZohoInvoiceIds=nextHistory`, `lastRevertedAt=now()`, `lastRevertedBy=userId`, `lastRevertReason=reason.trim()`.
   - Return updated row.
5. Caller (action wrapper) calls `revalidatePath("/admin/reports/monthly", "page")`.

Idempotency on partial failure: if step 3 succeeds but step 4 fails (rare network blip), retrying the action will re-call `voidZohoInvoice`, which returns "already voided" success, and the tx runs. Consistent state.

### Server action wrapper

`revertMonthlyBillingReportAction` in `src/lib/billing/actions.ts`. Mirrors the structure of `finalizeMonthlyBillingReportAction` and `createZohoInvoiceAction`:

- Same admin auth gate.
- Same vendor-access guard via `report.accountId`.
- Calls `revertMonthlyBillingReport` with the session user id.
- Returns `{ ok: true, report }` or throws on failure (caller toasts the error).

## UI surface

### Report actions toolbar

`src/components/admin/monthly-report-actions.tsx`. Add `Revert finalization` button:

- Visible only when `report.status === "finalized"`.
- Destructive variant (outline + destructive icon), separated from Finalize/Generate Invoice by a divider.
- Click opens an `AlertDialog`:
  - Title: "Revert finalization"
  - Body: dynamic. With invoice: *"This will void invoice **INV-XXXX** in Zoho and reopen the {Period} report for {Vendor} so metrics can be edited. The voided invoice ID will be recorded in this report's history."* Without invoice: *"This will reopen the report for editing. No Zoho cleanup is needed."*
  - Required `<Textarea>` labelled "Reason (required)". Submit disabled until ≥3 non-whitespace chars.
  - Buttons: `Cancel`, `Revert finalization` (destructive). Submit shows spinner while pending.

### Toast feedback (Sonner; matches existing pattern)

- Success with invoice: `"Report reverted. Invoice INV-XXXX voided in Zoho."`
- Success without invoice: `"Report reverted. Metrics are editable again."`
- Failure: surface Zoho error verbatim, e.g. `"Cannot revert: Cannot void this invoice as it has been paid."` Report stays finalized.

### Revert history strip

`src/app/admin/reports/monthly/page.tsx`. When `lastRevertedAt != null` OR `previousZohoInvoiceIds.length > 0`, render a muted block under the metrics section:

> Last reverted {relative time} by {user display name} — reason: "{reason}". Previous invoices: INV-X, INV-Y.

The page's existing data loader resolves `lastRevertedBy` (a user id) into a display name by joining to the better-auth users table the same way the rest of the admin dashboard surfaces user identities. If no matching user is found, fall back to the raw id string. Each invoice id links via `buildZohoInvoiceUrl(id)` (already exported from `src/lib/zoho/books.ts`) to the voided-invoice page in Zoho. Read-only, no controls.

## AI agent tool

`src/app/api/admin/billing/agent/route.ts`. Add `revertMonthlyBillingReport` tool:

```ts
inputSchema: z.object({
  reportId: z.string(),
  reason: z.string().min(3),
  confirm: z.literal("CONFIRM REVERT"),
})
```

Tool body calls the same `revertMonthlyBillingReport` server fn, passing the chat user's id. The literal-string `confirm` field is the safety: if the model invokes the tool with anything else, Zod rejects before any Zoho or DB call, and the tool result is a structured error fed back to the model.

System-prompt addition (append to existing `system` string):

> When a user asks to revert a finalized report, you MUST: (1) state which invoice will be voided in Zoho and which vendor/period the report is for, (2) ask the user to provide a written reason and to reply with the exact phrase `CONFIRM REVERT`, (3) only then call the `revertMonthlyBillingReport` tool with both fields. Never call this tool on the first turn. If voiding fails (e.g., paid invoice), surface the error verbatim — do not retry.

The drawer's existing refresh mechanism picks up the new state on success (same as create-invoice).

## Edge cases

| Case | Behavior |
|---|---|
| No `zohoInvoiceId` on report | Skip Zoho call, unfinalize only |
| Zoho returns "already voided" | Success, continue to DB tx |
| Zoho returns 404 / invoice-not-found | Success (warn), continue |
| Zoho returns "paid" or any other error | Throw verbatim, DB untouched |
| `reason.trim().length < 3` | Throw before Zoho call |
| `status === "draft"` | Throw `"Only finalized reports can be reverted."` |
| Report not found | Throw `"Report not found."` |
| Network blip after Zoho success | Retry is safe via "already voided" idempotency |
| Two admins click revert simultaneously | First wins via `SELECT … FOR UPDATE`; second sees `status="draft"` after lock and throws |
| Multiple revert cycles | `previousZohoInvoiceIds` accumulates oldest-first; `lastReverted*` reflects most recent only |
| Re-finalize after revert | Existing `finalizeMonthlyBillingReport` unchanged; sets fresh `finalizedAt`; history fields persist |
| Re-create invoice after revert | Existing `createZohoInvoiceAction` unchanged; writes fresh `zohoInvoiceId` |

## Testing

**Unit tests for `revertMonthlyBillingReport`** (alongside any existing `src/lib/billing/reports.test.ts`; create the file if absent). Mock the Zoho client.

- Happy path with linked invoice → status becomes draft, invoice voided, history fields populated, previous invoice id in array.
- Happy path without linked invoice → status becomes draft, no Zoho call, history fields populated, previous invoice array unchanged.
- Draft report → throws, no writes.
- Empty / whitespace reason → throws before Zoho call.
- Zoho returns "already voided" → treated as success.
- Zoho returns 404 → treated as success, warning logged.
- Zoho returns "paid" error → throws, DB row unchanged on re-fetch.
- Concurrent revert (two callers, second sees locked-then-draft state) → second throws.

**Action-layer integration tests** for `revertMonthlyBillingReportAction`:

- Unauthenticated → rejected.
- Authenticated but no access to vendor → rejected.
- Successful path → `revalidatePath` called.

**Manual sanity check on real April data.** The forcing example is the cleanest fixture. Once shipped: revert the stuck April report, verify the Zoho invoice flips to voided, verify metrics become editable, verify the history strip renders the previous invoice id with a working link.

## Files touched

- `src/db/schema/billing.ts` — add four columns to `monthly_billing_report`.
- `drizzle/` — new migration generated via `pnpm drizzle-kit generate`.
- `src/lib/zoho/books.ts` — add `voidZohoInvoice`.
- `src/lib/billing/reports.ts` — add `revertMonthlyBillingReport`.
- `src/lib/billing/actions.ts` — add `revertMonthlyBillingReportAction`.
- `src/components/admin/monthly-report-actions.tsx` — add revert button + dialog.
- `src/app/admin/reports/monthly/page.tsx` — add revert history strip.
- `src/app/api/admin/billing/agent/route.ts` — add tool definition + system-prompt paragraph.
- Tests as listed above.

## Open implementation questions

None. All design decisions are settled. The implementation plan can proceed.
