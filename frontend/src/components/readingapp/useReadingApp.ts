"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
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

export function useReadingApp(drive: string): ReadingAppState {
  const { nickname } = useProfile();
  const [prefs, setPrefs] = useState<AppPrefs | null>(null);
  const [chosen, setChosen] = useState<ChosenView | null>(null);
  const [rejectedFor, setRejectedFor] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(readAppPrefs(drive, "reading"));
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

  const savedId = prefs?.target ?? "default";
  const savedTarget = parseAppTargetId(savedId);
  const savedFolderId = savedTarget.kind === "smart" ? savedTarget.id : null;
  const savedCollectionId = savedTarget.kind === "collection" ? savedTarget.id : null;
  const listedFolder =
    savedFolderId !== null && smartFolders.status === "loaded"
      ? (smartFolders.data.find((candidate) => candidate.id === savedFolderId) ?? null)
      : null;
  const listedCollection =
    savedCollectionId !== null && collections.status === "loaded"
      ? (collections.data.find((candidate) => candidate.id === savedCollectionId) ?? null)
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
    (savedFolderId !== null &&
      (smartFolders.status === "loading" || smartFolders.status === "idle")) ||
    (savedCollectionId !== null &&
      (collections.status === "loading" || collections.status === "idle"));
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

  const targetId =
    resolved.collection !== null
      ? collectionTargetId(resolved.collection.id)
      : (resolved.folder?.id ?? "default");
  const targetName = resolved.collection?.name ?? resolved.folder?.name ?? null;

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
      setChosen({ drive, targetId, view: { ...view, group } });
    },
    [drive, targetId, view],
  );
  const setSort = useCallback(
    (sort: SortId) => {
      writeTargetView("reading", drive, targetId, { sort });
      setChosen({ drive, targetId, view: { ...view, sort } });
    },
    [drive, targetId, view],
  );

  const rejectViewer = useCallback(() => setRejectedFor(nickname), [nickname]);
  const chooseTarget = useCallback(
    (id: string) => {
      if (id === targetId) return;
      setChosen(null);
      updatePrefs({ target: id });
    },
    [targetId, updatePrefs],
  );

  return {
    prefs,
    updatePrefs,
    view,
    setGroup,
    setSort,
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
