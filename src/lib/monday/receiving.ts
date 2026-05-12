import "server-only";

import { z } from "zod";

import { env } from "@/env";
import type {
  BillingAccountSlug,
  BillingManualMetrics,
  BillingMondayMetricsWarning,
} from "@/lib/billing/types";
import { createMondayClient } from "@/lib/monday/client";
import { getMondayVendorLabel } from "@/lib/monday/vendor-map";

const COLUMN_IDS = {
  type: "color_mm38w0b1",
  packagesReceived: "numeric_mm38z1b3",
  date: "date_mm383r6a",
  packageType: "color_mm38haqd",
  vendor: "color_mm38r7t",
} as const;

const PAGE_SIZE = 500;

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  column_values: z.array(
    z.object({
      id: z.string(),
      text: z.string().nullable(),
    }),
  ),
});

type MondayItem = z.infer<typeof itemSchema>;

const firstPageSchema = z.object({
  boards: z.array(
    z.object({
      items_page: z.object({
        cursor: z.string().nullable(),
        items: z.array(itemSchema),
      }),
    }),
  ),
});

const nextPageSchema = z.object({
  next_items_page: z.object({
    cursor: z.string().nullable(),
    items: z.array(itemSchema),
  }),
});

const FIRST_PAGE_QUERY = `
  query GetReceiving($boardId: ID!, $columnIds: [String!], $limit: Int!) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
          }
        }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query NextReceiving($cursor: String!, $columnIds: [String!], $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items {
        id
        name
        column_values(ids: $columnIds) {
          id
          text
        }
      }
    }
  }
`;

const fetchAllItems = async (boardId: string): Promise<MondayItem[]> => {
  const client = createMondayClient({ apiToken: env.MONDAY_API_TOKEN });
  const columnIds = Object.values(COLUMN_IDS);

  const first = await client.query({
    query: FIRST_PAGE_QUERY,
    variables: { boardId, columnIds, limit: PAGE_SIZE },
    schema: firstPageSchema,
  });

  const board = first.boards[0];
  if (!board) {
    throw new Error(`Monday board "${boardId}" was not found.`);
  }

  const items: MondayItem[] = [...board.items_page.items];
  let cursor = board.items_page.cursor;

  while (cursor) {
    const next = await client.query({
      query: NEXT_PAGE_QUERY,
      variables: { cursor, columnIds, limit: PAGE_SIZE },
      schema: nextPageSchema,
    });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  return items;
};

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parsePackages = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const loadReceivingForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<{
  snapshot: Pick<
    BillingManualMetrics,
    "cartonsReceivedTotal" | "palletsReceivedTotal" | "retailReturnsTotal"
  >;
  warnings: BillingMondayMetricsWarning[];
}> => {
  const warnings: BillingMondayMetricsWarning[] = [];
  const vendorLabel = getMondayVendorLabel(accountSlug);
  const items = await fetchAllItems(env.MONDAY_RECEIVING_BOARD_ID);

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  let cartonsReceivedTotal = 0;
  let palletsReceivedTotal = 0;
  let retailReturnsTotal = 0;

  for (const item of items) {
    const columns = new Map(item.column_values.map((c) => [c.id, c.text]));
    if (columns.get(COLUMN_IDS.vendor) !== vendorLabel) continue;

    const date = parseDate(columns.get(COLUMN_IDS.date) ?? null);
    if (!date) continue;
    if (date < periodStart || date >= periodEnd) continue;

    const type = columns.get(COLUMN_IDS.type) ?? null;
    const packageType = columns.get(COLUMN_IDS.packageType) ?? null;
    const packages = parsePackages(
      columns.get(COLUMN_IDS.packagesReceived) ?? null,
    );

    if (!type) {
      warnings.push({
        board: "receiving",
        severity: "warning",
        message: `Receiving row "${item.name}" (id ${item.id}) has no TYPE — skipped.`,
      });
      continue;
    }

    if (packages === null || packages <= 0) {
      warnings.push({
        board: "receiving",
        severity: "warning",
        message: `Receiving row "${item.name}" (id ${item.id}) has no/zero Packages Received — skipped.`,
      });
      continue;
    }

    if (type === "Retail Return" || type === "B2B Return") {
      retailReturnsTotal += packages;
      continue;
    }

    if (type === "Inbound PO") {
      if (!packageType) {
        warnings.push({
          board: "receiving",
          severity: "warning",
          message: `Receiving row "${item.name}" (id ${item.id}) is an Inbound PO with no Package Type — skipped.`,
        });
        continue;
      }
      if (packageType === "Pallet") {
        palletsReceivedTotal += packages;
      } else if (packageType === "Packages" || packageType === "Carton") {
        cartonsReceivedTotal += packages;
      } else {
        warnings.push({
          board: "receiving",
          severity: "warning",
          message: `Receiving row "${item.name}" (id ${item.id}) has unknown Package Type "${packageType}" — skipped.`,
        });
      }
      continue;
    }

    warnings.push({
      board: "receiving",
      severity: "warning",
      message: `Receiving row "${item.name}" (id ${item.id}) has unknown TYPE "${type}" — skipped.`,
    });
  }

  return {
    snapshot: {
      cartonsReceivedTotal,
      palletsReceivedTotal,
      retailReturnsTotal,
    },
    warnings,
  };
};
