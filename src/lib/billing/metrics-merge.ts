import type {
  BillingManualMetrics,
  BillingManualMetricsOverrides,
  BillingMondayMetricsSnapshot,
} from "./types";
import { ALL_METRIC_KEYS } from "./types";

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
