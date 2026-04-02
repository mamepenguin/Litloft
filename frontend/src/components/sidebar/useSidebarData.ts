"use client";

import { useEffect, useState } from "react";

import { getDrives, getDriveTags, getPins, getPlaylists, getAuthStatus } from "@/lib/api";
import type { AuthStatus, Drive, PinnedFolder, PlaylistSummary, Tag } from "@/types";

interface UseSidebarDataResult {
  drives: Drive[];
  tags: Tag[];
  pins: PinnedFolder[];
  playlistList: PlaylistSummary[];
  setPlaylistList: React.Dispatch<React.SetStateAction<PlaylistSummary[]>>;
  authStatus: AuthStatus | null;
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

  useEffect(() => {
    getDrives().then(setDrives).catch(() => setDrives([]));
    getAuthStatus().then(setAuthStatus).catch(() => setAuthStatus(null));
  }, [refreshKey]);

  useEffect(() => {
    if (!currentDrive) return;
    getDriveTags(currentDrive).then(setTags).catch(() => setTags([]));
    getPins(currentDrive).then(setPins).catch(() => setPins([]));
    getPlaylists(currentDrive).then(setPlaylistList).catch(() => setPlaylistList([]));
  }, [currentDrive, refreshKey]);

  return { drives, tags, pins, playlistList, setPlaylistList, authStatus };
}
