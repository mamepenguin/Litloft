"use client";

import { useCallback, useRef, useState } from "react";

/**
 * **Silence means available.** An addon that never calls the reporter must
 * keep its tab; only an explicit `false` takes a button away.
 *
 * **A `false` does not unmount the reporter.** A dropped entry cannot report
 * again, so the first `false` would be permanent.
 *
 * **Silence only counts after the entry has rendered.** An entry whose module
 * is still loading has had no chance to answer, and its silence would show a
 * panel that the entry removes in the frame it mounts.
 */
export interface SlotAvailability {
  isAvailable: (entryId: string) => boolean;
  /** What the entry reported, or `undefined` while it has not reported. */
  reportedValue: (entryId: string) => boolean | undefined;
  /** The callback to hand that entry. Stable across renders. */
  reporterFor: (entryId: string) => (available: boolean) => void;
  /** Whether the entry's component has yet to render for the first time. */
  isPending: (entryId: string) => boolean;
  /** The callback that clears pending. Stable across renders. */
  renderedFor: (entryId: string) => () => void;
}

/**
 * Availability, tab ids and DOM ids are per slot because two slots may each
 * hold an entry with the same id.
 */
export function slotAvailabilityKey(slotId: string, entryId: string): string {
  return `${slotId}:${entryId}`;
}

export function useSlotAvailability(fileId: string): SlotAvailability {
  const [reports, setReports] = useState<Record<string, boolean>>({});
  // Not cleared with `reports`: a loaded module stays loaded, and a file
  // change does not remount the entry that would signal again.
  const [rendered, setRendered] = useState<Record<string, true>>({});
  const [reportedFor, setReportedFor] = useState(fileId);
  const reporters = useRef(new Map<string, (available: boolean) => void>());
  const renderedMarkers = useRef(new Map<string, () => void>());

  if (reportedFor !== fileId) {
    setReportedFor(fileId);
    setReports({});
  }

  // No guard for `reportedFor !== fileId` here: setting state during
  // render makes React re-run this component before committing, so the
  // pass that saw the stale map is thrown away and never reaches a
  // caller. A branch for it would be a branch nothing can falsify.
  const isAvailable = useCallback(
    (entryId: string) => reports[entryId] !== false,
    [reports],
  );

  const reportedValue = useCallback(
    (entryId: string) => reports[entryId],
    [reports],
  );

  const reporterFor = useCallback((entryId: string) => {
    const cached = reporters.current.get(entryId);
    if (cached) return cached;
    const fn = (available: boolean) =>
      setReports((prev) =>
        prev[entryId] === available ? prev : { ...prev, [entryId]: available },
      );
    reporters.current.set(entryId, fn);
    return fn;
  }, []);

  const isPending = useCallback(
    (entryId: string) => rendered[entryId] !== true,
    [rendered],
  );

  const renderedFor = useCallback((entryId: string) => {
    const cached = renderedMarkers.current.get(entryId);
    if (cached) return cached;
    const fn = () =>
      setRendered((prev) =>
        prev[entryId] === true ? prev : { ...prev, [entryId]: true },
      );
    renderedMarkers.current.set(entryId, fn);
    return fn;
  }, []);

  return { isAvailable, reportedValue, reporterFor, isPending, renderedFor };
}
