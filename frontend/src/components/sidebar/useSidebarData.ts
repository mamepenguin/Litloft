"use client";

import { useEffect, useState } from "react";

import { getCollections, getDrives, getDriveSummary, getDriveTags, getPins, getAuthStatus } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { AuthStatus, CollectionSummary, Drive, DriveSummary, PinnedFolder, Tag } from "@/types";

interface UseSidebarDataResult {
  drives: Drive[];
  tags: Tag[];
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
  const [tags, setTags] = useState<Tag[]>([]);
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
      setTags([]);
      return;
    }
    getDriveTags(currentDrive, currentFolderPath).then(setTags).catch(() => setTags([]));
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
