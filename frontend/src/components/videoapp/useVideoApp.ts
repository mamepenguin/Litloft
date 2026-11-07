"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { ApiStatusError, getDriveFiles, getSmartFolders } from "@/lib/api";
import { readAppPrefs, writeAppPrefs, type AppPrefs } from "@/lib/appPrefs";
import {
  resolveVideoTarget,
  type VideoTarget,
  type VideoTargetParams,
} from "@/lib/videoAppTarget";
import type { SmartFolder } from "@/types/smartFolder";
import { useLoad, type LoadState } from "./useLoad";

export const VIEWER_REQUIRED = "viewer_required";

export function isViewerRequired(error: unknown): boolean {
  return error instanceof ApiStatusError && error.detail === VIEWER_REQUIRED;
}

export interface VideoAppState {
  /** `null` until the stored values are read, so no request goes out for a default. */
  prefs: AppPrefs | null;
  updatePrefs: (changes: Partial<AppPrefs>) => void;
  /** The profile exists and the server has not turned it away. */
  hasProfile: boolean;
  /** Call when a request answered `viewer_required`. */
  rejectViewer: () => void;
  smartFolders: LoadState<SmartFolder[]>;
  /** The folder in force; `null` is the default target. */
  folder: SmartFolder | null;
  /** Null while the saved folder is still being looked up, or when the target is empty. */
  params: VideoTargetParams | null;
  /** Requests may go out. */
  ready: boolean;
  /** The target matches no video, so nothing is requested. */
  empty: boolean;
  /** Videos under the target; `null` until known or when it failed. */
  count: number | null;
  chooseTarget: (id: string) => void;
}

export function useVideoApp(drive: string): VideoAppState {
  const { nickname } = useProfile();
  const [prefs, setPrefs] = useState<AppPrefs | null>(null);
  const [rejectedFor, setRejectedFor] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(readAppPrefs(drive));
  }, [drive]);

  const updatePrefs = useCallback(
    (changes: Partial<AppPrefs>) => {
      writeAppPrefs(drive, changes);
      setPrefs((held) => (held ? { ...held, ...changes } : held));
    },
    [drive],
  );

  const loadFolders = useCallback(() => getSmartFolders(drive), [drive]);
  const { state: smartFolders } = useLoad(loadFolders);

  const savedId = prefs?.target ?? "default";
  const wantsFolder = savedId !== "default";
  const listed =
    smartFolders.status === "loaded"
      ? (smartFolders.data.find((candidate) => candidate.id === savedId) ?? null)
      : null;
  const resolved = useMemo<{ folder: SmartFolder | null; target: VideoTarget }>(() => {
    const target = resolveVideoTarget(listed);
    return target.usable ? { folder: listed, target } : { folder: null, target: resolveVideoTarget(null) };
  }, [listed]);

  // A folder that is gone is replaced; a list that failed to load proves nothing.
  const stale = wantsFolder && smartFolders.status === "loaded" && listed === null;
  useEffect(() => {
    if (stale) updatePrefs({ target: "default" });
  }, [stale, updatePrefs]);

  const lookingUp = wantsFolder && (smartFolders.status === "loading" || smartFolders.status === "idle");
  const ready = prefs !== null && !lookingUp;
  const empty = ready && resolved.target.usable && "empty" in resolved.target;
  const params =
    ready && resolved.target.usable && !("empty" in resolved.target) ? resolved.target.params : null;

  const loadCount = useMemo(
    () =>
      params === null
        ? null
        : () => getDriveFiles(drive, { ...params, limit: 1 }).then((page) => page.meta.total),
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
    hasProfile,
    rejectViewer,
    smartFolders,
    folder: resolved.folder,
    params,
    ready,
    empty,
    count,
    chooseTarget,
  };
}
