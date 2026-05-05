import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/access";

const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
  const ctx = await requireAdmin();

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col gap-6 px-6 py-10 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Admin console
          </p>
          <h1 className="font-heading text-xl font-semibold">
            Operations admin
          </h1>
          <p className="text-xs text-muted-foreground">
            Signed in as {ctx.user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">Users</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reports/monthly">Monthly reports</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Dashboard</Link>
          </Button>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
};

export default AdminLayout;
