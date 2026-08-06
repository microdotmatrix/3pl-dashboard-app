import { describe, expect, it } from "vitest";

import type { BillingPackageMatch } from "./types";
import { summarizeZeroCostPackages } from "./zero-cost-packages";

const packageMatch = (
  overrides: Partial<BillingPackageMatch> = {},
): BillingPackageMatch => ({
  packageIndex: 1,
  matched: true,
  pricingSource: "exact",
  ruleLabel: null,
  unitCost: 2.5,
  costApplied: 2.5,
  sourceRowNumber: null,
  originalDimensions: { length: 6, width: 4, height: 2 },
  normalizedDimensions: { longest: 6, middle: 4, shortest: 2 },
  normalizedKey: null,
  reason: null,
  ...overrides,
});

const shipment = (
  externalId: string,
  packageMatches: BillingPackageMatch[],
  shipmentNumber: string | null = null,
) => ({ externalId, shipmentNumber, packageMatches });

describe("summarizeZeroCostPackages", () => {
  it("returns null when every package carries a cost", () => {
    expect(
      summarizeZeroCostPackages([
        shipment("se-1", [packageMatch(), packageMatch({ packageIndex: 2 })]),
      ]),
    ).toBeNull();
  });

  it("returns null for a report with no shipments", () => {
    expect(summarizeZeroCostPackages([])).toBeNull();
  });

  it("flags a zero-cost package regardless of pricing source", () => {
    const summary = summarizeZeroCostPackages([
      shipment("se-1", [
        packageMatch({ pricingSource: "exact", costApplied: 0, unitCost: 0 }),
      ]),
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.packageCount).toBe(1);
    expect(summary?.shipmentCount).toBe(1);
  });

  it("counts each zero-cost package but each shipment only once", () => {
    const summary = summarizeZeroCostPackages([
      shipment("se-1", [
        packageMatch({ packageIndex: 1, costApplied: 0 }),
        packageMatch({ packageIndex: 2, costApplied: 0 }),
        packageMatch({ packageIndex: 3 }),
      ]),
      shipment("se-2", [packageMatch()]),
      shipment("se-3", [packageMatch({ packageIndex: 1, costApplied: 0 })]),
    ]);

    expect(summary?.packageCount).toBe(3);
    expect(summary?.shipmentCount).toBe(2);
  });

  it("reports the affected shipments and their package positions", () => {
    const summary = summarizeZeroCostPackages([
      shipment(
        "se-1",
        [
          packageMatch({ packageIndex: 1, costApplied: 0 }),
          packageMatch({ packageIndex: 2 }),
          packageMatch({ packageIndex: 3, costApplied: 0 }),
        ],
        "HB-1001",
      ),
    ]);

    expect(summary?.shipments).toEqual([
      { externalId: "se-1", shipmentNumber: "HB-1001", packageIndexes: [1, 3] },
    ]);
  });

  it("treats a negative cost as zero-cost so it cannot hide", () => {
    const summary = summarizeZeroCostPackages([
      shipment("se-1", [packageMatch({ costApplied: -1 })]),
    ]);

    expect(summary?.packageCount).toBe(1);
  });
});
