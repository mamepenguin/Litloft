"use client";

import { useContext } from "react";
import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WebSocketEvent } from "@/types";

export function useWebSocket(eventFilter?: string): WebSocketEvent | null {
  const context = useContext(WebSocketContext);
  const { lastEvent } = context;

  if (!lastEvent) {
    return null;
  }

  if (eventFilter && lastEvent.event !== eventFilter) {
    return null;
  }

  return lastEvent;
}
