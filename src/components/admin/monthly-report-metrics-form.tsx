"use client";

import { useActionState, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  INITIAL_MONTHLY_BILLING_METRICS_ACTION_STATE,
  type MonthlyBillingMetricsActionState,
} from "@/lib/billing/action-state";
import { saveMonthlyBillingReportManualMetricsAction } from "@/lib/billing/actions";
import type {
  BillingManualMetrics,
  BillingReportStatus,
} from "@/lib/billing/types";

type MonthlyReportMetricsFormProps = {
  reportId: string;
  reportStatus: BillingReportStatus;
  manualMetrics: BillingManualMetrics;
};

type MetricDraftValues = Record<keyof BillingManualMetrics, string>;

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const fieldError = (
  state: MonthlyBillingMetricsActionState,
  key: keyof BillingManualMetrics,
) => state.fieldErrors?.[key];

const buildDraftValues = (
  metrics: BillingManualMetrics,
): MetricDraftValues => ({
  smallBinCount: String(metrics.smallBinCount),
  mediumBinCount: String(metrics.mediumBinCount),
  largeBinCount: String(metrics.largeBinCount),
  cartonsReceivedTotal: String(metrics.cartonsReceivedTotal),
  retailReturnsTotal: String(metrics.retailReturnsTotal),
  specialProjectHours: String(metrics.specialProjectHours),
});

const METRIC_FIELDS: Array<{
  key: keyof BillingManualMetrics;
  label: string;
  description: string;
  inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  step: string;
  format: (value: number) => string;
}> = [
  {
    key: "smallBinCount",
    label: "Small bin count",
    description: "Total small storage bins on hand at month end.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "mediumBinCount",
    label: "Medium bin count",
    description: "Total medium storage bins on hand at month end.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "largeBinCount",
    label: "Large bin count",
    description: "Total large storage bins on hand at month end.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "cartonsReceivedTotal",
    label: "Cartons received",
    description: "Total cartons received during the month.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "retailReturnsTotal",
    label: "Retail returns",
    description: "Total retail returns processed during the month.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "specialProjectHours",
    label: "Special project hours",
    description: "Total special project labor hours for the month.",
    inputMode: "decimal",
    step: "0.01",
    format: (value) => numberFormatter.format(value),
  },
];

const FormStatusMessage = ({
  state,
}: {
  state: MonthlyBillingMetricsActionState;
}) => {
  if (!state.message) return null;

  if (state.status === "success") {
    return (
      <Alert className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return null;
};

export const MonthlyReportMetricsForm = ({
  reportId,
  reportStatus,
  manualMetrics,
}: MonthlyReportMetricsFormProps) => {
  const [state, formAction, isPending] = useActionState<
    MonthlyBillingMetricsActionState,
    FormData
  >(
    saveMonthlyBillingReportManualMetricsAction,
    INITIAL_MONTHLY_BILLING_METRICS_ACTION_STATE,
  );
  const currentMetrics = state.manualMetrics ?? manualMetrics;
  const isFinalized = reportStatus === "finalized";
  const [isEditing, setIsEditing] = useState(false);
  const [draftValues, setDraftValues] = useState<MetricDraftValues>(() =>
    buildDraftValues(manualMetrics),
  );

  useEffect(() => {
    if (!isEditing) {
      setDraftValues({
        smallBinCount: String(currentMetrics.smallBinCount),
        mediumBinCount: String(currentMetrics.mediumBinCount),
        largeBinCount: String(currentMetrics.largeBinCount),
        cartonsReceivedTotal: String(currentMetrics.cartonsReceivedTotal),
        retailReturnsTotal: String(currentMetrics.retailReturnsTotal),
        specialProjectHours: String(currentMetrics.specialProjectHours),
      });
    }
  }, [
    isEditing,
    currentMetrics.smallBinCount,
    currentMetrics.mediumBinCount,
    currentMetrics.largeBinCount,
    currentMetrics.cartonsReceivedTotal,
    currentMetrics.retailReturnsTotal,
    currentMetrics.specialProjectHours,
  ]);

  useEffect(() => {
    if (state.status === "success") {
      setIsEditing(false);
    }
  }, [state.status]);

  const setDraftValue = (key: keyof BillingManualMetrics, value: string) => {
    setDraftValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const adjustDraftValue = (
    key: keyof BillingManualMetrics,
    direction: -1 | 1,
  ) => {
    const currentValue = Number(draftValues[key] || "0");
    const nextValue = Number.isFinite(currentValue)
      ? Math.max(0, currentValue + direction)
      : Math.max(0, direction);

    setDraftValue(
      key,
      key === "specialProjectHours"
        ? String(nextValue)
        : String(Math.trunc(nextValue)),
    );
  };

  const handleCancel = () => {
    setDraftValues(buildDraftValues(currentMetrics));
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Month-end vendor metrics</CardTitle>
            <CardDescription>
              Save the manual month-end counts that are not derived from
              ShipStation yet.
            </CardDescription>
          </div>
          {!isFinalized ? (
            isEditing ? (
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  form="monthly-report-metrics-form"
                  disabled={isPending}
                >
                  {isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            )
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isFinalized ? (
          <Alert>
            <AlertDescription>
              This report has been finalized, so month-end metrics are now
              read-only.
            </AlertDescription>
          </Alert>
        ) : null}

        <form
          id="monthly-report-metrics-form"
          action={formAction}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="reportId" value={reportId} />
          <FormStatusMessage state={state} />

          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {METRIC_FIELDS.map((metric) => (
              <Field
                key={metric.key}
                className="rounded-md border border-border/60 bg-muted/30 p-3"
              >
                <FieldTitle>{metric.label}</FieldTitle>
                <input
                  type="hidden"
                  name={metric.key}
                  value={
                    isEditing
                      ? draftValues[metric.key]
                      : String(currentMetrics[metric.key])
                  }
                />
                {isEditing ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupButton
                          type="button"
                          size="icon-xs"
                          aria-label={`Decrease ${metric.label}`}
                          disabled={isPending}
                          onClick={() => adjustDraftValue(metric.key, -1)}
                        >
                          -
                        </InputGroupButton>
                      </InputGroupAddon>
                      <InputGroupInput
                        id={metric.key}
                        type="number"
                        min="0"
                        step={metric.step}
                        inputMode={metric.inputMode}
                        value={draftValues[metric.key]}
                        disabled={isPending}
                        aria-invalid={
                          Boolean(fieldError(state, metric.key)) || undefined
                        }
                        className="text-center font-heading text-lg font-semibold"
                        onChange={(event) =>
                          setDraftValue(metric.key, event.currentTarget.value)
                        }
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          type="button"
                          size="icon-xs"
                          aria-label={`Increase ${metric.label}`}
                          disabled={isPending}
                          onClick={() => adjustDraftValue(metric.key, 1)}
                        >
                          +
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </div>
                ) : (
                  <p className="mt-2 font-heading text-2xl font-semibold">
                    {metric.format(currentMetrics[metric.key])}
                  </p>
                )}
                <FieldDescription>{metric.description}</FieldDescription>
                <FieldError>{fieldError(state, metric.key)}</FieldError>
              </Field>
            ))}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
