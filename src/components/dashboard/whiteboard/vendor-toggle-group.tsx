"use client";

import {
  VENDOR_ACCENT,
  VENDOR_SLUGS,
  type VendorSlug,
} from "@/lib/shipments/vendor-colors";
import { cn } from "@/lib/utils";

type VendorToggleGroupProps = {
  value: VendorSlug[];
  onChange: (next: VendorSlug[]) => void;
  disabled?: boolean;
};

export const VendorToggleGroup = ({
  value,
  onChange,
  disabled,
}: VendorToggleGroupProps) => {
  const toggle = (slug: VendorSlug) => {
    if (value.includes(slug)) {
      onChange(value.filter((item) => item !== slug));
      return;
    }
    onChange([...value, slug]);
  };

  return (
    <fieldset
      aria-label="Vendor tags"
      className="flex flex-wrap items-center gap-1 border-0 p-0"
    >
      {VENDOR_SLUGS.map((slug) => {
        const active = value.includes(slug);
        const accent = VENDOR_ACCENT[slug];
        return (
          <button
            key={slug}
            type="button"
            onClick={() => toggle(slug)}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[0.625rem] font-semibold uppercase tracking-wide transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? `${accent.bg} ${accent.fg} border-transparent`
                : `border-border text-muted-foreground hover:text-foreground`,
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                active ? "bg-current" : accent.bg,
              )}
            />
            {accent.label}
          </button>
        );
      })}
    </fieldset>
  );
};
