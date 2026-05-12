import { isVendorSlug } from "@/lib/shipments/vendor-colors";

import type { BillingAccountSlug } from "@/lib/billing/types";

const VENDOR_LABEL: Record<BillingAccountSlug, string> = {
  ryot: "RYOT",
  fatass: "Fat Ass Glass",
  dip: "Dip Devices",
};

export const getMondayVendorLabel = (accountSlug: string): string => {
  if (!isVendorSlug(accountSlug)) {
    throw new Error(`Unsupported billing account slug "${accountSlug}".`);
  }

  return VENDOR_LABEL[accountSlug];
};

export const isMondayVendorLabelForSlug = (
  label: string,
  accountSlug: BillingAccountSlug,
): boolean => label === VENDOR_LABEL[accountSlug];
