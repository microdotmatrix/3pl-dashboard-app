import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuthFormShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export const AuthFormShell = ({
  title,
  description,
  children,
  footer,
  className,
}: AuthFormShellProps) => {
  return (
    <div
      className={cn(
        "flex min-h-screen w-full items-center justify-center px-4 py-12",
        className,
      )}
    >
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="self-center text-xs uppercase tracking-[0.25em] text-muted-foreground"
        >
          3PL Dashboard
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="pb-4">{children}</CardContent>
          {footer ? (
            <CardFooter className="justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground">
              {footer}
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
};
