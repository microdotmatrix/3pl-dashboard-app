import { Badge } from "@/components/ui/badge";

type StatusBadgeProps = {
  status: string;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className:
      "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  },
  processing: {
    label: "Processing",
    className:
      "bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  },
  label_purchased: {
    label: "Label purchased",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  on_hold: {
    label: "On hold",
    className:
      "bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-destructive/15 text-destructive dark:bg-destructive/20",
  },
};

const prettify = (status: string): string =>
  status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const meta = STATUS_META[status];
  const label = meta?.label ?? prettify(status);

  return (
    <Badge variant="outline" className={meta?.className} data-status={status}>
      {label}
    </Badge>
  );
};
