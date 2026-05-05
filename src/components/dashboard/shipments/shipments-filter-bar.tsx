"use client";

import { Calendar03Icon, FilterRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDateForParam,
  type RangeMode,
  SORT_OPTIONS,
  type SortOptionValue,
  STATUS_OPTIONS,
  type StatusFilterValue,
} from "@/lib/shipments/search-params";
import {
  VENDOR_ACCENT,
  VENDOR_SLUGS,
  type VendorSlug,
} from "@/lib/shipments/vendor-colors";
import { cn } from "@/lib/utils";

import { ShipmentsSearchInput } from "./shipments-search-input";

type ShipmentsFilterBarProps = {
  vendor: VendorSlug | undefined;
  status: StatusFilterValue;
  from: Date | null;
  to: Date | null;
  rangeMode: RangeMode;
  sort: SortOptionValue;
  query: string;
};

type PresetKey = "today" | "7d" | "30d" | "all";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

const resolvePreset = (key: PresetKey): DateRange | null => {
  const now = new Date();
  if (key === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (key === "7d") {
    return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
  }
  if (key === "30d") {
    return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
  }
  return null;
};

const fmtRangeLabel = (from: Date | null, to: Date | null): string => {
  if (!from && !to) return "All time";
  const fmt = (d: Date) => format(d, "MMM d, yyyy");
  if (from && to) return `${fmt(from)} \u2013 ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Until ${fmt(to)}`;
  return "All time";
};

export const ShipmentsFilterBar = ({
  vendor,
  status,
  from,
  to,
  rangeMode,
  sort,
  query,
}: ShipmentsFilterBarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);

  const initialRange: DateRange | undefined = useMemo(() => {
    if (!from && !to) return undefined;
    return {
      from: from ?? undefined,
      to: to ?? undefined,
    };
  }, [from, to]);

  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(
    initialRange,
  );

  const pushParams = (updater: (next: URLSearchParams) => URLSearchParams) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page"); // reset pagination on filter change
    const updated = updater(next);
    const qs = updated.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  const onVendorChange = (value: string) => {
    pushParams((next) => {
      if (value === "all") next.delete("vendor");
      else next.set("vendor", value);
      return next;
    });
  };

  const onStatusChange = (value: string) => {
    pushParams((next) => {
      if (value === "all") next.delete("status");
      else next.set("status", value);
      return next;
    });
  };

  const onSortChange = (value: string) => {
    pushParams((next) => {
      if (value === "modified-desc") next.delete("sort");
      else next.set("sort", value);
      return next;
    });
  };

  const applyDateRange = (range: DateRange | undefined) => {
    pushParams((next) => {
      // Any explicit range selection (or clearing it) overrides the "all" opt-out.
      next.delete("range");
      if (!range || (!range.from && !range.to)) {
        next.delete("from");
        next.delete("to");
        return next;
      }
      if (range.from) next.set("from", formatDateForParam(range.from));
      else next.delete("from");
      if (range.to) next.set("to", formatDateForParam(range.to));
      else next.delete("to");
      return next;
    });
  };

  const applyAllTime = () => {
    setPendingRange(undefined);
    pushParams((next) => {
      next.delete("from");
      next.delete("to");
      next.set("range", "all");
      return next;
    });
  };

  const applyPreset = (key: PresetKey) => {
    if (key === "all") {
      applyAllTime();
      setRangePopoverOpen(false);
      return;
    }
    const range = resolvePreset(key);
    setPendingRange(range ?? undefined);
    applyDateRange(range ?? undefined);
    setRangePopoverOpen(false);
  };

  const resetAll = () => {
    setPendingRange(undefined);
    const next = new URLSearchParams();
    next.set("range", "all");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  const vendorValue = vendor ?? "all";
  const hasActiveFilters =
    vendorValue !== "all" ||
    status !== "active" ||
    sort !== "modified-desc" ||
    rangeMode !== "all" ||
    query.length > 0;

  const rangeButtonLabel =
    rangeMode === "default"
      ? "Last 7 days"
      : rangeMode === "all"
        ? "All time"
        : fmtRangeLabel(from, to);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2",
        isPending && "opacity-80",
      )}
    >
      <ShipmentsSearchInput query={query} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={vendorValue} onValueChange={onVendorChange}>
          <SelectTrigger
            size="default"
            aria-label="Filter by vendor"
            className="min-w-28"
          >
            <SelectValue placeholder="Vendor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {VENDOR_SLUGS.map((slug) => (
              <SelectItem key={slug} value={slug}>
                {VENDOR_ACCENT[slug].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger
            size="default"
            aria-label="Filter by status"
            className="min-w-40"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="default"
              aria-label="Filter by date range"
            >
              <HugeiconsIcon
                icon={Calendar03Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {rangeButtonLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="mb-2 flex flex-wrap gap-1">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset(preset.key)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={from ?? undefined}
              selected={pendingRange}
              onSelect={setPendingRange}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPendingRange(undefined);
                  applyDateRange(undefined);
                  setRangePopoverOpen(false);
                }}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  applyDateRange(pendingRange);
                  setRangePopoverOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger
            size="default"
            aria-label="Sort shipments"
            className="min-w-52"
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="default"
            onClick={resetAll}
            aria-label="Reset filters"
          >
            <HugeiconsIcon
              icon={FilterRemoveIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
};
