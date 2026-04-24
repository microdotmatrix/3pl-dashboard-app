import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ShipmentsPanel } from "@/components/dashboard/shipments/shipments-panel";
import { WhiteboardPanel } from "@/components/dashboard/whiteboard/whiteboard-panel";
import { requireApprovedUser } from "@/lib/auth/access";
import type { DashboardSearchParams } from "@/lib/shipments/search-params";
import { getUnreadCount, listRecentNotes } from "@/lib/whiteboard/queries";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<DashboardSearchParams>;
};

const HomePage = async ({ searchParams }: HomePageProps) => {
  const ctx = await requireApprovedUser();
  const params = (await searchParams) ?? {};

  const [initialNotes, initialUnreadCount] = await Promise.all([
    listRecentNotes(50),
    getUnreadCount(ctx.user.id),
  ]);

  return (
    <main className="flex min-h-screen flex-1 flex-col">
      <DashboardHeader user={ctx.user} />
      <DashboardShell
        initialUnreadCount={initialUnreadCount}
        shipments={<ShipmentsPanel searchParams={params} />}
        whiteboard={
          <WhiteboardPanel
            initialNotes={initialNotes}
            initialUnreadCount={initialUnreadCount}
            currentUserId={ctx.user.id}
            isAdmin={ctx.user.role === "admin"}
          />
        }
      />
    </main>
  );
};

export default HomePage;
