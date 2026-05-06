import greenboxLogo from "@/assets/greenbox-logo-2.png";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AppNav } from "@/components/layout/app-nav";
import {
  ADMIN_NAV_ITEMS,
  DASHBOARD_NAV_ITEM,
} from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionProfile } from "@/lib/auth/access";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "../ui/icon";

const initials = (name: string, email: string): string => {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

type AppHeaderProps = {
  user: SessionProfile;
};

export const AppHeader = ({ user }: AppHeaderProps) => {
  const isAdmin = user.role === "admin";
  const navItems = isAdmin ? [DASHBOARD_NAV_ITEM, ...ADMIN_NAV_ITEMS] : [];

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60 sm:px-6">
      <div className="flex min-w-0 items-center gap-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-white">
            <Image
              src={greenboxLogo}
              alt="GreenBox 3PL"
              width={64}
              height={64}
              className="size-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[0.625rem] uppercase tracking-[0.25em] text-muted-foreground">
              Operations Dashboard
            </p>
            <h1 className="truncate font-heading text-base font-semibold text-foreground">
              GreenBox 3PL
            </h1>
          </div>
        </Link>
        <AppNav items={navItems} />
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2.5 sm:flex">
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
        <div className="hidden h-6 w-px bg-border/60 sm:block" aria-hidden />
        <div className="flex items-center gap-1.5">
          {isAdmin ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground md:hidden"
            >
              <Link href="/admin">
                <Icon
                  name="hugeicons:settings-01"
                  className="size-4"
                  aria-hidden
                />
                Admin
              </Link>
            </Button>
          ) : null}
          <ThemeToggle />
          <SignOutButton
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          />
        </div>
      </div>
    </header>
  );
};
