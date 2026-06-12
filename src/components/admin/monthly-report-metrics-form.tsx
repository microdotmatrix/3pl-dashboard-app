"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

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
  FieldLegend,
  FieldSet,
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
import {
  refreshMondayMetricsAction,
  saveMonthlyBillingReportManualMetricsAction,
} from "@/lib/billing/actions";
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
  accountSlug: string;
  manualMetrics: BillingManualMetrics;
  mondayMetricsSnapshot: BillingMondayMetricsSnapshot;
  manualMetricsOverrides: BillingManualMetricsOverrides;
  mondayMetricsFetchedAt: Date | null;
  mondayMetricsWarnings: BillingMondayMetricsWarning[];
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
  additionalCartonsCount: String(metrics.additionalCartonsCount),
  cartonsReceivedTotal: String(metrics.cartonsReceivedTotal),
  palletsReceivedTotal: String(metrics.palletsReceivedTotal),
  retailReturnsTotal: String(metrics.retailReturnsTotal),
  specialProjectHours: String(metrics.specialProjectHours),
  specialUseCaseOrdersCount: String(metrics.specialUseCaseOrdersCount),
});

type MetricField = {
  key: keyof BillingManualMetrics;
  label: string;
  description: string;
  abbreviation?: string;
  inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  step: string;
  format: (value: number) => string;
  sourceLabel?: "Monday" | "Zoho";
};

type MetricSection = {
  title: string;
  description: string;
  gridClassName: string;
  layout?: "default" | "split";
  fields: MetricField[];
};

const STORAGE_METRICS: MetricField[] = [
  {
    key: "smallBinCount",
    label: "Small bin count",
    description: "Total small storage bins on hand at month end.",
    abbreviation: "SM",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "mediumBinCount",
    label: "Medium bin count",
    description: "Total medium storage bins on hand at month end.",
    abbreviation: "MD",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "largeBinCount",
    label: "Large bin count",
    description: "Total large storage bins on hand at month end.",
    abbreviation: "LG",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "additionalCartonsCount",
    label: "Additional cartons",
    description: "Additional storage cartons on hand at month end.",
    abbreviation: "EX",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
];

const RECEIVING_AND_PROJECT_METRICS: MetricField[] = [
  {
    key: "cartonsReceivedTotal",
    label: "Cartons received",
    description: "Total cartons received during the month.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
  },
  {
    key: "palletsReceivedTotal",
    label: "Pallets received",
    description: "Total pallets received during the month.",
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

const METRIC_SECTIONS: MetricSection[] = [
  {
    title: "Storage metrics",
    description:
      "Month-end storage counts for bins and any additional cartons on hand.",
    gridClassName: "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
    layout: "split",
    fields: STORAGE_METRICS,
  },
  {
    title: "Receiving & special projects",
    description:
      "Monthly receiving volume, retail returns, and special project labor.",
    gridClassName: "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
    fields: RECEIVING_AND_PROJECT_METRICS,
  },
];

const SPECIAL_USE_CASE_METRICS: MetricField[] = [
  {
    key: "specialUseCaseOrdersCount",
    label: "Special use case orders",
    description:
      "Sales orders marked 'Contains 3PL SKUs' — combined 3PL + drop-ship shipments. Pulled from Zoho Books.",
    inputMode: "numeric",
    step: "1",
    format: (value) => numberFormatter.format(value),
    sourceLabel: "Zoho",
  },
];

const FATASS_ACCOUNT_SLUG = "fatass";

const buildMetricSections = (accountSlug: string): MetricSection[] => [
  ...METRIC_SECTIONS,
  ...(accountSlug === FATASS_ACCOUNT_SLUG
    ? [
        {
          title: "Special handling",
          description:
            "Combined-shipment sales orders pulled from Zoho Books custom fields.",
          gridClassName: "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
          fields: SPECIAL_USE_CASE_METRICS,
        },
      ]
    : []),
];

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
  sourceLabel,
}: {
  kind: FieldBadgeKind;
  snapshotValue: number | null | undefined;
  effectiveValue: number;
  sourceLabel: "Monday" | "Zoho";
}) => {
  if (kind === null) return null;
  if (kind === "monday") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {sourceLabel}
      </span>
    );
  }
  const tooltip =
    typeof snapshotValue === "number" && Number.isFinite(snapshotValue)
      ? `${sourceLabel} currently shows: ${snapshotValue}. You've overridden to ${effectiveValue}.`
      : `No data in ${sourceLabel} for this field; using manual value.`;
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400"
      title={tooltip}
    >
      Overridden
    </span>
  );
};

const computeEditHint = ({
  draftValue,
  override,
  snapshotValue,
  sourceLabel,
}: {
  draftValue: string;
  override: boolean;
  snapshotValue: number | null | undefined;
  sourceLabel: "Monday" | "Zoho";
}): string | null => {
  if (!override) return null;
  if (typeof snapshotValue !== "number" || !Number.isFinite(snapshotValue)) {
    return null;
  }
  const parsed = Number(draftValue);
  if (!Number.isFinite(parsed)) return null;
  if (parsed !== snapshotValue) return null;
  return `Matches ${sourceLabel} — override will clear.`;
};

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
  accountSlug,
  manualMetrics,
  mondayMetricsSnapshot,
  manualMetricsOverrides,
  mondayMetricsFetchedAt,
  mondayMetricsWarnings,
}: MonthlyReportMetricsFormProps) => {
  const [state, formAction, isPending] = useActionState<
    MonthlyBillingMetricsActionState,
    FormData
  >(
    saveMonthlyBillingReportManualMetricsAction,
    INITIAL_MONTHLY_BILLING_METRICS_ACTION_STATE,
  );
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
        additionalCartonsCount: String(currentMetrics.additionalCartonsCount),
        cartonsReceivedTotal: String(currentMetrics.cartonsReceivedTotal),
        palletsReceivedTotal: String(currentMetrics.palletsReceivedTotal),
        retailReturnsTotal: String(currentMetrics.retailReturnsTotal),
        specialProjectHours: String(currentMetrics.specialProjectHours),
        specialUseCaseOrdersCount: String(
          currentMetrics.specialUseCaseOrdersCount,
        ),
      });
    }
  }, [
    isEditing,
    currentMetrics.smallBinCount,
    currentMetrics.mediumBinCount,
    currentMetrics.largeBinCount,
    currentMetrics.additionalCartonsCount,
    currentMetrics.cartonsReceivedTotal,
    currentMetrics.palletsReceivedTotal,
    currentMetrics.retailReturnsTotal,
    currentMetrics.specialProjectHours,
    currentMetrics.specialUseCaseOrdersCount,
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

  const metricSections = buildMetricSections(accountSlug);

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
            <p className="text-xs text-muted-foreground">
              {mondayMetricsFetchedAt
                ? `Last refreshed from Monday: ${new Intl.DateTimeFormat(
                    "en-US",
                    {
                      dateStyle: "medium",
                      timeStyle: "short",
                    },
                  ).format(mondayMetricsFetchedAt)}`
                : "Not yet refreshed from Monday."}
            </p>
          </div>
          {!isFinalized ? (
            isEditing ? (
              <div className="mx-auto flex items-center gap-2 sm:mx-0">
                <Button
                  type="submit"
                  form="monthly-report-metrics-form"
                  disabled={isPending}
                  className="h-9 px-4 text-sm"
                >
                  {isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={handleCancel}
                  className="h-9 px-4 text-sm"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="mx-auto flex items-center gap-2 sm:mx-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-9 px-4 text-sm"
                >
                  {isRefreshing ? "Refreshing…" : "Refresh from Monday"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="h-9 animate-pulse-primary px-4 text-sm"
                >
                  Edit
                </Button>
              </div>
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

        <form
          id="monthly-report-metrics-form"
          action={formAction}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="reportId" value={reportId} />
          <FormStatusMessage state={state} />

          {mondayMetricsWarnings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {mondayMetricsWarnings
                .slice()
                .sort((a, b) => {
                  const rank = (w: BillingMondayMetricsWarning) =>
                    w.board === "connection"
                      ? 0
                      : w.severity === "error"
                        ? 1
                        : 2;
                  return rank(a) - rank(b);
                })
                .map((warning, index) => (
                  <Alert
                    key={`${warning.board}-${index}`}
                    variant={
                      warning.severity === "error" ? "destructive" : "default"
                    }
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

          <FieldGroup>
            {metricSections.map((section) => (
              <FieldSet
                key={section.title}
                className="rounded-lg border border-border/60 bg-muted/20 p-4"
              >
                <FieldLegend className="mb-1 font-heading text-sm font-semibold">
                  {section.title}
                </FieldLegend>
                <FieldDescription className="mb-3">
                  {section.description}
                </FieldDescription>
                <div className={section.gridClassName}>
                  {section.fields.map((metric) => {
                    const isSplit =
                      section.layout === "split" && metric.abbreviation;

                    if (isSplit) {
                      return (
                        <Field
                          key={metric.key}
                          className="!gap-0 overflow-hidden rounded-md border border-border/60 bg-background/80"
                        >
                          <FieldTitle className="sr-only">
                            {metric.label}
                          </FieldTitle>
                          <input
                            type="hidden"
                            name={metric.key}
                            value={
                              isEditing
                                ? draftValues[metric.key]
                                : String(currentMetrics[metric.key])
                            }
                          />
                          <div className="grid grid-cols-[5rem_1fr] items-stretch">
                            <div className="flex items-center justify-center bg-muted/40 font-heading text-3xl font-bold tracking-wider text-muted-foreground">
                              {metric.abbreviation}
                            </div>
                            <div className="relative flex items-center justify-center px-3 py-4">
                              <div className="absolute right-2 top-1">
                                {renderFieldBadge({
                                  kind: computeFieldBadge({
                                    isEditing,
                                    override:
                                      manualMetricsOverrides[metric.key],
                                    snapshotValue:
                                      mondayMetricsSnapshot[metric.key],
                                  }),
                                  snapshotValue:
                                    mondayMetricsSnapshot[metric.key],
                                  effectiveValue: currentMetrics[metric.key],
                                  sourceLabel: metric.sourceLabel ?? "Monday",
                                })}
                              </div>
                              {isEditing ? (
                                <InputGroup>
                                  <InputGroupAddon align="inline-start">
                                    <InputGroupButton
                                      type="button"
                                      size="icon-xs"
                                      aria-label={`Decrease ${metric.label}`}
                                      disabled={isPending}
                                      onClick={() =>
                                        adjustDraftValue(metric.key, -1)
                                      }
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
                                      Boolean(fieldError(state, metric.key)) ||
                                      undefined
                                    }
                                    aria-label={metric.label}
                                    className="text-center font-heading text-xl font-semibold"
                                    onChange={(event) =>
                                      setDraftValue(
                                        metric.key,
                                        event.currentTarget.value,
                                      )
                                    }
                                  />
                                  <InputGroupAddon align="inline-end">
                                    <InputGroupButton
                                      type="button"
                                      size="icon-xs"
                                      aria-label={`Increase ${metric.label}`}
                                      disabled={isPending}
                                      onClick={() =>
                                        adjustDraftValue(metric.key, 1)
                                      }
                                    >
                                      +
                                    </InputGroupButton>
                                  </InputGroupAddon>
                                </InputGroup>
                              ) : (
                                <p className="font-heading text-4xl font-semibold tabular-nums">
                                  {metric.format(currentMetrics[metric.key])}
                                </p>
                              )}
                            </div>
                          </div>
                          {isEditing
                            ? (() => {
                                const hint = computeEditHint({
                                  draftValue: draftValues[metric.key],
                                  override: manualMetricsOverrides[metric.key],
                                  snapshotValue:
                                    mondayMetricsSnapshot[metric.key],
                                  sourceLabel: metric.sourceLabel ?? "Monday",
                                });
                                return hint ? (
                                  <p className="px-3 pb-1 text-[11px] text-muted-foreground">
                                    {hint}
                                  </p>
                                ) : null;
                              })()
                            : null}
                          <FieldError className="px-3 pb-2">
                            {fieldError(state, metric.key)}
                          </FieldError>
                        </Field>
                      );
                    }

                    return (
                      <Field
                        key={metric.key}
                        className="rounded-md border border-border/60 bg-background/80 p-3"
                      >
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
                            sourceLabel: metric.sourceLabel ?? "Monday",
                          })}
                        </div>
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
                                  onClick={() =>
                                    adjustDraftValue(metric.key, -1)
                                  }
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
                                  Boolean(fieldError(state, metric.key)) ||
                                  undefined
                                }
                                className="text-center font-heading text-lg font-semibold"
                                onChange={(event) =>
                                  setDraftValue(
                                    metric.key,
                                    event.currentTarget.value,
                                  )
                                }
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  type="button"
                                  size="icon-xs"
                                  aria-label={`Increase ${metric.label}`}
                                  disabled={isPending}
                                  onClick={() =>
                                    adjustDraftValue(metric.key, 1)
                                  }
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
                        {isEditing
                          ? (() => {
                              const hint = computeEditHint({
                                draftValue: draftValues[metric.key],
                                override: manualMetricsOverrides[metric.key],
                                snapshotValue:
                                  mondayMetricsSnapshot[metric.key],
                                sourceLabel: metric.sourceLabel ?? "Monday",
                              });
                              return hint ? (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {hint}
                                </p>
                              ) : null;
                            })()
                          : null}
                        <FieldDescription>
                          {metric.description}
                        </FieldDescription>
                        <FieldError>{fieldError(state, metric.key)}</FieldError>
                      </Field>
                    );
                  })}
                </div>
              </FieldSet>
            ))}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
