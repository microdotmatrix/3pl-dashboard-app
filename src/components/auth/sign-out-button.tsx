"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

type SignOutButtonProps = {
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "secondary"
    | "destructive"
    | "link";
  size?: "default" | "xs" | "sm" | "lg";
  className?: string;
  children?: React.ReactNode;
};

export const SignOutButton = ({
  variant = "outline",
  size = "sm",
  className,
  children,
}: SignOutButtonProps) => {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await signOutAction();
        })
      }
    >
      {isPending ? "Signing out\u2026" : (children ?? "Sign out")}
    </Button>
  );
};
