export const parseNumericValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    // Number("") and Number("   ") are 0, not NaN — treat blank strings as
    // absent data so downstream tier classification can refuse to guess.
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const getUnitsPickedFromRawShipment = (raw: unknown): number | null => {
  if (!raw || typeof raw !== "object" || !("items" in raw)) {
    return null;
  }

  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return null;
  }

  return items.reduce<number>((sum, item) => {
    if (!item || typeof item !== "object") {
      return sum;
    }

    const quantity = parseNumericValue(
      (item as { quantity?: unknown }).quantity,
    );
    if (quantity === null || quantity <= 0) {
      return sum;
    }

    const unitPrice = parseNumericValue(
      (item as { unit_price?: unknown }).unit_price,
    );

    // ShipStation can include adjustment rows like discounts in `items`.
    if (unitPrice !== null && unitPrice < 0) {
      return sum;
    }

    return sum + quantity;
  }, 0);
};

/**
 * Resolves the units picked for a single report shipment row.
 *
 * A persisted value always wins, including a persisted `0` — that is a real
 * measurement, not absent data. When nothing was persisted we recompute from the
 * ShipStation payload, and if that payload has no line items we throw rather than
 * defaulting to zero: an undetectable zero silently under-bills the pick-and-pack
 * line, which is exactly how RYOT May 2026 shipped an invoice for 131 units
 * instead of 6,786.
 */
export const resolveShipmentUnitsPicked = ({
  externalId,
  storedUnitsPicked,
  raw,
}: {
  externalId: string;
  storedUnitsPicked: number | null;
  raw: unknown;
}): number => {
  if (storedUnitsPicked !== null) {
    return storedUnitsPicked;
  }

  const derived = getUnitsPickedFromRawShipment(raw);
  if (derived === null) {
    throw new Error(
      `ShipStation shipment ${externalId} is missing line-item data, so units picked cannot be determined. Backfill shipment items, sync again, and reload the report.`,
    );
  }

  return derived;
};
