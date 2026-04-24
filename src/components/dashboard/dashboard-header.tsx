import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionProfile } from "@/lib/auth/access";

const initials = (name: string, email: string): string => {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

type DashboardHeaderProps = {
  user: SessionProfile;
};

export const DashboardHeader = ({ user }: DashboardHeaderProps) => (
  <header className="flex items-center justify-between gap-3 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60 sm:px-6">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <span className="font-heading text-sm font-semibold">3PL</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[0.625rem] uppercase tracking-[0.25em] text-muted-foreground">
          Honeybee Shipments
        </p>
        <h1 className="truncate font-heading text-base font-semibold text-foreground">
          Operations dashboard
        </h1>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {user.role === "admin" ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Admin</Link>
        </Button>
      ) : null}
      <div className="hidden items-center gap-2 sm:flex">
        <div className="flex flex-col items-end leading-tight">
          <span className="text-xs font-medium text-foreground">
            {user.name || user.email}
          </span>
          <span className="text-[0.65rem] text-muted-foreground">
            {user.email}
          </span>
        </div>
        <Avatar size="sm">
          {user.image ? (
            <AvatarImage src={user.image} alt={user.name || user.email} />
          ) : null}
          <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
      </div>
      <SignOutButton />
    </div>
  </header>
);
