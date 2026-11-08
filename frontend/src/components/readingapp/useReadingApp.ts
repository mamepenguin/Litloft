"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { ApiStatusError, getShelves, getSmartFolders } from "@/lib/api";
import {
  readAppPrefs,
  readReadingGroup,
  writeAppPrefs,
  writeReadingGroup,
  type AppPrefs,
  type ReadingGroup,
} from "@/lib/appPrefs";
import {
  resolveReadingTarget,
  type ReadingTarget,
  type ReadingTargetParams,
} from "@/lib/readingAppTarget";
import type { SmartFolder } from "@/types/smartFolder";

export const VIEWER_REQUIRED = "viewer_required";

export function isViewerRequired(error: unknown): boolean {
  return error instanceof ApiStatusError && error.detail === VIEWER_REQUIRED;
}

export interface ReadingAppState {
  /** `null` until the stored values are read, so no request goes out for a default. */
  prefs: AppPrefs | null;
  updatePrefs: (changes: Partial<AppPrefs>) => void;
  group: ReadingGroup;
  setGroup: (group: ReadingGroup) => void;
  /** The profile exists and the server has not turned it away. */
  hasProfile: boolean;
  /** Call when a request answered `viewer_required`. */
  rejectViewer: () => void;
  smartFolders: LoadState<SmartFolder[]>;
  retrySmartFolders: () => void;
  /** The folder in force; `null` is the default target. */
  folder: SmartFolder | null;
  /** Null while the saved folder is still being looked up, or when the target is empty. */
  params: ReadingTargetParams | null;
  /** Requests may go out. */
  ready: boolean;
  /** The target matches no book, so nothing is requested. */
  empty: boolean;
  /** Books under the target; `null` until known or when it failed. */
  count: number | null;
  chooseTarget: (id: string) => void;
}

export function useReadingApp(drive: string): ReadingAppState {
  const { nickname } = useProfile();
  const [prefs, setPrefs] = useState<AppPrefs | null>(null);
  const [group, setGroupState] = useState<ReadingGroup>("none");
  const [rejectedFor, setRejectedFor] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(readAppPrefs(drive, "reading"));
    setGroupState(readReadingGroup(drive));
  }, [drive]);

  const updatePrefs = useCallback(
    (changes: Partial<AppPrefs>) => {
      writeAppPrefs(drive, changes, "reading");
      setPrefs((held) => (held ? { ...held, ...changes } : held));
    },
    [drive],
  );

  const setGroup = useCallback(
    (next: ReadingGroup) => {
      writeReadingGroup(drive, next);
      setGroupState(next);
    },
    [drive],
  );

  const loadFolders = useCallback(() => getSmartFolders(drive), [drive]);
  const { state: smartFolders, retry: retrySmartFolders } = useLoad(loadFolders);

  const savedId = prefs?.target ?? "default";
  const wantsFolder = savedId !== "default";
  const listed =
    smartFolders.status === "loaded"
      ? (smartFolders.data.find((candidate) => candidate.id === savedId) ?? null)
      : null;
  const resolved = useMemo<{ folder: SmartFolder | null; target: ReadingTarget }>(() => {
    const target = resolveReadingTarget(listed);
    return target.usable
      ? { folder: listed, target }
      : { folder: null, target: resolveReadingTarget(null) };
  }, [listed]);

  // A folder that is gone or unusable is ignored, but its saved id stays:
  // the viewer's choice returns if the folder does.
  const lookingUp =
    wantsFolder && (smartFolders.status === "loading" || smartFolders.status === "idle");
  const ready = prefs !== null && !lookingUp;
  const empty = ready && resolved.target.usable && "empty" in resolved.target;
  const params =
    ready && resolved.target.usable && !("empty" in resolved.target)
      ? resolved.target.params
      : null;

  const loadCount = useMemo(
    () =>
      params === null
        ? null
        : () =>
            getShelves(drive, { ...params, by: "all", per_shelf: 1 }).then(
              (response) => response.shelves[0]?.count ?? 0,
            ),
    [drive, params],
  );
  const { state: counted } = useLoad(loadCount);
  const count = empty ? 0 : counted.status === "loaded" ? counted.data : null;

  const hasProfile = nickname !== null && rejectedFor !== nickname;
  const rejectViewer = useCallback(() => setRejectedFor(nickname), [nickname]);
  const chooseTarget = useCallback((id: string) => updatePrefs({ target: id }), [updatePrefs]);

  return {
    prefs,
    updatePrefs,
    group,
    setGroup,
    hasProfile,
    rejectViewer,
    smartFolders,
    retrySmartFolders,
    folder: resolved.folder,
    params,
    ready,
    empty,
    count,
    chooseTarget,
  };
}
