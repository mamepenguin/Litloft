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
 * - The hook reads only `data.drive`, and only to decide whether the
 *   event concerns the caller. Subscribers still refetch their own list
 *   by bumping a refresh key rather than patching from the payload.
 *
 * Pass `drive` to ignore events about other drives. The server's access
 * filter already prevents delivery across a protected boundary, but two
 * public drives are both deliverable, so without this a change in one
 * drive refetches every open listing. An event whose payload carries no
 * `drive` always fires: a missed refresh is visible to the user, a spare
 * one is not.
 */
export function useWebSocketRefresh(
  events: readonly string[],
  onMatch: () => void,
  drive?: string,
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

  // Read through a ref so a changing drive does not re-run the effect and
  // replay the event that is already sitting in `lastEvent`.
  const driveRef = useRef(drive);
  driveRef.current = drive;

  useEffect(() => {
    matchSetRef.current = new Set(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey]);

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
