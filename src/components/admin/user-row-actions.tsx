"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  type AdminActionState,
  INITIAL_ADMIN_ACTION_STATE,
} from "@/lib/admin/action-state";
import {
  approveUserAction,
  reactivateUserAction,
  rejectUserAction,
  setRoleAction,
  suspendUserAction,
} from "@/lib/admin/actions";

type ActionKind =
  | "approve"
  | "reject"
  | "suspend"
  | "reactivate"
  | "promote"
  | "demote";

const ACTION_BY_KIND: Record<
  ActionKind,
  (state: AdminActionState, formData: FormData) => Promise<AdminActionState>
> = {
  approve: approveUserAction,
  reject: rejectUserAction,
  suspend: suspendUserAction,
  reactivate: reactivateUserAction,
  promote: setRoleAction,
  demote: setRoleAction,
};

type UserActionButtonProps = {
  userId: string;
  kind: ActionKind;
  label: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  confirm?: string;
  disabled?: boolean;
};

export const UserActionButton = ({
  userId,
  kind,
  label,
  variant = "outline",
  size = "xs",
  confirm,
  disabled,
}: UserActionButtonProps) => {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || isPending}
      onClick={() => {
        if (confirm && typeof window !== "undefined") {
          const ok = window.confirm(confirm);
          if (!ok) return;
        }
        startTransition(async () => {
          const formData = new FormData();
          formData.set("userId", userId);
          if (kind === "promote") formData.set("role", "admin");
          if (kind === "demote") formData.set("role", "user");
          await ACTION_BY_KIND[kind](INITIAL_ADMIN_ACTION_STATE, formData);
        });
      }}
    >
      {isPending ? "Working\u2026" : label}
    </Button>
  );
};
