// src/lib/billing/zoho-metrics.ts
import { getZohoContactIdForSlug } from "@/lib/zoho/contact-map";

import type {
  BillingAccountSlug,
  BillingMondayMetricsSnapshot,
  BillingMondayMetricsWarning,
} from "./types";

export type SpecialUseCaseCounter = (params: {
  customerId: string;
  year: number;
  month: number;
}) => Promise<number>;

const ZOHO_METRIC_ACCOUNT: BillingAccountSlug = "fatass";

/**
 * Loads the fatass-only "special use case orders" count from Zoho Books.
 * Failures degrade to a warning instead of throwing so a Zoho outage never
 * blocks report generation. The counter is injected for testability.
 */
export const loadSpecialUseCaseOrdersForPeriod = async ({
  accountSlug,
  year,
  month,
  counter,
}: {
  accountSlug: BillingAccountSlug;
  year: number;
  month: number;
  counter: SpecialUseCaseCounter;
}): Promise<{
  snapshot: BillingMondayMetricsSnapshot;
  warnings: BillingMondayMetricsWarning[];
}> => {
  if (accountSlug !== ZOHO_METRIC_ACCOUNT) {
    return { snapshot: {}, warnings: [] };
  }

  try {
    const count = await counter({
      customerId: getZohoContactIdForSlug(ZOHO_METRIC_ACCOUNT),
      year,
      month,
    });

    return { snapshot: { specialUseCaseOrdersCount: count }, warnings: [] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Zoho Books error.";

    return {
      snapshot: {},
      warnings: [
        {
          board: "zoho-sales-orders",
          severity: "error",
          message: `Zoho Books special use case pull failed: ${message}`,
        },
      ],
    };
  }
};
