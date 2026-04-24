import {
  AWAITING_STATUSES,
  type ShipmentSortBy,
  type ShipmentSortDir,
} from "./constants";
import { isVendorSlug, type VendorSlug } from "./vendor-colors";

export type DashboardSearchParams = Record<
  string,
  string | string[] | undefined
>;

export const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "awaiting", label: "Awaiting fulfillment" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "label_purchased", label: "Label purchased" },
  { value: "on_hold", label: "On hold" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type StatusFilterValue = (typeof STATUS_OPTIONS)[number]["value"];

export const SORT_OPTIONS = [
  { value: "modified-desc", label: "Last modified (newest first)" },
  { value: "modified-asc", label: "Last modified (oldest first)" },
  { value: "ship-desc", label: "Ship date (newest)" },
  { value: "ship-asc", label: "Ship date (oldest)" },
  { value: "created-desc", label: "Created (newest)" },
  { value: "created-asc", label: "Created (oldest)" },
] as const;

export type SortOptionValue = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_PAGE_SIZE = 50;

/**
 * When the dashboard is visited without explicit date filters and without
 * `range=all`, limit shipments to the last N days so the default view stays
 * focused on recent activity.
 */
export const DEFAULT_RANGE_DAYS = 7;

export type RangeMode = "default" | "all" | "custom";

const parseSingleParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
};

const parseStatus = (value: string | undefined): StatusFilterValue => {
  if (!value) return "all";
  if (STATUS_OPTIONS.some((option) => option.value === value)) {
    return value as StatusFilterValue;
  }
  return "all";
};

const parseSort = (value: string | undefined): SortOptionValue => {
  if (!value) return "modified-desc";
  if (SORT_OPTIONS.some((option) => option.value === value)) {
    return value as SortOptionValue;
  }
  return "modified-desc";
};

const parseDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parsePage = (value: string | undefined): number => {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
};

export type ParsedDashboardSearchParams = {
  vendor: VendorSlug | undefined;
  status: StatusFilterValue;
  statusesToQuery: string[] | undefined;
  from: Date | null;
  to: Date | null;
  rangeMode: RangeMode;
  sort: SortOptionValue;
  sortBy: ShipmentSortBy;
  sortDir: ShipmentSortDir;
  page: number;
  focus: string | undefined;
};

const splitSort = (
  sort: SortOptionValue,
): { sortBy: ShipmentSortBy; sortDir: ShipmentSortDir } => {
  const [column, dir] = sort.split("-") as [ShipmentSortBy, ShipmentSortDir];
  return { sortBy: column, sortDir: dir };
};

export const parseDashboardSearchParams = (
  raw: DashboardSearchParams,
): ParsedDashboardSearchParams => {
  const vendorRaw = parseSingleParam(raw.vendor);
  const vendor = isVendorSlug(vendorRaw) ? vendorRaw : undefined;

  const status = parseStatus(parseSingleParam(raw.status));
  const statusesToQuery =
    status === "all"
      ? undefined
      : status === "awaiting"
        ? [...AWAITING_STATUSES]
        : [status];

  const fromRaw = parseDate(parseSingleParam(raw.from));
  const toRaw = parseDate(parseSingleParam(raw.to));
  // End-of-day for `to` so filter is inclusive of that date.
  const toEod = toRaw
    ? new Date(
        toRaw.getFullYear(),
        toRaw.getMonth(),
        toRaw.getDate(),
        23,
        59,
        59,
        999,
      )
    : null;

  const rangeParam = parseSingleParam(raw.range);

  let from: Date | null;
  let to: Date | null;
  let rangeMode: RangeMode;

  if (fromRaw || toEod) {
    rangeMode = "custom";
    from = fromRaw;
    to = toEod;
  } else if (rangeParam === "all") {
    rangeMode = "all";
    from = null;
    to = null;
  } else {
    rangeMode = "default";
    const now = new Date();
    to = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    from = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - DEFAULT_RANGE_DAYS,
      0,
      0,
      0,
      0,
    );
  }

  const sort = parseSort(parseSingleParam(raw.sort));
  const { sortBy, sortDir } = splitSort(sort);

  return {
    vendor,
    status,
    statusesToQuery,
    from,
    to,
    rangeMode,
    sort,
    sortBy,
    sortDir,
    page: parsePage(parseSingleParam(raw.page)),
    focus: parseSingleParam(raw.focus),
  };
};

export const toSearchParamsString = (
  params: Record<string, string | number | undefined | null>,
): string => {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const str = String(value);
    if (str.length === 0) continue;
    usp.set(key, str);
  }
  const encoded = usp.toString();
  return encoded ? `?${encoded}` : "";
};

export const formatDateForParam = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
