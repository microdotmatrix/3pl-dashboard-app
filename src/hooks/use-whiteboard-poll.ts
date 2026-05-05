"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { NoteDto, WhiteboardPollResponse } from "@/lib/whiteboard/types";

type UseWhiteboardPollOptions = {
  initialNotes: NoteDto[];
  initialUnreadCount: number;
  intervalMs?: number;
  enabled?: boolean;
};

type UseWhiteboardPollReturn = {
  notes: NoteDto[];
  unreadCount: number;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  setNotes: (updater: (notes: NoteDto[]) => NoteDto[]) => void;
  setUnreadCount: (value: number) => void;
};

export const useWhiteboardPoll = ({
  initialNotes,
  initialUnreadCount,
  intervalMs = 90_000,
  enabled = true,
}: UseWhiteboardPollOptions): UseWhiteboardPollReturn => {
  const [notes, setNotesState] = useState<NoteDto[]>(initialNotes);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/whiteboard/poll", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const payload = (await res.json()) as WhiteboardPollResponse;
      setNotesState(payload.notes);
      setUnreadCount(payload.unreadCount);
    } catch {
      // ignore aborts / network blips; next tick will retry
    } finally {
      if (abortRef.current === ctrl) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
  }, [enabled, intervalMs, refresh]);

  const setNotes = useCallback((updater: (notes: NoteDto[]) => NoteDto[]) => {
    setNotesState((prev) => updater(prev));
  }, []);

  return {
    notes,
    unreadCount,
    isRefreshing,
    refresh,
    setNotes,
    setUnreadCount,
  };
};
