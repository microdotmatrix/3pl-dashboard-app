import "server-only";

import { env } from "@/env";

import { getMembraneClient } from "./client";
import { buildZohoInvoiceUrl } from "./urls";

export type ZohoLineItem = {
  sku: string;
  name: string;
  description?: string;
  rate: number;
  quantity: number;
};

export type CreateZohoInvoiceParams = {
  customerId: string;
  date: string;
  paymentTerms?: number;
  reference: string;
  lineItems: ZohoLineItem[];
};

export type CreateZohoInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string;
  total: number;
  invoiceUrl: string | null;
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
};

type ZohoItemsPage = {
  items: ZohoItemSummary[];
  hasMorePage: boolean;
};

const ZOHO_INVOICES_PATH = "/invoices";
const ZOHO_ITEMS_PATH = "/items";
const ITEMS_PER_PAGE = 200;
const MAX_ITEM_PAGES = 25;

const getZohoProxy = () =>
  getMembraneClient().connection(env.MEMBRANE_ZOHO_CONNECTION_ID).proxy;

const buildZohoPath = (
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

const getErrorMessage = (error: unknown): string => {
  if (isRecord(error)) {
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
  };
};

const listZohoItemsPage = async (page: number): Promise<ZohoItemsPage> => {
  const proxy = getZohoProxy();

  try {
    const response = await proxy.get(
      buildZohoPath(ZOHO_ITEMS_PATH, {
        page,
        per_page: ITEMS_PER_PAGE,
      }),
    );

    const items =
      isRecord(response) && Array.isArray(response.items)
        ? response.items.map(toItemSummary).filter(isNonNull)
        : [];

    const pageContext =
      isRecord(response) && isRecord(response.page_context)
        ? response.page_context
        : null;

    return {
      items,
      hasMorePage: pageContext?.has_more_page === true,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const listAllZohoItems = async (): Promise<ZohoItemSummary[]> => {
  const items: ZohoItemSummary[] = [];

  for (let page = 1; page <= MAX_ITEM_PAGES; page += 1) {
    const result = await listZohoItemsPage(page);
    items.push(...result.items);

    if (!result.hasMorePage) {
      break;
    }
  }

  return items;
};

const resolveZohoItemIds = async (
  lineItems: ZohoLineItem[],
): Promise<
  Array<
    ZohoLineItem & {
      itemId: string;
    }
  >
> => {
  const items = await listAllZohoItems();

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
    };
  });
};

export const createZohoInvoice = async (
  params: CreateZohoInvoiceParams,
): Promise<CreateZohoInvoiceResult> => {
  const proxy = getZohoProxy();
  const lineItems = await resolveZohoItemIds(params.lineItems);

  try {
    const response = await proxy.post(ZOHO_INVOICES_PATH, {
      customer_id: params.customerId,
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
      invoiceUrl:
        asString(invoice.invoice_url ?? invoice.invoiceUrl) ??
        buildZohoInvoiceUrl(invoiceId),
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

