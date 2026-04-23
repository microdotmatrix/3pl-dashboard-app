import Link from "next/link";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type SearchParams = Promise<{
  token?: string;
  error?: string;
}>;

const ResetPasswordPage = async ({
  searchParams,
}: {
  searchParams: SearchParams;
}) => {
  const params = await searchParams;
  const token = params.token?.trim();

  if (!token || params.error) {
    return (
      <AuthFormShell title="Reset link invalid">
        <Alert variant="destructive">
          <AlertTitle>This link can no longer be used.</AlertTitle>
          <AlertDescription>
            Request a new password reset link from the{" "}
            <Link href="/forgot-password">forgot password</Link> page.
          </AlertDescription>
        </Alert>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell
      title="Choose a new password"
      description="Pick a password you don't use anywhere else."
    >
      <ResetPasswordForm token={token} />
    </AuthFormShell>
  );
};

export default ResetPasswordPage;
