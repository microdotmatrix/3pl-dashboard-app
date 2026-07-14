import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  type ShipstationShipment,
  shipstationAccount,
  shipstationShipment,
} from "@/db/schema/shipstation";
import { env } from "@/env";

import {
  backfillShipmentItems,
  type ShipmentItemBackfillResult,
} from "./item-backfill-core";
import { fetchShipstationShipmentById } from "./shipment-detail";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 1_000;

const API_KEYS: Record<string, string> = {
  dip: env.SHIPSTATION_API_KEY_DIP,
  fatass: env.SHIPSTATION_API_KEY_FATASS,
  ryot: env.SHIPSTATION_API_KEY_RYOT,
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const backfillMissingShipmentItemsForAccount = async ({
  accountSlug,
  from,
  to,
  limit = DEFAULT_LIMIT,
  apply = false,
}: {
  accountSlug: string;
  from?: Date;
  to?: Date;
  limit?: number;
  apply?: boolean;
}): Promise<ShipmentItemBackfillResult> => {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`Limit must be between 1 and ${MAX_LIMIT}.`);
  }

  const [account] = await db
    .select()
    .from(shipstationAccount)
    .where(eq(shipstationAccount.slug, accountSlug))
    .limit(1);
  if (!account) {
    throw new Error(`Unknown ShipStation account slug "${accountSlug}".`);
  }

  const apiKey = API_KEYS[account.slug];
  if (!apiKey) {
    throw new Error(`No ShipStation API key configured for "${account.slug}".`);
  }

  const filters = [
    eq(shipstationShipment.accountId, account.id),
    sql`coalesce(jsonb_typeof(${shipstationShipment.raw}->'items'), 'null') <> 'array'`,
  ];

  if (from) {
    filters.push(gte(shipstationShipment.shipDate, from));
  }
  if (to) {
    filters.push(lt(shipstationShipment.shipDate, to));
  }

  const candidates = await db
    .select({
      id: shipstationShipment.id,
      externalId: shipstationShipment.externalId,
      raw: shipstationShipment.raw,
    })
    .from(shipstationShipment)
    .where(and(...filters))
    .orderBy(shipstationShipment.shipDate, shipstationShipment.id)
    .limit(limit);

  return backfillShipmentItems({
    candidates,
    apply,
    fetchShipment: (externalId) =>
      fetchShipstationShipmentById({ apiKey, shipmentId: externalId }),
    persistShipment: async (candidate, shipment) => {
      const mergedRaw = {
        ...asRecord(candidate.raw),
        ...asRecord(shipment),
      } as ShipstationShipment["raw"];

      await db
        .update(shipstationShipment)
        .set({ raw: mergedRaw, syncedAt: new Date() })
        .where(eq(shipstationShipment.id, candidate.id));
    },
  });
};
