import { describe, expect, test } from "vitest";

import { buildInvoiceParams } from "./invoice-builder";
import type { MonthlyBillingReportDetail } from "./reports";
import type { UnitsPickedByTier } from "./types";
import { EMPTY_OVERRIDES } from "./types";

// A breakdown consistent with the default unitsPickedTotal of 25, for tests
// that exercise dip but aren't about the tier split itself.
const DIP_DEFAULT_TIERS: UnitsPickedByTier = {
  tier1: 10,
  tier2: 5,
  tier3: 5,
  tier4: 5,
};

const makeDetail = (
  slug: string,
  specialUseCaseOrdersCount: number,
  {
    unitsPickedTotal = 25,
    unitsPickedByTierTotal = null,
  }: {
    unitsPickedTotal?: number;
    unitsPickedByTierTotal?: UnitsPickedByTier | null;
  } = {},
): MonthlyBillingReportDetail => ({
  report: {
    id: "report-1",
    account: { id: "acct-1", slug, displayName: slug },
    periodStart: new Date(Date.UTC(2026, 4, 1)),
    periodEnd: new Date(Date.UTC(2026, 5, 1)),
    status: "finalized",
    sheetSourceHash: "hash",
    shipmentCount: 10,
    unitsPickedTotal,
    unitsPickedByTierTotal,
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
    zeroCostPackages: null,
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
      const params = buildInvoiceParams(
        makeDetail(slug, 17, {
          unitsPickedByTierTotal: slug === "dip" ? DIP_DEFAULT_TIERS : null,
        }),
        slug,
      );
      expect(
        params.lineItems.some((item) => item.sku === "3PL-HANDLING-RETAIL"),
      ).toBe(false);
    }
  });

  test("ryot invoices carry the 3PL - TPB price list id", () => {
    const params = buildInvoiceParams(makeDetail("ryot", 0), "ryot");

    expect(params.priceListId).toBe("3195387000152128163");
  });

  test("dip invoices carry the 3PL -Dip Devices price list id", () => {
    const params = buildInvoiceParams(
      makeDetail("dip", 0, { unitsPickedByTierTotal: DIP_DEFAULT_TIERS }),
      "dip",
    );

    expect(params.priceListId).toBe("3195387000152128211");
  });

  test("each price list is bound to exactly one account", () => {
    const dip = buildInvoiceParams(
      makeDetail("dip", 0, { unitsPickedByTierTotal: DIP_DEFAULT_TIERS }),
      "dip",
    );
    const ryot = buildInvoiceParams(makeDetail("ryot", 0), "ryot");

    expect(dip.priceListId).not.toBe(ryot.priceListId);
  });

  test("accounts without a configured price list send none", () => {
    const params = buildInvoiceParams(makeDetail("fatass", 0), "fatass");

    expect(params.priceListId).toBeNull();
  });

  test("ryot and fatass bill all picked units on the standard pick SKU", () => {
    for (const slug of ["ryot", "fatass"] as const) {
      const params = buildInvoiceParams(makeDetail(slug, 0), slug);
      const standard = params.lineItems.find(
        (item) => item.sku === "3PL-PICK-PER-ITEM-STANDARD",
      );

      expect(standard?.quantity).toBe(25);
      expect(
        params.lineItems.some((item) => item.sku.startsWith("3PL-PNP-ITEM-")),
      ).toBe(false);
    }
  });

  test("dip replaces the standard pick SKU with the four tiered SKUs", () => {
    const detail = makeDetail("dip", 0, {
      unitsPickedTotal: 464,
      unitsPickedByTierTotal: { tier1: 7, tier2: 88, tier3: 188, tier4: 181 },
    });
    const params = buildInvoiceParams(detail, "dip");

    expect(
      params.lineItems.some(
        (item) => item.sku === "3PL-PICK-PER-ITEM-STANDARD",
      ),
    ).toBe(false);

    const tierLines = params.lineItems.filter((item) =>
      item.sku.startsWith("3PL-PNP-ITEM-"),
    );
    expect(
      tierLines.map(({ sku, quantity, rate }) => ({ sku, quantity, rate })),
    ).toEqual([
      { sku: "3PL-PNP-ITEM-0001", quantity: 7, rate: 0.05 },
      { sku: "3PL-PNP-ITEM-0102", quantity: 88, rate: 0.1 },
      { sku: "3PL-PNP-ITEM-0255", quantity: 188, rate: 0.2 },
      { sku: "3PL-PNP-ITEM-050X", quantity: 181, rate: 0.3 },
    ]);
  });

  test("dip tier lines are present even at quantity zero", () => {
    const detail = makeDetail("dip", 0, {
      unitsPickedTotal: 12,
      unitsPickedByTierTotal: { tier1: 0, tier2: 12, tier3: 0, tier4: 0 },
    });
    const params = buildInvoiceParams(detail, "dip");

    expect(
      params.lineItems.filter((item) => item.sku.startsWith("3PL-PNP-ITEM-"))
        .length,
    ).toBe(4);
  });

  test("dip throws when the report has no tiered breakdown", () => {
    expect(() => buildInvoiceParams(makeDetail("dip", 0), "dip")).toThrow(
      /tiered pick-fee breakdown/,
    );
  });

  test("dip throws when tier quantities disagree with units picked", () => {
    const detail = makeDetail("dip", 0, {
      unitsPickedTotal: 100,
      unitsPickedByTierTotal: { tier1: 1, tier2: 2, tier3: 3, tier4: 4 },
    });

    expect(() => buildInvoiceParams(detail, "dip")).toThrow(
      /do not match units picked/,
    );
  });

  // The price list carries a 0.00 rate for materials, so letting it drive that
  // line would silently drop the whole pass-through packaging cost.
  test("materials is the only pass-through line and keeps its computed rate", () => {
    const params = buildInvoiceParams(makeDetail("ryot", 0), "ryot");
    const passThrough = params.lineItems.filter(
      (item) => item.isPassThroughCost,
    );

    expect(passThrough.map((item) => item.sku)).toEqual(["3PL-MATERIALS-COST"]);
    expect(passThrough[0]?.rate).toBe(100);
  });
});
