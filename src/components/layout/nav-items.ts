import {
  DashboardSquare01Icon,
  FileEditIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: typeof DashboardSquare01Icon;
  exact?: boolean;
};

export const DASHBOARD_NAV_ITEM: AppNavItem = {
  href: "/",
  label: "Dashboard",
  icon: DashboardSquare01Icon,
  exact: true,
};

export const ADMIN_NAV_ITEMS: AppNavItem[] = [
  { href: "/admin", label: "Users", icon: UserMultipleIcon, exact: true },
  {
    href: "/admin/reports/monthly",
    label: "Monthly reports",
    icon: FileEditIcon,
  },
];
