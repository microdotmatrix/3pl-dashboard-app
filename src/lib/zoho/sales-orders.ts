// src/lib/zoho/sales-orders.ts
import "server-only";

import { buildZohoPath, getErrorMessage, getZohoProxy } from "./books";
import {
  countSpecialUseCaseSalesOrdersFromFetchers,
  type SalesOrdersListPage,
} from "./sales-orders-matching";

const ZOHO_SALES_ORDERS_PATH = "/salesorders";
const SALES_ORDERS_PER_PAGE = 200;

const pad = (value: number) => String(value).padStart(2, "0");

const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Counts fatass sales orders dated within the given month that carry the
 * "Special Use Case = Contains 3PL SKUs" custom field, excluding draft and
 * void orders.
 *
 * The custom field is NOT present on list rows (verified live 2026-06; see the
 * design spec), so this lists the customer+month orders — cheaply pre-filtering
 * draft/void by their list-row status — then fetches each remaining order's
 * detail and matches on its custom_fields. Filtering is client-side because
 * Zoho silently ignores unknown query params and its multiselect filter rejects
 * the label value.
 */
export const countSpecialUseCaseSalesOrders = async ({
  customerId,
  year,
  month,
}: {
  customerId: string;
  year: number;
  month: number;
}): Promise<number> => {
  const proxy = getZohoProxy();
  const dateStart = `${year}-${pad(month)}-01`;
  const dateEnd = `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;

  const fetchListPage = async (page: number): Promise<SalesOrdersListPage> => {
    let response: unknown;
    try {
      response = await proxy.get(
        buildZohoPath(ZOHO_SALES_ORDERS_PATH, {
          customer_id: customerId,
          date_start: dateStart,
          date_end: dateEnd,
          page,
          per_page: SALES_ORDERS_PER_PAGE,
        }),
      );
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }

    const record = asRecord(response);
    const rows = Array.isArray(record.salesorders) ? record.salesorders : [];
    const pageContext = asRecord(record.page_context);

    return { rows, hasMorePage: pageContext.has_more_page === true };
  };

  const fetchDetail = async (salesOrderId: string): Promise<unknown> => {
    let response: unknown;
    try {
      response = await proxy.get(`${ZOHO_SALES_ORDERS_PATH}/${salesOrderId}`);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }

    return asRecord(response).salesorder;
  };

  return countSpecialUseCaseSalesOrdersFromFetchers({
    fetchListPage,
    fetchDetail,
  });
};
