"use client";

import { useContext, useEffect, useRef } from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";

/**
 * Pass `drive` to ignore events about other drives. The server's access
 * filter already prevents delivery across a protected boundary, but two
 * public drives are both deliverable. An event whose payload carries no
 * `drive` always fires: a missed refresh is visible to the user, a spare
 * one is not.
 */
export function useWebSocketRefresh(
  events: readonly string[],
  onMatch: () => void,
  drive?: string,
): void {
  const { lastEvent, connected } = useContext(WebSocketContext);
  const lastSeenRef = useRef(lastEvent);
  const eventsKey = events.join("|");
  const matchSetRef = useRef<Set<string>>(new Set(events));
  if (matchSetRef.current.size !== events.length) {
    matchSetRef.current = new Set(events);
  }

  // Track latest callback in a ref so the effect doesn't re-fire purely
  // because the parent rendered a fresh `onMatch` lambda.
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  const pendingRef = useRef(false);

  // Read through a ref so a changing drive does not re-run the effect and
  // replay the event that is already sitting in `lastEvent`.
  const driveRef = useRef(drive);
  driveRef.current = drive;

  useEffect(() => {
    matchSetRef.current = new Set(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey]);

  // Catch-up on reconnect. `wasConnectedRef` starts true so the initial
  // connection is not treated as a recovery.
  const wasConnectedRef = useRef(true);
  useEffect(() => {
    const was = wasConnectedRef.current;
    wasConnectedRef.current = connected;
    if (connected && !was) {
      onMatchRef.current();
    }
  }, [connected]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent === lastSeenRef.current) return;
    lastSeenRef.current = lastEvent;
    if (!matchSetRef.current.has(lastEvent.event)) return;
    const wanted = driveRef.current;
    const eventDrive = lastEvent.data?.drive;
    if (wanted && typeof eventDrive === "string" && eventDrive !== wanted) {
      return;
    }
    if (pendingRef.current) return;
    pendingRef.current = true;
    queueMicrotask(() => {
      pendingRef.current = false;
      onMatchRef.current();
    });
  }, [lastEvent]);
}
