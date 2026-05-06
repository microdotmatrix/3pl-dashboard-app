import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  BillingPackageMatch,
  BillingReportStatus,
  BillingShipmentMatchStatus,
} from "@/lib/billing/types";

import { shipstationAccount, shipstationShipment } from "./shipstation";

export const monthlyBillingReport = pgTable(
  "monthly_billing_report",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => shipstationAccount.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<BillingReportStatus>()
      .notNull()
      .default("draft"),
    sheetSourceHash: text("sheet_source_hash").notNull(),
    shipmentCount: integer("shipment_count").notNull().default(0),
    packageCount: integer("package_count").notNull().default(0),
    packagingCostTotal: numeric("packaging_cost_total", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    unmatchedShipmentCount: integer("unmatched_shipment_count")
      .notNull()
      .default(0),
    smallBinCount: integer("small_bin_count").notNull().default(0),
    mediumBinCount: integer("medium_bin_count").notNull().default(0),
    largeBinCount: integer("large_bin_count").notNull().default(0),
    additionalCartonsCount: integer("additional_cartons_count")
      .notNull()
      .default(0),
    cartonsReceivedTotal: integer("cartons_received_total")
      .notNull()
      .default(0),
    retailReturnsTotal: integer("retail_returns_total").notNull().default(0),
    specialProjectHours: numeric("special_project_hours", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("monthly_billing_report_account_period_idx").on(
      t.accountId,
      t.periodStart,
      t.periodEnd,
    ),
    index("monthly_billing_report_status_idx").on(t.status),
  ],
);

export const monthlyBillingReportShipment = pgTable(
  "monthly_billing_report_shipment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => monthlyBillingReport.id, { onDelete: "cascade" }),
    shipmentId: uuid("shipment_id").references(() => shipstationShipment.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id").notNull(),
    shipmentNumber: text("shipment_number"),
    externalShipmentId: text("external_shipment_id"),
    shipDate: timestamp("ship_date", { withTimezone: true }),
    status: text("status").notNull(),
    unitsPicked: integer("units_picked"),
    packageCount: integer("package_count").notNull().default(0),
    packagingCostTotal: numeric("packaging_cost_total", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    matchStatus: text("match_status")
      .$type<BillingShipmentMatchStatus>()
      .notNull(),
    packageMatches: jsonb("package_matches")
      .$type<BillingPackageMatch[]>()
      .notNull(),
  },
  (t) => [
    uniqueIndex("monthly_billing_report_shipment_report_external_idx").on(
      t.reportId,
      t.externalId,
    ),
    index("monthly_billing_report_shipment_report_idx").on(t.reportId),
    index("monthly_billing_report_shipment_match_idx").on(t.matchStatus),
  ],
);

export const monthlyBillingReportRelations = relations(
  monthlyBillingReport,
  ({ one, many }) => ({
    account: one(shipstationAccount, {
      fields: [monthlyBillingReport.accountId],
      references: [shipstationAccount.id],
    }),
    shipments: many(monthlyBillingReportShipment),
  }),
);

export const monthlyBillingReportShipmentRelations = relations(
  monthlyBillingReportShipment,
  ({ one }) => ({
    report: one(monthlyBillingReport, {
      fields: [monthlyBillingReportShipment.reportId],
      references: [monthlyBillingReport.id],
    }),
    shipment: one(shipstationShipment, {
      fields: [monthlyBillingReportShipment.shipmentId],
      references: [shipstationShipment.id],
    }),
  }),
);

export type MonthlyBillingReport = typeof monthlyBillingReport.$inferSelect;
export type MonthlyBillingReportShipment =
  typeof monthlyBillingReportShipment.$inferSelect;
