import type { BillingPackageMatch } from "./types";

export type ZeroCostPackageShipment = {
  externalId: string;
  shipmentNumber: string | null;
  packageIndexes: number[];
};

export type ZeroCostPackageSummary = {
  packageCount: number;
  shipmentCount: number;
  shipments: ZeroCostPackageShipment[];
};

type ShipmentInput = {
  externalId: string;
  shipmentNumber: string | null;
  packageMatches: BillingPackageMatch[];
};

/**
 * Finds packages that were billed nothing.
 *
 * A package normally prices from the master carton list, or from a weighted
 * estimate of comparable cartons when the dimensions do not match a rule. When
 * neither happens — no package data in the payload, or a missing dimension —
 * the package is billed at $0 and the shipment is silently under-charged. This
 * surfaces those so they can be corrected by hand; it deliberately does not
 * block the report.
 *
 * Non-positive costs count, so a negative adjustment cannot mask a zero.
 */
export const summarizeZeroCostPackages = (
  shipments: ReadonlyArray<ShipmentInput>,
): ZeroCostPackageSummary | null => {
  const affected: ZeroCostPackageShipment[] = shipments
    .map((shipment) => ({
      externalId: shipment.externalId,
      shipmentNumber: shipment.shipmentNumber,
      packageIndexes: shipment.packageMatches
        .filter((entry) => entry.costApplied <= 0)
        .map((entry) => entry.packageIndex),
    }))
    .filter((shipment) => shipment.packageIndexes.length > 0);

  if (affected.length === 0) {
    return null;
  }

  return {
    packageCount: affected.reduce(
      (sum, entry) => sum + entry.packageIndexes.length,
      0,
    ),
    shipmentCount: affected.length,
    shipments: affected,
  };
};
