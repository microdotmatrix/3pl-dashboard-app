import "server-only";

import { env } from "@/env";
import { isVendorSlug } from "@/lib/shipments/vendor-colors";

import type {
  BillingAccountSlug,
  BillingSheetClientConfig,
  BillingSheetColumnMapping,
} from "./types";

const COMMON_COLUMNS: BillingSheetColumnMapping = {
  label: ["carton", "carton name", "package", "package type", "box"],
  length: ["length", "len", "l"],
  width: ["width", "wid", "w"],
  height: ["height", "ht", "h"],
  cost: ["cost", "carton cost", "packaging cost", "price", "amount"],
};

const BILLING_REPORT_REQUIRED_TAGS: Partial<
  Record<BillingAccountSlug, readonly string[]>
> = {
  fatass: ["3PL"],
};

export const BILLING_SHEET_CONFIG: Record<
  BillingAccountSlug,
  BillingSheetClientConfig
> = {
  dip: {
    accountSlug: "dip",
    spreadsheetId: env.BILLING_RATES_SPREADSHEET_ID ?? null,
    sheetGid: env.BILLING_RATES_GID ?? null,
    headerRow: 1,
    columns: COMMON_COLUMNS,
  },
  fatass: {
    accountSlug: "fatass",
    spreadsheetId: env.BILLING_RATES_SPREADSHEET_ID ?? null,
    sheetGid: env.BILLING_RATES_GID ?? null,
    headerRow: 1,
    columns: COMMON_COLUMNS,
  },
  ryot: {
    accountSlug: "ryot",
    spreadsheetId: env.BILLING_RATES_SPREADSHEET_ID ?? null,
    sheetGid: env.BILLING_RATES_GID ?? null,
    headerRow: 1,
    columns: COMMON_COLUMNS,
  },
};

export const getBillingSheetConfig = (
  accountSlug: string,
): BillingSheetClientConfig => {
  if (!isVendorSlug(accountSlug)) {
    throw new Error(`Unsupported billing account slug "${accountSlug}".`);
  }

  return BILLING_SHEET_CONFIG[accountSlug];
};

export const getRequiredBillingShipmentTagNames = (
  accountSlug: string,
): string[] => {
  if (!isVendorSlug(accountSlug)) {
    throw new Error(`Unsupported billing account slug "${accountSlug}".`);
  }

  return [...(BILLING_REPORT_REQUIRED_TAGS[accountSlug] ?? [])];
};

export const isBillingSheetConfigured = (accountSlug: string): boolean => {
  if (!isVendorSlug(accountSlug)) {
    return false;
  }

  const config = BILLING_SHEET_CONFIG[accountSlug];
  return Boolean(config.spreadsheetId && config.sheetGid);
};
