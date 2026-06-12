import type { VendorSlug } from "@/lib/shipments/vendor-colors";

export type BillingAccountSlug = VendorSlug;

export type BillingReportStatus = "draft" | "finalized";

export type BillingShipmentMatchStatus = "matched" | "partial" | "unmatched";

export type BillingRateColumnIds = {
  length: string;
  width: string;
  height: string;
  cost: string;
};

export type BillingRateClientConfig = {
  accountSlug: BillingAccountSlug;
  boardId: string;
  columnIds: BillingRateColumnIds;
};

export type BillingRateRow = {
  label: string;
  length: number;
  width: number;
  height: number;
  cost: number;
  normalizedKey: string;
  sourceRowNumber: number;
};

export type BillingPackagePricingSource = "exact" | "fallback" | "none";

export type BillingManualMetrics = {
  smallBinCount: number;
  mediumBinCount: number;
  largeBinCount: number;
  additionalCartonsCount: number;
  cartonsReceivedTotal: number;
  palletsReceivedTotal: number;
  retailReturnsTotal: number;
  specialProjectHours: number;
  specialUseCaseOrdersCount: number;
};

export type BillingPackageMatch = {
  packageIndex: number;
  matched: boolean;
  pricingSource: BillingPackagePricingSource;
  ruleLabel: string | null;
  unitCost: number | null;
  costApplied: number;
  sourceRowNumber: number | null;
  originalDimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
  };
  normalizedDimensions: {
    longest: number | null;
    middle: number | null;
    shortest: number | null;
  };
  normalizedKey: string | null;
  reason: string | null;
};

export type BillingShipmentEvaluation = {
  packageCount: number;
  packagingCostTotal: number;
  matchStatus: BillingShipmentMatchStatus;
  packageMatches: BillingPackageMatch[];
  unmatchedPackageCount: number;
};

export type BillingMetricKey = keyof BillingManualMetrics;

export type BillingManualMetricsOverrides = Record<BillingMetricKey, boolean>;

export type BillingMondayMetricsSnapshot = Partial<
  Record<BillingMetricKey, number | null>
>;

export type BillingMondayMetricsWarning = {
  board:
    | "storage-tracking"
    | "receiving"
    | "special-projects"
    | "zoho-sales-orders"
    | "connection";
  severity: "warning" | "error";
  message: string;
};

export const ALL_METRIC_KEYS: readonly BillingMetricKey[] = [
  "smallBinCount",
  "mediumBinCount",
  "largeBinCount",
  "additionalCartonsCount",
  "cartonsReceivedTotal",
  "palletsReceivedTotal",
  "retailReturnsTotal",
  "specialProjectHours",
  "specialUseCaseOrdersCount",
] as const;

export const EMPTY_OVERRIDES: BillingManualMetricsOverrides = {
  smallBinCount: false,
  mediumBinCount: false,
  largeBinCount: false,
  additionalCartonsCount: false,
  cartonsReceivedTotal: false,
  palletsReceivedTotal: false,
  retailReturnsTotal: false,
  specialProjectHours: false,
  specialUseCaseOrdersCount: false,
};
