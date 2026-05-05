import "server-only";

import { z } from "zod";

const BASE_URL = "https://api.shipstation.com/v2";

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
  .nullable()
  .optional();

const tagSchema = z.object({ name: z.string() });

const weightSchema = z
  .object({
    value: z.number(),
    // V2 docs disagree: list response uses `units`, get-by-id uses `unit`.
    // Accept either and normalize at the call site if ever needed.
    units: z.string().optional(),
    unit: z.string().optional(),
  })
  .nullable()
  .optional();

export const shipstationShipmentSchema = z.object({
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
});

export type ShipstationShipmentPayload = z.infer<
  typeof shipstationShipmentSchema
>;

const linkSchema = z.union([
  z.object({ href: z.string() }),
  z.object({}).strict(),
]);

const linksSchema = z.object({
  first: linkSchema.optional(),
  last: linkSchema.optional(),
  prev: linkSchema.optional(),
  next: linkSchema.optional(),
});

export const shipstationListResponseSchema = z.object({
  shipments: z.array(shipstationShipmentSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
  links: linksSchema,
});

export type ShipstationListResponse = z.infer<
  typeof shipstationListResponseSchema
>;

export type ListShipmentsParams = {
  modifiedAtStart?: string;
  modifiedAtEnd?: string;
  shipmentStatus?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "modified_at" | "created_at";
  sortDir?: "asc" | "desc";
};

export type ShipstationClient = {
  accountSlug: string;
  listShipments: (
    params?: ListShipmentsParams,
  ) => Promise<ShipstationListResponse>;
  listShipmentsByUrl: (url: string) => Promise<ShipstationListResponse>;
};

const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildListUrl = (params: ListShipmentsParams): string => {
  const url = new URL(`${BASE_URL}/shipments`);
  const {
    modifiedAtStart,
    modifiedAtEnd,
    shipmentStatus,
    page,
    pageSize,
    sortBy,
    sortDir,
  } = params;

  if (modifiedAtStart) {
    url.searchParams.set("modified_at_start", modifiedAtStart);
  }
  if (modifiedAtEnd) {
    url.searchParams.set("modified_at_end", modifiedAtEnd);
  }
  if (shipmentStatus) {
    url.searchParams.set("shipment_status", shipmentStatus);
  }
  if (page) {
    url.searchParams.set("page", String(page));
  }
  if (pageSize) {
    url.searchParams.set("page_size", String(pageSize));
  }
  if (sortBy) {
    url.searchParams.set("sort_by", sortBy);
  }
  if (sortDir) {
    url.searchParams.set("sort_dir", sortDir);
  }

  return url.toString();
};

const fetchWithRetry = async (
  url: string,
  apiKey: string,
): Promise<unknown> => {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      const waitMs = Math.max(1, retryAfter) * 1000;
      attempt += 1;

      if (attempt > MAX_RETRIES) {
        throw new Error(
          `ShipStation rate limit exhausted after ${MAX_RETRIES} retries for ${url}`,
        );
      }

      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable>");
      throw new Error(
        `ShipStation ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 500)}`,
      );
    }

    return response.json();
  }
};

export const createShipstationClient = ({
  apiKey,
  accountSlug,
}: {
  apiKey: string;
  accountSlug: string;
}): ShipstationClient => {
  const fetchList = async (url: string): Promise<ShipstationListResponse> => {
    const raw = await fetchWithRetry(url, apiKey);
    return shipstationListResponseSchema.parse(raw);
  };

  return {
    accountSlug,
    listShipments: (params = {}) => fetchList(buildListUrl(params)),
    listShipmentsByUrl: (url) => fetchList(url),
  };
};
