"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
  createCollection,
  deleteCollection,
  getCollections,
  updateCollection,
} from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import type { CollectionSummary } from "@/types";

interface UseCollectionManagementParams {
  currentDrive: string | null;
  collectionList: CollectionSummary[];
  setCollectionList: React.Dispatch<React.SetStateAction<CollectionSummary[]>>;
  close: () => void;
  router: AppRouterInstance;
  setOverrideDrive: (drive: string | null) => void;
}

export function useCollectionManagement({
  currentDrive,
  collectionList,
  setCollectionList,
  close,
  router,
  setOverrideDrive,
}: UseCollectionManagementParams) {
  const t = useTranslations("collection");
  const toast = useToast();
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingCollection && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [creatingCollection]);

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

  const handleCreateCollection = useCallback(async () => {
    if (!currentDrive || !newCollectionName.trim()) {
      setCreatingCollection(false);
      setNewCollectionName("");
      return;
    }
    try {
      await createCollection(currentDrive, newCollectionName.trim());
      const updated = await getCollections(currentDrive);
      setCollectionList(updated);
    } catch {
      toast.error(t("errorCreate"));
    }
    setCreatingCollection(false);
    setNewCollectionName("");
  }, [currentDrive, newCollectionName, setCollectionList, toast, t]);

  const handleRenameCollection = useCallback(async () => {
    if (!currentDrive || !renamingId || !renameValue.trim()) {
      setRenamingId(null);
      setRenameValue("");
      return;
    }
    try {
      await updateCollection(currentDrive, renamingId, { name: renameValue.trim() });
      const updated = await getCollections(currentDrive);
      setCollectionList(updated);
    } catch {
      toast.error(t("errorRename"));
    }
    setRenamingId(null);
    setRenameValue("");
  }, [currentDrive, renamingId, renameValue, setCollectionList, toast, t]);

  const handleDeleteCollection = useCallback(async (id: string) => {
    if (!currentDrive) return;
    try {
      await deleteCollection(currentDrive, id);
      const updated = await getCollections(currentDrive);
      setCollectionList(updated);
    } catch {
      toast.error(t("errorDelete"));
    }
    setContextMenu(null);
  }, [currentDrive, setCollectionList, toast, t]);

  // Sidebar click opens the collection's "virtual folder" detail page.
  // The Play action (jump into the fullscreen playback queue) lives on
  // that page, gated on whether the collection actually has media.
  // Spec 2026-05-12-playlist-to-collection §6.3 + PR-A follow-up.
  const handleCollectionClick = useCallback((c: CollectionSummary) => {
    setOverrideDrive(c.drive);
    close();
    router.push(
      `/drive/${encodeURIComponent(c.drive)}/collections/${encodeURIComponent(c.id)}`,
    );
  }, [close, router, setOverrideDrive]);

  return {
    creatingCollection,
    setCreatingCollection,
    newCollectionName,
    setNewCollectionName,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    contextMenu,
    setContextMenu,
    createInputRef,
    renameInputRef,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    handleCollectionClick,
    collectionList,
  };
}
