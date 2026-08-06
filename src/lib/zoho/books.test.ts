import { beforeEach, describe, expect, test, vi } from "vitest";

const { proxyPost, proxyGet } = vi.hoisted(() => ({
  proxyPost: vi.fn(),
  proxyGet: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    MEMBRANE_ZOHO_CONNECTION_ID: "test-connection",
  },
}));

vi.mock("./client", () => ({
  getMembraneClient: () => ({
    connection: () => ({
      proxy: {
        post: proxyPost,
        get: proxyGet,
      },
    }),
  }),
}));

import { createZohoInvoice, voidZohoInvoice } from "./books";

describe("voidZohoInvoice", () => {
  beforeEach(() => {
    proxyPost.mockReset();
  });

  test("treats Zoho's deleted-invoice 404 response as already gone", async () => {
    proxyPost.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 404"), {
        isAxiosError: true,
        response: {
          status: 404,
          data: {
            code: 1002,
            message: "Resource does not exist.",
          },
        },
      }),
    );

    await expect(voidZohoInvoice("deleted-invoice")).resolves.toBeUndefined();
    expect(proxyPost).toHaveBeenCalledWith(
      "/invoices/deleted-invoice/status/void",
      {},
    );
  });

  test("continues to block revert when Zoho rejects a non-missing invoice", async () => {
    proxyPost.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 400"), {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            code: 1001,
            message: "This invoice has payments applied.",
          },
        },
      }),
    );

    await expect(voidZohoInvoice("paid-invoice")).rejects.toThrow(
      "This invoice has payments applied.",
    );
  });
});

describe("createZohoInvoice price list handling", () => {
  const PRICE_LIST_ID = "3195387000152128163";

  const ITEMS = [
    { item_id: "item-sm", sku: "3PL-STORAGE-SM", name: "Storage", rate: 1.5 },
    {
      item_id: "item-materials",
      sku: "3PL-MATERIALS-COST",
      name: "Materials",
      rate: 0,
    },
    {
      item_id: "item-pallet",
      sku: "3PL-RECV-PALLET",
      name: "Pallet",
      rate: 30,
    },
  ];

  // Price list undercuts the item default on storage, zeroes materials.
  const PRICEBOOK_ITEMS = [
    { item_id: "item-sm", pricebook_rate: 1 },
    { item_id: "item-materials", pricebook_rate: 0 },
    { item_id: "item-pallet", pricebook_rate: 30 },
  ];

  const LINE_ITEMS = [
    { sku: "3PL-STORAGE-SM", name: "Storage", rate: 1.5, quantity: 10 },
    {
      sku: "3PL-MATERIALS-COST",
      name: "Materials",
      rate: 100,
      quantity: 1,
      isPassThroughCost: true,
    },
    { sku: "3PL-RECV-PALLET", name: "Pallet", quantity: 2 },
  ];

  const params = {
    customerId: "customer-1",
    date: "2026-08-06",
    reference: "3PL - Jul 2026",
    lineItems: LINE_ITEMS,
  };

  const mockGet = ({
    pricingScheme = "unit",
    pricebookItems = PRICEBOOK_ITEMS,
  }: {
    pricingScheme?: string;
    pricebookItems?: Array<{ item_id: string; pricebook_rate: number }>;
  } = {}) => {
    proxyGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/pricebooks/")) {
        return {
          pricebook: {
            pricebook_id: PRICE_LIST_ID,
            name: "3PL - TPB ",
            pricing_scheme: pricingScheme,
            pricebook_items: pricebookItems,
          },
        };
      }

      return { items: ITEMS, page_context: { has_more_page: false } };
    });
  };

  const getPostedBody = () => proxyPost.mock.calls[0][1];

  beforeEach(() => {
    proxyPost.mockReset();
    proxyGet.mockReset();
    proxyPost.mockResolvedValue({
      invoice: { invoice_id: "inv-1", status: "draft", total: 170 },
    });
  });

  test("tags the invoice with the price list and prices lines from it", async () => {
    mockGet();

    await createZohoInvoice({ ...params, priceListId: PRICE_LIST_ID });

    const body = getPostedBody();
    expect(body.pricebook_id).toBe(PRICE_LIST_ID);

    const rates = Object.fromEntries(
      body.line_items.map((item: { item_id: string; rate: number }) => [
        item.item_id,
        item.rate,
      ]),
    );

    // Price list wins over the rate the builder supplied...
    expect(rates["item-sm"]).toBe(1);
    // ...and over the Zoho item default when the builder supplied none.
    expect(rates["item-pallet"]).toBe(30);
    // ...but never over a computed pass-through cost.
    expect(rates["item-materials"]).toBe(100);
  });

  test("refuses to invoice an item the price list does not cover", async () => {
    mockGet({
      pricebookItems: PRICEBOOK_ITEMS.filter(
        (item) => item.item_id !== "item-pallet",
      ),
    });

    await expect(
      createZohoInvoice({ ...params, priceListId: PRICE_LIST_ID }),
    ).rejects.toThrow(/Pallet.*3PL-RECV-PALLET/);
    expect(proxyPost).not.toHaveBeenCalled();
  });

  test("refuses a price list whose scheme is not flat per-unit rates", async () => {
    mockGet({ pricingScheme: "volume" });

    await expect(
      createZohoInvoice({ ...params, priceListId: PRICE_LIST_ID }),
    ).rejects.toThrow(/pricing scheme/i);
    expect(proxyPost).not.toHaveBeenCalled();
  });

  test("accounts with no price list are unaffected", async () => {
    mockGet();

    await createZohoInvoice(params);

    const body = getPostedBody();
    expect(body.pricebook_id).toBeUndefined();
    expect(
      proxyGet.mock.calls.some((call) =>
        String(call[0]).startsWith("/pricebooks/"),
      ),
    ).toBe(false);

    const rates = Object.fromEntries(
      body.line_items.map((item: { item_id: string; rate: number }) => [
        item.item_id,
        item.rate,
      ]),
    );
    expect(rates["item-sm"]).toBe(1.5);
    expect(rates["item-pallet"]).toBe(30);
    expect(rates["item-materials"]).toBe(100);
  });
});
