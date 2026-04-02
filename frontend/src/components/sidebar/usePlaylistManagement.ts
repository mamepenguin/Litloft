"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { createPlaylist, updatePlaylist, deletePlaylist, getPlaylists } from "@/lib/api";
import type { PlaylistSummary } from "@/types";

interface UsePlaylistManagementParams {
  currentDrive: string | null;
  playlistList: PlaylistSummary[];
  setPlaylistList: React.Dispatch<React.SetStateAction<PlaylistSummary[]>>;
  close: () => void;
  router: AppRouterInstance;
  setOverrideDrive: (drive: string | null) => void;
}

export function usePlaylistManagement({
  currentDrive,
  playlistList,
  setPlaylistList,
  close,
  router,
  setOverrideDrive,
}: UsePlaylistManagementParams) {
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingPlaylist && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [creatingPlaylist]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick() { setContextMenu(null); }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const handleCreatePlaylist = useCallback(async () => {
    if (!currentDrive || !newPlaylistName.trim()) {
      setCreatingPlaylist(false);
      setNewPlaylistName("");
      return;
    }
    try {
      await createPlaylist(currentDrive, newPlaylistName.trim());
      const updated = await getPlaylists(currentDrive);
      setPlaylistList(updated);
    } catch {
      // name conflict or other error
    }
    setCreatingPlaylist(false);
    setNewPlaylistName("");
  }, [currentDrive, newPlaylistName, setPlaylistList]);

  const handleRenamePlaylist = useCallback(async () => {
    if (!currentDrive || !renamingId || !renameValue.trim()) {
      setRenamingId(null);
      setRenameValue("");
      return;
    }
    try {
      await updatePlaylist(currentDrive, renamingId, renameValue.trim());
      const updated = await getPlaylists(currentDrive);
      setPlaylistList(updated);
    } catch {
      // name conflict or other error
    }
    setRenamingId(null);
    setRenameValue("");
  }, [currentDrive, renamingId, renameValue, setPlaylistList]);

  const handleDeletePlaylist = useCallback(async (id: string) => {
    if (!currentDrive) return;
    try {
      await deletePlaylist(currentDrive, id);
      const updated = await getPlaylists(currentDrive);
      setPlaylistList(updated);
    } catch {
      // error
    }
    setContextMenu(null);
  }, [currentDrive, setPlaylistList]);

  const handlePlaylistClick = useCallback((pl: PlaylistSummary) => {
    if (!pl.first_file_id) return;
    setOverrideDrive(pl.drive);
    close();
    router.push(`/files/${pl.first_file_id}?playlist=${pl.id}`);
  }, [close, router, setOverrideDrive]);

  return {
    creatingPlaylist,
    setCreatingPlaylist,
    newPlaylistName,
    setNewPlaylistName,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    contextMenu,
    setContextMenu,
    createInputRef,
    renameInputRef,
    handleCreatePlaylist,
    handleRenamePlaylist,
    handleDeletePlaylist,
    handlePlaylistClick,
    playlistList,
  };
}
