import "server-only";

import { cache } from "react";

import { db } from "@/db";
import {
  type ShipstationAccount,
  shipstationAccount,
} from "@/db/schema/shipstation";
import { env } from "@/env";

export type ShipstationAccountWithKey = ShipstationAccount & {
  apiKey: string;
};

const API_KEYS: Record<string, string> = {
  dip: env.SHIPSTATION_API_KEY_DIP,
  fatass: env.SHIPSTATION_API_KEY_FATASS,
  ryot: env.SHIPSTATION_API_KEY_RYOT,
};

export const getShipstationAccounts = cache(
  async (): Promise<ShipstationAccountWithKey[]> => {
    const rows = await db.select().from(shipstationAccount);

    return rows.map((row) => {
      const apiKey = API_KEYS[row.slug];

      if (!apiKey) {
        throw new Error(
          `No ShipStation API key configured for account slug "${row.slug}". Check env and src/lib/shipstation/accounts.ts.`,
        );
      }

      return { ...row, apiKey };
    });
  },
);

export const getShipstationAccountBySlug = async (
  slug: string,
): Promise<ShipstationAccountWithKey | null> => {
  const accounts = await getShipstationAccounts();
  return accounts.find((account) => account.slug === slug) ?? null;
};
