import { vendorAccent } from "@/lib/shipments/vendor-colors";
import { cn } from "@/lib/utils";

type VendorPillProps = {
  slug: string;
  displayName?: string;
  variant?: "solid" | "soft";
  className?: string;
};

export const VendorPill = ({
  slug,
  displayName,
  variant = "solid",
  className,
}: VendorPillProps) => {
  const accent = vendorAccent(slug);
  const label = (displayName ?? accent?.label ?? slug).toUpperCase();

  const baseClasses =
    "inline-flex h-5 shrink-0 items-center justify-center rounded-full px-2 text-[0.625rem] font-semibold uppercase tracking-wide";

  if (!accent) {
    return (
      <span
        className={cn(baseClasses, "bg-muted text-muted-foreground", className)}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      data-vendor={accent.slug}
      className={cn(
        baseClasses,
        variant === "solid" ? `${accent.bg} ${accent.fg}` : accent.soft,
        className,
      )}
    >
      {label}
    </span>
  );
};
