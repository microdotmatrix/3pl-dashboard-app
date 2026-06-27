import type { BillingRateRow } from "@/lib/billing/types";
import type { ShipstationPackageTypeInput } from "@/lib/shipstation/client";

const DESCRIPTION_PREFIX = "Synced from Monday package board item";
const DIMENSION_PRECISION = 3;
const MAX_PACKAGE_NAME_LENGTH = 50;

const truncatePackageName = (name: string): string => {
  const normalized = name.trim().replace(/#/g, "No. ").replace(/\s+/g, " ");

  if (normalized.length <= MAX_PACKAGE_NAME_LENGTH) {
    return normalized;
  }

  return normalized.slice(0, MAX_PACKAGE_NAME_LENGTH).trimEnd();
};

const roundDimension = (value: number): number =>
  Number(value.toFixed(DIMENSION_PRECISION));

export const buildPackagePresetInput = (
  row: BillingRateRow,
): ShipstationPackageTypeInput => ({
  package_code: `custom_pkg_${row.sourceRowNumber}`,
  name: truncatePackageName(row.label),
  dimensions: {
    unit: "inch",
    length: roundDimension(row.length),
    width: roundDimension(row.width),
    height: roundDimension(row.height),
  },
  description: `${DESCRIPTION_PREFIX} ${row.sourceRowNumber}.`,
});

export const normalizePackagePresetDimension = roundDimension;
