import "server-only";

import { env } from "@/env";
import { isVendorSlug } from "@/lib/shipments/vendor-colors";

import type {
  BillingAccountSlug,
  BillingRateClientConfig,
  BillingRateColumnIds,
} from "./types";

// Stable column IDs from the Monday "Package List" board. The columns are
// addressed by ID (not header text), so renaming them in the Monday UI is
// safe; restructuring the board is not.
const PACKAGE_BOARD_COLUMN_IDS: BillingRateColumnIds = {
  length: "numeric_mkyarrcw",
  width: "numeric_mkyae9vp",
  height: "numeric_mkyaahkv",
  cost: "numeric_mkyad0ax",
};

const BILLING_REPORT_REQUIRED_TAGS: Partial<
  Record<BillingAccountSlug, readonly string[]>
> = {
  fatass: ["3PL"],
};

// All three accounts currently share one board; per-account boards can be
// added by replacing this with per-slug entries.
const SHARED_BOARD = {
  boardId: env.MONDAY_PACKAGE_BOARD_ID,
  columnIds: PACKAGE_BOARD_COLUMN_IDS,
};

export const BILLING_RATE_CONFIG: Record<
  BillingAccountSlug,
  BillingRateClientConfig
> = {
  dip: { accountSlug: "dip", ...SHARED_BOARD },
  fatass: { accountSlug: "fatass", ...SHARED_BOARD },
  ryot: { accountSlug: "ryot", ...SHARED_BOARD },
};

export const getBillingRateConfig = (
  accountSlug: string,
): BillingRateClientConfig => {
  if (!isVendorSlug(accountSlug)) {
    throw new Error(`Unsupported billing account slug "${accountSlug}".`);
  }

  return BILLING_RATE_CONFIG[accountSlug];
};

export const getRequiredBillingShipmentTagNames = (
  accountSlug: string,
): string[] => {
  if (!isVendorSlug(accountSlug)) {
    throw new Error(`Unsupported billing account slug "${accountSlug}".`);
  }

  return [...(BILLING_REPORT_REQUIRED_TAGS[accountSlug] ?? [])];
};

export const isBillingRateSourceConfigured = (accountSlug: string): boolean => {
  if (!isVendorSlug(accountSlug)) {
    return false;
  }

  return Boolean(BILLING_RATE_CONFIG[accountSlug].boardId);
};
