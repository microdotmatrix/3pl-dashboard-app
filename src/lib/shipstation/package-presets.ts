import "server-only";

import {
  getShipstationAccounts,
  type ShipstationAccountWithKey,
} from "@/lib/shipstation/accounts";
import {
  createShipstationClient,
  type ShipstationPackageType,
  type ShipstationPackageTypeInput,
} from "@/lib/shipstation/client";
import {
  buildPackagePresetInput,
  normalizePackagePresetDimension,
} from "@/lib/shipstation/package-preset-input";

import { loadBillingRateSource } from "../billing/rate-source";

export type PackagePresetSyncResult = {
  accountSlug: string;
  created: number;
  updated: number;
  unchanged: number;
  error: string | null;
};

const dimensionsMatch = (
  current: ShipstationPackageType["dimensions"],
  desired: ShipstationPackageTypeInput["dimensions"],
): boolean => {
  const unit = (current.unit ?? current.units ?? "").toLowerCase();

  return (
    (unit === "inch" || unit === "inches") &&
    normalizePackagePresetDimension(current.length) === desired.length &&
    normalizePackagePresetDimension(current.width) === desired.width &&
    normalizePackagePresetDimension(current.height) === desired.height
  );
};

const packageMatches = (
  current: ShipstationPackageType,
  desired: ShipstationPackageTypeInput,
): boolean =>
  current.package_code === desired.package_code &&
  current.name === desired.name &&
  (current.description ?? "") === desired.description &&
  dimensionsMatch(current.dimensions, desired.dimensions);

const syncAccountPackagePresets = async ({
  account,
  desiredPackages,
}: {
  account: ShipstationAccountWithKey;
  desiredPackages: ShipstationPackageTypeInput[];
}): Promise<PackagePresetSyncResult> => {
  const client = createShipstationClient({
    accountSlug: account.slug,
    apiKey: account.apiKey,
  });

  try {
    const existing = await client.listPackageTypes();
    const existingByCode = new Map(
      existing.packages.map((packageType) => [
        packageType.package_code,
        packageType,
      ]),
    );

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const desiredPackage of desiredPackages) {
      const current = existingByCode.get(desiredPackage.package_code);

      if (!current) {
        console.info("Creating ShipStation package preset", {
          accountSlug: account.slug,
          packagePayload: desiredPackage,
        });
        await client.createPackageType(desiredPackage);
        created += 1;
        continue;
      }

      if (packageMatches(current, desiredPackage)) {
        unchanged += 1;
        continue;
      }

      await client.updatePackageType(current.package_id, desiredPackage);
      updated += 1;
    }

    return {
      accountSlug: account.slug,
      created,
      updated,
      unchanged,
      error: null,
    };
  } catch (error) {
    console.error(
      "Error syncing package presets for account",
      account.slug,
      error,
    );
    return {
      accountSlug: account.slug,
      created: 0,
      updated: 0,
      unchanged: 0,
      error:
        error instanceof Error
          ? error.message
          : "Unknown ShipStation package preset sync error.",
    };
  }
};

export const syncPackagePresetsForAllAccounts = async (): Promise<{
  packageCount: number;
  results: PackagePresetSyncResult[];
}> => {
  const accounts = await getShipstationAccounts();
  const firstAccount = accounts[0];

  if (!firstAccount) {
    throw new Error("No ShipStation accounts are configured.");
  }

  const source = await loadBillingRateSource(firstAccount.slug);
  const desiredPackages = source.rateRows.map(buildPackagePresetInput);
  const results: PackagePresetSyncResult[] = [];

  for (const account of accounts) {
    results.push(
      await syncAccountPackagePresets({
        account,
        desiredPackages,
      }),
    );
  }

  return {
    packageCount: desiredPackages.length,
    results,
  };
};
