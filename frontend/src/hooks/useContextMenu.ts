"use client";

import { useCallback, useRef, useState } from "react";

interface Position {
  x: number;
  y: number;
}

interface ContextMenuState {
  open: boolean;
  position: Position;
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>({
    open: false,
    position: { x: 0, y: 0 },
  });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPos = useRef<Position>({ x: 0, y: 0 });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ open: true, position: { x: e.clientX, y: e.clientY } });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      setState({ open: true, position: touchPos.current });
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setState({ open: false, position: { x: 0, y: 0 } });
  }, []);

  return {
    menuState: state,
    close,
    handlers: {
      onContextMenu: handleContextMenu,
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      onTouchMove: handleTouchMove,
    },
  };
}
