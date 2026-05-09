"use client";

import { useContext, useEffect, useRef } from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";

/**
 * Subscribe to one or more WebSocket event names and fire `onMatch`
 * once each time a matching event arrives.
 *
 * `useWebSocket(filter)` only accepts a single string filter, which is
 * awkward when a hook needs to react to several event names — the
 * tree pane and right pane both want to refresh on any of
 * `files.moved` / `files.deleted` / `files.purged` / `files.created` /
 * `files.recovered` / `files.restored` / `folders.created` /
 * `folders.deleted` / `folders.moved` / `scan.complete`.
 *
 * Implementation notes:
 *
 * - We compare the live `lastEvent` reference against the previous one
 *   so a same-reference re-render does not double-fire.
 * - Synchronous bursts (a scan emitting missing → recovered → moved
 *   in quick succession) are coalesced into a single callback by
 *   deferring through a microtask. The next tick sees one consolidated
 *   call rather than three.
 * - The hook never reads the event payload; subscribers refetch their
 *   own list by bumping a refresh key. Targeted patching is left to
 *   the consumer (it is currently not worth the complexity — see spec).
 */
export function useWebSocketRefresh(
  events: readonly string[],
  onMatch: () => void,
): void {
  const { lastEvent } = useContext(WebSocketContext);
  const lastSeenRef = useRef(lastEvent);
  // Match-set is rebuilt only when the event-name list reference
  // changes; consumers typically pass an inline array, so memoise on
  // the joined name string instead.
  const eventsKey = events.join("|");
  const matchSetRef = useRef<Set<string>>(new Set(events));
  if (matchSetRef.current.size !== events.length) {
    matchSetRef.current = new Set(events);
  }

  // Track latest callback in a ref so the effect doesn't re-fire purely
  // because the parent rendered a fresh `onMatch` lambda.
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  // A pending flag so multiple events in the same microtask boundary
  // collapse into a single callback.
  const pendingRef = useRef(false);

  useEffect(() => {
    matchSetRef.current = new Set(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent === lastSeenRef.current) return;
    lastSeenRef.current = lastEvent;
    if (!matchSetRef.current.has(lastEvent.event)) return;
    if (pendingRef.current) return;
    pendingRef.current = true;
    queueMicrotask(() => {
      pendingRef.current = false;
      onMatchRef.current();
    });
  }, [lastEvent]);
}
