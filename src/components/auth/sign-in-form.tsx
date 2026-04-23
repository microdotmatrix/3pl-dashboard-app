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
import { signInAction } from "@/lib/auth/actions";
import {
  type AuthActionState,
  INITIAL_AUTH_ACTION_STATE,
} from "@/lib/auth/state";

type SignInFormProps = {
  redirectTo?: string;
};

export const SignInForm = ({ redirectTo }: SignInFormProps) => {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(signInAction, INITIAL_AUTH_ACTION_STATE);

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
        <Field>
          <FieldLabel htmlFor="password" className="justify-between">
            <span>Password</span>
            <Link
              href="/forgot-password"
              className="text-[0.7rem] font-normal text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Forgot?
            </Link>
          </FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(fieldError(state, "password")) || undefined}
          />
          <FieldError>{fieldError(state, "password")}</FieldError>
        </Field>
      </FieldGroup>
      {redirectTo ? (
        <input type="hidden" name="redirect" value={redirectTo} />
      ) : null}
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? "Signing in\u2026" : "Sign in"}
      </Button>
      <FieldDescription className="text-center">
        Don&apos;t have an account? <Link href="/sign-up">Create one</Link>
      </FieldDescription>
    </form>
  );
};
