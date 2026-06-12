import { describe, expect, test } from "vitest";

import {
  collectCountableSalesOrderIdsFromPages,
  countSpecialUseCaseSalesOrdersFromFetchers,
  isSpecialUseCaseSalesOrder,
  MAX_SALES_ORDER_PAGES,
  type SalesOrdersListPage,
} from "./sales-orders-matching";

const FIELD_ID = "3195387000008653629";

// Detail payloads expose the field as a multiselect: value is an ARRAY of
// strings (note the trailing space Zoho stores), with a value_formatted string.
const detailRow = (overrides: Record<string, unknown> = {}) => ({
  salesorder_id: "so-1",
  status: "invoiced",
  custom_fields: [
    {
      customfield_id: FIELD_ID,
      value: ["Contains 3PL SKUs "],
      value_formatted: "Contains 3PL SKUs ",
    },
  ],
  ...overrides,
});

describe("isSpecialUseCaseSalesOrder", () => {
  test("matches a detail row with the multiselect array value", () => {
    expect(isSpecialUseCaseSalesOrder(detailRow())).toBe(true);
  });

  test("matches a plain string custom-field value too", () => {
    expect(
      isSpecialUseCaseSalesOrder(
        detailRow({
          custom_fields: [
            { customfield_id: FIELD_ID, value: "Contains 3PL SKUs" },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("matches case- and whitespace-insensitively", () => {
    expect(
      isSpecialUseCaseSalesOrder(
        detailRow({
          custom_fields: [
            { customfield_id: FIELD_ID, value: ["  contains 3pl skus  "] },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("matches when the multiselect contains other options alongside ours", () => {
    expect(
      isSpecialUseCaseSalesOrder(
        detailRow({
          custom_fields: [
            {
              customfield_id: FIELD_ID,
              value: ["Something else", "Contains 3PL SKUs "],
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("matches via flattened cf_* key when custom_fields is absent", () => {
    expect(
      isSpecialUseCaseSalesOrder({
        salesorder_id: "so-2",
        status: "invoiced",
        cf_special_use_case: "Contains 3PL SKUs",
      }),
    ).toBe(true);
  });

  test("excludes draft and void statuses regardless of field", () => {
    expect(isSpecialUseCaseSalesOrder(detailRow({ status: "draft" }))).toBe(
      false,
    );
    expect(isSpecialUseCaseSalesOrder(detailRow({ status: "void" }))).toBe(
      false,
    );
    expect(isSpecialUseCaseSalesOrder(detailRow({ status: "Void" }))).toBe(
      false,
    );
  });

  test("ignores orders without the field or with other values", () => {
    expect(
      isSpecialUseCaseSalesOrder({ salesorder_id: "so-3", status: "open" }),
    ).toBe(false);
    expect(
      isSpecialUseCaseSalesOrder(
        detailRow({
          custom_fields: [{ customfield_id: FIELD_ID, value: ["Other"] }],
        }),
      ),
    ).toBe(false);
    expect(
      isSpecialUseCaseSalesOrder(
        detailRow({
          custom_fields: [
            { customfield_id: "999", value: ["Contains 3PL SKUs "] },
          ],
        }),
      ),
    ).toBe(false);
  });

  test("ignores non-record rows", () => {
    expect(isSpecialUseCaseSalesOrder(null)).toBe(false);
    expect(isSpecialUseCaseSalesOrder("nope")).toBe(false);
    expect(isSpecialUseCaseSalesOrder([detailRow()])).toBe(false);
  });
});

describe("collectCountableSalesOrderIdsFromPages", () => {
  test("collects ids across pages, skips draft/void, stops when has_more_page is false", async () => {
    const pages: SalesOrdersListPage[] = [
      {
        rows: [
          { salesorder_id: "a", status: "invoiced" },
          { salesorder_id: "b", status: "draft" },
          { salesorder_id: "c", status: "open" },
          { status: "open" }, // no id -> skipped
        ],
        hasMorePage: true,
      },
      {
        rows: [
          { salesorder_id: "d", status: "void" },
          { salesorder_id: "e", status: "fulfilled" },
        ],
        hasMorePage: false,
      },
    ];
    const fetched: number[] = [];
    const ids = await collectCountableSalesOrderIdsFromPages(async (page) => {
      fetched.push(page);
      return pages[page - 1];
    });

    expect(ids).toEqual(["a", "c", "e"]);
    expect(fetched).toEqual([1, 2]);
  });

  test("throws instead of paging forever past the cap", async () => {
    await expect(
      collectCountableSalesOrderIdsFromPages(async () => ({
        rows: [{ salesorder_id: "x", status: "open" }],
        hasMorePage: true,
      })),
    ).rejects.toThrow(`${MAX_SALES_ORDER_PAGES}`);
  });
});

describe("countSpecialUseCaseSalesOrdersFromFetchers", () => {
  test("lists countable orders then counts matches from their details", async () => {
    const listPages: SalesOrdersListPage[] = [
      {
        rows: [
          { salesorder_id: "a", status: "invoiced" },
          { salesorder_id: "b", status: "draft" }, // excluded -> never fetched
          { salesorder_id: "c", status: "open" },
          { salesorder_id: "d", status: "fulfilled" },
        ],
        hasMorePage: false,
      },
    ];
    const details: Record<string, unknown> = {
      a: detailRow({ salesorder_id: "a" }),
      c: detailRow({ salesorder_id: "c", custom_fields: [] }), // no field
      d: detailRow({ salesorder_id: "d" }),
    };
    const fetchedDetailIds: string[] = [];

    const count = await countSpecialUseCaseSalesOrdersFromFetchers({
      fetchListPage: async (page) => listPages[page - 1],
      fetchDetail: async (id) => {
        fetchedDetailIds.push(id);
        return details[id];
      },
    });

    expect(count).toBe(2); // a and d match; c lacks the field
    expect(fetchedDetailIds.sort()).toEqual(["a", "c", "d"]); // draft "b" never fetched
  });

  test("returns 0 when no countable orders exist", async () => {
    const count = await countSpecialUseCaseSalesOrdersFromFetchers({
      fetchListPage: async () => ({
        rows: [{ salesorder_id: "b", status: "void" }],
        hasMorePage: false,
      }),
      fetchDetail: async () => {
        throw new Error("should not fetch any detail");
      },
    });
    expect(count).toBe(0);
  });
});
