export type VendorSlug = "dip" | "ryot" | "fatass";

export type VendorAccent = {
  slug: VendorSlug;
  label: string;
  bg: string;
  fg: string;
  ring: string;
  border: string;
  soft: string;
};

export const VENDOR_ACCENT: Record<VendorSlug, VendorAccent> = {
  dip: {
    slug: "dip",
    label: "DIP",
    bg: "bg-vendor-dip",
    fg: "text-vendor-dip-foreground",
    ring: "ring-vendor-dip",
    border: "border-vendor-dip",
    soft: "bg-vendor-dip/15 text-vendor-dip",
  },
  ryot: {
    slug: "ryot",
    label: "RYOT",
    bg: "bg-vendor-ryot",
    fg: "text-vendor-ryot-foreground",
    ring: "ring-vendor-ryot",
    border: "border-vendor-ryot",
    soft: "bg-vendor-ryot/15 text-vendor-ryot",
  },
  fatass: {
    slug: "fatass",
    label: "FATASS",
    bg: "bg-vendor-fatass",
    fg: "text-vendor-fatass-foreground",
    ring: "ring-vendor-fatass",
    border: "border-vendor-fatass",
    soft: "bg-vendor-fatass/15 text-vendor-fatass",
  },
};

export const VENDOR_SLUGS = Object.keys(VENDOR_ACCENT) as VendorSlug[];

export const isVendorSlug = (
  value: string | null | undefined,
): value is VendorSlug =>
  value === "dip" || value === "ryot" || value === "fatass";

export const vendorAccent = (
  slug: string | null | undefined,
): VendorAccent | null => (isVendorSlug(slug) ? VENDOR_ACCENT[slug] : null);
