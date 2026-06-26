"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { triggerShipstationPackagePresetSync } from "@/lib/shipstation/actions";

type PackageSyncRunResult = Awaited<
  ReturnType<typeof triggerShipstationPackagePresetSync>
>;

export const ShipstationPackageSyncButton = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<PackageSyncRunResult | null>(
    null,
  );

  const handleClick = () => {
    startTransition(async () => {
      const result = await triggerShipstationPackagePresetSync();
      setLastResult(result);
      router.refresh();
    });
  };

  const summary = lastResult
    ? lastResult.results
        .map((result) => {
          if (result.error) {
            return `${result.accountSlug}: error (${result.error.slice(0, 80)}${result.error.length > 80 ? "\u2026" : ""})`;
          }

          return `${result.accountSlug}: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged`;
        })
        .join("  \u00b7  ")
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={handleClick}
        >
          {isPending ? "Syncing packages\u2026" : "Sync package list"}
        </Button>
      </div>
      {summary ? (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {lastResult?.packageCount ?? 0} Monday packages. {summary}
        </p>
      ) : null}
    </div>
  );
};
