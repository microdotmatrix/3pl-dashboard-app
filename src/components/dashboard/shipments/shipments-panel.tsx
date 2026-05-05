import {
  type DashboardSearchParams,
  DEFAULT_PAGE_SIZE,
  parseDashboardSearchParams,
} from "@/lib/shipments/search-params";
import {
  listPriorityShipments,
  listShipmentsFiltered,
} from "@/lib/shipstation/queries";

import { ShipmentPriorityCard } from "./shipment-priority-card";
import { ShipmentsFilterBar } from "./shipments-filter-bar";
import { ShipmentsPagination } from "./shipments-pagination";
import { ShipmentsTable } from "./shipments-table";

type ShipmentsPanelProps = {
  searchParams: DashboardSearchParams;
};

export const ShipmentsPanel = async ({ searchParams }: ShipmentsPanelProps) => {
  const parsed = parseDashboardSearchParams(searchParams);

  const [priority, page] = await Promise.all([
    listPriorityShipments({
      vendorSlug: parsed.vendor,
      from: parsed.from,
      to: parsed.to,
      limit: 12,
    }),
    listShipmentsFiltered({
      vendorSlug: parsed.vendor,
      statuses: parsed.statusesToQuery,
      excludeCancelled: parsed.excludeCancelled,
      from: parsed.from,
      to: parsed.to,
      search: parsed.query,
      sortBy: parsed.sortBy,
      sortDir: parsed.sortDir,
      page: parsed.page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
  ]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <ShipmentsFilterBar
        vendor={parsed.vendor}
        status={parsed.status}
        from={parsed.from}
        to={parsed.to}
        rangeMode={parsed.rangeMode}
        sort={parsed.sort}
        query={parsed.query}
      />
      <ShipmentPriorityCard rows={priority} />
      <ShipmentsTable rows={page.rows} focusExternalId={parsed.focus ?? null} />
      <ShipmentsPagination
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        pageSize={page.pageSize}
      />
    </div>
  );
};
