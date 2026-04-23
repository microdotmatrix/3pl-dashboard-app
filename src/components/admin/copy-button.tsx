"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type CopyButtonProps = {
  value: string;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
};

export const CopyButton = ({
  value,
  label = "Copy",
  size = "xs",
  variant = "outline",
  className,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
};
