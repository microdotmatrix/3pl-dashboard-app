import { describe, expect, it } from "vitest";

import { getUnitsPickedFromRawShipment } from "./units-picked";

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
