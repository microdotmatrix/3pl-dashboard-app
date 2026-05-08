import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { env } from "@/env";
import { createMondayClient } from "@/lib/monday/client";

import { getBillingRateConfig } from "./config";
import { normalizeRateDimensions } from "./dimension-match";
import type { BillingRateRow } from "./types";

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
  query GetPackageBoardItems($boardId: ID!, $columnIds: [String!], $limit: Int!) {
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
  query NextPackageBoardItems($cursor: String!, $columnIds: [String!], $limit: Int!) {
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

const parseNumber = (value: string | null): number | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const fetchAllBoardItems = async ({
  boardId,
  columnIds,
}: {
  boardId: string;
  columnIds: string[];
}): Promise<MondayItem[]> => {
  const client = createMondayClient({ apiToken: env.MONDAY_API_TOKEN });

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

// Deterministic content hash so report regeneration can detect when the
// underlying rate data changed. Persisted to the legacy `sheet_source_hash`
// column for now; renaming the column is deferred to a separate migration.
const hashItems = (items: MondayItem[]): string => {
  const normalized = [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      columns: [...item.column_values]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((column) => ({ id: column.id, text: column.text ?? "" })),
    }));

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
};

export const loadBillingRateSource = async (
  accountSlug: string,
): Promise<{
  sourceHash: string;
  rateRows: BillingRateRow[];
}> => {
  const config = getBillingRateConfig(accountSlug);

  const columnIds = [
    config.columnIds.length,
    config.columnIds.width,
    config.columnIds.height,
    config.columnIds.cost,
  ];

  const items = await fetchAllBoardItems({
    boardId: config.boardId,
    columnIds,
  });

  const rateRows: BillingRateRow[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const columnText = new Map(
      item.column_values.map((column) => [column.id, column.text]),
    );

    const label = item.name.trim();
    const length = parseNumber(columnText.get(config.columnIds.length) ?? null);
    const width = parseNumber(columnText.get(config.columnIds.width) ?? null);
    const height = parseNumber(columnText.get(config.columnIds.height) ?? null);
    const cost = parseNumber(columnText.get(config.columnIds.cost) ?? null);

    const completelyEmpty =
      !label &&
      length === null &&
      width === null &&
      height === null &&
      cost === null;
    if (completelyEmpty) {
      continue;
    }

    if (
      !label ||
      length === null ||
      width === null ||
      height === null ||
      cost === null
    ) {
      throw new Error(
        `Monday board item "${item.name || "(unnamed)"}" (id ${item.id}) is missing a required field for "${accountSlug}".`,
      );
    }

    const normalized = normalizeRateDimensions(length, width, height);

    if (seen.has(normalized.normalizedKey)) {
      throw new Error(
        `Duplicate carton dimensions "${normalized.normalizedKey}" found in Monday board (item "${item.name}", id ${item.id}).`,
      );
    }

    seen.add(normalized.normalizedKey);
    rateRows.push({
      label,
      length,
      width,
      height,
      cost,
      normalizedKey: normalized.normalizedKey,
      // Monday item IDs are numeric strings; coerce for the audit field that
      // previously held a 1-indexed sheet row number.
      sourceRowNumber: Number(item.id),
    });
  }

  if (rateRows.length === 0) {
    throw new Error(`No billing rate rows were found for "${accountSlug}".`);
  }

  return {
    sourceHash: hashItems(items),
    rateRows,
  };
};
