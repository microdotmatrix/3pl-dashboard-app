import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  shipstationAccount,
  shipstationShipment,
  shipstationSyncCursor,
} from "@/db/schema/shipstation";
import {
  AWAITING_STATUSES,
  type ShipmentSortBy,
  type ShipmentSortDir,
} from "@/lib/shipments/constants";
import type { VendorSlug } from "@/lib/shipments/vendor-colors";

export { AWAITING_STATUSES };
export type { ShipmentSortBy, ShipmentSortDir };

const PENDING_STATUSES = ["pending", "processing"] as const;
const SHIPPED_STATUSES = ["label_purchased"] as const;

export type ShipmentStatus =
  | "pending"
  | "processing"
  | "label_purchased"
  | "on_hold"
  | "cancelled"
  | (string & {});

type ListShipmentsFilter = {
  accountSlug?: string;
  limit?: number;
};

const resolveAccountId = async (slug: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: shipstationAccount.id })
    .from(shipstationAccount)
    .where(eq(shipstationAccount.slug, slug))
    .limit(1);

  return row?.id ?? null;
};

export const listPendingShipments = async ({
  accountSlug,
  limit = 100,
}: ListShipmentsFilter = {}) => {
  const filters = [inArray(shipstationShipment.status, [...PENDING_STATUSES])];

  if (accountSlug) {
    const accountId = await resolveAccountId(accountSlug);

    if (!accountId) {
      return [];
    }

    filters.push(eq(shipstationShipment.accountId, accountId));
  }

  return db
    .select()
    .from(shipstationShipment)
    .where(and(...filters))
    .orderBy(desc(shipstationShipment.modifiedAtRemote))
    .limit(limit);
};

export const listShippedShipments = async ({
  accountSlug,
  limit = 100,
}: ListShipmentsFilter = {}) => {
  const filters = [inArray(shipstationShipment.status, [...SHIPPED_STATUSES])];

  if (accountSlug) {
    const accountId = await resolveAccountId(accountSlug);

    if (!accountId) {
      return [];
    }

    filters.push(eq(shipstationShipment.accountId, accountId));
  }

  return db
    .select()
    .from(shipstationShipment)
    .where(and(...filters))
    .orderBy(desc(shipstationShipment.shipDate))
    .limit(limit);
};

export const getShipmentByLocalId = async (id: string) => {
  const [row] = await db
    .select()
    .from(shipstationShipment)
    .where(eq(shipstationShipment.id, id))
    .limit(1);

  return row ?? null;
};

export type ShipmentWithAccount = {
  shipment: typeof shipstationShipment.$inferSelect;
  account: {
    id: string;
    slug: string;
    displayName: string;
  };
};

export type ListShipmentsFilteredParams = {
  vendorSlug?: VendorSlug;
  statuses?: string[];
  excludeCancelled?: boolean;
  from?: Date | null;
  to?: Date | null;
  sortBy?: ShipmentSortBy;
  sortDir?: ShipmentSortDir;
  page?: number;
  pageSize?: number;
};

export type ListShipmentsFilteredResult = {
  rows: ShipmentWithAccount[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const resolveSortColumn = (sortBy: ShipmentSortBy) => {
  if (sortBy === "ship") return shipstationShipment.shipDate;
  if (sortBy === "created") return shipstationShipment.createdAtRemote;
  return shipstationShipment.modifiedAtRemote;
};

const buildShipmentFilters = async (params: {
  vendorSlug?: VendorSlug;
  statuses?: string[];
  excludeCancelled?: boolean;
  from?: Date | null;
  to?: Date | null;
}): Promise<SQL | undefined> => {
  const filters: SQL[] = [];

  if (params.statuses?.length) {
    filters.push(inArray(shipstationShipment.status, params.statuses));
  }

  if (params.excludeCancelled) {
    filters.push(sql`${shipstationShipment.status} != 'cancelled'`);
  }

  if (params.from) {
    filters.push(gte(shipstationShipment.modifiedAtRemote, params.from));
  }

  if (params.to) {
    filters.push(lte(shipstationShipment.modifiedAtRemote, params.to));
  }

  if (params.vendorSlug) {
    const accountId = await resolveAccountId(params.vendorSlug);
    if (!accountId) {
      // Force an always-false predicate so the caller gets an empty result.
      filters.push(sql`1 = 0`);
    } else {
      filters.push(eq(shipstationShipment.accountId, accountId));
    }
  }

  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return and(...filters);
};

export const listShipmentsFiltered = async (
  params: ListShipmentsFilteredParams = {},
): Promise<ListShipmentsFilteredResult> => {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
  const sortBy: ShipmentSortBy = params.sortBy ?? "modified";
  const sortDir: ShipmentSortDir = params.sortDir ?? "desc";

  const whereSql = await buildShipmentFilters({
    vendorSlug: params.vendorSlug,
    statuses: params.statuses,
    excludeCancelled: params.excludeCancelled,
    from: params.from ?? null,
    to: params.to ?? null,
  });

  const sortColumn = resolveSortColumn(sortBy);
  const orderExpr = sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

  const baseSelect = db
    .select({
      shipment: shipstationShipment,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(shipstationShipment)
    .innerJoin(
      shipstationAccount,
      eq(shipstationShipment.accountId, shipstationAccount.id),
    );

  const rowsQuery = whereSql ? baseSelect.where(whereSql) : baseSelect;

  const rows = await rowsQuery
    .orderBy(orderExpr, desc(shipstationShipment.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countBase = db
    .select({ value: sql<number>`count(*)::int` })
    .from(shipstationShipment);

  const countQuery = whereSql ? countBase.where(whereSql) : countBase;
  const [{ value: total }] = await countQuery;
  const pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);

  return { rows, total, page, pageSize, pageCount };
};

export type ListPriorityShipmentsParams = {
  vendorSlug?: VendorSlug;
  from?: Date | null;
  to?: Date | null;
  limit?: number;
};

export const listPriorityShipments = async (
  params: ListPriorityShipmentsParams = {},
): Promise<ShipmentWithAccount[]> => {
  const limit = Math.max(1, Math.min(100, params.limit ?? 25));

  const whereSql = await buildShipmentFilters({
    vendorSlug: params.vendorSlug,
    statuses: [...AWAITING_STATUSES],
    from: params.from ?? null,
    to: params.to ?? null,
  });

  const baseSelect = db
    .select({
      shipment: shipstationShipment,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(shipstationShipment)
    .innerJoin(
      shipstationAccount,
      eq(shipstationShipment.accountId, shipstationAccount.id),
    );

  const rowsQuery = whereSql ? baseSelect.where(whereSql) : baseSelect;

  return rowsQuery
    .orderBy(
      sql`${shipstationShipment.shipDate} asc nulls last`,
      asc(shipstationShipment.modifiedAtRemote),
    )
    .limit(limit);
};

export type ShipmentPickerResult = {
  id: string;
  externalId: string;
  status: string;
  shipDate: Date | null;
  recipientName: string | null;
  recipientCity: string | null;
  account: {
    id: string;
    slug: string;
    displayName: string;
  };
};

export const searchShipmentsForPicker = async (
  query: string,
  limit = 20,
): Promise<ShipmentPickerResult[]> => {
  const trimmed = query.trim();
  const capped = Math.max(1, Math.min(50, limit));

  const baseSelect = db
    .select({
      id: shipstationShipment.id,
      externalId: shipstationShipment.externalId,
      status: shipstationShipment.status,
      shipDate: shipstationShipment.shipDate,
      recipientName: sql<string | null>`${shipstationShipment.shipTo}->>'name'`,
      recipientCity: sql<
        string | null
      >`${shipstationShipment.shipTo}->>'city_locality'`,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(shipstationShipment)
    .innerJoin(
      shipstationAccount,
      eq(shipstationShipment.accountId, shipstationAccount.id),
    );

  if (!trimmed) {
    return baseSelect
      .orderBy(desc(shipstationShipment.modifiedAtRemote))
      .limit(capped);
  }

  const pattern = `%${trimmed}%`;
  return baseSelect
    .where(
      or(
        ilike(shipstationShipment.externalId, pattern),
        sql`${shipstationShipment.shipTo}->>'name' ilike ${pattern}`,
        sql`${shipstationShipment.shipTo}->>'city_locality' ilike ${pattern}`,
      ),
    )
    .orderBy(desc(shipstationShipment.modifiedAtRemote))
    .limit(capped);
};

export type ShipstationSyncStatusRow = {
  accountId: string;
  slug: string;
  displayName: string;
  resource: string | null;
  lastModifiedAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  shipmentCount: number;
};

export const listShipstationSyncStatus = async (): Promise<
  ShipstationSyncStatusRow[]
> => {
  const rows = await db
    .select({
      accountId: shipstationAccount.id,
      slug: shipstationAccount.slug,
      displayName: shipstationAccount.displayName,
      resource: shipstationSyncCursor.resource,
      lastModifiedAt: shipstationSyncCursor.lastModifiedAt,
      lastRunAt: shipstationSyncCursor.lastRunAt,
      lastStatus: shipstationSyncCursor.lastStatus,
      lastError: shipstationSyncCursor.lastError,
      shipmentCount: sql<number>`(
        SELECT count(*)::int
        FROM ${shipstationShipment} s
        WHERE s.account_id = ${shipstationAccount.id}
      )`,
    })
    .from(shipstationAccount)
    .leftJoin(
      shipstationSyncCursor,
      and(
        eq(shipstationSyncCursor.accountId, shipstationAccount.id),
        eq(shipstationSyncCursor.resource, "shipments"),
      ),
    )
    .orderBy(asc(shipstationAccount.slug));

  return rows;
};

export const getShipmentsByIds = async (
  ids: string[],
): Promise<ShipmentWithAccount[]> => {
  if (ids.length === 0) return [];

  return db
    .select({
      shipment: shipstationShipment,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(shipstationShipment)
    .innerJoin(
      shipstationAccount,
      eq(shipstationShipment.accountId, shipstationAccount.id),
    )
    .where(inArray(shipstationShipment.id, ids));
};
