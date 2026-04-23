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
import { forgotPasswordAction } from "@/lib/auth/actions";
import {
  type AuthActionState,
  INITIAL_AUTH_ACTION_STATE,
} from "@/lib/auth/state";

export const ForgotPasswordForm = () => {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(forgotPasswordAction, INITIAL_AUTH_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormStatusMessage state={state} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(fieldError(state, "email")) || undefined}
          />
          <FieldError>{fieldError(state, "email")}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? "Requesting\u2026" : "Send reset link"}
      </Button>
      <FieldDescription className="text-center">
        Remember your password? <Link href="/sign-in">Sign in</Link>
      </FieldDescription>
    </form>
  );
};
