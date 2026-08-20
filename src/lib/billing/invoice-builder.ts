import "server-only";

import {
  getPickFeeTiers,
  sumUnitsPickedByTier,
} from "@/lib/billing/pick-fee-tiers";
import type { MonthlyBillingReportDetail } from "@/lib/billing/reports";
import type { BillingAccountSlug } from "@/lib/billing/types";
import type { CreateZohoInvoiceParams, ZohoLineItem } from "@/lib/zoho/books";
import { getZohoContactIdForSlug } from "@/lib/zoho/contact-map";
import { getZohoPriceListIdForSlug } from "@/lib/zoho/price-list-map";

// Default rates, used for accounts with no price list in
// `src/lib/zoho/price-list-map.ts`. Accounts that do have one are billed at
// their price list's rates instead.
const LINE_RATES = {
  storageSmall: 1.5,
  storageMedium: 1.75,
  storageLarge: 2.25,
  storageCarton: 2.75,
  orderRetail: 1.0,
  orderWholesale: 3.0,
  pickPerItem: 0.3,
  receivingCarton: 2.75,
  returnRetail: 4.0,
  specialHourly: 50.0,
} as const;

const LONG_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

// Reference covers the period month's actionable fees plus the next month's
// storage fees, e.g. a July report bills July actionable + August storage and
// reads "3PL - July/August 2026". Years are shown per-month across a rollover.
const formatReference = (periodStart: Date): string => {
  const nextMonth = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );

  const fromMonth = LONG_MONTH.format(periodStart);
  const toMonth = LONG_MONTH.format(nextMonth);
  const fromYear = periodStart.getUTCFullYear();
  const toYear = nextMonth.getUTCFullYear();

  if (fromYear === toYear) {
    return `3PL - ${fromMonth}/${toMonth} ${fromYear}`;
  }

  return `3PL - ${fromMonth} ${fromYear}/${toMonth} ${toYear}`;
};

const today = (): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

const resolveRetailQty = (
  report: MonthlyBillingReportDetail["report"],
): number =>
  report.orderChannelSummary?.d2cShipmentCount ?? report.shipmentCount;

const resolveWholesaleQty = (
  report: MonthlyBillingReportDetail["report"],
): number => report.orderChannelSummary?.b2bShipmentCount ?? 0;

// Flat-rate accounts bill every picked unit on one SKU; tiered accounts (DIP)
// split the same units across price-banded SKUs. Every tier line is always
// present, even at quantity zero, so the invoice shape stays predictable.
const buildPickAndPackLineItems = (
  report: MonthlyBillingReportDetail["report"],
  accountSlug: BillingAccountSlug,
): ZohoLineItem[] => {
  const pickFeeTiers = getPickFeeTiers(accountSlug);

  if (!pickFeeTiers) {
    return [
      {
        sku: "3PL-PICK-PER-ITEM-STANDARD",
        name: "Pick & Pack Fee – Per Item",
        rate: LINE_RATES.pickPerItem,
        quantity: report.unitsPickedTotal,
      },
    ];
  }

  const byTier = report.unitsPickedByTierTotal;
  if (!byTier) {
    throw new Error(
      `The ${accountSlug} report has no tiered pick-fee breakdown. Regenerate the report before creating the invoice.`,
    );
  }

  const tieredTotal = sumUnitsPickedByTier(byTier);
  if (tieredTotal !== report.unitsPickedTotal) {
    throw new Error(
      `Tiered pick-fee units (${tieredTotal}) do not match units picked (${report.unitsPickedTotal}) for ${accountSlug}. Regenerate the report before creating the invoice.`,
    );
  }

  return pickFeeTiers.map((tier) => ({
    sku: tier.sku,
    name: tier.name,
    rate: tier.rate,
    quantity: byTier[tier.key],
  }));
};

export const buildInvoiceParams = (
  detail: MonthlyBillingReportDetail,
  accountSlug: BillingAccountSlug,
): CreateZohoInvoiceParams => {
  const report = detail.report;

  const baseLineItems: ZohoLineItem[] = [
    {
      sku: "3PL-STORAGE-SM",
      name: "Storage – Small Bin",
      rate: LINE_RATES.storageSmall,
      quantity: report.manualMetrics.smallBinCount,
    },
    {
      sku: "3PL-STORAGE-MD",
      name: "Storage – Medium Bin",
      rate: LINE_RATES.storageMedium,
      quantity: report.manualMetrics.mediumBinCount,
    },
    {
      sku: "3PL-STORAGE-LG",
      name: "Storage – Large Bin",
      rate: LINE_RATES.storageLarge,
      quantity: report.manualMetrics.largeBinCount,
    },
    {
      sku: "3PL-STORAGE-CARTON",
      name: "Storage – Carton",
      rate: LINE_RATES.storageCarton,
      quantity: report.manualMetrics.additionalCartonsCount,
    },
    {
      sku: "3PL-ORDER-RETAIL",
      name: "Order Processing – Retail",
      rate: LINE_RATES.orderRetail,
      quantity: resolveRetailQty(report),
    },
    {
      sku: "3PL-ORDER-WHOLESALE-PACKAGE",
      name: "Order Processing – Wholesale",
      rate: LINE_RATES.orderWholesale,
      quantity: resolveWholesaleQty(report),
    },
    ...buildPickAndPackLineItems(report, accountSlug),
    {
      sku: "3PL-MATERIALS-COST",
      name: "Materials / Packaging",
      rate: report.packagingCostTotal,
      quantity: 1,
      isPassThroughCost: true,
    },
    {
      sku: "3PL-RECV-CARTON",
      name: "Receiving – Carton",
      rate: LINE_RATES.receivingCarton,
      quantity: report.manualMetrics.cartonsReceivedTotal,
    },
    {
      sku: "3PL-RECV-PALLET",
      name: "Receiving – Pallet",
      quantity: report.manualMetrics.palletsReceivedTotal,
    },
    {
      sku: "3PL-RETURN-RETAIL",
      name: "Return Processing – Retail",
      rate: LINE_RATES.returnRetail,
      quantity: report.manualMetrics.retailReturnsTotal,
    },
    {
      sku: "3PL-SPECIAL-HOURLY",
      name: "Special Project – Per Hour",
      rate: LINE_RATES.specialHourly,
      quantity: report.manualMetrics.specialProjectHours,
    },
  ];

  // Fatass-only: combined 3PL + drop-ship shipments counted from Zoho sales
  // orders. No rate — resolveZohoItemIds falls back to the Zoho item's rate.
  const lineItems: ZohoLineItem[] =
    accountSlug === "fatass"
      ? [
          ...baseLineItems,
          {
            sku: "3PL-HANDLING-RETAIL",
            name: "Special Handling Fee - Retail Order",
            quantity: report.manualMetrics.specialUseCaseOrdersCount,
          },
        ]
      : baseLineItems;

  return {
    customerId: getZohoContactIdForSlug(accountSlug),
    priceListId: getZohoPriceListIdForSlug(accountSlug),
    date: today(),
    paymentTerms: 30,
    reference: formatReference(report.periodStart),
    lineItems,
  };
};
