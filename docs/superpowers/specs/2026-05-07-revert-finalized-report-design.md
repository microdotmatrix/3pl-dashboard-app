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
- Setting up a unit-test framework. The project has no existing test infrastructure (`package.json` has no test scripts, no test files anywhere in `src/`). This work is verified manually against real data; standing up vitest is deferred to a separate effort.

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
4. **Atomic conditional DB update** (no `db.transaction(...)`; the app uses Drizzle's `neon-http` driver, whose transactions throw at runtime):
   - Update only when `id` still matches, `status === "finalized"`, and `zohoInvoiceId` is unchanged from the pre-void read.
   - If there was a linked invoice, append that exact invoice id to `previousZohoInvoiceIds` in SQL during the same update.
   - Set: `status="draft"`, `finalizedAt=null`, `zohoInvoiceId=null`, `lastRevertedAt=now()`, `lastRevertedBy=userId`, `lastRevertReason=reason.trim()`.
   - If no row is updated, re-read the report and throw a race-specific error. If another revert already won, throw `"Only finalized reports can be reverted."` If a Zoho invoice was attached after the pre-read, throw `"Report invoice changed while reverting. Refresh and try again so the linked invoice can be voided."`
5. Caller (action wrapper) calls `revalidatePath("/admin/reports/monthly", "page")`.

Idempotency on partial failure: if step 3 succeeds but step 4 fails or a concurrent caller wins, retrying the action will re-call `voidZohoInvoice`, which returns "already voided" success when appropriate. The conditional update prevents reverting a report after a different invoice has been attached.

### Existing invoice creation hardening

`createZohoInvoiceAction` must be hardened while adding revert, because invoice creation and revert mutate the same `zohoInvoiceId` state.

After creating the Zoho invoice, write it back with a conditional update:

- `id === reportId`
- `status === "finalized"`
- `zohoInvoiceId IS NULL`

If the conditional update affects zero rows, the report changed while the external invoice was being created. Best-effort void the newly-created Zoho invoice immediately. If cleanup succeeds, return an error telling the user to refresh and try again. If cleanup fails, return an error that includes the new invoice id and instructs manual voiding in Zoho. This avoids silently orphaning real Zoho invoices.

### Observability

Membrane proxy calls should remain in the existing server-only Zoho module. For destructive invoice voiding, log structured server context on failures: `reportId`, `invoiceId`, and the normalized Zoho error message. Do not log Membrane credentials, JWTs, or full request headers. If the Membrane proxy exposes action/run identifiers in future SDK versions, include them in these logs and in admin-facing troubleshooting output.

### Server action wrapper

`revertMonthlyBillingReportAction` in `src/lib/billing/actions.ts`. Mirrors the structure of `finalizeMonthlyBillingReportAction` and `createZohoInvoiceAction`:

- Same admin auth gate.
- Same authorization scope as the existing billing actions (`requireAdmin()` today; add a narrower account/vendor guard only if one is introduced for billing generally).
- Calls `revertMonthlyBillingReport` with the session user id.
- Returns a small structured result (`ok`, `message`, `reportId`, `voidedInvoiceId`) so client UI does not receive a raw report record.

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

### Action feedback

- Success with invoice: `"Report reverted. Invoice INV-XXXX voided in Zoho."`
- Success without invoice: `"Report reverted. Metrics are editable again."`
- Failure: surface Zoho error verbatim in the existing inline Alert/banner pattern, e.g. `"Cannot revert: Cannot void this invoice as it has been paid."` Report stays finalized.

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

Tool body calls the same `revertMonthlyBillingReport` server fn through the server action. The literal-string `confirm` field is one guard: if the model invokes the tool with anything else, Zod rejects before any Zoho or DB call. The route must also verify that the latest user message text contains the exact phrase `CONFIRM REVERT`; this prevents the model from satisfying the confirmation field by itself.

System-prompt addition (append to existing `system` string):

> When a user asks to revert a finalized report, you MUST: (1) state which invoice will be voided in Zoho and which vendor/period the report is for, (2) ask the user to provide a written reason and to reply with the exact phrase `CONFIRM REVERT`, (3) only then call the `revertMonthlyBillingReport` tool with both fields. Never call this tool on the first turn. If voiding fails (e.g., paid invoice), surface the error verbatim — do not retry.

The drawer's existing refresh mechanism picks up the new state on success (same as create-invoice).

## Edge cases

| Case | Behavior |
|---|---|
| No `zohoInvoiceId` on report | Skip Zoho call, unfinalize only |
| Zoho returns "already voided" | Success, continue to conditional DB update |
| Zoho returns 404 / invoice-not-found | Success (warn), continue to conditional DB update |
| Zoho returns "paid" or any other error | Throw verbatim, DB untouched |
| `reason.trim().length < 3` | Throw before Zoho call |
| `status === "draft"` | Throw `"Only finalized reports can be reverted."` |
| Report not found | Throw `"Report not found."` |
| Network blip after Zoho success | Retry is safe via "already voided" idempotency |
| Two admins click revert simultaneously | First conditional update wins; second updates zero rows, re-reads `status="draft"`, and throws |
| Revert races with invoice creation | Revert updates zero rows if a new `zohoInvoiceId` appears; report stays finalized and user retries so that invoice can be voided |
| Invoice creation races with revert | Create-invoice conditional write updates zero rows; newly-created Zoho invoice is best-effort voided to avoid an orphan |
| Multiple revert cycles | `previousZohoInvoiceIds` accumulates oldest-first; `lastReverted*` reflects most recent only |
| Re-finalize after revert | Existing `finalizeMonthlyBillingReport` unchanged; sets fresh `finalizedAt`; history fields persist |
| Re-create invoice after revert | Hardened `createZohoInvoiceAction` writes a fresh `zohoInvoiceId` only if the report is still finalized and has no linked invoice |

## Verification

The project has no automated test infrastructure, so verification is type-check + lint + manual run-through.

**Type/lint guarantees:**

- `pnpm tsc --noEmit` (or `pnpm build`) passes.
- `pnpm lint` (biome) passes.
- Drizzle migration applies cleanly: `pnpm db:generate` produces a new SQL file, `pnpm db:migrate` runs it without errors.

**Manual sanity check on the real stuck April report** — the forcing example is the canonical fixture.

1. Pull up the finalized April report in the admin dashboard. Verify the new "Revert finalization" button is visible and that the existing Finalize/Generate buttons are correctly disabled.
2. Click revert. Dialog should name the linked invoice id and the vendor + period correctly. Reason textarea should reject submit until ≥3 chars typed.
3. Submit with a real reason. Confirm:
   - Toast says "Report reverted. Invoice INV-XXXX voided in Zoho."
   - Report status flips to draft, metrics inputs become editable.
   - The Zoho Books UI (open in another tab) shows the invoice as voided.
   - The "Last reverted by … reason: …" strip renders below the metrics with a working Zoho link to the now-voided invoice.
4. Re-edit metrics, re-finalize, create a new invoice. Confirm:
   - A new `zohoInvoiceId` is written.
   - The history strip still shows the previously-voided invoice in `Previous invoices`.
5. Open the BillingAssistantDrawer. Ask the agent to revert without typing the confirmation phrase — agent should refuse to call the tool. Provide the phrase + reason — agent should call the tool and the same flow runs.

**Negative-path sanity checks** (using throwaway fixtures, not the April report):

- Generate a draft report, finalize it, mark the linked Zoho invoice as paid in Zoho directly, then attempt revert. Expect the UI feedback to surface the Zoho "cannot void: paid" error verbatim and the report to remain finalized.
- Finalize a report without creating a Zoho invoice, then revert. Expect UI feedback that says metrics are editable again with no mention of an invoice.

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
