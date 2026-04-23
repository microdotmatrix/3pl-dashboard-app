"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormStatusMessage, fieldError } from "@/components/auth/form-helpers";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resetPasswordAction } from "@/lib/auth/actions";
import {
  type AuthActionState,
  INITIAL_AUTH_ACTION_STATE,
} from "@/lib/auth/state";

type ResetPasswordFormProps = {
  token: string;
};

export const ResetPasswordForm = ({ token }: ResetPasswordFormProps) => {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(resetPasswordAction, INITIAL_AUTH_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormStatusMessage state={state} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={Boolean(fieldError(state, "password")) || undefined}
          />
          <FieldDescription>Minimum 8 characters.</FieldDescription>
          <FieldError>{fieldError(state, "password")}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirmPassword">
            Confirm new password
          </FieldLabel>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={
              Boolean(fieldError(state, "confirmPassword")) || undefined
            }
          />
          <FieldError>{fieldError(state, "confirmPassword")}</FieldError>
        </Field>
      </FieldGroup>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? "Updating\u2026" : "Update password"}
      </Button>
      <FieldDescription className="text-center">
        Back to <Link href="/sign-in">sign in</Link>
      </FieldDescription>
    </form>
  );
};
