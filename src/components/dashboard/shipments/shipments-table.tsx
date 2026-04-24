import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ShipmentWithAccount } from "@/lib/shipstation/queries";

import { ShipmentRow } from "./shipment-row";

type ShipmentsTableProps = {
  rows: ShipmentWithAccount[];
  focusExternalId?: string | null;
};

export const ShipmentsTable = ({
  rows,
  focusExternalId,
}: ShipmentsTableProps) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center">
        <p className="font-heading text-sm font-medium text-foreground">
          No shipments match these filters
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Adjust vendor, status, or date range above to widen the view.
        </p>
      </div>
    );
  }

  return (
    <div
      data-allow-horizontal-scroll
      className="rounded-lg border border-border/60 bg-card"
    >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <TableRow>
            <TableHead className="w-20">Vendor</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead>Shipment</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Ship date</TableHead>
            <TableHead className="hidden lg:table-cell">Carrier</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ShipmentRow
              key={row.shipment.id}
              row={row}
              focusExternalId={focusExternalId}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
