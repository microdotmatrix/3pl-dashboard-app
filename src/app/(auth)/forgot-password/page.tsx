import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

const ForgotPasswordPage = () => (
  <AuthFormShell
    title="Forgot password"
    description="Enter your email and we'll generate a reset link you can request from an admin."
  >
    <ForgotPasswordForm />
  </AuthFormShell>
);

export default ForgotPasswordPage;
