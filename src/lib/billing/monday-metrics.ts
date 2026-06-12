import "server-only";

import { loadReceivingForPeriod } from "@/lib/monday/receiving";
import { loadSpecialProjectsForPeriod } from "@/lib/monday/special-projects";
import { loadStorageTrackingForPeriod } from "@/lib/monday/storage-tracking";
import { countSpecialUseCaseSalesOrders } from "@/lib/zoho/sales-orders";
import type {
  BillingAccountSlug,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
} from "./types";
import { loadSpecialUseCaseOrdersForPeriod } from "./zoho-metrics";

export {
  applySnapshotToMetrics,
  computeOverridesAgainstSnapshot,
} from "./metrics-merge";

export type MondayMetricsPullResult = {
  snapshot: BillingMondayMetricsSnapshot;
  warnings: BillingMondayMetricsWarning[];
  fetchedAt: Date;
};

export const pullMondayMetricsForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<MondayMetricsPullResult> => {
  const [storage, receiving, projects, zohoSalesOrders] = await Promise.all([
    loadStorageTrackingForPeriod({ accountSlug, year, month }),
    loadReceivingForPeriod({ accountSlug, year, month }),
    loadSpecialProjectsForPeriod({ accountSlug, year, month }),
    loadSpecialUseCaseOrdersForPeriod({
      accountSlug,
      year,
      month,
      counter: countSpecialUseCaseSalesOrders,
    }),
  ]);

  const snapshot: BillingMondayMetricsSnapshot = {
    ...(storage?.snapshot ?? {}),
    ...receiving.snapshot,
    ...projects.snapshot,
    ...zohoSalesOrders.snapshot,
  };

  const warnings: BillingMondayMetricsWarning[] = [
    ...(storage?.warnings ?? []),
    ...receiving.warnings,
    ...projects.warnings,
    ...zohoSalesOrders.warnings,
  ];

  return { snapshot, warnings, fetchedAt: new Date() };
};
