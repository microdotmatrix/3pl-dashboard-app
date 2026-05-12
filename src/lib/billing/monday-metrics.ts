import "server-only";

import { loadReceivingForPeriod } from "@/lib/monday/receiving";
import { loadSpecialProjectsForPeriod } from "@/lib/monday/special-projects";
import { loadStorageTrackingForPeriod } from "@/lib/monday/storage-tracking";

import type {
  BillingAccountSlug,
  BillingManualMetrics,
  BillingManualMetricsOverrides,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
} from "./types";
import { ALL_METRIC_KEYS } from "./types";

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
  const [storage, receiving, projects] = await Promise.all([
    loadStorageTrackingForPeriod({ accountSlug, year, month }),
    loadReceivingForPeriod({ accountSlug, year, month }),
    loadSpecialProjectsForPeriod({ accountSlug, year, month }),
  ]);

  const snapshot: BillingMondayMetricsSnapshot = {
    ...(storage?.snapshot ?? {}),
    ...receiving.snapshot,
    ...projects.snapshot,
  };

  const warnings: BillingMondayMetricsWarning[] = [
    ...(storage?.warnings ?? []),
    ...receiving.warnings,
    ...projects.warnings,
  ];

  return { snapshot, warnings, fetchedAt: new Date() };
};

/**
 * Overlay a Monday snapshot on top of the report's current state.
 * Per-field: if overridden, keep current; else replace with snapshot value
 * when snapshot has a finite number; else keep current.
 */
export const applySnapshotToMetrics = ({
  currentMetrics,
  currentOverrides,
  snapshot,
}: {
  currentMetrics: BillingManualMetrics;
  currentOverrides: BillingManualMetricsOverrides;
  snapshot: BillingMondayMetricsSnapshot;
}): {
  nextMetrics: BillingManualMetrics;
  nextOverrides: BillingManualMetricsOverrides;
} => {
  const nextMetrics = { ...currentMetrics };
  const nextOverrides = { ...currentOverrides };

  for (const key of ALL_METRIC_KEYS) {
    if (currentOverrides[key]) continue;
    const incoming = snapshot[key];
    if (typeof incoming === "number" && Number.isFinite(incoming)) {
      nextMetrics[key] = incoming;
    }
  }

  return { nextMetrics, nextOverrides };
};

/**
 * Override-flag rule applied at save time: a field is overridden iff its
 * submitted value differs from the current Monday snapshot. If the snapshot
 * is null/absent for a key, any saved value is considered manual.
 */
export const computeOverridesAgainstSnapshot = ({
  submittedMetrics,
  snapshot,
}: {
  submittedMetrics: BillingManualMetrics;
  snapshot: BillingMondayMetricsSnapshot;
}): BillingManualMetricsOverrides => {
  const overrides = {} as BillingManualMetricsOverrides;
  for (const key of ALL_METRIC_KEYS) {
    const submitted = submittedMetrics[key];
    const snap = snapshot[key];
    if (typeof snap === "number" && Number.isFinite(snap)) {
      overrides[key] = submitted !== snap;
    } else {
      overrides[key] = true;
    }
  }
  return overrides;
};
