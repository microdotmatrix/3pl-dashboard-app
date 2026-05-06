export type AppNavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

export const DASHBOARD_NAV_ITEM: AppNavItem = {
  href: "/",
  label: "Dashboard",
  // icon: DashboardSquare01Icon,
  icon: "hugeicons:dashboard-square-01",
  exact: true,
};

export const ADMIN_NAV_ITEMS: AppNavItem[] = [
  {
    href: "/admin",
    label: "Users",
    icon: "hugeicons:user-multiple",
    exact: true,
  },
  {
    href: "/admin/reports/monthly",
    label: "Monthly reports",
    // icon: FileEditIcon,
    icon: "hugeicons:file-edit",
  },
];
