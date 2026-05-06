import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  monthlyBillingReport,
  monthlyBillingReportShipment,
} from "@/db/schema/billing";
import {
  shipstationAccount,
  shipstationShipment,
} from "@/db/schema/shipstation";

import { getRequiredBillingShipmentTagNames } from "./config";
import { matchShipmentPackages } from "./dimension-match";
import { loadBillingRateSheet } from "./rate-sheet";
import type {
  BillingManualMetrics,
  BillingPackageMatch,
  BillingReportStatus,
  BillingShipmentMatchStatus,
} from "./types";

const BILLABLE_STATUS = "label_purchased";
const RYOT_B2B_PREFIX = "B2B";

const moneyToStorage = (value: number) => value.toFixed(2);

const moneyToNumber = (value: string) => Number(value);

const normalizeShipmentTagName = (value: string) => value.trim().toLowerCase();

const parseNumericValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getUnitsPickedFromRawShipment = (raw: unknown) => {
  if (!raw || typeof raw !== "object" || !("items" in raw)) {
    return 0;
  }

  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return 0;
  }

  return items.reduce((sum, item) => {
    if (!item || typeof item !== "object") {
      return sum;
    }

    const quantity = parseNumericValue(
      (item as { quantity?: unknown }).quantity,
    );
    if (quantity === null || quantity <= 0) {
      return sum;
    }

    const unitPrice = parseNumericValue(
      (item as { unit_price?: unknown }).unit_price,
    );

    // ShipStation can include adjustment rows like discounts in `items`.
    if (unitPrice !== null && unitPrice < 0) {
      return sum;
    }

    return sum + quantity;
  }, 0);
};

const shipmentMatchesRequiredTags = (
  tags: Array<{ name: string }> | null | undefined,
  requiredTagNames: readonly string[],
) => {
  if (requiredTagNames.length === 0) {
    return true;
  }

  const tagNames = new Set(
    (tags ?? []).map((tag) => normalizeShipmentTagName(tag.name)),
  );

  return requiredTagNames.every((tagName) =>
    tagNames.has(normalizeShipmentTagName(tagName)),
  );
};

const makePeriod = (year: number, month: number) => {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Year must be a four-digit number.");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Month must be between 1 and 12.");
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { periodStart, periodEnd };
};

const billableDateSql = sql`coalesce(${shipstationShipment.shipDate}, ${shipstationShipment.createdAtRemote})`;

const resolveAccount = async (accountSlug: string) => {
  const [account] = await db
    .select({
      id: shipstationAccount.id,
      slug: shipstationAccount.slug,
      displayName: shipstationAccount.displayName,
    })
    .from(shipstationAccount)
    .where(eq(shipstationAccount.slug, accountSlug))
    .limit(1);

  if (!account) {
    throw new Error(`Unknown ShipStation account "${accountSlug}".`);
  }

  return account;
};

const findReportByPeriod = async ({
  accountId,
  periodStart,
  periodEnd,
}: {
  accountId: string;
  periodStart: Date;
  periodEnd: Date;
}) => {
  const [report] = await db
    .select()
    .from(monthlyBillingReport)
    .where(
      and(
        eq(monthlyBillingReport.accountId, accountId),
        eq(monthlyBillingReport.periodStart, periodStart),
        eq(monthlyBillingReport.periodEnd, periodEnd),
      ),
    )
    .limit(1);

  return report ?? null;
};

const insertShipmentRows = async (
  rows: Array<typeof monthlyBillingReportShipment.$inferInsert>,
) => {
  if (rows.length === 0) {
    return;
  }

  const chunkSize = 250;

  for (let index = 0; index < rows.length; index += chunkSize) {
    await db
      .insert(monthlyBillingReportShipment)
      .values(rows.slice(index, index + chunkSize));
  }
};

const formatPeriodLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);

const formatDate = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "";

const escapeCsv = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
};

export type MonthlyBillingReportListRow = {
  id: string;
  account: {
    id: string;
    slug: string;
    displayName: string;
  };
  periodStart: Date;
  periodEnd: Date;
  status: BillingReportStatus;
  shipmentCount: number;
  packageCount: number;
  packagingCostTotal: number;
  unmatchedShipmentCount: number;
  generatedAt: Date;
  finalizedAt: Date | null;
};

export type MonthlyBillingReportDetailRow = {
  id: string;
  shipmentId: string | null;
  externalId: string;
  shipmentNumber: string | null;
  externalShipmentId: string | null;
  shipDate: Date | null;
  status: string;
  unitsPicked: number;
  packageCount: number;
  packagingCostTotal: number;
  matchStatus: BillingShipmentMatchStatus;
  packageMatches: BillingPackageMatch[];
};

export type MonthlyBillingReportDetail = {
  report: {
    id: string;
    account: {
      id: string;
      slug: string;
      displayName: string;
    };
    periodStart: Date;
    periodEnd: Date;
    status: BillingReportStatus;
    sheetSourceHash: string;
    shipmentCount: number;
    unitsPickedTotal: number;
    packageCount: number;
    packagingCostTotal: number;
    unmatchedShipmentCount: number;
    manualMetrics: BillingManualMetrics;
    orderChannelSummary: {
      b2bShipmentCount: number;
      d2cShipmentCount: number;
      totalShipmentCount: number;
    } | null;
    generatedAt: Date;
    finalizedAt: Date | null;
  };
  shipments: MonthlyBillingReportDetailRow[];
};

const getManualMetricsFromRow = (row: {
  smallBinCount: number | null;
  mediumBinCount: number | null;
  largeBinCount: number | null;
  cartonsReceivedTotal: number | null;
  retailReturnsTotal: number | null;
  specialProjectHours: string | number | null;
}): BillingManualMetrics => ({
  smallBinCount: row.smallBinCount ?? 0,
  mediumBinCount: row.mediumBinCount ?? 0,
  largeBinCount: row.largeBinCount ?? 0,
  cartonsReceivedTotal: row.cartonsReceivedTotal ?? 0,
  retailReturnsTotal: row.retailReturnsTotal ?? 0,
  specialProjectHours:
    row.specialProjectHours === null
      ? 0
      : typeof row.specialProjectHours === "number"
        ? row.specialProjectHours
        : moneyToNumber(row.specialProjectHours),
});

const hasRyotB2bShipmentPrefix = (shipmentNumber: string | null) =>
  shipmentNumber?.trim().toUpperCase().startsWith(RYOT_B2B_PREFIX) ?? false;

const buildOrderChannelSummary = ({
  accountSlug,
  shipments,
}: {
  accountSlug: string;
  shipments: Array<{ shipmentNumber: string | null }>;
}) => {
  if (accountSlug !== "ryot") {
    return null;
  }

  const b2bShipmentCount = shipments.filter((shipment) =>
    hasRyotB2bShipmentPrefix(shipment.shipmentNumber),
  ).length;

  return {
    b2bShipmentCount,
    d2cShipmentCount: shipments.length - b2bShipmentCount,
    totalShipmentCount: shipments.length,
  };
};

export const generateMonthlyBillingReport = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: string;
  year: number;
  month: number;
}) => {
  const account = await resolveAccount(accountSlug);
  const { periodStart, periodEnd } = makePeriod(year, month);
  const existing = await findReportByPeriod({
    accountId: account.id,
    periodStart,
    periodEnd,
  });

  if (existing?.status === "finalized") {
    throw new Error(
      `The ${formatPeriodLabel(periodStart)} report for ${account.displayName} has already been finalized.`,
    );
  }

  const { sheetSourceHash, rateRows } = await loadBillingRateSheet(
    account.slug,
  );
  const requiredTagNames = getRequiredBillingShipmentTagNames(account.slug);

  const shipments = await db
    .select({
      id: shipstationShipment.id,
      externalId: shipstationShipment.externalId,
      shipmentNumber: shipstationShipment.shipmentNumber,
      externalShipmentId: shipstationShipment.externalShipmentId,
      shipDate: shipstationShipment.shipDate,
      createdAtRemote: shipstationShipment.createdAtRemote,
      status: shipstationShipment.status,
      tags: shipstationShipment.tags,
      packageCount: shipstationShipment.packageCount,
      raw: shipstationShipment.raw,
    })
    .from(shipstationShipment)
    .where(
      and(
        eq(shipstationShipment.accountId, account.id),
        eq(shipstationShipment.status, BILLABLE_STATUS),
        sql`${billableDateSql} >= ${periodStart}`,
        sql`${billableDateSql} < ${periodEnd}`,
      ),
    )
    .orderBy(asc(billableDateSql), asc(shipstationShipment.id));

  const evaluated = shipments
    .filter((shipment) =>
      shipmentMatchesRequiredTags(shipment.tags, requiredTagNames),
    )
    .map((shipment) => {
      const rawPackages =
        shipment.raw &&
        typeof shipment.raw === "object" &&
        "packages" in shipment.raw
          ? (shipment.raw as { packages?: unknown }).packages
          : null;

      const evaluation = matchShipmentPackages({
        packages: rawPackages,
        fallbackPackageCount: shipment.packageCount,
        rateRows,
      });

      return {
        shipment,
        evaluation,
        billableDate: shipment.shipDate ?? shipment.createdAtRemote,
        unitsPicked: getUnitsPickedFromRawShipment(shipment.raw),
      };
    });

  const shipmentCount = evaluated.length;
  const packageCount = evaluated.reduce(
    (sum, entry) => sum + entry.evaluation.packageCount,
    0,
  );
  const packagingCostTotal = evaluated.reduce(
    (sum, entry) => sum + entry.evaluation.packagingCostTotal,
    0,
  );
  const unmatchedShipmentCount = evaluated.filter(
    (entry) => entry.evaluation.matchStatus !== "matched",
  ).length;

  const reportId =
    existing?.id ??
    (
      await db
        .insert(monthlyBillingReport)
        .values({
          accountId: account.id,
          periodStart,
          periodEnd,
          status: "draft",
          sheetSourceHash,
          shipmentCount: 0,
          packageCount: 0,
          packagingCostTotal: "0",
          unmatchedShipmentCount: 0,
          generatedAt: new Date(),
          finalizedAt: null,
        })
        .returning({ id: monthlyBillingReport.id })
    )[0]?.id;

  if (!reportId) {
    throw new Error("Failed to create the monthly billing report.");
  }

  await db
    .delete(monthlyBillingReportShipment)
    .where(eq(monthlyBillingReportShipment.reportId, reportId));

  await insertShipmentRows(
    evaluated.map(({ shipment, evaluation, billableDate, unitsPicked }) => ({
      reportId,
      shipmentId: shipment.id,
      externalId: shipment.externalId,
      shipmentNumber: shipment.shipmentNumber ?? null,
      externalShipmentId: shipment.externalShipmentId ?? null,
      shipDate: billableDate,
      status: shipment.status,
      unitsPicked,
      packageCount: evaluation.packageCount,
      packagingCostTotal: moneyToStorage(evaluation.packagingCostTotal),
      matchStatus: evaluation.matchStatus,
      packageMatches: evaluation.packageMatches,
    })),
  );

  await db
    .update(monthlyBillingReport)
    .set({
      status: "draft",
      sheetSourceHash,
      shipmentCount,
      packageCount,
      packagingCostTotal: moneyToStorage(packagingCostTotal),
      unmatchedShipmentCount,
      generatedAt: new Date(),
      finalizedAt: null,
    })
    .where(eq(monthlyBillingReport.id, reportId));

  return getMonthlyBillingReport({ reportId });
};

export const finalizeMonthlyBillingReport = async ({
  reportId,
}: {
  reportId: string;
}) => {
  const report = await getMonthlyBillingReport({ reportId });

  if (report.report.status === "finalized") {
    return report;
  }

  if (report.report.unmatchedShipmentCount > 0) {
    throw new Error(
      "Resolve unmatched shipments before finalizing this monthly report.",
    );
  }

  await db
    .update(monthlyBillingReport)
    .set({
      status: "finalized",
      finalizedAt: new Date(),
    })
    .where(eq(monthlyBillingReport.id, reportId));

  return getMonthlyBillingReport({ reportId });
};

export const updateMonthlyBillingReportManualMetrics = async ({
  reportId,
  manualMetrics,
}: {
  reportId: string;
  manualMetrics: BillingManualMetrics;
}) => {
  const [reportRow] = await db
    .select({
      id: monthlyBillingReport.id,
      status: monthlyBillingReport.status,
    })
    .from(monthlyBillingReport)
    .where(eq(monthlyBillingReport.id, reportId))
    .limit(1);

  if (!reportRow) {
    throw new Error("Monthly billing report not found.");
  }

  if (reportRow.status === "finalized") {
    throw new Error("Finalized reports cannot be edited.");
  }

  await db
    .update(monthlyBillingReport)
    .set({
      smallBinCount: manualMetrics.smallBinCount,
      mediumBinCount: manualMetrics.mediumBinCount,
      largeBinCount: manualMetrics.largeBinCount,
      cartonsReceivedTotal: manualMetrics.cartonsReceivedTotal,
      retailReturnsTotal: manualMetrics.retailReturnsTotal,
      specialProjectHours: moneyToStorage(manualMetrics.specialProjectHours),
    })
    .where(eq(monthlyBillingReport.id, reportId));

  return getMonthlyBillingReport({ reportId });
};

export const listMonthlyBillingReports = async ({
  accountSlug,
}: {
  accountSlug?: string;
} = {}): Promise<MonthlyBillingReportListRow[]> => {
  const baseQuery = db
    .select({
      id: monthlyBillingReport.id,
      periodStart: monthlyBillingReport.periodStart,
      periodEnd: monthlyBillingReport.periodEnd,
      status: monthlyBillingReport.status,
      shipmentCount: monthlyBillingReport.shipmentCount,
      packageCount: monthlyBillingReport.packageCount,
      packagingCostTotal: monthlyBillingReport.packagingCostTotal,
      unmatchedShipmentCount: monthlyBillingReport.unmatchedShipmentCount,
      generatedAt: monthlyBillingReport.generatedAt,
      finalizedAt: monthlyBillingReport.finalizedAt,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(monthlyBillingReport)
    .innerJoin(
      shipstationAccount,
      eq(monthlyBillingReport.accountId, shipstationAccount.id),
    );

  const rows = await (accountSlug
    ? baseQuery.where(eq(shipstationAccount.slug, accountSlug))
    : baseQuery
  ).orderBy(
    desc(monthlyBillingReport.periodStart),
    asc(shipstationAccount.slug),
  );

  return rows.map((row) => ({
    ...row,
    status: row.status as BillingReportStatus,
    packagingCostTotal: moneyToNumber(row.packagingCostTotal),
  }));
};

export const getMonthlyBillingReport = async ({
  reportId,
}: {
  reportId: string;
}): Promise<MonthlyBillingReportDetail> => {
  const [reportRow] = await db
    .select({
      id: monthlyBillingReport.id,
      periodStart: monthlyBillingReport.periodStart,
      periodEnd: monthlyBillingReport.periodEnd,
      status: monthlyBillingReport.status,
      sheetSourceHash: monthlyBillingReport.sheetSourceHash,
      shipmentCount: monthlyBillingReport.shipmentCount,
      packageCount: monthlyBillingReport.packageCount,
      packagingCostTotal: monthlyBillingReport.packagingCostTotal,
      unmatchedShipmentCount: monthlyBillingReport.unmatchedShipmentCount,
      smallBinCount: monthlyBillingReport.smallBinCount,
      mediumBinCount: monthlyBillingReport.mediumBinCount,
      largeBinCount: monthlyBillingReport.largeBinCount,
      cartonsReceivedTotal: monthlyBillingReport.cartonsReceivedTotal,
      retailReturnsTotal: monthlyBillingReport.retailReturnsTotal,
      specialProjectHours: monthlyBillingReport.specialProjectHours,
      generatedAt: monthlyBillingReport.generatedAt,
      finalizedAt: monthlyBillingReport.finalizedAt,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(monthlyBillingReport)
    .innerJoin(
      shipstationAccount,
      eq(monthlyBillingReport.accountId, shipstationAccount.id),
    )
    .where(eq(monthlyBillingReport.id, reportId))
    .limit(1);

  if (!reportRow) {
    throw new Error("Monthly billing report not found.");
  }

  const shipmentRows = await db
    .select({
      id: monthlyBillingReportShipment.id,
      shipmentId: monthlyBillingReportShipment.shipmentId,
      externalId: monthlyBillingReportShipment.externalId,
      shipmentNumber: monthlyBillingReportShipment.shipmentNumber,
      externalShipmentId: monthlyBillingReportShipment.externalShipmentId,
      shipDate: monthlyBillingReportShipment.shipDate,
      status: monthlyBillingReportShipment.status,
      unitsPicked: monthlyBillingReportShipment.unitsPicked,
      packageCount: monthlyBillingReportShipment.packageCount,
      packagingCostTotal: monthlyBillingReportShipment.packagingCostTotal,
      matchStatus: monthlyBillingReportShipment.matchStatus,
      packageMatches: monthlyBillingReportShipment.packageMatches,
      raw: shipstationShipment.raw,
    })
    .from(monthlyBillingReportShipment)
    .leftJoin(
      shipstationShipment,
      eq(monthlyBillingReportShipment.shipmentId, shipstationShipment.id),
    )
    .where(eq(monthlyBillingReportShipment.reportId, reportId))
    .orderBy(
      sql`${monthlyBillingReportShipment.shipDate} asc nulls last`,
      asc(monthlyBillingReportShipment.externalId),
    );

  const orderChannelSummary = buildOrderChannelSummary({
    accountSlug: reportRow.account.slug,
    shipments: shipmentRows,
  });

  const shipments = shipmentRows.map((row) => {
    const { raw, ...shipment } = row;

    return {
      ...shipment,
      unitsPicked: row.unitsPicked ?? getUnitsPickedFromRawShipment(raw),
      packagingCostTotal: moneyToNumber(row.packagingCostTotal),
      matchStatus: row.matchStatus as BillingShipmentMatchStatus,
      packageMatches: row.packageMatches as BillingPackageMatch[],
    };
  });

  const unitsPickedTotal = shipments.reduce(
    (sum, shipment) => sum + shipment.unitsPicked,
    0,
  );
  const manualMetrics = getManualMetricsFromRow(reportRow);

  return {
    report: {
      ...reportRow,
      status: reportRow.status as BillingReportStatus,
      unitsPickedTotal,
      packagingCostTotal: moneyToNumber(reportRow.packagingCostTotal),
      manualMetrics,
      orderChannelSummary,
    },
    shipments,
  };
};

export const getMonthlyBillingReportForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: string;
  year: number;
  month: number;
}) => {
  const account = await resolveAccount(accountSlug);
  const { periodStart, periodEnd } = makePeriod(year, month);
  const existing = await findReportByPeriod({
    accountId: account.id,
    periodStart,
    periodEnd,
  });

  if (!existing) {
    return null;
  }

  return getMonthlyBillingReport({ reportId: existing.id });
};

export const exportMonthlyBillingReportCsv = async ({
  reportId,
}: {
  reportId: string;
}) => {
  const report = await getMonthlyBillingReport({ reportId });
  const summaryLines = report.report.orderChannelSummary
    ? [
        [
          "B2B shipment count",
          report.report.orderChannelSummary.b2bShipmentCount,
        ],
        [
          "D2C shipment count",
          report.report.orderChannelSummary.d2cShipmentCount,
        ],
        [
          "Total shipment count",
          report.report.orderChannelSummary.totalShipmentCount,
        ],
      ]
    : [];

  const lines = [
    ["Client", report.report.account.displayName],
    ["Account slug", report.report.account.slug],
    ["Period", formatPeriodLabel(report.report.periodStart)],
    ["Status", report.report.status],
    ["Generated at", formatDate(report.report.generatedAt)],
    ["Finalized at", formatDate(report.report.finalizedAt)],
    ["Shipment count", report.report.shipmentCount],
    ["Units picked total", report.report.unitsPickedTotal],
    ["Package count", report.report.packageCount],
    ["Packaging cost total", report.report.packagingCostTotal.toFixed(2)],
    ["Unmatched shipment count", report.report.unmatchedShipmentCount],
    ["Small bin count", report.report.manualMetrics.smallBinCount],
    ["Medium bin count", report.report.manualMetrics.mediumBinCount],
    ["Large bin count", report.report.manualMetrics.largeBinCount],
    [
      "Cartons received total",
      report.report.manualMetrics.cartonsReceivedTotal,
    ],
    ["Retail returns total", report.report.manualMetrics.retailReturnsTotal],
    [
      "Special project hours",
      report.report.manualMetrics.specialProjectHours.toFixed(2),
    ],
    ...summaryLines,
    [],
    [
      "Shipment external ID",
      "Shipment number",
      "Order ID",
      "Billable date",
      "Shipment status",
      "Match status",
      "Units picked",
      "Package count",
      "Packaging cost",
      "Package details",
    ],
    ...report.shipments.map((shipment) => [
      shipment.externalId,
      shipment.shipmentNumber ?? "",
      shipment.externalShipmentId ?? "",
      shipment.shipDate ? shipment.shipDate.toISOString() : "",
      shipment.status,
      shipment.matchStatus,
      shipment.unitsPicked,
      shipment.packageCount,
      shipment.packagingCostTotal.toFixed(2),
      shipment.packageMatches
        .map((match) => {
          const dims = [
            match.originalDimensions.length,
            match.originalDimensions.width,
            match.originalDimensions.height,
          ]
            .map((value) => (value === null ? "?" : String(value)))
            .join("x");
          if (match.pricingSource === "exact") {
            return `#${match.packageIndex}: ${match.ruleLabel} @ ${match.costApplied.toFixed(2)} (${dims})`;
          }

          if (match.pricingSource === "fallback") {
            return `#${match.packageIndex}: estimated fallback @ ${match.costApplied.toFixed(2)} (${dims}) ${match.reason ?? ""}`.trim();
          }

          return `#${match.packageIndex}: ${match.reason ?? "unmatched"} (${dims})`;
        })
        .join(" | "),
    ]),
  ];

  const csv = lines
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
  const fileName = `monthly-billing-${report.report.account.slug}-${report.report.periodStart.toISOString().slice(0, 7)}.csv`;

  return {
    csv,
    fileName,
  };
};
