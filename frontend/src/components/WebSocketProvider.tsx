"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WebSocketEvent } from "@/types";

export interface WebSocketContextValue {
  lastEvent: WebSocketEvent | null;
}

export const WebSocketContext = createContext<WebSocketContextValue>({
  lastEvent: null,
});

const MAX_BACKOFF_MS = 30000;
const BASE_DELAY_MS = 1000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data as string);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof parsed.event === "string" &&
          typeof parsed.data === "object"
        ) {
          setLastEvent(parsed as WebSocketEvent);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      const attempt = reconnectAttemptRef.current;
      reconnectAttemptRef.current = attempt + 1;
      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_BACKOFF_MS);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearReconnectTimeout();
      wsRef.current?.close();
    };
  }, [connect, clearReconnectTimeout]);

  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        clearReconnectTimeout();
        wsRef.current?.close();
        wsRef.current = null;
      } else {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connect();
        }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [connect, clearReconnectTimeout]);

  return (
    <WebSocketContext.Provider value={{ lastEvent }}>
      {children}
    </WebSocketContext.Provider>
  );
}
