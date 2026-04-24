"use client";

import { useCallback, useRef } from "react";

type SwipeHandlers = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
};

type PointerHandlers<T extends HTMLElement = HTMLElement> = {
  onPointerDown: (event: React.PointerEvent<T>) => void;
  onPointerUp: (event: React.PointerEvent<T>) => void;
  onPointerCancel: () => void;
};

export const useSwipe = <T extends HTMLElement = HTMLElement>({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
}: SwipeHandlers): PointerHandlers<T> => {
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const pointerTypeRef = useRef<string | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<T>) => {
    // Only track touch / pen to avoid stealing mouse drag interactions.
    if (event.pointerType === "mouse") {
      startXRef.current = null;
      return;
    }
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    pointerTypeRef.current = event.pointerType;
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<T>) => {
      const startX = startXRef.current;
      const startY = startYRef.current;
      startXRef.current = null;
      startYRef.current = null;
      if (startX === null || startY === null) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) < threshold) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) return;
      if (deltaX < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    },
    [onSwipeLeft, onSwipeRight, threshold],
  );

  const onPointerCancel = useCallback(() => {
    startXRef.current = null;
    startYRef.current = null;
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
};
