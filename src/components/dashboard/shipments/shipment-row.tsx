"use client";

import { format, formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TableCell, TableRow } from "@/components/ui/table";
import type { ShipmentWithAccount } from "@/lib/shipstation/queries";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import { VendorPill } from "./vendor-pill";

const EM_DASH = "\u2014";

type ShipmentRowProps = {
  row: ShipmentWithAccount;
  focusExternalId?: string | null;
};

type ShipToLike = {
  name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_line3?: string | null;
  city_locality?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

const asShipTo = (value: unknown): ShipToLike | null => {
  if (!value || typeof value !== "object") return null;
  return value as ShipToLike;
};

const locationLabel = (shipTo: ShipToLike | null): string => {
  if (!shipTo) return EM_DASH;
  const parts = [
    shipTo.city_locality,
    shipTo.state_province,
    shipTo.country_code,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : EM_DASH;
};

const totalWeightLabel = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const weight = value as { value?: number; units?: string; unit?: string };
  if (typeof weight.value !== "number") return null;
  const units = weight.units ?? weight.unit ?? "";
  return units ? `${weight.value} ${units}` : String(weight.value);
};

export const ShipmentRow = ({ row, focusExternalId }: ShipmentRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(false);

  const shipTo = asShipTo(row.shipment.shipTo);
  const shipFrom = asShipTo(row.shipment.shipFrom);

  const recipientName = shipTo?.name ?? shipTo?.company_name ?? "\u2014";
  const recipientLocation = locationLabel(shipTo);
  const weight = totalWeightLabel(row.shipment.totalWeight);
  const service = row.shipment.serviceCode ?? null;
  const carrier = row.shipment.carrierId ?? null;

  const shipDate = row.shipment.shipDate
    ? format(row.shipment.shipDate, "MMM d, yyyy")
    : null;
  const modifiedRelative = row.shipment.modifiedAtRemote
    ? formatDistanceToNowStrict(row.shipment.modifiedAtRemote, {
        addSuffix: true,
      })
    : null;

  useEffect(() => {
    if (!focusExternalId) return;
    if (focusExternalId !== row.shipment.externalId) return;
    setHighlighted(true);
    const t = setTimeout(() => setHighlighted(false), 2500);
    return () => clearTimeout(t);
  }, [focusExternalId, row.shipment.externalId]);

  const toggle = () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      setSheetOpen(true);
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <>
      <TableRow
        data-external-id={row.shipment.externalId}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        tabIndex={0}
        className={cn(
          "cursor-pointer",
          highlighted && "ring-2 ring-primary/60 bg-primary/5",
        )}
      >
        <TableCell>
          <VendorPill
            slug={row.account.slug}
            displayName={row.account.displayName}
          />
        </TableCell>
        <TableCell>
          <StatusBadge status={row.shipment.status} />
        </TableCell>
        <TableCell className="font-mono text-[0.7rem] text-foreground/80">
          {row.shipment.externalId}
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{recipientName}</span>
            <span className="text-[0.7rem] text-muted-foreground">
              {recipientLocation}
            </span>
          </div>
        </TableCell>
        <TableCell>
          {shipDate ? (
            <span className="text-foreground">{shipDate}</span>
          ) : (
            <span className="text-muted-foreground">{EM_DASH}</span>
          )}
          {modifiedRelative ? (
            <div className="text-[0.7rem] text-muted-foreground">
              updated {modifiedRelative}
            </div>
          ) : null}
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground">{service ?? EM_DASH}</span>
            <span className="text-[0.7rem] text-muted-foreground">
              {carrier ?? "No carrier"}
            </span>
          </div>
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow data-slot="shipment-row-detail" className="bg-muted/20">
          <TableCell colSpan={6} className="whitespace-normal p-4">
            <ShipmentDetail
              row={row}
              shipTo={shipTo}
              shipFrom={shipFrom}
              weight={weight}
            />
          </TableCell>
        </TableRow>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <VendorPill
                slug={row.account.slug}
                displayName={row.account.displayName}
              />
              <span className="font-mono text-xs">
                {row.shipment.externalId}
              </span>
            </SheetTitle>
            <SheetDescription>
              Shipment details synced from ShipStation.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            <ShipmentDetail
              row={row}
              shipTo={shipTo}
              shipFrom={shipFrom}
              weight={weight}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

type ShipmentDetailProps = {
  row: ShipmentWithAccount;
  shipTo: ShipToLike | null;
  shipFrom: ShipToLike | null;
  weight: string | null;
};

const addressBlock = (address: ShipToLike | null) => {
  if (!address) return EM_DASH;
  const lines = [
    address.name,
    address.company_name,
    address.address_line1,
    address.address_line2,
    address.address_line3,
    [address.city_locality, address.state_province, address.postal_code]
      .filter((part): part is string => Boolean(part))
      .join(", "),
    address.country_code,
    address.phone,
  ].filter((line): line is string => Boolean(line));
  return lines.length ? lines.join("\n") : EM_DASH;
};

const ShipmentDetail = ({
  row,
  shipTo,
  shipFrom,
  weight,
}: ShipmentDetailProps) => {
  const tags = row.shipment.tags ?? [];
  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailBlock title="Ship to" value={addressBlock(shipTo)} />
        <DetailBlock title="Ship from" value={addressBlock(shipFrom)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <DetailBlock title="Status" value={row.shipment.status} inline />
        <DetailBlock
          title="Service"
          value={row.shipment.serviceCode ?? EM_DASH}
          inline
        />
        <DetailBlock
          title="Carrier"
          value={row.shipment.carrierId ?? EM_DASH}
          inline
        />
        <DetailBlock
          title="Warehouse"
          value={row.shipment.warehouseId ?? EM_DASH}
          inline
        />
        <DetailBlock
          title="Packages"
          value={
            row.shipment.packageCount !== null &&
            row.shipment.packageCount !== undefined
              ? String(row.shipment.packageCount)
              : EM_DASH
          }
          inline
        />
        <DetailBlock title="Total weight" value={weight ?? EM_DASH} inline />
      </div>
      {tags.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Tags:
          </span>
          {tags.map((tag) => (
            <span
              key={tag.name}
              className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-foreground"
            >
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
      <details className="rounded-md border border-border/60 p-2">
        <summary className="cursor-pointer text-[0.7rem] font-medium text-muted-foreground">
          View raw payload
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted/40 p-2 text-[0.65rem] leading-relaxed">
          {JSON.stringify(row.shipment.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
};

type DetailBlockProps = {
  title: string;
  value: string;
  inline?: boolean;
};

const DetailBlock = ({ title, value, inline }: DetailBlockProps) => (
  <div className={cn("flex flex-col gap-1", inline && "gap-0.5")}>
    <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
      {title}
    </span>
    <span className="whitespace-pre-wrap text-xs text-foreground">{value}</span>
  </div>
);
