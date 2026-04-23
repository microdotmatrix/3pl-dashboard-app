import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AuthActionState } from "@/lib/auth/state";

export const FormStatusMessage = ({ state }: { state: AuthActionState }) => {
  if (!state.message) return null;

  if (state.status === "success") {
    return (
      <Alert className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return null;
};

export const fieldError = (state: AuthActionState, key: string) =>
  state.fieldErrors?.[key];
