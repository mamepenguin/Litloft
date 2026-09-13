"use client";

import { useCallback, useRef, useState } from "react";

/**
 * **Silence means available.** An addon that never calls the reporter must
 * keep its tab; only an explicit `false` takes a button away.
 *
 * **A `false` does not unmount the reporter.** A dropped entry cannot report
 * again, so the first `false` would be permanent.
 */
export interface SlotAvailability {
  isAvailable: (entryId: string) => boolean;
  /** The callback to hand that entry. Stable across renders. */
  reporterFor: (entryId: string) => (available: boolean) => void;
}

export function useSlotAvailability(fileId: string): SlotAvailability {
  const [reports, setReports] = useState<Record<string, boolean>>({});
  const [reportedFor, setReportedFor] = useState(fileId);
  const reporters = useRef(new Map<string, (available: boolean) => void>());

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

  return { isAvailable, reporterFor };
}
