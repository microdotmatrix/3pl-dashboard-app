import "server-only";

import type { BillingAccountSlug } from "@/lib/billing/types";

/**
 * Static map from account slug -> Zoho Books price list ("pricebook") ID.
 *
 * An account listed here is billed at its price list's rates instead of the
 * default rates in `src/lib/billing/invoice-builder.ts`, and its invoices are
 * tagged with the price list in Zoho Books. Accounts omitted here keep the
 * default rates.
 *
 * Like the contact IDs, these are non-secret and copied by hand from the Zoho
 * Books admin UI.
 */
export const ZOHO_PRICE_LIST_IDS: Partial<Record<BillingAccountSlug, string>> =
  {
    // "3PL - TPB"
    ryot: "3195387000152128163",
    // "3PL -Dip Devices"
    dip: "3195387000152128211",
  };

export const getZohoPriceListIdForSlug = (
  slug: BillingAccountSlug,
): string | null => ZOHO_PRICE_LIST_IDS[slug] ?? null;
