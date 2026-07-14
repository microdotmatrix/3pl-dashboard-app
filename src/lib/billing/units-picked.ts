const parseNumericValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
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
