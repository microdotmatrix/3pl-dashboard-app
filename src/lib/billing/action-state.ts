import type { BillingManualMetrics } from "./types";

export type MonthlyBillingMetricsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  manualMetrics?: BillingManualMetrics;
};

export const INITIAL_MONTHLY_BILLING_METRICS_ACTION_STATE: MonthlyBillingMetricsActionState =
  {
    status: "idle",
  };
