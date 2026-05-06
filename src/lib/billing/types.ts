import type { VendorSlug } from "@/lib/shipments/vendor-colors";

export type BillingAccountSlug = VendorSlug;

export type BillingReportStatus = "draft" | "finalized";

export type BillingShipmentMatchStatus = "matched" | "partial" | "unmatched";

export type BillingSheetColumnMapping = {
  label: string[];
  length: string[];
  width: string[];
  height: string[];
  cost: string[];
};

export type BillingSheetClientConfig = {
  accountSlug: BillingAccountSlug;
  spreadsheetId: string | null;
  sheetGid: string | null;
  headerRow: number;
  columns: BillingSheetColumnMapping;
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
  retailReturnsTotal: number;
  specialProjectHours: number;
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
