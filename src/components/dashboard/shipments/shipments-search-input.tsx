"use client";

import { Cancel01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useDebounceFn } from "@/hooks/use-debounce-fn";
import { cn } from "@/lib/utils";

type ShipmentsSearchInputProps = {
  query: string;
};

export const ShipmentsSearchInput = ({ query }: ShipmentsSearchInputProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(query);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep local state in sync with URL changes (e.g. reset button).
  useEffect(() => {
    setValue(query);
  }, [query]);

  const pushQuery = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = next.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      params.delete("page");
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const { run: debouncedPush, cancel, flush } = useDebounceFn(pushQuery, 250);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    debouncedPush(event.target.value);
  };

  const handleClear = () => {
    cancel();
    setValue("");
    pushQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      flush();
    }
    if (event.key === "Escape" && value.length > 0) {
      event.preventDefault();
      handleClear();
    }
  };

  return (
    <div
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-input/20 px-2 text-xs shadow-xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 dark:bg-input/30 sm:w-auto sm:min-w-44 sm:max-w-52",
        isPending && "opacity-80",
      )}
    >
      <HugeiconsIcon
        icon={SearchIcon}
        strokeWidth={2}
        className="size-3.5 shrink-0 opacity-60"
        aria-hidden
      />
      <label htmlFor="shipments-search" className="sr-only">
        Search shipments
      </label>
      <input
        ref={inputRef}
        id="shipments-search"
        type="search"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search by order ID, shipment #, recipient..."
        className="w-full bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
        autoComplete="off"
        spellCheck={false}
      />
      {value.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      ) : null}
    </div>
  );
};
