import { vendorAccent } from "@/lib/shipments/vendor-colors";
import type { ShipmentWithAccount } from "@/lib/shipstation/queries";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, format } from "date-fns";

import { StatusBadge } from "./status-badge";
import { VendorPill } from "./vendor-pill";

const EM_DASH = "\u2014";

type ShipmentPriorityCardProps = {
  rows: ShipmentWithAccount[];
};

type ShipToLike = {
  name?: string | null;
  company_name?: string | null;
  city_locality?: string | null;
  state_province?: string | null;
};

const recipientLine = (value: unknown): string => {
  if (!value || typeof value !== "object") return EM_DASH;
  const shipTo = value as ShipToLike;
  const name = shipTo.name ?? shipTo.company_name ?? EM_DASH;
  const loc = [shipTo.city_locality, shipTo.state_province]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  return loc ? `${name} \u2013 ${loc}` : name;
};

const urgencyHint = (shipDate: Date | null): string | null => {
  if (!shipDate) return null;
  const days = differenceInCalendarDays(shipDate, new Date());
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days}d`;
  return null;
};

export const ShipmentPriorityCard = ({ rows }: ShipmentPriorityCardProps) => {
  if (rows.length === 0) {
    return (
      <section
        aria-label="Awaiting fulfillment"
        className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4"
      >
        <header className="mb-1 flex items-center gap-2">
          <span className="inline-flex size-1.5 rounded-full bg-emerald-500" />
          <h2 className="font-heading text-sm font-medium text-foreground">
            Awaiting fulfillment
          </h2>
        </header>
        <p className="text-xs text-muted-foreground">
          Nothing pending. All synced shipments are shipped or resolved.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Awaiting fulfillment" className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-1.5 animate-pulse rounded-full bg-amber-500" />
          <h2 className="font-heading text-sm font-medium text-foreground">
            Awaiting fulfillment
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-foreground/70">
            {rows.length}
          </span>
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          Sorted by ship date, oldest first
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const accent = vendorAccent(row.account.slug);
          const urgency = urgencyHint(row.shipment.shipDate);
          const shipLabel = row.shipment.shipDate
            ? format(row.shipment.shipDate, "MMM d")
            : "No ship date";
          return (
            <li
              key={row.shipment.id}
              className={cn(
                "relative rounded-md border border-l-4 bg-muted/40 px-3 py-2",
                accent ? accent.border : "border-border/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <VendorPill
                      slug={row.account.slug}
                      displayName={row.account.displayName}
                    />
                    <StatusBadge status={row.shipment.status} />
                  </div>
                  <p className="font-mono text-[0.7rem] text-foreground/80">
                    {row.shipment.externalId}
                  </p>
                  <p className="text-xs text-foreground">
                    {recipientLine(row.shipment.shipTo)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="text-[0.7rem] text-muted-foreground">
                    {shipLabel}
                  </span>
                  {urgency ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider",
                        urgency.includes("overdue")
                          ? "bg-destructive/15 text-destructive"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {urgency}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
