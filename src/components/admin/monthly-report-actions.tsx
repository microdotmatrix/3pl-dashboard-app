"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  finalizeMonthlyBillingReportAction,
  generateMonthlyBillingReportAction,
  type MonthlyBillingActionResult,
} from "@/lib/billing/actions";
import type { BillingReportStatus } from "@/lib/billing/types";

type MonthlyReportActionsProps = {
  accountSlug: string;
  year: number;
  month: number;
  reportId: string | null;
  reportStatus: BillingReportStatus | null;
  canFinalize: boolean;
  sheetConfigured: boolean;
};

export const MonthlyReportActions = ({
  accountSlug,
  year,
  month,
  reportId,
  reportStatus,
  canFinalize,
  sheetConfigured,
}: MonthlyReportActionsProps) => {
  const router = useRouter();
  const [isGenerating, startGenerating] = useTransition();
  const [isFinalizing, startFinalizing] = useTransition();
  const [result, setResult] = useState<MonthlyBillingActionResult | null>(null);

  const handleGenerate = () => {
    startGenerating(async () => {
      const nextResult = await generateMonthlyBillingReportAction({
        accountSlug,
        year,
        month,
      });

      setResult(nextResult);
      if (nextResult.ok) {
        router.refresh();
      }
    });
  };

  const handleFinalize = () => {
    if (!reportId) return;

    startFinalizing(async () => {
      const nextResult = await finalizeMonthlyBillingReportAction({ reportId });

      setResult(nextResult);
      if (nextResult.ok) {
        router.refresh();
      }
    });
  };

  const generateLabel =
    reportStatus === "draft" ? "Regenerate draft" : "Generate draft";
  const finalizeDisabled =
    !reportId || !canFinalize || reportStatus === "finalized" || isFinalizing;

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
        <Button
          type="button"
          variant="outline"
          disabled={finalizeDisabled}
          onClick={handleFinalize}
        >
          {isFinalizing ? "Finalizing\u2026" : "Finalize report"}
        </Button>
        {reportId ? (
          <Button asChild type="button" variant="outline">
            <a href={`/api/admin/reports/monthly/${reportId}/csv`}>
              Export CSV
            </a>
          </Button>
        ) : null}
      </div>

      {result ? (
        <Alert variant={result.ok ? "default" : "destructive"}>
          <AlertTitle>
            {result.ok ? "Report updated" : "Action failed"}
          </AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
};
