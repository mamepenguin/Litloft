"use client";

import { useEffect, useState } from "react";

import { getAuthStatus, getDrives } from "@/lib/api";
import type {
  AuthStatus,
  CollectionSummary,
  Drive,
  DriveSummary,
  PinnedFolder,
} from "@/types";
import { useDriveScopedReads, type ScopedTags } from "./useDriveScopedReads";

export type { ScopedTags };

interface UseSidebarDataResult {
  drives: Drive[];
  /** null until the first fetch for the current drive resolves. */
  tags: ScopedTags | null;
  pins: PinnedFolder[];
  collectionList: CollectionSummary[];
  reloadCollections: () => Promise<void>;
  authStatus: AuthStatus | null;
  driveSummary: DriveSummary | null;
}

export function useSidebarData(
  currentDrive: string | null,
  currentFolderPath: string | null,
  refreshKey: number,
): UseSidebarDataResult {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    getDrives().then(setDrives).catch(() => setDrives([]));
    getAuthStatus().then(setAuthStatus).catch(() => setAuthStatus(null));
  }, [refreshKey]);

  const { tags, pins, collectionList, driveSummary, reloadCollections } = useDriveScopedReads(
    currentDrive,
    currentFolderPath,
    refreshKey,
  );

  return { drives, tags, pins, collectionList, reloadCollections, authStatus, driveSummary };
}
