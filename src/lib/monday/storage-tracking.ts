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
  timeline: "timerange_mm38e8gg",
  smallBins: "numeric_mm38jqfe",
  mediumBins: "numeric_mm385gdh",
  largeBins: "numeric_mm38ccar",
  additionalCartons: "numeric_mm388h6h",
  vendor: "color_mm385exr",
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
  query GetStorageTracking($boardId: ID!, $columnIds: [String!], $limit: Int!) {
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
  query NextStorageTracking($cursor: String!, $columnIds: [String!], $limit: Int!) {
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

const parseNumber = (value: string | null): number | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTimelineRange = (
  value: string | null,
): { start: Date; end: Date } | null => {
  if (!value) return null;
  // Monday timeline column text comes back as "YYYY-MM-DD - YYYY-MM-DD".
  const match = value
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];
  if (!startStr || !endStr) return null;
  const start = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return { start, end };
};

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const parseItemNamePeriod = (
  name: string,
): { year: number; month: number } | null => {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");
  const match = cleaned.match(/^([a-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const monthName = match[1];
  const yearStr = match[2];
  if (!monthName || !yearStr) return null;
  const monthIndex = MONTH_NAMES.indexOf(monthName);
  if (monthIndex === -1) return null;
  const year = Number(yearStr);
  if (!Number.isFinite(year)) return null;
  return { year, month: monthIndex + 1 };
};

export const loadStorageTrackingForPeriod = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
}): Promise<{
  snapshot: Partial<
    Record<
      keyof Pick<
        BillingManualMetrics,
        | "smallBinCount"
        | "mediumBinCount"
        | "largeBinCount"
        | "additionalCartonsCount"
      >,
      number | null
    >
  >;
  warnings: BillingMondayMetricsWarning[];
} | null> => {
  const warnings: BillingMondayMetricsWarning[] = [];
  const vendorLabel = getMondayVendorLabel(accountSlug);
  const items = await fetchAllItems(env.MONDAY_STORAGE_TRACKING_BOARD_ID);

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  type Candidate = MondayItem & {
    columns: Map<string, string | null>;
    timeline: { start: Date; end: Date } | null;
    nameParsed: { year: number; month: number } | null;
  };

  const vendorMatches: Candidate[] = items
    .map((item) => {
      const columns = new Map(item.column_values.map((c) => [c.id, c.text]));
      return {
        ...item,
        columns,
        timeline: parseTimelineRange(columns.get(COLUMN_IDS.timeline) ?? null),
        nameParsed: parseItemNamePeriod(item.name),
      };
    })
    .filter((item) => item.columns.get(COLUMN_IDS.vendor) === vendorLabel);

  const timelineMatches = vendorMatches.filter((item) => {
    if (!item.timeline) return false;
    return item.timeline.start < periodEnd && item.timeline.end >= periodStart;
  });

  const nameMatches =
    timelineMatches.length === 0
      ? vendorMatches.filter(
          (item) =>
            item.nameParsed?.year === year && item.nameParsed?.month === month,
        )
      : [];

  const matches = timelineMatches.length > 0 ? timelineMatches : nameMatches;

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    const ids = matches.map((m) => `"${m.name}" (id ${m.id})`).join(", ");
    throw new Error(
      `Storage Tracking has duplicate entries for ${vendorLabel} in ${year}-${String(month).padStart(2, "0")}: ${ids}. Remove the duplicate in Monday and try again.`,
    );
  }

  const match = matches[0];
  if (!match) {
    return null;
  }

  if (match.timeline && match.nameParsed) {
    const sameMonth =
      match.nameParsed.year === year && match.nameParsed.month === month;
    if (!sameMonth) {
      warnings.push({
        board: "storage-tracking",
        severity: "warning",
        message: `Storage Tracking item name "${match.name}" parses to ${match.nameParsed.year}-${String(match.nameParsed.month).padStart(2, "0")} but its Timeline overlaps ${year}-${String(month).padStart(2, "0")}. Using Timeline; please update the item name in Monday.`,
      });
    }
  }

  const small = parseNumber(match.columns.get(COLUMN_IDS.smallBins) ?? null);
  const medium = parseNumber(match.columns.get(COLUMN_IDS.mediumBins) ?? null);
  const large = parseNumber(match.columns.get(COLUMN_IDS.largeBins) ?? null);
  const extra = parseNumber(
    match.columns.get(COLUMN_IDS.additionalCartons) ?? null,
  );

  return {
    snapshot: {
      smallBinCount: small,
      mediumBinCount: medium,
      largeBinCount: large,
      additionalCartonsCount: extra,
    },
    warnings,
  };
};
