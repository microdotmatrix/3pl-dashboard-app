import { describe, expect, it } from "vitest";

import {
  getUnitsPickedFromRawShipment,
  resolveShipmentUnitsPicked,
} from "./units-picked";

describe("getUnitsPickedFromRawShipment", () => {
  it("returns null when item data is missing", () => {
    expect(getUnitsPickedFromRawShipment({ shipment_id: "se-1" })).toBeNull();
  });

  it("returns zero for a present but empty items array", () => {
    expect(getUnitsPickedFromRawShipment({ items: [] })).toBe(0);
  });

  it("sums positive numeric and numeric-string quantities", () => {
    expect(
      getUnitsPickedFromRawShipment({
        items: [
          { quantity: 2, unit_price: 10 },
          { quantity: "3", unit_price: "5.50" },
          { quantity: 0, unit_price: 1 },
          { quantity: -1, unit_price: 1 },
        ],
      }),
    ).toBe(5);
  });

  it("excludes adjustment rows with a negative unit price", () => {
    expect(
      getUnitsPickedFromRawShipment({
        items: [
          { quantity: 2, unit_price: 10 },
          { quantity: 1, unit_price: -4 },
          { quantity: "1", unit_price: "-2" },
        ],
      }),
    ).toBe(2);
  });

  it("returns null when items is not an array", () => {
    expect(getUnitsPickedFromRawShipment({ items: null })).toBeNull();
  });
});

describe("resolveShipmentUnitsPicked", () => {
  it("prefers the persisted value over recomputing from raw", () => {
    expect(
      resolveShipmentUnitsPicked({
        externalId: "se-1",
        storedUnitsPicked: 7,
        raw: { items: [{ quantity: 99, unit_price: 1 }] },
      }),
    ).toBe(7);
  });

  it("treats a persisted zero as a real value rather than missing data", () => {
    expect(
      resolveShipmentUnitsPicked({
        externalId: "se-1",
        storedUnitsPicked: 0,
        raw: null,
      }),
    ).toBe(0);
  });

  it("recomputes from raw when no value was persisted", () => {
    expect(
      resolveShipmentUnitsPicked({
        externalId: "se-1",
        storedUnitsPicked: null,
        raw: { items: [{ quantity: 4, unit_price: 2 }] },
      }),
    ).toBe(4);
  });

  it("throws instead of billing zero when units cannot be determined", () => {
    expect(() =>
      resolveShipmentUnitsPicked({
        externalId: "se-362710943",
        storedUnitsPicked: null,
        raw: { shipment_id: "se-362710943" },
      }),
    ).toThrow(/se-362710943/);
  });

  it("throws when the shipment row could not be joined at all", () => {
    expect(() =>
      resolveShipmentUnitsPicked({
        externalId: "se-2",
        storedUnitsPicked: null,
        raw: null,
      }),
    ).toThrow(/missing line-item data/);
  });
});
