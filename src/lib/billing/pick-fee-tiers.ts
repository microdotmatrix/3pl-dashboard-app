import { isVendorSlug } from "@/lib/shipments/vendor-colors";

import type {
  BillingAccountSlug,
  PickFeeTierKey,
  UnitsPickedByTier,
} from "./types";
import { PICK_FEE_TIER_KEYS } from "./types";
import { parseNumericValue } from "./units-picked";

export type PickFeeTier = {
  key: PickFeeTierKey;
  /** Inclusive upper bound on the item's unit price. `null` means uncapped. */
  maxUnitPrice: number | null;
  sku: string;
  name: string;
  rate: number;
  /** Human-readable price range for report rows and CSV lines. */
  priceRangeLabel: string;
};

// DIP is billed per unit at a rate that depends on the item's unit price, so
// its invoice carries four pick-and-pack SKUs instead of the standard one.
// SKU strings must match the Zoho Books items exactly — invoice creation
// resolves items by SKU (`resolveZohoItemIds` in `src/lib/zoho/books.ts`),
// with a case-insensitive name match as fallback. Names below mirror the Zoho
// items verbatim, including tier1's missing space before the dash.
export const DIP_PICK_FEE_TIERS: readonly PickFeeTier[] = [
  {
    key: "tier1",
    maxUnitPrice: 1.0,
    sku: "3PL-PNP-ITEM-0001",
    name: "Pick & Pack Fee– Per Item ($0 - $1)",
    rate: 0.05,
    priceRangeLabel: "$0 - $1.00",
  },
  {
    key: "tier2",
    maxUnitPrice: 2.5,
    sku: "3PL-PNP-ITEM-0102",
    name: "Pick & Pack Fee – Per Item ($1.01 - $2.50)",
    rate: 0.1,
    priceRangeLabel: "$1.01 - $2.50",
  },
  {
    key: "tier3",
    maxUnitPrice: 5.0,
    sku: "3PL-PNP-ITEM-0255",
    name: "Pick & Pack Fee – Per Item ($2.51 - $5.00)",
    rate: 0.2,
    priceRangeLabel: "$2.51 - $5.00",
  },
  {
    key: "tier4",
    maxUnitPrice: null,
    sku: "3PL-PNP-ITEM-050X",
    name: "Pick & Pack Fee – Per Item ($5.01+)",
    rate: 0.3,
    priceRangeLabel: "$5.01+",
  },
];

const TIERED_PICK_FEE_CONFIG: Partial<
  Record<BillingAccountSlug, readonly PickFeeTier[]>
> = {
  dip: DIP_PICK_FEE_TIERS,
};

export const getPickFeeTiers = (
  accountSlug: string,
): readonly PickFeeTier[] | null => {
  if (!isVendorSlug(accountSlug)) {
    return null;
  }

  return TIERED_PICK_FEE_CONFIG[accountSlug] ?? null;
};

export const emptyUnitsPickedByTier = (): UnitsPickedByTier =>
  Object.fromEntries(
    PICK_FEE_TIER_KEYS.map((key) => [key, 0]),
  ) as UnitsPickedByTier;

export const sumUnitsPickedByTier = (byTier: UnitsPickedByTier): number =>
  PICK_FEE_TIER_KEYS.reduce((sum, key) => sum + byTier[key], 0);

export const addUnitsPickedByTier = (
  a: UnitsPickedByTier,
  b: UnitsPickedByTier,
): UnitsPickedByTier =>
  Object.fromEntries(
    PICK_FEE_TIER_KEYS.map((key) => [key, a[key] + b[key]]),
  ) as UnitsPickedByTier;

export const classifyPickFeeTier = (
  unitPrice: number,
  tiers: readonly PickFeeTier[],
): PickFeeTierKey => {
  const tier = tiers.find(
    (candidate) =>
      candidate.maxUnitPrice === null || unitPrice <= candidate.maxUnitPrice,
  );

  if (!tier) {
    throw new Error(
      `No pick-fee tier covers a unit price of ${unitPrice}. Tier configuration must end with an uncapped tier.`,
    );
  }

  return tier.key;
};

/**
 * Buckets a shipment's picked units into pick-fee tiers by item unit price.
 *
 * Inclusion rules must stay identical to `getUnitsPickedFromRawShipment` so
 * the tier buckets always sum to the shipment's units picked: zero/negative
 * quantities are skipped and negative-unit-price adjustment rows are excluded.
 * A counted item with no readable unit price throws — guessing a tier would
 * silently misbill, and accuracy beats success here.
 *
 * Returns `null` when the payload has no line-item data, matching the
 * units-picked convention so callers decide how to surface the failure.
 */
export const getUnitsPickedByTierFromRawShipment = (
  raw: unknown,
  tiers: readonly PickFeeTier[],
): UnitsPickedByTier | null => {
  if (!raw || typeof raw !== "object" || !("items" in raw)) {
    return null;
  }

  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return null;
  }

  const byTier = emptyUnitsPickedByTier();

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const quantity = parseNumericValue(
      (item as { quantity?: unknown }).quantity,
    );
    if (quantity === null || quantity <= 0) {
      continue;
    }

    const unitPrice = parseNumericValue(
      (item as { unit_price?: unknown }).unit_price,
    );

    // ShipStation can include adjustment rows like discounts in `items`.
    if (unitPrice !== null && unitPrice < 0) {
      continue;
    }

    if (unitPrice === null) {
      const sku = (item as { sku?: unknown }).sku;
      const itemLabel = typeof sku === "string" && sku ? ` "${sku}"` : "";
      throw new Error(
        `Line item${itemLabel} counts ${quantity} picked units but has no unit price, so it cannot be assigned a pick-fee tier.`,
      );
    }

    byTier[classifyPickFeeTier(unitPrice, tiers)] += quantity;
  }

  return byTier;
};

/**
 * Resolves the tiered pick-fee breakdown for a single report shipment row.
 *
 * A persisted breakdown always wins — it was measured at generation time and
 * verified against units picked. When nothing was persisted (reports generated
 * before tiered pick fees existed) we recompute from the ShipStation payload
 * and require the buckets to sum to the resolved units picked; any mismatch or
 * missing data throws rather than silently misbilling, per the same discipline
 * as `resolveShipmentUnitsPicked`.
 */
export const resolveShipmentUnitsPickedByTier = ({
  externalId,
  storedUnitsPickedByTier,
  unitsPicked,
  raw,
  tiers,
}: {
  externalId: string;
  storedUnitsPickedByTier: UnitsPickedByTier | null;
  unitsPicked: number;
  raw: unknown;
  tiers: readonly PickFeeTier[];
}): UnitsPickedByTier => {
  if (storedUnitsPickedByTier !== null) {
    return storedUnitsPickedByTier;
  }

  let derived: UnitsPickedByTier | null;
  try {
    derived = getUnitsPickedByTierFromRawShipment(raw, tiers);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ShipStation shipment ${externalId}: ${message}`);
  }

  if (derived === null) {
    throw new Error(
      `ShipStation shipment ${externalId} is missing line-item data, so tiered pick fees cannot be determined. Backfill shipment items, sync again, and reload the report.`,
    );
  }

  const derivedTotal = sumUnitsPickedByTier(derived);
  if (derivedTotal !== unitsPicked) {
    throw new Error(
      `ShipStation shipment ${externalId}: tiered pick-fee units (${derivedTotal}) do not match units picked (${unitsPicked}). The shipment payload may have changed since the report was generated — regenerate the report.`,
    );
  }

  return derived;
};
