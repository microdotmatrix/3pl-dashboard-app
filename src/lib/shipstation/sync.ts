import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  monthlyBillingReport,
  monthlyBillingReportShipment,
} from "@/db/schema/billing";
import {
  type ShipstationShipment,
  shipstationShipment,
  shipstationSyncCursor,
} from "@/db/schema/shipstation";

import {
  getShipstationAccountBySlug,
  getShipstationAccounts,
  type ShipstationAccountWithKey,
} from "./accounts";
import {
  createShipstationClient,
  type ShipstationShipmentPayload,
} from "./client";

const RESOURCE = "shipments" as const;
const OVERLAP_MS = 2 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export type SyncResult = {
  accountSlug: string;
  upserted: number;
  pagesFetched: number;
  cursorAdvancedTo: string | null;
  shipmentNumbersBackfilled: number;
  reportShipmentNumbersBackfilled: number;
  error: string | null;
};

const toTimestamp = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

const mapShipmentRow = (
  account: ShipstationAccountWithKey,
  payload: ShipstationShipmentPayload,
): Omit<ShipstationShipment, "id" | "syncedAt"> => {
  const createdAt = toTimestamp(payload.created_at);
  const modifiedAt = toTimestamp(payload.modified_at);

  if (!createdAt || !modifiedAt) {
    throw new Error(
      `Shipment ${payload.shipment_id} missing required created_at/modified_at`,
    );
  }

  return {
    accountId: account.id,
    externalId: payload.shipment_id,
    shipmentNumber: payload.shipment_number ?? null,
    externalShipmentId: payload.external_shipment_id ?? null,
    status: payload.shipment_status,
    carrierId: payload.carrier_id ?? null,
    serviceCode: payload.service_code ?? null,
    shipDate: toTimestamp(payload.ship_date),
    createdAtRemote: createdAt,
    modifiedAtRemote: modifiedAt,
    shipTo: (payload.ship_to ?? null) as ShipstationShipment["shipTo"],
    shipFrom: (payload.ship_from ?? null) as ShipstationShipment["shipFrom"],
    warehouseId: payload.warehouse_id ?? null,
    tags: payload.tags ?? null,
    totalWeight: (payload.total_weight ??
      null) as ShipstationShipment["totalWeight"],
    packageCount: payload.packages ? payload.packages.length : null,
    raw: payload as unknown as ShipstationShipment["raw"],
  };
};

const readCursor = async (accountId: string): Promise<Date | null> => {
  const [row] = await db
    .select()
    .from(shipstationSyncCursor)
    .where(
      and(
        eq(shipstationSyncCursor.accountId, accountId),
        eq(shipstationSyncCursor.resource, RESOURCE),
      ),
    )
    .limit(1);

  return row?.lastModifiedAt ?? null;
};

const writeCursor = async (
  accountId: string,
  lastModifiedAt: Date | null,
  status: "ok" | "error",
  error: string | null,
) => {
  const now = new Date();

  await db
    .insert(shipstationSyncCursor)
    .values({
      accountId,
      resource: RESOURCE,
      lastModifiedAt,
      lastRunAt: now,
      lastStatus: status,
      lastError: error,
    })
    .onConflictDoUpdate({
      target: [shipstationSyncCursor.accountId, shipstationSyncCursor.resource],
      set: {
        lastModifiedAt,
        lastRunAt: now,
        lastStatus: status,
        lastError: error,
      },
    });
};

const backfillShipmentNumbersFromRaw = async (accountId: string) => {
  const rows = await db
    .update(shipstationShipment)
    .set({
      shipmentNumber: sql`nullif(${shipstationShipment.raw}->>'shipment_number', '')`,
      syncedAt: new Date(),
    })
    .where(
      and(
        eq(shipstationShipment.accountId, accountId),
        sql`${shipstationShipment.shipmentNumber} is null`,
        sql`nullif(${shipstationShipment.raw}->>'shipment_number', '') is not null`,
      ),
    )
    .returning({ id: shipstationShipment.id });

  return rows.length;
};

const backfillDraftReportShipmentNumbers = async (accountId: string) => {
  const rows = await db
    .update(monthlyBillingReportShipment)
    .set({
      shipmentNumber: sql`(
        select ${shipstationShipment.shipmentNumber}
        from ${shipstationShipment}
        where ${shipstationShipment.id} = ${monthlyBillingReportShipment.shipmentId}
      )`,
    })
    .where(
      and(
        sql`${monthlyBillingReportShipment.shipmentNumber} is null`,
        sql`${monthlyBillingReportShipment.shipmentId} is not null`,
        sql`exists (
          select 1
          from ${monthlyBillingReport}
          inner join ${shipstationShipment}
            on ${shipstationShipment.id} = ${monthlyBillingReportShipment.shipmentId}
          where ${monthlyBillingReport.id} = ${monthlyBillingReportShipment.reportId}
            and ${monthlyBillingReport.accountId} = ${accountId}
            and ${monthlyBillingReport.status} = 'draft'
            and ${shipstationShipment.shipmentNumber} is not null
        )`,
      ),
    )
    .returning({ id: monthlyBillingReportShipment.id });

  return rows.length;
};

export const syncAccountShipments = async (
  slug: string,
): Promise<SyncResult> => {
  const account = await getShipstationAccountBySlug(slug);

  if (!account) {
    return {
      accountSlug: slug,
      upserted: 0,
      pagesFetched: 0,
      cursorAdvancedTo: null,
      shipmentNumbersBackfilled: 0,
      reportShipmentNumbersBackfilled: 0,
      error: `Unknown account slug "${slug}"`,
    };
  }

  const client = createShipstationClient({
    apiKey: account.apiKey,
    accountSlug: account.slug,
  });

  const cursor = await readCursor(account.id);
  const lookbackFloor = new Date(Date.now() - MAX_LOOKBACK_MS);
  const rawStart = cursor
    ? new Date(cursor.getTime() - OVERLAP_MS)
    : lookbackFloor;
  const startDate = rawStart < lookbackFloor ? lookbackFloor : rawStart;
  const modifiedAtStart = startDate.toISOString();

  let upserted = 0;
  let pagesFetched = 0;
  let maxModifiedAt = cursor;
  let shipmentNumbersBackfilled = 0;
  let reportShipmentNumbersBackfilled = 0;

  try {
    shipmentNumbersBackfilled = await backfillShipmentNumbersFromRaw(
      account.id,
    );

    let page: Awaited<ReturnType<typeof client.listShipments>> =
      await client.listShipments({
        modifiedAtStart,
        page: 1,
        pageSize: PAGE_SIZE,
        sortBy: "modified_at",
        sortDir: "asc",
      });

    while (true) {
      pagesFetched += 1;

      for (const payload of page.shipments) {
        const row = mapShipmentRow(account, payload);

        await db
          .insert(shipstationShipment)
          .values(row)
          .onConflictDoUpdate({
            target: [
              shipstationShipment.accountId,
              shipstationShipment.externalId,
            ],
            set: {
              shipmentNumber: sql`coalesce(excluded.shipment_number, ${shipstationShipment.shipmentNumber})`,
              externalShipmentId: row.externalShipmentId,
              status: row.status,
              carrierId: row.carrierId,
              serviceCode: row.serviceCode,
              shipDate: row.shipDate,
              createdAtRemote: row.createdAtRemote,
              modifiedAtRemote: row.modifiedAtRemote,
              shipTo: row.shipTo,
              shipFrom: row.shipFrom,
              warehouseId: row.warehouseId,
              tags: row.tags,
              totalWeight: row.totalWeight,
              packageCount: row.packageCount,
              raw: row.raw,
              syncedAt: new Date(),
            },
          });

        upserted += 1;

        if (!maxModifiedAt || row.modifiedAtRemote > maxModifiedAt) {
          maxModifiedAt = row.modifiedAtRemote;
        }
      }

      const nextHref =
        page.links.next && "href" in page.links.next
          ? page.links.next.href
          : undefined;

      if (!nextHref) {
        break;
      }

      page = await client.listShipmentsByUrl(nextHref);
    }

    reportShipmentNumbersBackfilled = await backfillDraftReportShipmentNumbers(
      account.id,
    );

    await writeCursor(account.id, maxModifiedAt, "ok", null);

    return {
      accountSlug: account.slug,
      upserted,
      pagesFetched,
      cursorAdvancedTo: maxModifiedAt?.toISOString() ?? null,
      shipmentNumbersBackfilled,
      reportShipmentNumbersBackfilled,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeCursor(account.id, cursor, "error", message);

    return {
      accountSlug: account.slug,
      upserted,
      pagesFetched,
      cursorAdvancedTo: null,
      shipmentNumbersBackfilled,
      reportShipmentNumbersBackfilled,
      error: message,
    };
  }
};

export const syncAllAccounts = async (): Promise<SyncResult[]> => {
  const accounts = await getShipstationAccounts();
  const results: SyncResult[] = [];

  for (const account of accounts) {
    results.push(await syncAccountShipments(account.slug));
  }

  return results;
};
