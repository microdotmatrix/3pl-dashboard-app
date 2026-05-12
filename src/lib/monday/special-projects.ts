import "server-only";

import { z } from "zod";

import { env } from "@/env";
import { createMondayClient } from "@/lib/monday/client";
import { getMondayVendorLabel } from "@/lib/monday/vendor-map";

import type {
  BillingAccountSlug,
  BillingManualMetrics,
  BillingMondayMetricsWarning,
} from "@/lib/billing/types";

const COLUMN_IDS = {
  date: "date_mm38ate7",
  duration: "duration_mm38waxr",
  billed: "boolean_mm38eg88",
  vendor: "color_mm385wz6",
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
  query GetSpecialProjects($boardId: ID!, $columnIds: [String!], $limit: Int!) {
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
  query NextSpecialProjects($cursor: String!, $columnIds: [String!], $limit: Int!) {
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

const parseDurationHours = (value: string | null): number | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hStr = match[1];
  const mStr = match[2];
  const sStr = match[3];
  if (!hStr || !mStr || !sStr) return null;
  const hours = Number(hStr);
  const minutes = Number(mStr);
  const seconds = Number(sStr);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return null;
  }
  return hours + minutes / 60 + seconds / 3600;
};

const isBilled = (value: string | null): boolean => {
  if (!value) return false;
  // Monday's checkbox column returns "v" (truthy) or empty/null (falsy) in text form.
  const trimmed = value.trim().toLowerCase();
  return trimmed === "v" || trimmed === "true" || trimmed === "checked";
};

export const loadSpecialProjectsForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<{
  snapshot: Pick<BillingManualMetrics, "specialProjectHours">;
  warnings: BillingMondayMetricsWarning[];
}> => {
  const warnings: BillingMondayMetricsWarning[] = [];
  const vendorLabel = getMondayVendorLabel(accountSlug);
  const items = await fetchAllItems(env.MONDAY_SPECIAL_PROJECTS_BOARD_ID);

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  let totalHours = 0;

  for (const item of items) {
    const columns = new Map(item.column_values.map((c) => [c.id, c.text]));
    if (columns.get(COLUMN_IDS.vendor) !== vendorLabel) continue;

    if (isBilled(columns.get(COLUMN_IDS.billed) ?? null)) continue;

    const date = parseDate(columns.get(COLUMN_IDS.date) ?? null);
    if (!date) continue;
    if (date < periodStart || date >= periodEnd) continue;

    const hours = parseDurationHours(columns.get(COLUMN_IDS.duration) ?? null);
    if (hours === null) {
      warnings.push({
        board: "special-projects",
        severity: "warning",
        message: `Special Projects row "${item.name}" (id ${item.id}) has unparseable Time Tracking — skipped.`,
      });
      continue;
    }

    totalHours += hours;
  }

  return {
    snapshot: { specialProjectHours: Math.round(totalHours * 100) / 100 },
    warnings,
  };
};
