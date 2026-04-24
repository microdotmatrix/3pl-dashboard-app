export const AWAITING_STATUSES = ["pending", "processing"] as const;

export type ShipmentSortBy = "modified" | "ship" | "created";
export type ShipmentSortDir = "asc" | "desc";
