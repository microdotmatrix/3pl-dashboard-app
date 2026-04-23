import { sql } from "drizzle-orm";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { shipments } from "@/db/schema/shipments";
import { requireApprovedUser } from "@/lib/auth/access";

const getDbStatus = async () => {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(shipments);

    return {
      ok: true,
      shipmentCount: Number(result.count),
    };
  } catch {
    return {
      ok: false,
      shipmentCount: 0,
    };
  }
};

const HomePage = async () => {
  const ctx = await requireApprovedUser();
  const dbStatus = await getDbStatus();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            3PL Dashboard
          </p>
          <h1 className="font-heading text-xl font-semibold">
            Welcome back, {ctx.user.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {ctx.user.role === "admin" ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">Admin</Link>
            </Button>
          ) : null}
          <SignOutButton />
        </div>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">
          Database connection
        </h2>
        <div className="rounded-xl border border-border/60 bg-card px-4 py-3 text-xs/relaxed">
          <p>
            Neon connection is{" "}
            <strong>{dbStatus.ok ? "live" : "not reachable"}</strong>. Current
            shipments rows: <strong>{dbStatus.shipmentCount}</strong>.
          </p>
        </div>
        <p className="text-xs/relaxed text-muted-foreground">
          Use <code>pnpm db:generate</code>, <code>pnpm db:push</code>, and{" "}
          <code>pnpm db:studio</code> to manage schema changes.
        </p>
      </section>
    </main>
  );
};

export default HomePage;
