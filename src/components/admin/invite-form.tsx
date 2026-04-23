"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/admin/copy-button";
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
import {
  type AdminActionState,
  createInviteAction,
  INITIAL_ADMIN_ACTION_STATE,
} from "@/lib/admin/actions";

export const InviteForm = () => {
  const [state, formAction, isPending] = useActionState<
    AdminActionState,
    FormData
  >(createInviteAction, INITIAL_ADMIN_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormStatusMessage
        state={{
          status: state.status,
          message: state.message,
          fieldErrors: state.fieldErrors,
        }}
      />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-email">
            Email <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="person@company.com"
            aria-invalid={Boolean(fieldError(state, "email")) || undefined}
          />
          <FieldDescription>
            If provided, the invite locks sign-up to this email.
          </FieldDescription>
          <FieldError>{fieldError(state, "email")}</FieldError>
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        size="sm"
        disabled={isPending}
        className="self-start"
      >
        {isPending ? "Creating\u2026" : "Create invite link"}
      </Button>
      {state.inviteUrl ? (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/40 p-2 text-xs">
          <p className="font-medium">New invite link</p>
          <code className="break-all text-[0.7rem] text-muted-foreground">
            {state.inviteUrl}
          </code>
          <CopyButton value={state.inviteUrl} label="Copy link" />
        </div>
      ) : null}
    </form>
  );
};
