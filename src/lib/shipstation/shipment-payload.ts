import { z } from "zod";

const shipToSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    company_name: z.string().nullable().optional(),
    address_line1: z.string().nullable().optional(),
    address_line2: z.string().nullable().optional(),
    address_line3: z.string().nullable().optional(),
    city_locality: z.string().nullable().optional(),
    state_province: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
    address_residential_indicator: z
      .enum(["yes", "no", "unknown"])
      .nullable()
      .optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const tagSchema = z.object({ name: z.string() }).passthrough();

const weightSchema = z
  .object({
    value: z.number(),
    // V2 docs disagree: list response uses `units`, get-by-id uses `unit`.
    // Accept either and normalize at the call site if ever needed.
    units: z.string().optional(),
    unit: z.string().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const shipmentItemSchema = z
  .object({
    quantity: z.union([z.number(), z.string()]).nullable().optional(),
    unit_price: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export const shipstationShipmentSchema = z
  .object({
    shipment_id: z.string(),
    shipment_number: z.string().nullable().optional(),
    external_shipment_id: z.string().nullable().optional(),
    shipment_status: z.string(),
    carrier_id: z.string().nullable().optional(),
    service_code: z.string().nullable().optional(),
    ship_date: z.string().nullable().optional(),
    created_at: z.string(),
    modified_at: z.string(),
    ship_to: shipToSchema,
    ship_from: shipToSchema,
    warehouse_id: z.string().nullable().optional(),
    tags: z.array(tagSchema).nullable().optional(),
    total_weight: weightSchema,
    packages: z.array(z.unknown()).nullable().optional(),
    items: z.array(shipmentItemSchema).optional(),
  })
  .passthrough();

export type ShipstationShipmentPayload = z.infer<
  typeof shipstationShipmentSchema
>;
