import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

type SearchParams = Promise<{
  redirect?: string;
  reason?: string;
}>;

const REASON_MESSAGES: Record<string, string> = {
  reset: "Your password has been updated. Sign in with your new password.",
  suspended:
    "Your access has been suspended. Contact your administrator for help.",
  rejected: "Your account request was rejected. Please contact support.",
};

const SignInPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const params = await searchParams;
  const description =
    (params.reason && REASON_MESSAGES[params.reason]) ??
    "Use your email and password to continue.";

  return (
    <AuthFormShell title="Sign in" description={description}>
      <SignInForm redirectTo={params.redirect} />
    </AuthFormShell>
  );
};

export default SignInPage;
