import { AppHeader } from "@/components/layout/app-header";
import { requireAdmin } from "@/lib/auth/access";

const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
  const ctx = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader user={ctx.user} />
      <div className="mx-auto flex w-full flex-1 flex-col gap-6 px-6 pt-6 sm:px-10">
        <p className="ml-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Admin console
        </p>
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;
