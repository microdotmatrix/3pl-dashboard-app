import { beforeEach, describe, expect, test, vi } from "vitest";

const { proxyPost } = vi.hoisted(() => ({
  proxyPost: vi.fn(),
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
      },
    }),
  }),
}));

import { voidZohoInvoice } from "./books";

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
