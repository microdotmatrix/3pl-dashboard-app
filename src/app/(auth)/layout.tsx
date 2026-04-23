import { redirect } from "next/navigation";

import { getSessionWithProfile } from "@/lib/auth/access";

const AuthLayout = async ({ children }: { children: React.ReactNode }) => {
  const ctx = await getSessionWithProfile();
  if (ctx) {
    if (ctx.user.status === "approved") {
      redirect("/");
    }
    redirect("/pending-approval");
  }
  return <>{children}</>;
};

export default AuthLayout;
