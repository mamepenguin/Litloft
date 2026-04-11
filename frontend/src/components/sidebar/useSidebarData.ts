"use client";

import { useEffect, useState } from "react";

import { getDrives, getDriveSummary, getDriveTags, getPins, getPlaylists, getAuthStatus } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { AuthStatus, Drive, DriveSummary, PinnedFolder, PlaylistSummary, Tag } from "@/types";

interface UseSidebarDataResult {
  drives: Drive[];
  tags: Tag[];
  pins: PinnedFolder[];
  playlistList: PlaylistSummary[];
  setPlaylistList: React.Dispatch<React.SetStateAction<PlaylistSummary[]>>;
  authStatus: AuthStatus | null;
  driveSummary: DriveSummary | null;
}

export function useSidebarData(
  currentDrive: string | null,
  refreshKey: number,
): UseSidebarDataResult {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [pins, setPins] = useState<PinnedFolder[]>([]);
  const [playlistList, setPlaylistList] = useState<PlaylistSummary[]>([]);
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
    getDriveTags(currentDrive).then(setTags).catch(() => setTags([]));
    getPins(currentDrive).then(setPins).catch(() => setPins([]));
    getPlaylists(currentDrive).then(setPlaylistList).catch(() => setPlaylistList([]));
    getDriveSummary(currentDrive).then(setDriveSummary).catch(() => setDriveSummary(null));
  }, [currentDrive, refreshKey]);

  // Refresh drive summary when a scan completes so sidebar reflects
  // newly missing / recovered counts.
  const scanEvent = useWebSocket("scan:complete");
  useEffect(() => {
    if (!scanEvent || !currentDrive) return;
    getDriveSummary(currentDrive).then(setDriveSummary).catch(() => {});
  }, [scanEvent, currentDrive]);

  return { drives, tags, pins, playlistList, setPlaylistList, authStatus, driveSummary };
}
