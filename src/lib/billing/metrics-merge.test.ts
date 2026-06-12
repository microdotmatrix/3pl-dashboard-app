import { describe, expect, test } from "vitest";

import { applySnapshotToMetrics } from "./metrics-merge";
import type { BillingManualMetrics } from "./types";
import { EMPTY_OVERRIDES } from "./types";

const METRICS: BillingManualMetrics = {
  smallBinCount: 1,
  mediumBinCount: 2,
  largeBinCount: 3,
  additionalCartonsCount: 4,
  cartonsReceivedTotal: 5,
  palletsReceivedTotal: 6,
  retailReturnsTotal: 7,
  specialProjectHours: 8,
  specialUseCaseOrdersCount: 9,
};

describe("applySnapshotToMetrics", () => {
  test("a key absent from the snapshot leaves the current value untouched", () => {
    const { nextMetrics } = applySnapshotToMetrics({
      currentMetrics: METRICS,
      currentOverrides: EMPTY_OVERRIDES,
      snapshot: { cartonsReceivedTotal: 50 },
    });

    expect(nextMetrics.specialUseCaseOrdersCount).toBe(9);
    expect(nextMetrics.cartonsReceivedTotal).toBe(50);
  });

  test("an overridden key keeps its manual value even when the snapshot has data", () => {
    const { nextMetrics } = applySnapshotToMetrics({
      currentMetrics: METRICS,
      currentOverrides: {
        ...EMPTY_OVERRIDES,
        specialUseCaseOrdersCount: true,
      },
      snapshot: { specialUseCaseOrdersCount: 42 },
    });

    expect(nextMetrics.specialUseCaseOrdersCount).toBe(9);
  });

  test("a snapshot number replaces a non-overridden value", () => {
    const { nextMetrics } = applySnapshotToMetrics({
      currentMetrics: METRICS,
      currentOverrides: EMPTY_OVERRIDES,
      snapshot: { specialUseCaseOrdersCount: 42 },
    });

    expect(nextMetrics.specialUseCaseOrdersCount).toBe(42);
  });
});
