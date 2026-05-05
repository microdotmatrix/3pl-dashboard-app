import type {
  BillingPackageMatch,
  BillingRateRow,
  BillingShipmentEvaluation,
} from "./types";

const DIMENSION_PRECISION = 3;
const MONEY_PRECISION = 2;
const FALLBACK_NEIGHBOR_COUNT = 5;
const DIMENSIONAL_WEIGHT_DIVISOR = 139;
const MIN_FALLBACK_SIZE_FACTOR = 0.85;
const MAX_FALLBACK_SIZE_FACTOR = 1.25;
const MAX_FALLBACK_WEIGHT_FACTOR = 1.15;

const roundDimension = (value: number): number =>
  Number(value.toFixed(DIMENSION_PRECISION));

const roundMoney = (value: number): number =>
  Number(value.toFixed(MONEY_PRECISION));

const formatDimensionKey = (dimensions: number[]) =>
  dimensions.map((value) => value.toFixed(DIMENSION_PRECISION)).join("x");

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const buildDimensionKey = (dimensions: [number, number, number]) => {
  const rounded = dimensions.map((value) => roundDimension(value)) as [
    number,
    number,
    number,
  ];
  const normalized = [...rounded].sort((a, b) => b - a);

  return {
    exact: rounded,
    longest: normalized[0] ?? null,
    middle: normalized[1] ?? null,
    shortest: normalized[2] ?? null,
    normalizedKey: formatDimensionKey(rounded),
    volume: roundDimension(rounded[0] * rounded[1] * rounded[2]),
  };
};

const rateRowMap = (rows: BillingRateRow[]) =>
  new Map(rows.map((row) => [row.normalizedKey, row]));

const dimensionGap = (left: number | null, right: number | null) => {
  if (left === null || right === null) {
    return 1;
  }

  return Math.abs(left - right) / Math.max(left, right, 1);
};

const weightToOunces = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    value?: unknown;
    unit?: unknown;
    units?: unknown;
  };
  const amount = toFiniteNumber(candidate.value ?? null);

  if (amount === null || amount < 0) {
    return null;
  }

  const rawUnit =
    typeof candidate.units === "string"
      ? candidate.units
      : typeof candidate.unit === "string"
        ? candidate.unit
        : "";
  const unit = rawUnit.trim().toLowerCase();

  if (!unit || unit === "oz" || unit === "ounce" || unit === "ounces") {
    return amount;
  }

  if (
    unit === "lb" ||
    unit === "lbs" ||
    unit === "pound" ||
    unit === "pounds"
  ) {
    return amount * 16;
  }

  if (unit === "g" || unit === "gram" || unit === "grams") {
    return amount / 28.349523125;
  }

  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") {
    return amount * 35.27396195;
  }

  return amount;
};

const packageWeightOunces = (entry: unknown): number | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as {
    weight?: unknown;
    package_weight?: unknown;
  };

  return (
    weightToOunces(candidate.weight ?? null) ??
    weightToOunces(candidate.package_weight ?? null)
  );
};

const weightedAverage = (
  entries: Array<{ value: number; weight: number }>,
): number => {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    return entries[0]?.value ?? 0;
  }

  return (
    entries.reduce((sum, entry) => sum + entry.value * entry.weight, 0) /
    totalWeight
  );
};

const estimateFallbackCost = ({
  length,
  width,
  height,
  packageWeightOz,
  rateRows,
}: {
  length: number;
  width: number;
  height: number;
  packageWeightOz: number | null;
  rateRows: BillingRateRow[];
}) => {
  if (rateRows.length === 0) {
    return null;
  }

  const profile = buildDimensionKey([length, width, height]);
  const neighbors = rateRows
    .map((row) => {
      const rowProfile = buildDimensionKey([row.length, row.width, row.height]);
      const distance =
        dimensionGap(profile.longest, rowProfile.longest) * 0.45 +
        dimensionGap(profile.middle, rowProfile.middle) * 0.35 +
        dimensionGap(profile.shortest, rowProfile.shortest) * 0.2 +
        dimensionGap(profile.volume, rowProfile.volume) * 0.35;

      return {
        row,
        profile: rowProfile,
        weight: 1 / Math.max(distance, 0.01),
      };
    })
    .sort((left, right) => right.weight - left.weight)
    .slice(0, FALLBACK_NEIGHBOR_COUNT);

  if (neighbors.length === 0) {
    return null;
  }

  const averageCost = weightedAverage(
    neighbors.map((neighbor) => ({
      value: neighbor.row.cost,
      weight: neighbor.weight,
    })),
  );
  const averageVolume = weightedAverage(
    neighbors.map((neighbor) => ({
      value: neighbor.profile.volume,
      weight: neighbor.weight,
    })),
  );
  const sizeFactor = clamp(
    (profile.volume / Math.max(averageVolume, 1)) ** 0.25,
    MIN_FALLBACK_SIZE_FACTOR,
    MAX_FALLBACK_SIZE_FACTOR,
  );
  const dimensionalWeightOz =
    (Math.max(profile.volume, 0) / DIMENSIONAL_WEIGHT_DIVISOR) * 16;
  const weightFactor =
    packageWeightOz === null
      ? 1
      : clamp(
          (Math.max(packageWeightOz, dimensionalWeightOz, 1) /
            Math.max(dimensionalWeightOz, 1)) **
            0.15,
          1,
          MAX_FALLBACK_WEIGHT_FACTOR,
        );
  const estimatedCost = roundMoney(averageCost * sizeFactor * weightFactor);

  return {
    unitCost: estimatedCost,
    comparableCount: neighbors.length,
    usedWeightAdjustment: weightFactor > 1,
  };
};

const matchStatusForPackages = (packageMatches: BillingPackageMatch[]) => {
  const matchedCount = packageMatches.filter((entry) => entry.matched).length;

  if (matchedCount === packageMatches.length) {
    return "matched" as const;
  }

  if (matchedCount === 0) {
    return "unmatched" as const;
  }

  return "partial" as const;
};

export const normalizeRateDimensions = (
  length: number,
  width: number,
  height: number,
) => buildDimensionKey([length, width, height]);

export const matchShipmentPackages = ({
  packages,
  fallbackPackageCount,
  rateRows,
}: {
  packages: unknown;
  fallbackPackageCount?: number | null;
  rateRows: BillingRateRow[];
}): BillingShipmentEvaluation => {
  const packageEntries = Array.isArray(packages) ? packages : [];
  const rates = rateRowMap(rateRows);

  const packageMatches: BillingPackageMatch[] =
    packageEntries.length === 0
      ? [
          {
            packageIndex: 1,
            matched: false,
            pricingSource: "none",
            ruleLabel: null,
            unitCost: null,
            costApplied: 0,
            sourceRowNumber: null,
            originalDimensions: {
              length: null,
              width: null,
              height: null,
            },
            normalizedDimensions: {
              longest: null,
              middle: null,
              shortest: null,
            },
            normalizedKey: null,
            reason: "No package data found in the ShipStation payload.",
          },
        ]
      : packageEntries.map((entry, index) => {
          const dimensions =
            entry && typeof entry === "object" && "dimensions" in entry
              ? (entry as { dimensions?: unknown }).dimensions
              : null;

          const length =
            dimensions && typeof dimensions === "object"
              ? toFiniteNumber(
                  (dimensions as { length?: unknown }).length ?? null,
                )
              : null;
          const width =
            dimensions && typeof dimensions === "object"
              ? toFiniteNumber(
                  (dimensions as { width?: unknown }).width ?? null,
                )
              : null;
          const height =
            dimensions && typeof dimensions === "object"
              ? toFiniteNumber(
                  (dimensions as { height?: unknown }).height ?? null,
                )
              : null;

          if (length === null || width === null || height === null) {
            return {
              packageIndex: index + 1,
              matched: false,
              pricingSource: "none",
              ruleLabel: null,
              unitCost: null,
              costApplied: 0,
              sourceRowNumber: null,
              originalDimensions: { length, width, height },
              normalizedDimensions: {
                longest: null,
                middle: null,
                shortest: null,
              },
              normalizedKey: null,
              reason: "Missing or invalid package dimensions.",
            };
          }

          const normalized = buildDimensionKey([length, width, height]);
          const match = rates.get(normalized.normalizedKey);

          if (!match) {
            const fallback = estimateFallbackCost({
              length,
              width,
              height,
              packageWeightOz: packageWeightOunces(entry),
              rateRows,
            });

            return {
              packageIndex: index + 1,
              matched: false,
              pricingSource: fallback ? "fallback" : "none",
              ruleLabel: fallback ? "Estimated fallback" : null,
              unitCost: fallback?.unitCost ?? null,
              costApplied: fallback?.unitCost ?? 0,
              sourceRowNumber: null,
              originalDimensions: { length, width, height },
              normalizedDimensions: {
                longest: normalized.longest,
                middle: normalized.middle,
                shortest: normalized.shortest,
              },
              normalizedKey: normalized.normalizedKey,
              reason: fallback
                ? `Estimated from the average of ${fallback.comparableCount} similar carton sizes${fallback.usedWeightAdjustment ? ", adjusted upward for package weight" : ""}.`
                : "No carton rule matched these dimensions.",
            };
          }

          return {
            packageIndex: index + 1,
            matched: true,
            pricingSource: "exact",
            ruleLabel: match.label,
            unitCost: match.cost,
            costApplied: match.cost,
            sourceRowNumber: match.sourceRowNumber,
            originalDimensions: { length, width, height },
            normalizedDimensions: {
              longest: normalized.longest,
              middle: normalized.middle,
              shortest: normalized.shortest,
            },
            normalizedKey: normalized.normalizedKey,
            reason: null,
          };
        });

  const packagingCostTotal = packageMatches.reduce(
    (sum, entry) => sum + entry.costApplied,
    0,
  );
  const packageCount =
    packageEntries.length > 0
      ? packageEntries.length
      : Math.max(0, fallbackPackageCount ?? 0);
  const unmatchedPackageCount = packageMatches.filter(
    (entry) => !entry.matched,
  ).length;

  return {
    packageCount,
    packagingCostTotal,
    matchStatus: matchStatusForPackages(packageMatches),
    packageMatches,
    unmatchedPackageCount,
  };
};
