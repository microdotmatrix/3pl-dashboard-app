import "server-only";

import { env } from "@/env";

import { getMembraneClient } from "./client";
import { buildZohoInvoiceUrl } from "./urls";

export type ZohoLineItem = {
  sku: string;
  name: string;
  description?: string;
  rate?: number;
  quantity: number;
  /**
   * Marks a line whose rate is a computed pass-through cost (e.g. actual
   * packaging spend) rather than a service rate. Price lists never override
   * these — the price list carries 0.00 for them, which would silently drop
   * the cost from the invoice.
   */
  isPassThroughCost?: boolean;
};

export type CreateZohoInvoiceParams = {
  customerId: string;
  date: string;
  paymentTerms?: number;
  reference: string;
  lineItems: ZohoLineItem[];
  /** Zoho price list ("pricebook") ID, when the account is billed off one. */
  priceListId?: string | null;
};

export type CreateZohoInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string;
  total: number;
};

export type ZohoInvoiceSummary = {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string;
  total: number;
  date: string | null;
  reference: string | null;
};

type ZohoProxyRecord = Record<string, unknown>;

type ZohoItemSummary = {
  itemId: string;
  sku: string | null;
  name: string | null;
  rate: number | null;
};

const ZOHO_INVOICES_PATH = "/invoices";
const ZOHO_ITEMS_PATH = "/items";
const ZOHO_PRICEBOOKS_PATH = "/pricebooks";
const ITEMS_PER_PAGE = 200;
const MAX_ITEM_PAGES = 25;

// The only scheme where a price list is a flat rate per unit. "volume" and
// "quantity" schemes price off `price_brackets`, which we do not implement.
const SUPPORTED_PRICING_SCHEME = "unit";

// "Green Box 3PL - 2026 Approved" invoice template in Zoho Books.
const ZOHO_INVOICE_TEMPLATE_ID = "3195387000197277124";

export const getZohoProxy = () =>
  getMembraneClient().connection(env.MEMBRANE_ZOHO_CONNECTION_ID).proxy;

export const buildZohoPath = (
  path: string,
  query: Record<string, number | string | null | undefined> = {},
): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
};

const isRecord = (value: unknown): value is ZohoProxyRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const isNonNull = <T>(value: T | null): value is T => value !== null;

const getErrorResponse = (error: unknown): ZohoProxyRecord | null => {
  if (!isRecord(error)) {
    return null;
  }

  if (isRecord(error.response)) {
    return error.response;
  }

  const membraneErrorData = isRecord(error.data) ? error.data : null;
  const membraneContext = isRecord(membraneErrorData?.data)
    ? membraneErrorData.data
    : null;

  return isRecord(membraneContext?.response) ? membraneContext.response : null;
};

const getErrorStatus = (error: unknown): number | null =>
  asNumber(getErrorResponse(error)?.status);

export const getErrorMessage = (error: unknown): string => {
  if (isRecord(error)) {
    const response = getErrorResponse(error);
    const responseData = isRecord(response?.data) ? response.data : null;
    const responseMessage = asString(responseData?.message);
    if (responseMessage) {
      return responseMessage;
    }

    const data = isRecord(error.data) ? error.data : null;
    const nested = asString(data?.message);
    if (nested) {
      return nested;
    }

    const direct = asString(error.message);
    if (direct) {
      return direct;
    }
  }

  return error instanceof Error ? error.message : "Zoho Books request failed.";
};

const getInvoiceRecord = (value: unknown): ZohoProxyRecord => {
  if (!isRecord(value)) {
    throw new Error("Zoho Books returned an unexpected invoice payload.");
  }

  const invoice = isRecord(value.invoice) ? value.invoice : value;
  const invoiceId = asString(invoice.invoice_id ?? invoice.invoiceId);

  if (!invoiceId) {
    throw new Error("Zoho Books did not return an invoice_id.");
  }

  return invoice;
};

const toInvoiceSummary = (value: unknown): ZohoInvoiceSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  const invoiceId = asString(value.invoice_id ?? value.invoiceId);
  if (!invoiceId) {
    return null;
  }

  return {
    invoiceId,
    invoiceNumber: asString(value.invoice_number ?? value.invoiceNumber),
    status: asString(value.status) ?? "unknown",
    total: asNumber(value.total) ?? 0,
    date: asString(value.date),
    reference: asString(value.reference_number ?? value.referenceNumber),
  };
};

const toItemSummary = (value: unknown): ZohoItemSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  const itemId = asString(value.item_id ?? value.itemId);
  if (!itemId) {
    return null;
  }

  return {
    itemId,
    sku: asString(value.sku),
    name: asString(value.name),
    rate: asNumber(value.rate),
  };
};

export { buildZohoInvoiceUrl };

const computeCommonPrefix = (values: string[]): string => {
  if (values.length === 0) {
    return "";
  }

  let prefix = values[0];
  for (let i = 1; i < values.length && prefix; i += 1) {
    while (prefix && !values[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

  return prefix;
};

const listZohoItemsBySkuPrefix = async (
  prefix: string,
): Promise<ZohoItemSummary[]> => {
  const proxy = getZohoProxy();
  const collected: ZohoItemSummary[] = [];

  for (let page = 1; page <= MAX_ITEM_PAGES; page += 1) {
    let response: unknown;
    try {
      response = await proxy.get(
        buildZohoPath(ZOHO_ITEMS_PATH, {
          sku_startswith: prefix,
          page,
          per_page: ITEMS_PER_PAGE,
        }),
      );
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }

    const items =
      isRecord(response) && Array.isArray(response.items)
        ? response.items.map(toItemSummary).filter(isNonNull)
        : [];

    collected.push(...items);

    const pageContext =
      isRecord(response) && isRecord(response.page_context)
        ? response.page_context
        : null;

    if (pageContext?.has_more_page !== true) {
      break;
    }
  }

  return collected;
};

/**
 * Reads a price list and returns its per-item rates, keyed by Zoho item ID.
 *
 * Zoho honours an explicit line-item `rate` over the price list, so the rates
 * have to be resolved here and sent on the line items — attaching
 * `pricebook_id` alone silently leaves the default rates in place.
 */
const fetchZohoPriceListRates = async (
  priceListId: string,
): Promise<Map<string, number>> => {
  const proxy = getZohoProxy();

  let response: unknown;
  try {
    response = await proxy.get(`${ZOHO_PRICEBOOKS_PATH}/${priceListId}`);
  } catch (error) {
    throw new Error(
      `Could not read Zoho Books price list ${priceListId}: ${getErrorMessage(error)}`,
    );
  }

  const pricebook =
    isRecord(response) && isRecord(response.pricebook)
      ? response.pricebook
      : null;

  if (!pricebook) {
    throw new Error(
      `Zoho Books returned no price list for ID ${priceListId}. Check src/lib/zoho/price-list-map.ts.`,
    );
  }

  const scheme = asString(pricebook.pricing_scheme);
  if (scheme !== SUPPORTED_PRICING_SCHEME) {
    throw new Error(
      `Zoho Books price list "${asString(pricebook.name)?.trim() ?? priceListId}" uses the ` +
        `"${scheme ?? "unknown"}" pricing scheme, which this app cannot price. ` +
        `Only "${SUPPORTED_PRICING_SCHEME}" (flat rate per unit) is supported.`,
    );
  }

  const rows = Array.isArray(pricebook.pricebook_items)
    ? pricebook.pricebook_items
    : [];

  const rates = new Map<string, number>();
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }

    const itemId = asString(row.item_id ?? row.itemId);
    const rate = asNumber(row.pricebook_rate);

    if (itemId && rate !== null) {
      rates.set(itemId, rate);
    }
  }

  return rates;
};

const resolveLineItemRate = (
  lineItem: ZohoLineItem,
  match: ZohoItemSummary,
  priceListRates: Map<string, number> | null,
): number => {
  // A computed pass-through cost is the real amount owed; no price list or
  // item default may replace it.
  if (lineItem.isPassThroughCost) {
    if (typeof lineItem.rate !== "number") {
      throw new Error(
        `Pass-through line "${lineItem.name}" (${lineItem.sku}) has no computed cost.`,
      );
    }

    return lineItem.rate;
  }

  if (priceListRates) {
    const priceListRate = priceListRates.get(match.itemId);

    if (typeof priceListRate !== "number") {
      throw new Error(
        `Zoho Books item "${lineItem.name}" (${lineItem.sku}) is not on this account's price list. ` +
          "Add it in Zoho Books before invoicing, or the line would bill at the wrong rate.",
      );
    }

    return priceListRate;
  }

  const rate = lineItem.rate ?? match.rate;
  if (typeof rate !== "number") {
    throw new Error(
      `Zoho Books item "${lineItem.name}" (${lineItem.sku}) does not have a configured rate.`,
    );
  }

  return rate;
};

const resolveZohoItemIds = async (
  lineItems: ZohoLineItem[],
  priceListRates: Map<string, number> | null,
): Promise<
  Array<
    ZohoLineItem & {
      itemId: string;
    }
  >
> => {
  const prefix = computeCommonPrefix(lineItems.map((item) => item.sku));

  if (!prefix) {
    throw new Error(
      "Cannot look up Zoho Books items: line item SKUs share no common prefix.",
    );
  }

  const items = await listZohoItemsBySkuPrefix(prefix);

  return lineItems.map((lineItem) => {
    const match =
      items.find((item) => item.sku === lineItem.sku) ??
      items.find(
        (item) =>
          item.name?.toLowerCase() === lineItem.name.trim().toLowerCase(),
      );

    if (!match) {
      throw new Error(
        `Zoho Books item not found for "${lineItem.name}" (${lineItem.sku}).`,
      );
    }

    return {
      ...lineItem,
      itemId: match.itemId,
      rate: resolveLineItemRate(lineItem, match, priceListRates),
    };
  });
};

export const createZohoInvoice = async (
  params: CreateZohoInvoiceParams,
): Promise<CreateZohoInvoiceResult> => {
  const proxy = getZohoProxy();
  const priceListRates = params.priceListId
    ? await fetchZohoPriceListRates(params.priceListId)
    : null;
  const lineItems = await resolveZohoItemIds(params.lineItems, priceListRates);

  try {
    const response = await proxy.post(ZOHO_INVOICES_PATH, {
      customer_id: params.customerId,
      template_id: ZOHO_INVOICE_TEMPLATE_ID,
      ...(params.priceListId ? { pricebook_id: params.priceListId } : {}),
      date: params.date,
      payment_terms: params.paymentTerms ?? 30,
      reference_number: params.reference,
      line_items: lineItems.map((item) => ({
        item_id: item.itemId,
        name: item.name,
        description: item.description,
        rate: item.rate,
        quantity: item.quantity,
      })),
    });

    const invoice = getInvoiceRecord(response);
    const invoiceId = String(invoice.invoice_id);

    return {
      invoiceId,
      invoiceNumber: asString(invoice.invoice_number ?? invoice.invoiceNumber),
      status: asString(invoice.status) ?? "draft",
      total: asNumber(invoice.total) ?? 0,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const listZohoInvoices = async (
  customerId: string,
): Promise<ZohoInvoiceSummary[]> => {
  const proxy = getZohoProxy();

  try {
    const response = await proxy.get(
      buildZohoPath(ZOHO_INVOICES_PATH, {
        customer_id: customerId,
        per_page: 25,
      }),
    );

    const rows =
      isRecord(response) && Array.isArray(response.invoices)
        ? response.invoices
        : [];

    return rows.map(toInvoiceSummary).filter(isNonNull);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getZohoInvoice = async (
  invoiceId: string,
): Promise<Record<string, unknown>> => {
  const proxy = getZohoProxy();

  try {
    const response = await proxy.get(`${ZOHO_INVOICES_PATH}/${invoiceId}`);
    return getInvoiceRecord(response);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const voidZohoInvoice = async (invoiceId: string): Promise<void> => {
  const proxy = getZohoProxy();

  try {
    await proxy.post(`${ZOHO_INVOICES_PATH}/${invoiceId}/status/void`, {});
  } catch (error) {
    const message = getErrorMessage(error);
    const lowered = message.toLowerCase();

    if (lowered.includes("already") && lowered.includes("void")) {
      return;
    }

    if (
      getErrorStatus(error) === 404 ||
      lowered.includes("invoice does not exist") ||
      lowered.includes("invalid invoice id") ||
      lowered.includes("invoice not found") ||
      lowered.includes("resource does not exist")
    ) {
      console.warn(
        `voidZohoInvoice: invoice ${invoiceId} not found in Zoho; treating as already gone.`,
      );
      return;
    }

    throw new Error(message);
  }
};
