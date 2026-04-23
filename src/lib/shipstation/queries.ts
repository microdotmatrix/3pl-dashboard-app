import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  shipstationAccount,
  shipstationShipment,
} from "@/db/schema/shipstation";

const PENDING_STATUSES = ["pending", "processing"] as const;
const SHIPPED_STATUSES = ["label_purchased"] as const;

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
