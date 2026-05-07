"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BillingAssistantDrawer } from "@/components/admin/billing-assistant-drawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  createZohoInvoiceAction,
  finalizeMonthlyBillingReportAction,
  generateMonthlyBillingReportAction,
  type CreateZohoInvoiceActionResult,
  type MonthlyBillingActionResult,
} from "@/lib/billing/actions";
import type {
  BillingAccountSlug,
  BillingReportStatus,
} from "@/lib/billing/types";
import { buildZohoInvoiceUrl } from "@/lib/zoho/urls";

type MonthlyReportActionsProps = {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
  reportId: string | null;
  reportStatus: BillingReportStatus | null;
  zohoInvoiceId: string | null;
  periodLabel: string;
  canFinalize: boolean;
  unmatchedShipmentCount: number;
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
  unmatchedShipmentCount,
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
      if (result.ok) {
        router.refresh();
      }
    });
  };

  const handleFinalize = () => {
    if (!reportId) return;

    startFinalizing(async () => {
      const result = await finalizeMonthlyBillingReportAction({ reportId });

      setLatest({ kind: "report", result });
      if (result.ok) {
        router.refresh();
      }
    });
  };

  const handleCreateInvoice = () => {
    if (!reportId) return;

    startCreatingInvoice(async () => {
      const result = await createZohoInvoiceAction({ reportId });

      setLatest({ kind: "invoice", result });
      if (result.ok) {
        router.refresh();
      }
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
          {isGenerating ? "Generating\u2026" : generateLabel}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={finalizeDisabled}
            >
              {isFinalizing ? "Finalizing\u2026" : "Finalize report"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finalize this report?</AlertDialogTitle>
              <AlertDialogDescription>
                {unmatchedShipmentCount > 0
                  ? `${unmatchedShipmentCount} shipment${unmatchedShipmentCount === 1 ? "" : "s"} could not be matched to a carton rule and will be billed using the fallback pricing already shown in the audit. Once finalized, the snapshot is locked for invoicing.`
                  : "Once finalized, this snapshot is locked for invoicing and can no longer be regenerated."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleFinalize}>
                Finalize
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
            disabled={isCreatingInvoice}
            onClick={handleCreateInvoice}
          >
            {isCreatingInvoice ? "Creating\u2026" : "Create draft invoice"}
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
