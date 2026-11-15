"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { useMemberTarget } from "@/components/appshell/useMemberTarget";
import { ApiStatusError, getSmartFolders } from "@/lib/api";
import {
  readAppPrefs,
  readReadingGroup,
  writeAppPrefs,
  writeReadingGroup,
  type AppPrefs,
  type ReadingGroup,
} from "@/lib/appPrefs";
import { appRequests, type AppRequests, type MemberTarget } from "@/lib/memberTarget";
import {
  readingMemberParams,
  resolveReadingMemberTarget,
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
  /** The saved target is known, so the control can show its name. */
  targetKnown: boolean;
  /** Null while the saved folder is still being looked up, its members are evaluated, or the target is empty. */
  params: ReadingTargetParams | null;
  /** Requests may go out. */
  ready: boolean;
  /** The target matches no book, so nothing is requested. */
  empty: boolean;
  /** The member evaluation failed; the body offers a retry. */
  targetFailed: boolean;
  /** More members than the app can send; the body says the target cannot be used. */
  targetUnusable: boolean;
  /** Evaluate the member target again. */
  retryTarget: () => void;
  /** The app's requests under the target. */
  requests: AppRequests;
  /** Books under the target; `null` until known or when it failed. */
  count: number | null;
  chooseTarget: (id: string) => void;
}

interface Resolution {
  folder: SmartFolder | null;
  target: ReadingTarget | null;
  member: MemberTarget | null;
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
  const resolved = useMemo<Resolution>(() => {
    const member = resolveReadingMemberTarget(listed);
    if (member !== null) {
      return { folder: listed, target: null, member };
    }
    const target = resolveReadingTarget(listed);
    return target.usable
      ? { folder: listed, target, member: null }
      : { folder: null, target: resolveReadingTarget(null), member: null };
  }, [listed]);

  const { evaluation, retry: retryTarget } = useMemberTarget(drive, listed, resolved.member);
  const memberReady = evaluation?.status === "ready" ? evaluation : null;
  const targetFailed = evaluation?.status === "failed";
  const targetUnusable = evaluation?.status === "tooLarge";
  const evaluating =
    resolved.member !== null && resolved.member.kinds.length > 0 && evaluation === null;

  // A folder that is gone or unusable is ignored, but its saved id stays:
  // the viewer's choice returns if the folder does.
  const lookingUp =
    wantsFolder && (smartFolders.status === "loading" || smartFolders.status === "idle");
  const targetKnown = prefs !== null && !lookingUp;
  const ready = targetKnown && !evaluating && !targetFailed && !targetUnusable;
  const empty =
    ready &&
    (resolved.member !== null
      ? resolved.member.kinds.length === 0
      : resolved.target !== null && resolved.target.usable && "empty" in resolved.target);
  const params = useMemo<ReadingTargetParams | null>(() => {
    if (!ready) return null;
    if (resolved.member !== null) return readingMemberParams(resolved.member);
    return resolved.target !== null && resolved.target.usable && !("empty" in resolved.target)
      ? resolved.target.params
      : null;
  }, [ready, resolved]);

  const requests = useMemo(
    () => appRequests(resolved.member, memberReady?.fileIds ?? null),
    [resolved.member, memberReady],
  );

  const loadCount = useMemo(
    () =>
      params === null
        ? null
        : resolved.member !== null
          ? // No shelf request under a member target carries a grouping of its own.
            () => requests.files(drive, { ...params, limit: 1 }).then((page) => page.meta.total)
          : () =>
              requests.shelves(drive, { ...params, by: "all", per_shelf: 1 }).then(
                (response) => response.shelves[0]?.count ?? 0,
              ),
    [drive, params, requests, resolved.member],
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
    targetKnown,
    params,
    ready,
    empty,
    targetFailed,
    targetUnusable,
    retryTarget,
    requests,
    count,
    chooseTarget,
  };
}
