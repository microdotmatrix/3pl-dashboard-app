"use client";

import {
  Cancel01Icon,
  PackageAddIcon,
  SearchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ShipmentPickerResult } from "@/lib/shipstation/queries";
import { cn } from "@/lib/utils";

import { VendorPill } from "../shipments/vendor-pill";

export type LinkedShipment = {
  id: string;
  externalId: string;
  accountSlug: string;
  accountDisplayName: string;
};

type ShipmentPickerProps = {
  value: LinkedShipment[];
  onChange: (next: LinkedShipment[]) => void;
  max?: number;
};

const buildUrl = (query: string): string => {
  const usp = new URLSearchParams();
  if (query.trim()) usp.set("q", query.trim());
  return `/api/shipments/search?${usp.toString()}`;
};

export const ShipmentPicker = ({
  value,
  onChange,
  max = 5,
}: ShipmentPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShipmentPickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(buildUrl(q), {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const payload = (await res.json()) as {
        results: ShipmentPickerResult[];
      };
      setResults(payload.results);
    } catch {
      // ignore; next keystroke will retry
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, query, runSearch]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const addShipment = (result: ShipmentPickerResult) => {
    if (value.some((entry) => entry.id === result.id)) return;
    if (value.length >= max) return;
    onChange([
      ...value,
      {
        id: result.id,
        externalId: result.externalId,
        accountSlug: result.account.slug,
        accountDisplayName: result.account.displayName,
      },
    ]);
  };

  const removeShipment = (id: string) => {
    onChange(value.filter((entry) => entry.id !== id));
  };

  const limitReached = value.length >= max;

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1">
          {value.map((entry) => (
            <li key={entry.id}>
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 py-0.5 pr-1 pl-1.5 text-[0.7rem]">
                <VendorPill
                  slug={entry.accountSlug}
                  displayName={entry.accountDisplayName}
                  variant="soft"
                />
                <span className="font-mono text-[0.7rem] text-foreground/80">
                  {entry.externalId}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove shipment ${entry.externalId}`}
                  onClick={() => removeShipment(entry.id)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={limitReached}
            aria-label="Link a shipment"
          >
            <HugeiconsIcon
              icon={PackageAddIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {limitReached
              ? `Max ${max} shipments`
              : value.length > 0
                ? "Link another shipment"
                : "Link shipment"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(28rem,calc(100vw-2rem))] p-2"
        >
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-input/20 px-2 py-1 dark:bg-input/30">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="size-3.5 opacity-50"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by external ID, recipient, or city"
              className="w-full bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
              aria-label="Search shipments"
            />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto">
            {loading ? (
              <p className="py-4 text-center text-[0.7rem] text-muted-foreground">
                {"Searching\u2026"}
              </p>
            ) : results.length === 0 ? (
              <p className="py-4 text-center text-[0.7rem] text-muted-foreground">
                No matches
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {results.map((result) => {
                  const alreadySelected = value.some(
                    (entry) => entry.id === result.id,
                  );
                  return (
                    <li key={result.id}>
                      <button
                        type="button"
                        disabled={alreadySelected || limitReached}
                        onClick={() => {
                          addShipment(result);
                        }}
                        className={cn(
                          "w-full rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          (alreadySelected || limitReached) &&
                            "cursor-not-allowed opacity-50 hover:bg-transparent",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <VendorPill
                            slug={result.account.slug}
                            displayName={result.account.displayName}
                          />
                          <span className="font-mono text-[0.7rem]">
                            {result.externalId}
                          </span>
                          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.625rem] text-muted-foreground">
                            {result.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.7rem] text-muted-foreground">
                          {`${result.recipientName ?? "No recipient"}${
                            result.recipientCity
                              ? ` \u2013 ${result.recipientCity}`
                              : ""
                          }`}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
