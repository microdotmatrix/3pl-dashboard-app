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
import { signUpAction } from "@/lib/auth/actions";
import {
  type AuthActionState,
  INITIAL_AUTH_ACTION_STATE,
} from "@/lib/auth/state";

type SignUpFormProps = {
  inviteToken?: string;
  boundEmail?: string;
  redirectTo?: string;
};

export const SignUpForm = ({
  inviteToken,
  boundEmail,
  redirectTo,
}: SignUpFormProps) => {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(signUpAction, INITIAL_AUTH_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormStatusMessage state={state} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            aria-invalid={Boolean(fieldError(state, "name")) || undefined}
          />
          <FieldError>{fieldError(state, "name")}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={boundEmail}
            readOnly={Boolean(boundEmail)}
            aria-invalid={Boolean(fieldError(state, "email")) || undefined}
          />
          <FieldError>{fieldError(state, "email")}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
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
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
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
      {inviteToken ? (
        <input type="hidden" name="invite" value={inviteToken} />
      ) : null}
      {redirectTo ? (
        <input type="hidden" name="redirect" value={redirectTo} />
      ) : null}
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? "Creating account\u2026" : "Create account"}
      </Button>
      <FieldDescription className="text-center">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </FieldDescription>
    </form>
  );
};
