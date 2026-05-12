import type {
  BillingManualMetrics,
  BillingManualMetricsOverrides,
} from "./types";
import { EMPTY_OVERRIDES } from "./types";

export type MonthlyBillingMetricsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  manualMetrics?: BillingManualMetrics;
  manualMetricsOverrides?: BillingManualMetricsOverrides;
};

export const INITIAL_MONTHLY_BILLING_METRICS_ACTION_STATE: MonthlyBillingMetricsActionState =
  {
    status: "idle",
  };

export { EMPTY_OVERRIDES };
