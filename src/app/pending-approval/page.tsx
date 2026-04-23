import { redirect } from "next/navigation";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getSessionWithProfile } from "@/lib/auth/access";

const PendingApprovalPage = async () => {
  const ctx = await getSessionWithProfile();
  if (!ctx) {
    redirect("/sign-in");
  }
  if (ctx.user.status === "approved") {
    redirect("/");
  }

  const title =
    ctx.user.status === "rejected"
      ? "Request denied"
      : ctx.user.status === "suspended" || ctx.user.banned
        ? "Access suspended"
        : "Awaiting approval";

  const description =
    ctx.user.status === "rejected"
      ? "Your sign-up request was rejected. If you think this is a mistake, contact your administrator."
      : ctx.user.status === "suspended" || ctx.user.banned
        ? "Your account is currently suspended. Contact your administrator to restore access."
        : "Your account has been created. An administrator needs to approve it before you can sign in to the dashboard.";

  return (
    <AuthFormShell
      title={title}
      description={description}
      footer={<SignOutButton variant="ghost">Sign out</SignOutButton>}
    >
      <Alert>
        <AlertTitle>
          Signed in as <span className="font-medium">{ctx.user.email}</span>
        </AlertTitle>
        <AlertDescription>
          We&apos;ll keep this page available while your access is reviewed. You
          can close this tab and return later.
        </AlertDescription>
      </Alert>
    </AuthFormShell>
  );
};

export default PendingApprovalPage;
