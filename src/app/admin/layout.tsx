import { AppHeader } from "@/components/layout/app-header";
import { requireAdmin } from "@/lib/auth/access";

const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
  const ctx = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader user={ctx.user} />
      <div className="mx-auto flex w-full flex-1 flex-col gap-6 px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-1 border-b border-border/50 pb-4">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Admin console
          </p>
          <h2 className="font-heading text-xl font-semibold">
            Operations admin
          </h2>
        </div>
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;
