// Pure matching/pagination logic for the fatass "Special Use Case" metric.
// Keep this file free of server-only / env imports so it stays unit-testable.
//
// Verified live 2026-06-11 (see docs/superpowers/specs): the Special Use Case
// custom field is NOT flattened onto /salesorders LIST rows — it only appears
// in the per-order DETAIL payload, as a `multiselect` whose value is an ARRAY
// of strings (e.g. ["Contains 3PL SKUs "], note the trailing space). Counting
// therefore lists the month's orders (status IS on list rows, so draft/void
// are pre-filtered cheaply) then fetches each remaining order's detail.

export const SPECIAL_USE_CASE_FIELD_ID = "3195387000008653629";
export const SPECIAL_USE_CASE_VALUE = "Contains 3PL SKUs";
export const MAX_SALES_ORDER_PAGES = 50;
export const DETAIL_FETCH_CONCURRENCY = 8;

const EXCLUDED_STATUSES = new Set(["draft", "void"]);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalize = (value: string) => value.trim().toLowerCase();

// A custom-field value may be a plain string or, for multiselect fields, an
// array of strings. Match if any element equals the target value.
const matchesSpecialUseCaseValue = (value: unknown): boolean => {
  if (typeof value === "string") {
    return normalize(value) === normalize(SPECIAL_USE_CASE_VALUE);
  }
  if (Array.isArray(value)) {
    return value.some(matchesSpecialUseCaseValue);
  }
  return false;
};

const hasSpecialUseCaseCustomField = (row: UnknownRecord): boolean => {
  // Detail payloads expose a custom_fields array; the multiselect value lives
  // on `value` (array) with a `value_formatted` string fallback.
  if (Array.isArray(row.custom_fields)) {
    const matched = row.custom_fields.some(
      (field) =>
        isRecord(field) &&
        String(field.customfield_id ?? field.field_id ?? "") ===
          SPECIAL_USE_CASE_FIELD_ID &&
        (matchesSpecialUseCaseValue(field.value) ||
          matchesSpecialUseCaseValue(field.value_formatted)),
    );
    if (matched) {
      return true;
    }
  }

  // Defensive: some payloads flatten custom fields into cf_<label> keys. The
  // value is specific enough that any cf_* match identifies the field.
  return Object.entries(row).some(
    ([key, value]) =>
      key.startsWith("cf_") && matchesSpecialUseCaseValue(value),
  );
};

const getStatus = (row: unknown): string =>
  isRecord(row) && typeof row.status === "string" ? normalize(row.status) : "";

const getSalesOrderId = (row: unknown): string | null => {
  if (!isRecord(row)) {
    return null;
  }
  const id = row.salesorder_id;
  return typeof id === "string" && id ? id : null;
};

/**
 * True when a sales order should be counted: it is not draft/void and carries
 * the Special Use Case = "Contains 3PL SKUs" custom field. Operates on a Zoho
 * detail `salesorder` record (which has both `status` and `custom_fields`).
 */
export const isSpecialUseCaseSalesOrder = (row: unknown): boolean => {
  if (!isRecord(row)) {
    return false;
  }
  if (EXCLUDED_STATUSES.has(getStatus(row))) {
    return false;
  }
  return hasSpecialUseCaseCustomField(row);
};

export type SalesOrdersListPage = {
  rows: unknown[];
  hasMorePage: boolean;
};

export type FetchSalesOrdersListPage = (
  page: number,
) => Promise<SalesOrdersListPage>;

export type FetchSalesOrderDetail = (salesOrderId: string) => Promise<unknown>;

/**
 * Pages the customer+month sales-order list and returns the ids worth a detail
 * fetch — i.e. every order whose list-row status is not draft/void. Throws past
 * the page cap rather than silently undercounting.
 */
export const collectCountableSalesOrderIdsFromPages = async (
  fetchPage: FetchSalesOrdersListPage,
): Promise<string[]> => {
  const ids: string[] = [];

  for (let page = 1; page <= MAX_SALES_ORDER_PAGES; page += 1) {
    const { rows, hasMorePage } = await fetchPage(page);

    for (const row of rows) {
      if (EXCLUDED_STATUSES.has(getStatus(row))) {
        continue;
      }
      const id = getSalesOrderId(row);
      if (id) {
        ids.push(id);
      }
    }

    if (!hasMorePage) {
      return ids;
    }
  }

  throw new Error(
    `Zoho returned more than ${MAX_SALES_ORDER_PAGES} pages of sales orders; refusing to return a partial count.`,
  );
};

// Bounded-concurrency map: runs at most `limit` async tasks at once while
// preserving input order. Pure (no I/O of its own) so it stays testable.
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await task(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
};

/**
 * Counts special-use-case sales orders given injected fetchers. Phase 1 lists
 * the countable order ids; phase 2 fetches their details (bounded concurrency)
 * and counts those that match. Fetchers are injected so this stays unit-tested
 * without touching the network or env.
 */
export const countSpecialUseCaseSalesOrdersFromFetchers = async ({
  fetchListPage,
  fetchDetail,
  concurrency = DETAIL_FETCH_CONCURRENCY,
}: {
  fetchListPage: FetchSalesOrdersListPage;
  fetchDetail: FetchSalesOrderDetail;
  concurrency?: number;
}): Promise<number> => {
  const ids = await collectCountableSalesOrderIdsFromPages(fetchListPage);
  const details = await mapWithConcurrency(ids, concurrency, fetchDetail);
  return details.filter(isSpecialUseCaseSalesOrder).length;
};
