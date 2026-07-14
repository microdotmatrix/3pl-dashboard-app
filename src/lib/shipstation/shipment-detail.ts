import { requestShipstation } from "./request";
import {
  type ShipstationShipmentPayload,
  shipstationShipmentSchema,
} from "./shipment-payload";

const BASE_URL = "https://api.shipstation.com/v2";

export const fetchShipstationShipmentById = async ({
  apiKey,
  shipmentId,
}: {
  apiKey: string;
  shipmentId: string;
}): Promise<ShipstationShipmentPayload> => {
  const raw = await requestShipstation(
    `${BASE_URL}/shipments/${encodeURIComponent(shipmentId)}`,
    apiKey,
  );
  return shipstationShipmentSchema.parse(raw);
};
