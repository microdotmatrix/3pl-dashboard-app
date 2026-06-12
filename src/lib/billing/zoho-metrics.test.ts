import { describe, expect, test } from "vitest";

import { loadSpecialUseCaseOrdersForPeriod } from "./zoho-metrics";

describe("loadSpecialUseCaseOrdersForPeriod", () => {
  test("returns an empty result for non-fatass accounts without calling the counter", async () => {
    let called = false;
    const result = await loadSpecialUseCaseOrdersForPeriod({
      accountSlug: "ryot",
      year: 2026,
      month: 5,
      counter: async () => {
        called = true;
        return 99;
      },
    });

    expect(result).toEqual({ snapshot: {}, warnings: [] });
    expect(called).toBe(false);
  });

  test("returns the count in the snapshot for fatass", async () => {
    const result = await loadSpecialUseCaseOrdersForPeriod({
      accountSlug: "fatass",
      year: 2026,
      month: 5,
      counter: async ({ customerId, year, month }) => {
        expect(customerId).toBe("3195387000000546623");
        expect(year).toBe(2026);
        expect(month).toBe(5);
        return 17;
      },
    });

    expect(result.snapshot).toEqual({ specialUseCaseOrdersCount: 17 });
    expect(result.warnings).toEqual([]);
  });

  test("maps a counter failure to a zoho-sales-orders warning", async () => {
    const result = await loadSpecialUseCaseOrdersForPeriod({
      accountSlug: "fatass",
      year: 2026,
      month: 5,
      counter: async () => {
        throw new Error("rate limit exceeded");
      },
    });

    expect(result.snapshot).toEqual({});
    expect(result.warnings).toEqual([
      {
        board: "zoho-sales-orders",
        severity: "error",
        message: "Zoho Books special use case pull failed: rate limit exceeded",
      },
    ]);
  });
});
