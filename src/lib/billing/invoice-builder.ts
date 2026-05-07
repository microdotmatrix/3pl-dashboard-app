import "server-only";

import type { MonthlyBillingReportDetail } from "@/lib/billing/reports";
import type { BillingAccountSlug } from "@/lib/billing/types";
import { getZohoContactIdForSlug } from "@/lib/zoho/contact-map";
import type {
  CreateZohoInvoiceParams,
  ZohoLineItem,
} from "@/lib/zoho/books";

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

const SHORT_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

const formatReference = (periodStart: Date): string => {
  const month = SHORT_MONTH.format(periodStart);
  const year = periodStart.getUTCFullYear();

  return `3PL - ${month} ${year}`;
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
): number => report.orderChannelSummary?.d2cShipmentCount ?? report.shipmentCount;

const resolveWholesaleQty = (
  report: MonthlyBillingReportDetail["report"],
): number => report.orderChannelSummary?.b2bShipmentCount ?? 0;

export const buildInvoiceParams = (
  detail: MonthlyBillingReportDetail,
  accountSlug: BillingAccountSlug,
): CreateZohoInvoiceParams => {
  const report = detail.report;

  const lineItems: ZohoLineItem[] = [
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
    {
      sku: "3PL-PICK-PER-ITEM-STANDARD",
      name: "Pick & Pack Fee – Per Item",
      rate: LINE_RATES.pickPerItem,
      quantity: report.unitsPickedTotal,
    },
    {
      sku: "3PL-MATERIALS-COST",
      name: "Materials / Packaging",
      rate: report.packagingCostTotal,
      quantity: 1,
    },
    {
      sku: "3PL-RECV-CARTON",
      name: "Receiving – Carton",
      rate: LINE_RATES.receivingCarton,
      quantity: report.manualMetrics.cartonsReceivedTotal,
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

  return {
    customerId: getZohoContactIdForSlug(accountSlug),
    date: today(),
    paymentTerms: 30,
    reference: formatReference(report.periodStart),
    lineItems,
  };
};
