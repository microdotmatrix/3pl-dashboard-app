"use client";

import { MessageAdd02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useWhiteboardPoll } from "@/hooks/use-whiteboard-poll";
import { cn } from "@/lib/utils";
import { markWhiteboardRead } from "@/lib/whiteboard/actions";
import type { NoteDto } from "@/lib/whiteboard/types";

import { NoteCard } from "./note-card";
import { NoteComposer } from "./note-composer";
import { UnreadBadge } from "./unread-badge";

type WhiteboardPanelProps = {
  initialNotes: NoteDto[];
  initialUnreadCount: number;
  currentUserId: string;
  isAdmin: boolean;
};

export const WhiteboardPanel = ({
  initialNotes,
  initialUnreadCount,
  currentUserId,
  isAdmin,
}: WhiteboardPanelProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const markedRef = useRef(false);

  const { notes, unreadCount, isRefreshing, refresh, setUnreadCount } =
    useWhiteboardPoll({
      initialNotes,
      initialUnreadCount,
    });

  const markRead = useCallback(async () => {
    if (markedRef.current) return;
    markedRef.current = true;
    try {
      await markWhiteboardRead();
      setUnreadCount(0);
    } catch {
      markedRef.current = false;
    }
  }, [setUnreadCount]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (unreadCount <= 0) return;
    if (document.visibilityState !== "visible") return;
    void markRead();
  }, [markRead, unreadCount]);

  const focusShipment = useCallback(
    (externalId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("focus", externalId);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}#shipments`, {
        scroll: false,
      });

      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          const target = document.querySelector<HTMLElement>(
            `[data-external-id="${CSS.escape(externalId)}"]`,
          );
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            document
              .getElementById("shipments")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 120);
      }
    },
    [pathname, router, searchParams],
  );

  const pinnedNotes = useMemo(() => notes.filter((n) => n.pinned), [notes]);
  const recentNotes = useMemo(() => notes.filter((n) => !n.pinned), [notes]);

  return (
    <section
      id="whiteboard"
      aria-labelledby="whiteboard-heading"
      className="flex min-h-0 flex-col gap-3"
      onMouseEnter={markRead}
      onFocus={markRead}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={MessageAdd02Icon}
            strokeWidth={2}
            className="size-4 text-primary"
          />
          <h2
            id="whiteboard-heading"
            className="font-heading text-sm font-medium text-foreground"
          >
            Team whiteboard
          </h2>
          <UnreadBadge count={unreadCount} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh whiteboard"
          onClick={() => {
            void refresh();
          }}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            strokeWidth={2}
            className={cn(isRefreshing && "animate-spin")}
          />
        </Button>
      </header>

      <NoteComposer
        onNoteCreated={() => {
          void refresh();
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {pinnedNotes.length === 0 && recentNotes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-[0.75rem] text-muted-foreground">
            No notes yet. Post the first update to the team.
          </p>
        ) : null}

        {pinnedNotes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Pinned
            </h3>
            {pinnedNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onFocusShipment={focusShipment}
              />
            ))}
          </div>
        ) : null}

        {recentNotes.length > 0 ? (
          <div className="flex flex-col gap-2">
            {pinnedNotes.length > 0 ? (
              <h3 className="px-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </h3>
            ) : null}
            {recentNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onFocusShipment={focusShipment}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};
