"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { readLibraryFilters, resetLibraryFilters } from "@/components/appshell/libraryFilters";
import { useMemberTarget } from "@/components/appshell/useMemberTarget";
import { ApiStatusError, getCollections, getSmartFolders } from "@/lib/api";
import { collectionTargetId, parseAppTargetId } from "@/lib/appTarget";
import {
  readAppPrefs,
  readLegacyGroup,
  readTargetView,
  writeAppPrefs,
  writeTargetView,
  type AppPrefs,
  type TargetView,
} from "@/lib/appPrefs";
import {
  DEFAULT_READING_GROUP,
  isReadingGroup,
  isSortId,
  type ReadingGroup,
  type SortId,
} from "./labels";
import { appRequests, type AppRequests, type MemberTarget } from "@/lib/memberTarget";
import {
  isReadingTargetUsable,
  readingMemberParams,
  resolveReadingCollectionTarget,
  resolveReadingMemberTarget,
  resolveReadingTarget,
  type ReadingTarget,
  type ReadingTargetParams,
} from "@/lib/readingAppTarget";
import type { CollectionSummary } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

export const VIEWER_REQUIRED = "viewer_required";

export function isViewerRequired(error: unknown): boolean {
  return error instanceof ApiStatusError && error.detail === VIEWER_REQUIRED;
}

export interface ReadingAppState {
  /** `null` until the stored values are read, so no request goes out for a default. */
  prefs: AppPrefs | null;
  updatePrefs: (changes: Partial<AppPrefs>) => void;
  /** The grouping and the sort in force for the target shown. */
  view: { group: ReadingGroup; sort: SortId };
  setGroup: (group: ReadingGroup) => void;
  setSort: (sort: SortId) => void;
  /** The profile's name, or `null` when none is set. */
  nickname: string | null;
  /** The profile exists and the server has not turned it away. */
  hasProfile: boolean;
  /** Call when a request answered `viewer_required`. */
  rejectViewer: () => void;
  smartFolders: LoadState<SmartFolder[]>;
  retrySmartFolders: () => void;
  collections: LoadState<CollectionSummary[]>;
  retryCollections: () => void;
  /** The folder in force; `null` is the default target or a collection. */
  folder: SmartFolder | null;
  /** The target in force as the id it is saved under. */
  targetId: string;
  /** The target's name; `null` for the default target and while it is looked up. */
  targetName: string | null;
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
  collection: CollectionSummary | null;
  target: ReadingTarget | null;
  member: MemberTarget | null;
}

interface ChosenView {
  drive: string;
  targetId: string;
  view: TargetView;
}

function pickReadingGroup(held: string | undefined, legacy: string | null): ReadingGroup {
  if (isReadingGroup(held)) return held;
  if (isReadingGroup(legacy)) return legacy;
  return DEFAULT_READING_GROUP;
}

export function useReadingApp(
  drive: string,
  targetParam: string | null = null,
  onTargetHandled?: () => void,
): ReadingAppState {
  const { nickname } = useProfile();
  const [prefs, setPrefs] = useState<AppPrefs | null>(null);
  const [chosen, setChosen] = useState<ChosenView | null>(null);
  const [rejectedFor, setRejectedFor] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(() =>
    targetParam !== null && targetParam !== "" && targetParam !== "default"
      ? targetParam
      : null,
  );
  const savedBefore = useRef<string | null>(null);
  const stripped = useRef(false);

  useEffect(() => {
    const next = readAppPrefs(drive, "reading");
    savedBefore.current = next.target;
    setPrefs(next);
    setChosen(null);
  }, [drive]);

  const updatePrefs = useCallback(
    (changes: Partial<AppPrefs>) => {
      writeAppPrefs(drive, changes, "reading");
      setPrefs((held) => (held ? { ...held, ...changes } : held));
    },
    [drive],
  );

  const loadFolders = useCallback(() => getSmartFolders(drive), [drive]);
  const { state: smartFolders, retry: retrySmartFolders } = useLoad(loadFolders);
  const loadCollections = useCallback(() => getCollections(drive), [drive]);
  const { state: collections, retry: retryCollections } = useLoad(loadCollections);

  const needsCollections =
    pendingId !== null && pendingId.startsWith("collection:");
  let pendingState: "none" | "waiting" | "apply" | "ignore" = "none";
  let applyId: string | null = null;
  if (pendingId !== null) {
    if (prefs === null) {
      pendingState = "waiting";
    } else if (needsCollections) {
      if (collections.status === "failed") pendingState = "ignore";
      else if (collections.status !== "loaded") pendingState = "waiting";
      else if (collections.data.some((c) => collectionTargetId(c.id) === pendingId)) {
        pendingState = "apply";
        applyId = pendingId;
      } else pendingState = "ignore";
    } else if (smartFolders.status === "failed") {
      pendingState = "ignore";
    } else if (smartFolders.status !== "loaded") {
      pendingState = "waiting";
    } else {
      const folder = smartFolders.data.find((candidate) => candidate.id === pendingId) ?? null;
      if (folder !== null && isReadingTargetUsable(folder)) {
        pendingState = "apply";
        applyId = pendingId;
      } else {
        pendingState = "ignore";
      }
    }
  }
  const pending = pendingId !== null;

  useEffect(() => {
    if (pendingState === "apply" && applyId !== null) {
      const before = savedBefore.current ?? "default";
      writeAppPrefs(drive, { target: applyId }, "reading");
      setPrefs((held) => (held ? { ...held, target: applyId } : held));
      if (applyId !== before) resetLibraryFilters("reading", drive);
      setPendingId(null);
    } else if (pendingState === "ignore") {
      setPendingId(null);
    }
  }, [drive, pendingState, applyId]);

  useEffect(() => {
    if (targetParam === null || pendingState === "waiting" || stripped.current) return;
    stripped.current = true;
    onTargetHandled?.();
  }, [targetParam, pendingState, onTargetHandled]);

  // A pending id holds every request: what it names has not been applied yet.
  const savedId = prefs?.target ?? "default";
  const requestedId = pending ? "default" : savedId;
  const requestedTarget = parseAppTargetId(requestedId);
  const requestedFolderId = requestedTarget.kind === "smart" ? requestedTarget.id : null;
  const requestedCollectionId =
    requestedTarget.kind === "collection" ? requestedTarget.id : null;
  const listedFolder =
    requestedFolderId !== null && smartFolders.status === "loaded"
      ? (smartFolders.data.find((candidate) => candidate.id === requestedFolderId) ?? null)
      : null;
  const listedCollection =
    requestedCollectionId !== null && collections.status === "loaded"
      ? (collections.data.find((candidate) => candidate.id === requestedCollectionId) ?? null)
      : null;
  const resolved = useMemo<Resolution>(() => {
    if (listedCollection !== null) {
      return {
        folder: null,
        collection: listedCollection,
        target: resolveReadingCollectionTarget(listedCollection),
        member: null,
      };
    }
    const member = resolveReadingMemberTarget(listedFolder);
    if (member !== null) {
      return { folder: listedFolder, collection: null, target: null, member };
    }
    const target = resolveReadingTarget(listedFolder);
    return target.usable
      ? { folder: listedFolder, collection: null, target, member: null }
      : { folder: null, collection: null, target: resolveReadingTarget(null), member: null };
  }, [listedFolder, listedCollection]);

  const { evaluation, retry: retryTarget } = useMemberTarget(drive, listedFolder, resolved.member);
  const memberReady = evaluation?.status === "ready" ? evaluation : null;
  const targetFailed = evaluation?.status === "failed";
  const targetUnusable = evaluation?.status === "tooLarge";
  const evaluating =
    resolved.member !== null && resolved.member.kinds.length > 0 && evaluation === null;

  // A target that is gone or unusable is ignored, but its saved id stays:
  // the viewer's choice returns if the target does.
  const lookingUp =
    (requestedFolderId !== null &&
      (smartFolders.status === "loading" || smartFolders.status === "idle")) ||
    (requestedCollectionId !== null &&
      (collections.status === "loading" || collections.status === "idle"));
  const targetKnown = prefs !== null && !lookingUp && !pending;
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

  const resolvedTargetId =
    resolved.collection !== null
      ? collectionTargetId(resolved.collection.id)
      : (resolved.folder?.id ?? "default");
  const targetId = pending && pendingId !== null ? pendingId : resolvedTargetId;
  const targetName =
    pending ? null : (resolved.collection?.name ?? resolved.folder?.name ?? null);

  const hasProfile = nickname !== null && rejectedFor !== nickname;

  const storedView = useMemo(
    () => readTargetView("reading", drive, targetId),
    [drive, targetId],
  );
  const view = useMemo(() => {
    const held =
      chosen !== null && chosen.drive === drive && chosen.targetId === targetId
        ? { ...storedView, ...chosen.view }
        : storedView;
    const legacy = targetId === "default" ? readLegacyGroup(drive, "reading") : null;
    return {
      group: pickReadingGroup(held.group, legacy),
      sort: isSortId(held.sort) ? held.sort : "newest",
    };
  }, [chosen, drive, targetId, storedView]);

  const setGroup = useCallback(
    (group: ReadingGroup) => {
      writeTargetView("reading", drive, targetId, { group });
      setChosen((held) => ({
        drive,
        targetId,
        view: {
          ...(held !== null && held.drive === drive && held.targetId === targetId
            ? held.view
            : {}),
          group,
        },
      }));
    },
    [drive, targetId],
  );
  const setSort = useCallback(
    (sort: SortId) => {
      writeTargetView("reading", drive, targetId, { sort });
      setChosen((held) => ({
        drive,
        targetId,
        view: {
          ...(held !== null && held.drive === drive && held.targetId === targetId
            ? held.view
            : {}),
          sort,
        },
      }));
    },
    [drive, targetId],
  );

  useEffect(() => {
    readLibraryFilters("reading", drive);
  }, [drive]);

  const rejectViewer = useCallback(() => setRejectedFor(nickname), [nickname]);
  const chooseTarget = useCallback(
    (id: string) => {
      if (id === targetId) return;
      setPendingId(null);
      setChosen(null);
      resetLibraryFilters("reading", drive);
      updatePrefs({ target: id });
    },
    [drive, targetId, updatePrefs],
  );

  return {
    prefs,
    updatePrefs,
    view,
    setGroup,
    setSort,
    nickname,
    hasProfile,
    rejectViewer,
    smartFolders,
    retrySmartFolders,
    collections,
    retryCollections,
    folder: resolved.folder,
    targetId,
    targetName,
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
