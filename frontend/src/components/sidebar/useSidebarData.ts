"use client";

import { useEffect, useState } from "react";

import { getCollections, getDrives, getDriveSummary, getDriveTags, getPins, getAuthStatus } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { AuthStatus, CollectionSummary, Drive, DriveSummary, PinnedFolder, Tag } from "@/types";

/**
 * The tag list together with the scope it was actually fetched for.
 *
 * spec 2026-08-21-folder-scoped-tag-filter §5.0: sharing an expression
 * between the list fetch and the tag href makes them agree about *what
 * scope to ask for*, but the rendered items lag behind by one fetch.
 * Carrying the scope with the data lets the consumer tell "these rows
 * describe the scope you are in" from "these rows are the previous
 * scope's, still on screen". The drive is part of the key as well as the
 * folder — drive is a security boundary (hako cRNeIvcbhz449BwTmof5m).
 */
export interface ScopedTags {
  resolvedScope: { drive: string; folderPath: string | null };
  items: Tag[];
}

interface UseSidebarDataResult {
  drives: Drive[];
  /** null until the first fetch for the current drive resolves. */
  tags: ScopedTags | null;
  pins: PinnedFolder[];
  collectionList: CollectionSummary[];
  setCollectionList: React.Dispatch<React.SetStateAction<CollectionSummary[]>>;
  authStatus: AuthStatus | null;
  driveSummary: DriveSummary | null;
}

export function useSidebarData(
  currentDrive: string | null,
  currentFolderPath: string | null,
  refreshKey: number,
): UseSidebarDataResult {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [tags, setTags] = useState<ScopedTags | null>(null);
  const [pins, setPins] = useState<PinnedFolder[]>([]);
  const [collectionList, setCollectionList] = useState<CollectionSummary[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [driveSummary, setDriveSummary] = useState<DriveSummary | null>(null);

  useEffect(() => {
    getDrives().then(setDrives).catch(() => setDrives([]));
    getAuthStatus().then(setAuthStatus).catch(() => setAuthStatus(null));
  }, [refreshKey]);

  useEffect(() => {
    if (!currentDrive) {
      setDriveSummary(null);
      return;
    }
    getPins(currentDrive).then(setPins).catch(() => setPins([]));
    getCollections(currentDrive).then(setCollectionList).catch(() => setCollectionList([]));
    getDriveSummary(currentDrive).then(setDriveSummary).catch(() => setDriveSummary(null));
  }, [currentDrive, refreshKey]);

  useEffect(() => {
    if (!currentDrive) {
      setTags(null);
      return;
    }
    // currentFolderPath is published by the folder page after mount (see
    // CurrentDriveProvider), so opening a folder URL directly fires this
    // effect twice in quick succession: once with null, then again with
    // the real path. Guard against the null request resolving second and
    // clobbering the folder-scoped result.
    const resolvedScope = { drive: currentDrive, folderPath: currentFolderPath };
    let cancelled = false;
    getDriveTags(currentDrive, currentFolderPath)
      .then((items) => {
        if (!cancelled) setTags({ resolvedScope, items });
      })
      .catch(() => {
        // Record the scope on failure too. Leaving the previous value in
        // place would strand the old rows inert forever, because nothing
        // would ever match the current scope again.
        if (!cancelled) setTags({ resolvedScope, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [currentDrive, currentFolderPath, refreshKey]);

  // Refresh drive summary when a scan completes so sidebar reflects
  // newly missing / recovered counts.
  const scanEvent = useWebSocket("scan:complete");
  useEffect(() => {
    if (!scanEvent || !currentDrive) return;
    getDriveSummary(currentDrive).then(setDriveSummary).catch(() => {});
  }, [scanEvent, currentDrive]);

  return { drives, tags, pins, collectionList, setCollectionList, authStatus, driveSummary };
}
