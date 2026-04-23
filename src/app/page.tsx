import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { requireApprovedUser } from "@/lib/auth/access";

const HomePage = async () => {
  const ctx = await requireApprovedUser();

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
        <h2 className="font-heading text-base font-medium">Shipments</h2>
        <p className="text-xs/relaxed text-muted-foreground">
          Shipments sync from ShipStation is wired up. A dashboard UI lands in a
          later phase.
        </p>
      </section>
    </main>
  );
};

export default HomePage;
