"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { ApiStatusError, getSmartFolders } from "@/lib/api";
import { readAppPrefs, writeAppPrefs, type AppPrefs } from "@/lib/appPrefs";
import { appRequests, type AppRequests, type MemberTarget } from "@/lib/memberTarget";
import {
  resolveVideoMemberTarget,
  resolveVideoTarget,
  videoMemberParams,
  type VideoTarget,
  type VideoTargetParams,
} from "@/lib/videoAppTarget";
import type { SmartFolder } from "@/types/smartFolder";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { useMemberTarget } from "@/components/appshell/useMemberTarget";

export const VIEWER_REQUIRED = "viewer_required";

export function isViewerRequired(error: unknown): boolean {
  return error instanceof ApiStatusError && error.detail === VIEWER_REQUIRED;
}

export interface VideoAppState {
  /** `null` until the stored values are read, so no request goes out for a default. */
  prefs: AppPrefs | null;
  updatePrefs: (changes: Partial<AppPrefs>) => void;
  /** The profile's name, or `null` when none is set. */
  nickname: string | null;
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
  params: VideoTargetParams | null;
  /** Requests may go out. */
  ready: boolean;
  /** The target matches no video, so nothing is requested. */
  empty: boolean;
  /** The member evaluation failed; the body offers a retry. */
  targetFailed: boolean;
  /** More members than the app can send; the body says the target cannot be used. */
  targetUnusable: boolean;
  /** Evaluate the member target again. */
  retryTarget: () => void;
  /** The app's requests under the target. */
  requests: AppRequests;
  /** Videos under the target; `null` until known or when it failed. */
  count: number | null;
  chooseTarget: (id: string) => void;
}

interface Resolution {
  folder: SmartFolder | null;
  target: VideoTarget | null;
  member: MemberTarget | null;
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
  const { state: smartFolders, retry: retrySmartFolders } = useLoad(loadFolders);

  const savedId = prefs?.target ?? "default";
  const wantsFolder = savedId !== "default";
  const listed =
    smartFolders.status === "loaded"
      ? (smartFolders.data.find((candidate) => candidate.id === savedId) ?? null)
      : null;
  const resolved = useMemo<Resolution>(() => {
    const member = resolveVideoMemberTarget(listed);
    if (member !== null) {
      return { folder: listed, target: null, member };
    }
    const target = resolveVideoTarget(listed);
    return target.usable
      ? { folder: listed, target, member: null }
      : { folder: null, target: resolveVideoTarget(null), member: null };
  }, [listed]);

  const { evaluation, retry: retryTarget } = useMemberTarget(drive, listed, resolved.member);
  const memberReady = evaluation?.status === "ready" ? evaluation : null;
  const targetFailed = evaluation?.status === "failed";
  const targetUnusable = evaluation?.status === "tooLarge";
  const evaluating =
    resolved.member !== null && resolved.member.kinds.length > 0 && evaluation === null;

  // A folder that is gone or unusable is ignored, but its saved id stays:
  // the viewer's choice returns if the folder does.
  const lookingUp = wantsFolder && (smartFolders.status === "loading" || smartFolders.status === "idle");
  const targetKnown = prefs !== null && !lookingUp;
  const ready = targetKnown && !evaluating && !targetFailed && !targetUnusable;
  const empty =
    ready &&
    (resolved.member !== null
      ? resolved.member.kinds.length === 0
      : resolved.target !== null && resolved.target.usable && "empty" in resolved.target);
  const params = useMemo<VideoTargetParams | null>(() => {
    if (!ready) return null;
    if (resolved.member !== null) return videoMemberParams(resolved.member);
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
        : () => requests.files(drive, { ...params, limit: 1 }).then((page) => page.meta.total),
    [drive, params, requests],
  );
  const { state: counted } = useLoad(loadCount);
  const count = empty ? 0 : counted.status === "loaded" ? counted.data : null;

  const hasProfile = nickname !== null && rejectedFor !== nickname;
  const rejectViewer = useCallback(() => setRejectedFor(nickname), [nickname]);
  const chooseTarget = useCallback((id: string) => updatePrefs({ target: id }), [updatePrefs]);

  return {
    prefs,
    updatePrefs,
    nickname,
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
