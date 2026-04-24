"use client";

import { usePathname, useSearchParams } from "next/navigation";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type ShipmentsPaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
};

const buildPageList = (page: number, pageCount: number): (number | "...")[] => {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < pageCount - 1) pages.push("...");
  pages.push(pageCount);
  return pages;
};

export const ShipmentsPagination = ({
  page,
  pageCount,
  total,
  pageSize,
}: ShipmentsPaginationProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (target: number): string => {
    const next = new URLSearchParams(searchParams.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    const qs = next.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };

  if (pageCount <= 1) {
    return (
      <p className="text-center text-[0.7rem] text-muted-foreground">
        Showing {total} {total === 1 ? "shipment" : "shipments"}
      </p>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = buildPageList(page, pageCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[0.7rem] text-muted-foreground">
        {`Showing ${from}\u2013${to} of ${total}`}
      </p>
      <Pagination className="justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={hrefFor(Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
          {pages.map((entry, index) => {
            if (entry === "...") {
              const prev = pages[index - 1];
              const next = pages[index + 1];
              return (
                <PaginationItem
                  key={`ellipsis-${prev ?? "start"}-${next ?? "end"}`}
                >
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }
            return (
              <PaginationItem key={entry}>
                <PaginationLink
                  href={hrefFor(entry)}
                  isActive={entry === page}
                  size="icon"
                >
                  {entry}
                </PaginationLink>
              </PaginationItem>
            );
          })}
          <PaginationItem>
            <PaginationNext
              href={hrefFor(Math.min(pageCount, page + 1))}
              aria-disabled={page >= pageCount}
              className={
                page >= pageCount ? "pointer-events-none opacity-50" : ""
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};
