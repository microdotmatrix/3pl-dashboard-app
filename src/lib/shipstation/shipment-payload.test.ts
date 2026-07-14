import { describe, expect, it } from "vitest";

import { shipstationShipmentSchema } from "./shipment-payload";

const makeShipment = () => ({
  shipment_id: "se-523116393",
  shipment_number: "32820",
  external_shipment_id: "order-32820",
  shipment_status: "label_purchased",
  carrier_id: "se-carrier",
  service_code: "usps_ground_advantage",
  ship_date: "2026-05-05T00:00:00.000Z",
  created_at: "2026-05-05T18:00:00.000Z",
  modified_at: "2026-05-05T18:30:00.000Z",
  ship_to: null,
  ship_from: null,
  warehouse_id: null,
  tags: [],
  total_weight: null,
  packages: [],
});

describe("shipstationShipmentSchema", () => {
  it("retains shipment items and their quantities", () => {
    const parsed = shipstationShipmentSchema.parse({
      ...makeShipment(),
      items: [
        {
          sku: "FAG-001",
          quantity: 2,
          unit_price: 12.5,
          adjustment: false,
        },
      ],
    });

    expect(parsed.items).toEqual([
      {
        sku: "FAG-001",
        quantity: 2,
        unit_price: 12.5,
        adjustment: false,
      },
    ]);
  });

  it("retains additional shipment fields in the stored raw payload", () => {
    const parsed = shipstationShipmentSchema.parse({
      ...makeShipment(),
      items: [],
      external_order_id: "32820",
      advanced_options: { bill_to_party: "sender" },
    });

    expect(parsed).toMatchObject({
      external_order_id: "32820",
      advanced_options: { bill_to_party: "sender" },
    });
  });
});
