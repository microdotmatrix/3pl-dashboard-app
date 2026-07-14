import "server-only";

import { z } from "zod";

import {
  type ShipstationShipmentPayload,
  shipstationShipmentSchema,
} from "./shipment-payload";

const BASE_URL = "https://api.shipstation.com/v2";

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
  getShipmentById: (
    shipmentId: string,
  ) => Promise<ShipstationShipmentPayload>;
  listPackageTypes: () => Promise<ShipstationPackageTypesResponse>;
  createPackageType: (
    packageType: ShipstationPackageTypeInput,
  ) => Promise<ShipstationPackageType>;
  updatePackageType: (
    packageId: string,
    packageType: ShipstationPackageTypeInput,
  ) => Promise<void>;
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

const dimensionSchema = z.object({
  unit: z.string().optional(),
  units: z.string().optional(),
  length: z.number(),
  width: z.number(),
  height: z.number(),
});

export const shipstationPackageTypeSchema = z.object({
  package_id: z.string(),
  package_code: z.string(),
  name: z.string(),
  dimensions: dimensionSchema,
  description: z.string().nullable().optional(),
});

export type ShipstationPackageType = z.infer<
  typeof shipstationPackageTypeSchema
>;

export const shipstationPackageTypesResponseSchema = z.object({
  packages: z.array(shipstationPackageTypeSchema),
});

export type ShipstationPackageTypesResponse = z.infer<
  typeof shipstationPackageTypesResponseSchema
>;

export type ShipstationPackageTypeInput = {
  package_code: string;
  name: string;
  dimensions: {
    unit: "inch";
    length: number;
    width: number;
    height: number;
  };
  description: string;
};

const requestWithRetry = async (
  url: string,
  apiKey: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
  } = {},
): Promise<unknown> => {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "API-Key": apiKey,
        Accept: "application/json",
        ...init.headers,
      },
      body: init.body,
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

    if (response.status === 204) {
      return undefined;
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
    const raw = await requestWithRetry(url, apiKey);
    return shipstationListResponseSchema.parse(raw);
  };

  const fetchPackageTypes =
    async (): Promise<ShipstationPackageTypesResponse> => {
      const raw = await requestWithRetry(`${BASE_URL}/packages`, apiKey);
      return shipstationPackageTypesResponseSchema.parse(raw);
    };

  return {
    accountSlug,
    listShipments: (params = {}) => fetchList(buildListUrl(params)),
    listShipmentsByUrl: (url) => fetchList(url),
    getShipmentById: async (shipmentId) => {
      const raw = await requestWithRetry(
        `${BASE_URL}/shipments/${encodeURIComponent(shipmentId)}`,
        apiKey,
      );
      return shipstationShipmentSchema.parse(raw);
    },
    listPackageTypes: fetchPackageTypes,
    createPackageType: async (packageType) => {
      try {
        const raw = await requestWithRetry(`${BASE_URL}/packages/`, apiKey, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(packageType),
        });
        return shipstationPackageTypeSchema.parse(raw);
      } catch (error) {
        throw new Error(
          `Failed to create ShipStation package preset ${packageType.package_code} (${packageType.name}) with payload ${JSON.stringify(packageType)}: ${error instanceof Error ? error.message : "Unknown ShipStation package create error."}`,
        );
      }
    },
    updatePackageType: async (packageId, packageType) => {
      try {
        await requestWithRetry(
          `${BASE_URL}/packages/${encodeURIComponent(packageId)}`,
          apiKey,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(packageType),
          },
        );
      } catch (error) {
        throw new Error(
          `Failed to update ShipStation package preset ${packageType.package_code} (${packageType.name}) at ${packageId} with payload ${JSON.stringify(packageType)}: ${error instanceof Error ? error.message : "Unknown ShipStation package update error."}`,
        );
      }
    },
  };
};
