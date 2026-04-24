import { cn } from "@/lib/utils";

type UnreadBadgeProps = {
  count: number;
  className?: string;
};

export const UnreadBadge = ({ count, className }: UnreadBadgeProps) => {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <output
      aria-label={`${count} unread whiteboard note${count === 1 ? "" : "s"}`}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold tabular-nums text-primary-foreground",
        className,
      )}
    >
      {label}
    </output>
  );
};
