import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const shipstationAccount = pgTable("shipstation_account", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shipstationShipment = pgTable(
  "shipstation_shipment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => shipstationAccount.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    shipmentNumber: text("shipment_number"),
    externalShipmentId: text("external_shipment_id"),
    status: text("status").notNull(),
    carrierId: text("carrier_id"),
    serviceCode: text("service_code"),
    shipDate: timestamp("ship_date", { withTimezone: true }),
    createdAtRemote: timestamp("created_at_remote", {
      withTimezone: true,
    }).notNull(),
    modifiedAtRemote: timestamp("modified_at_remote", {
      withTimezone: true,
    }).notNull(),
    shipTo: jsonb("ship_to"),
    shipFrom: jsonb("ship_from"),
    warehouseId: text("warehouse_id"),
    tags: jsonb("tags").$type<Array<{ name: string }>>(),
    totalWeight: jsonb("total_weight"),
    packageCount: integer("package_count"),
    raw: jsonb("raw").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("shipstation_shipment_account_external_idx").on(
      t.accountId,
      t.externalId,
    ),
    index("shipstation_shipment_account_status_idx").on(t.accountId, t.status),
    index("shipstation_shipment_modified_at_idx").on(t.modifiedAtRemote),
  ],
);

export const shipstationSyncCursor = pgTable(
  "shipstation_sync_cursor",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => shipstationAccount.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.resource] })],
);

export const shipstationAccountRelations = relations(
  shipstationAccount,
  ({ many }) => ({
    shipments: many(shipstationShipment),
    cursors: many(shipstationSyncCursor),
  }),
);

export const shipstationShipmentRelations = relations(
  shipstationShipment,
  ({ one }) => ({
    account: one(shipstationAccount, {
      fields: [shipstationShipment.accountId],
      references: [shipstationAccount.id],
    }),
  }),
);

export const shipstationSyncCursorRelations = relations(
  shipstationSyncCursor,
  ({ one }) => ({
    account: one(shipstationAccount, {
      fields: [shipstationSyncCursor.accountId],
      references: [shipstationAccount.id],
    }),
  }),
);

export type ShipstationAccount = typeof shipstationAccount.$inferSelect;
export type ShipstationShipment = typeof shipstationShipment.$inferSelect;
export type ShipstationSyncCursor = typeof shipstationSyncCursor.$inferSelect;
export type ShipstationSyncResource = "shipments";
