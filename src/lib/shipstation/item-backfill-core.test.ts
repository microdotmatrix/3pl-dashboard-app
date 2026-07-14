import { describe, expect, it, vi } from "vitest";

import { backfillShipmentItems } from "./item-backfill-core";

const candidates = [
  { id: "db-1", externalId: "se-1" },
  { id: "db-2", externalId: "se-2" },
];

describe("backfillShipmentItems", () => {
  it("is dry-run only unless apply is explicitly enabled", async () => {
    const fetchShipment = vi.fn();
    const persistShipment = vi.fn();

    const result = await backfillShipmentItems({
      candidates,
      apply: false,
      fetchShipment,
      persistShipment,
    });

    expect(result).toEqual({
      scanned: 2,
      repaired: 0,
      failed: 0,
      errors: [],
    });
    expect(fetchShipment).not.toHaveBeenCalled();
    expect(persistShipment).not.toHaveBeenCalled();
  });

  it("fetches and persists item-bearing shipment details", async () => {
    const fetchShipment = vi.fn(async (externalId: string) => ({
      shipment_id: externalId,
      items: [{ quantity: 2, unit_price: 5 }],
    }));
    const persistShipment = vi.fn(async () => undefined);

    const result = await backfillShipmentItems({
      candidates,
      apply: true,
      fetchShipment,
      persistShipment,
    });

    expect(result.repaired).toBe(2);
    expect(result.failed).toBe(0);
    expect(fetchShipment).toHaveBeenCalledTimes(2);
    expect(persistShipment).toHaveBeenCalledTimes(2);
    expect(persistShipment).toHaveBeenNthCalledWith(
      1,
      candidates[0],
      expect.objectContaining({ shipment_id: "se-1" }),
    );
  });

  it("records itemless responses and continues repairing other shipments", async () => {
    const fetchShipment = vi.fn(async (externalId: string) =>
      externalId === "se-1"
        ? { shipment_id: externalId }
        : { shipment_id: externalId, items: [] },
    );
    const persistShipment = vi.fn(async () => undefined);

    const result = await backfillShipmentItems({
      candidates,
      apply: true,
      fetchShipment,
      persistShipment,
    });

    expect(result.repaired).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      {
        externalId: "se-1",
        message: "ShipStation response is missing items.",
      },
    ]);
    expect(persistShipment).toHaveBeenCalledTimes(1);
  });
});
