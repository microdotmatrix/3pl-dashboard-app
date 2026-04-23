"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  INITIAL_ADMIN_ACTION_STATE,
  revokeInviteAction,
} from "@/lib/admin/actions";

export const RevokeInviteButton = ({ inviteId }: { inviteId: string }) => {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="destructive"
      size="xs"
      disabled={isPending}
      onClick={() => {
        if (typeof window !== "undefined") {
          const ok = window.confirm("Revoke this invite?");
          if (!ok) return;
        }
        startTransition(async () => {
          const formData = new FormData();
          formData.set("inviteId", inviteId);
          await revokeInviteAction(INITIAL_ADMIN_ACTION_STATE, formData);
        });
      }}
    >
      {isPending ? "Revoking\u2026" : "Revoke"}
    </Button>
  );
};
