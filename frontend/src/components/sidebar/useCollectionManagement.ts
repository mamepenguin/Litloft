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
import { useNameSubmission } from "@/hooks/useNameSubmission";
import { collectionHref } from "@/lib/driveViews";
import { isNameInUse } from "@/lib/nameInUse";
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
  const createName = useNameSubmission();
  const renameName = useNameSubmission();
  const { begin: beginCreate, settle: settleCreate, reject: rejectCreate } = createName;
  const { begin: beginRename, settle: settleRename, reject: rejectRename } = renameName;
  const clearCreate = createName.clear;
  const clearRename = renameName.clear;
  const isCreateBusy = createName.isBusy;
  const isRenameBusy = renameName.isBusy;
  const isCreateRejected = createName.isRejected;
  const isRenameRejected = renameName.isRejected;
  const resetCreate = createName.reset;
  const resetRename = renameName.reset;

  useEffect(() => {
    resetCreate();
    resetRename();
    setCreatingCollection(false);
    setNewCollectionName("");
    setRenamingId(null);
    setRenameValue("");
  }, [currentDrive, resetCreate, resetRename]);

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

  const updateNewCollectionName = useCallback(
    (value: string) => {
      setNewCollectionName(value);
      clearCreate();
    },
    [clearCreate],
  );

  const updateRenameValue = useCallback(
    (value: string) => {
      setRenameValue(value);
      clearRename();
    },
    [clearRename],
  );

  const cancelCreate = useCallback(() => {
    setCreatingCollection(false);
    setNewCollectionName("");
    resetCreate();
  }, [resetCreate]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
    resetRename();
  }, [resetRename]);

  const startCollectionRename = useCallback(
    (id: string, name: string) => {
      setRenamingId(id);
      setRenameValue(name);
      setCreatingCollection(false);
      setNewCollectionName("");
      resetCreate();
      resetRename();
    },
    [resetCreate, resetRename],
  );

  // No listener here. The menu is `ContextMenu`, which goes through
  // `DismissScrim`: an outside press closes it and the click that press
  // produces is swallowed.

  const handleCreateCollection = useCallback(async () => {
    const name = newCollectionName.trim();
    if (!currentDrive || !name) {
      cancelCreate();
      return;
    }
    if (isCreateBusy() || isCreateRejected(name)) return;
    beginCreate();
    try {
      await createCollection(currentDrive, name);
      const updated = await getCollections(currentDrive);
      setCollectionList(updated);
    } catch (e) {
      if (isNameInUse(e)) {
        rejectCreate(name);
        return;
      }
      toast.error(t("errorCreate"));
    } finally {
      settleCreate();
    }
    setCreatingCollection(false);
    setNewCollectionName("");
  }, [currentDrive, newCollectionName, setCollectionList, toast, t, isCreateBusy, isCreateRejected, beginCreate, rejectCreate, settleCreate, cancelCreate]);

  const handleRenameCollection = useCallback(async () => {
    const name = renameValue.trim();
    if (!currentDrive || !renamingId || !name) {
      cancelRename();
      return;
    }
    if (isRenameBusy() || isRenameRejected(name)) return;
    beginRename();
    try {
      await updateCollection(currentDrive, renamingId, { name });
      const updated = await getCollections(currentDrive);
      setCollectionList(updated);
    } catch (e) {
      if (isNameInUse(e)) {
        rejectRename(name);
        return;
      }
      toast.error(t("errorRename"));
    } finally {
      settleRename();
    }
    setRenamingId(null);
    setRenameValue("");
  }, [currentDrive, renamingId, renameValue, setCollectionList, toast, t, isRenameBusy, isRenameRejected, beginRename, rejectRename, settleRename, cancelRename]);

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

  const handleCollectionClick = useCallback((c: CollectionSummary) => {
    setOverrideDrive(c.drive);
    close();
    router.push(collectionHref(c));
  }, [close, router, setOverrideDrive]);

  return {
    creatingCollection,
    setCreatingCollection,
    newCollectionName,
    setNewCollectionName: updateNewCollectionName,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue: updateRenameValue,
    contextMenu,
    setContextMenu,
    createInputRef,
    renameInputRef,
    createInUse: createName.inUse,
    createBusy: createName.busy,
    renameInUse: renameName.inUse,
    renameBusy: renameName.busy,
    cancelCreate,
    cancelRename,
    startCollectionRename,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    handleCollectionClick,
    collectionList,
  };
}
