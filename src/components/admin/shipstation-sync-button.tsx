"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { triggerShipstationSync } from "@/lib/shipstation/actions";

type SyncRunResult = Awaited<ReturnType<typeof triggerShipstationSync>>;

export const ShipstationSyncButton = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      const result = await triggerShipstationSync();
      setLastResult(result);
      router.refresh();
    });
  };

  const summary = lastResult
    ? lastResult.results
        .map(
          (r) =>
            `${r.accountSlug}: ${r.error ? `error (${r.error.slice(0, 80)}${r.error.length > 80 ? "\u2026" : ""})` : `${r.upserted} upserted, ${r.pagesFetched} pages`}`,
        )
        .join("  \u00b7  ")
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isPending}
          onClick={handleClick}
        >
          {isPending ? "Syncing\u2026" : "Run sync now"}
        </Button>
      </div>
      {summary ? (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {summary}
        </p>
      ) : null}
    </div>
  );
};
