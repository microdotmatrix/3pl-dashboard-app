import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { findUsableInvite } from "@/lib/auth/invites";

type SearchParams = Promise<{
  invite?: string;
  redirect?: string;
}>;

const SignUpPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const params = await searchParams;
  const inviteToken = params.invite?.trim() || undefined;

  const invite = inviteToken ? await findUsableInvite(inviteToken) : null;

  const description = invite
    ? "Invite accepted. Create your account to get immediate access."
    : "New accounts require admin approval before you can access the dashboard.";

  return (
    <AuthFormShell title="Create an account" description={description}>
      <SignUpForm
        inviteToken={invite ? inviteToken : undefined}
        boundEmail={invite?.email ?? undefined}
        redirectTo={params.redirect}
      />
    </AuthFormShell>
  );
};

export default SignUpPage;
