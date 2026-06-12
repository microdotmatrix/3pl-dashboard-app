import { describe, expect, test } from "vitest";

import { buildInvoiceParams } from "./invoice-builder";
import type { MonthlyBillingReportDetail } from "./reports";
import { EMPTY_OVERRIDES } from "./types";

const makeDetail = (
  slug: string,
  specialUseCaseOrdersCount: number,
): MonthlyBillingReportDetail => ({
  report: {
    id: "report-1",
    account: { id: "acct-1", slug, displayName: slug },
    periodStart: new Date(Date.UTC(2026, 4, 1)),
    periodEnd: new Date(Date.UTC(2026, 5, 1)),
    status: "finalized",
    sheetSourceHash: "hash",
    shipmentCount: 10,
    unitsPickedTotal: 25,
    packageCount: 12,
    packagingCostTotal: 100,
    unmatchedShipmentCount: 0,
    manualMetrics: {
      smallBinCount: 1,
      mediumBinCount: 2,
      largeBinCount: 3,
      additionalCartonsCount: 4,
      cartonsReceivedTotal: 5,
      palletsReceivedTotal: 6,
      retailReturnsTotal: 7,
      specialProjectHours: 8,
      specialUseCaseOrdersCount,
    },
    mondayMetricsSnapshot: {},
    manualMetricsOverrides: EMPTY_OVERRIDES,
    mondayMetricsFetchedAt: null,
    mondayMetricsWarnings: [],
    orderChannelSummary: null,
    generatedAt: new Date(Date.UTC(2026, 5, 1)),
    finalizedAt: null,
    zohoInvoiceId: null,
    previousZohoInvoiceIds: [],
    lastRevertedAt: null,
    lastRevertedBy: null,
    lastRevertedByName: null,
    lastRevertReason: null,
  },
  shipments: [],
});

describe("buildInvoiceParams", () => {
  test("fatass invoices include the special handling line with the metric quantity", () => {
    const params = buildInvoiceParams(makeDetail("fatass", 17), "fatass");
    const line = params.lineItems.find(
      (item) => item.sku === "3PL-HANDLING-RETAIL",
    );

    expect(line).toBeDefined();
    expect(line?.quantity).toBe(17);
    expect(line?.name).toBe("Special Handling Fee - Retail Order");
    expect(line?.rate).toBeUndefined();
  });

  test("fatass line is present even at quantity zero", () => {
    const params = buildInvoiceParams(makeDetail("fatass", 0), "fatass");
    expect(
      params.lineItems.some((item) => item.sku === "3PL-HANDLING-RETAIL"),
    ).toBe(true);
  });

  test("other vendors never get the special handling line", () => {
    for (const slug of ["dip", "ryot"] as const) {
      const params = buildInvoiceParams(makeDetail(slug, 17), slug);
      expect(
        params.lineItems.some((item) => item.sku === "3PL-HANDLING-RETAIL"),
      ).toBe(false);
    }
  });
});
