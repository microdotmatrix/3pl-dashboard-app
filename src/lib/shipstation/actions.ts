"use server";

import { requireAdmin } from "@/lib/auth/access";

import { type SyncResult, syncAllAccounts } from "./sync";

export const triggerShipstationSync = async (): Promise<{
  ok: boolean;
  results: SyncResult[];
}> => {
  await requireAdmin();

  const results = await syncAllAccounts();

  return {
    ok: results.every((result) => result.error === null),
    results,
  };
};
