import "server-only";

import type { BillingAccountSlug } from "@/lib/billing/types";

/**
 * Static map from account slug -> Zoho Books contact ID.
 *
 * These IDs are non-secret (they identify a customer record in our Zoho
 * Books org) but must be filled in by hand from the Zoho Books admin UI
 * before invoice creation will succeed.
 */
export const ZOHO_CONTACT_IDS: Record<BillingAccountSlug, string> = {
  dip: "3195387000102666619",
  fatass: "3195387000000546623",
  ryot: "3195387000107449011",
};

export const getZohoContactIdForSlug = (slug: BillingAccountSlug): string => {
  const id = ZOHO_CONTACT_IDS[slug];

  if (!id) {
    throw new Error(
      `No Zoho Books contact ID configured for account "${slug}". ` +
        "Edit src/lib/zoho/contact-map.ts and fill in the ID from Zoho Books.",
    );
  }

  return id;
};
