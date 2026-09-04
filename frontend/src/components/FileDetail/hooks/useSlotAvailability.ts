"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Which slot entries have said they have nothing for this file.
 *
 * Core cannot look inside an addon's panel. Asking "will you draw
 * anything for this file" by entry id would mean core knowing what
 * `transcript` is, which `.claude/rules/design-decisions.md` forbids
 * ("No core-to-addon dependencies"). So the entry answers for itself,
 * through a callback core hands it — the same shape core's own
 * `ChaptersPanel` already uses with `onResolved`, generalised to
 * anything that can occupy a slot.
 *
 * Three properties, each of which a defect depends on:
 *
 * 1. **Silence means available.** An addon written before this signal
 *    existed never calls the reporter, and its tab must keep appearing.
 *    Only an explicit `false` takes a button away, so adding the signal
 *    changes nothing for anyone who has not opted in.
 * 2. **The answer is per file.** It is reset when the file changes,
 *    during render rather than in an effect: an effect would leave the
 *    previous file's answers standing for one commit, which is exactly
 *    long enough to draw the wrong strip.
 * 3. **A `false` does not unmount the reporter.** Whoever holds the
 *    entry is expected to hide it, not to drop it — a dropped entry
 *    cannot report again, so the first `false` would be permanent even
 *    once the file's transcript arrives.
 *
 * The reporter is stable for the life of the mount, so handing it to an
 * addon component does not re-render it. It carries no file identity of
 * its own: an in-flight fetch from the previous file must be abandoned
 * by the entry that started it, the way every other fetch in this app
 * is.
 */
export interface SlotAvailability {
  /** False only once the entry has said it has nothing for this file. */
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
