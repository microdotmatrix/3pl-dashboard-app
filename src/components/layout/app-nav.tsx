"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppNavItem } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

const isActive = (pathname: string, item: AppNavItem): boolean => {
  if (item.exact) return pathname === item.href;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

type AppNavProps = {
  items: AppNavItem[];
};

export const AppNav = ({ items }: AppNavProps) => {
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md py-2 px-4 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={item.icon} size={14} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
