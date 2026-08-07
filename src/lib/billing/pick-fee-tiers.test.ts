import { describe, expect, it } from "vitest";

import {
  classifyPickFeeTier,
  DIP_PICK_FEE_TIERS,
  emptyUnitsPickedByTier,
  getPickFeeTiers,
  getUnitsPickedByTierFromRawShipment,
  resolveShipmentUnitsPickedByTier,
} from "./pick-fee-tiers";

describe("getPickFeeTiers", () => {
  it("returns the DIP tiers for dip", () => {
    expect(getPickFeeTiers("dip")).toBe(DIP_PICK_FEE_TIERS);
  });

  it("returns null for flat-rate vendors", () => {
    expect(getPickFeeTiers("ryot")).toBeNull();
    expect(getPickFeeTiers("fatass")).toBeNull();
  });

  it("returns null for unknown slugs", () => {
    expect(getPickFeeTiers("not-a-vendor")).toBeNull();
  });
});

describe("classifyPickFeeTier", () => {
  it.each([
    [0, "tier1"],
    [0.99, "tier1"],
    [1.0, "tier1"],
    [1.01, "tier2"],
    [2.5, "tier2"],
    [2.51, "tier3"],
    [5.0, "tier3"],
    [5.01, "tier4"],
    [120, "tier4"],
  ])("assigns a unit price of %s to %s", (unitPrice, expected) => {
    expect(classifyPickFeeTier(unitPrice, DIP_PICK_FEE_TIERS)).toBe(expected);
  });

  it("never leaves a gap between tiers", () => {
    // A price like $1.005 sits between the labelled ranges but must still land
    // in a tier — inclusive upper bounds make the ranges continuous.
    expect(classifyPickFeeTier(1.005, DIP_PICK_FEE_TIERS)).toBe("tier2");
    expect(classifyPickFeeTier(2.505, DIP_PICK_FEE_TIERS)).toBe("tier3");
    expect(classifyPickFeeTier(5.005, DIP_PICK_FEE_TIERS)).toBe("tier4");
  });
});

describe("getUnitsPickedByTierFromRawShipment", () => {
  it("returns null when item data is missing", () => {
    expect(
      getUnitsPickedByTierFromRawShipment(
        { shipment_id: "se-1" },
        DIP_PICK_FEE_TIERS,
      ),
    ).toBeNull();
  });

  it("returns null when items is not an array", () => {
    expect(
      getUnitsPickedByTierFromRawShipment({ items: null }, DIP_PICK_FEE_TIERS),
    ).toBeNull();
  });

  it("returns all-zero buckets for an empty items array", () => {
    expect(
      getUnitsPickedByTierFromRawShipment({ items: [] }, DIP_PICK_FEE_TIERS),
    ).toEqual(emptyUnitsPickedByTier());
  });

  it("buckets quantities by unit price, accepting numeric strings", () => {
    expect(
      getUnitsPickedByTierFromRawShipment(
        {
          items: [
            { quantity: 7, unit_price: 0.5 },
            { quantity: "88", unit_price: "1.99" },
            { quantity: 100, unit_price: 3 },
            { quantity: 88, unit_price: 4.25 },
            { quantity: 181, unit_price: 12.0 },
          ],
        },
        DIP_PICK_FEE_TIERS,
      ),
    ).toEqual({ tier1: 7, tier2: 88, tier3: 188, tier4: 181 });
  });

  it("skips zero/negative quantities and negative-price adjustment rows", () => {
    expect(
      getUnitsPickedByTierFromRawShipment(
        {
          items: [
            { quantity: 2, unit_price: 10 },
            { quantity: 0, unit_price: 1 },
            { quantity: -1, unit_price: 1 },
            { quantity: 1, unit_price: -4 },
            { quantity: "1", unit_price: "-2" },
          ],
        },
        DIP_PICK_FEE_TIERS,
      ),
    ).toEqual({ tier1: 0, tier2: 0, tier3: 0, tier4: 2 });
  });

  it("throws on an empty-string unit price instead of treating it as $0", () => {
    // Number("") is 0 in JS; letting that through would silently bill the
    // cheapest tier for an item whose price is actually unknown.
    expect(() =>
      getUnitsPickedByTierFromRawShipment(
        { items: [{ sku: "DIP-BLANK", quantity: 2, unit_price: "" }] },
        DIP_PICK_FEE_TIERS,
      ),
    ).toThrow(/DIP-BLANK/);
  });

  it("throws instead of guessing when a counted item has no unit price", () => {
    expect(() =>
      getUnitsPickedByTierFromRawShipment(
        {
          items: [
            { quantity: 2, unit_price: 1 },
            { sku: "DIP-MYSTERY", quantity: 3 },
          ],
        },
        DIP_PICK_FEE_TIERS,
      ),
    ).toThrow(/DIP-MYSTERY/);
  });
});

describe("resolveShipmentUnitsPickedByTier", () => {
  const stored = { tier1: 1, tier2: 2, tier3: 3, tier4: 4 };

  it("prefers the persisted breakdown over recomputing from raw", () => {
    expect(
      resolveShipmentUnitsPickedByTier({
        externalId: "se-1",
        storedUnitsPickedByTier: stored,
        unitsPicked: 10,
        raw: { items: [{ quantity: 99, unit_price: 1 }] },
        tiers: DIP_PICK_FEE_TIERS,
      }),
    ).toBe(stored);
  });

  it("recomputes from raw when nothing was persisted", () => {
    expect(
      resolveShipmentUnitsPickedByTier({
        externalId: "se-1",
        storedUnitsPickedByTier: null,
        unitsPicked: 4,
        raw: { items: [{ quantity: 4, unit_price: 2 }] },
        tiers: DIP_PICK_FEE_TIERS,
      }),
    ).toEqual({ tier1: 0, tier2: 4, tier3: 0, tier4: 0 });
  });

  it("throws when the recomputed breakdown disagrees with units picked", () => {
    expect(() =>
      resolveShipmentUnitsPickedByTier({
        externalId: "se-77",
        storedUnitsPickedByTier: null,
        unitsPicked: 9,
        raw: { items: [{ quantity: 4, unit_price: 2 }] },
        tiers: DIP_PICK_FEE_TIERS,
      }),
    ).toThrow(/se-77/);
  });

  it("throws instead of billing zero when line items are missing", () => {
    expect(() =>
      resolveShipmentUnitsPickedByTier({
        externalId: "se-362710943",
        storedUnitsPickedByTier: null,
        unitsPicked: 5,
        raw: { shipment_id: "se-362710943" },
        tiers: DIP_PICK_FEE_TIERS,
      }),
    ).toThrow(/se-362710943/);
  });

  it("wraps unclassifiable-item errors with the shipment id", () => {
    expect(() =>
      resolveShipmentUnitsPickedByTier({
        externalId: "se-88",
        storedUnitsPickedByTier: null,
        unitsPicked: 3,
        raw: { items: [{ quantity: 3 }] },
        tiers: DIP_PICK_FEE_TIERS,
      }),
    ).toThrow(/se-88/);
  });
});
