"use client";

import { useCallback, useEffect, useState } from "react";

import { getFile, recordFileView, renameFile, updateFile } from "@/lib/api";
import { addRecentlyPlayed } from "@/lib/recentlyPlayed";
import { clearListSnapshot } from "@/lib/listSnapshot";
import {
  FILE_CHAPTERS_UPDATED_EVENT,
  type FileChaptersUpdatedDetail,
} from "@/lib/addonEvents";
import { markdownContentRegistry } from "@/lib/markdownContentRegistry";
import { useSidebar } from "@/components/SidebarProvider";
import type { FileItem } from "@/types";

export interface FileDetailData {
  file: FileItem | null;
  setFile: React.Dispatch<React.SetStateAction<FileItem | null>>;
  chaptersPresent: boolean;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  editing: boolean;
  startEditing: () => void;
  cancelEditing: () => void;
  editTitle: string;
  setEditTitle: (value: string) => void;
  editDesc: string;
  setEditDesc: (value: string) => void;
  saving: boolean;
  save: () => Promise<void>;
  rename: (newFilename: string) => Promise<void>;
  tagSaveVersion: number;
  onTagsSaved: () => void;
  refetch: () => void;
}

export function useFileDetailData(fileId: string): FileDetailData {
  const { requestRefresh: refreshSidebar } = useSidebar();

  const [file, setFile] = useState<FileItem | null>(null);
  /**
   * Held apart from ``file`` on purpose: the mutation endpoints answer with
   * the plain ``FileResponse`` and every one does ``setFile(updated)``, so
   * keeping the flag on the file object would make chapters disappear.
   */
  const [chaptersPresent, setChaptersPresent] = useState(false);
  const [chaptersVersion, setChaptersVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [tagSaveVersion, setTagSaveVersion] = useState(0);

  useEffect(() => {
    setFile(null);
    setChaptersPresent(false);
    setChaptersVersion(0);
    setEditing(false);
    let cancelled = false;
    getFile(fileId)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        setChaptersPresent(f.has_chapters === true);
        setEditTitle(f.title);
        setEditDesc(f.description);
      })
      .catch(() => {
        // Host renders the loading / not-found UI when ``file`` is
        // null below, so swallow the error here.
      });
    addRecentlyPlayed(fileId);
    // Fire-and-forget; must fire exactly once per mounted fileId.
    recordFileView(fileId);
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  useEffect(() => {
    const handleChaptersUpdated = (event: Event) => {
      const updatedFileId = (
        event as CustomEvent<Partial<FileChaptersUpdatedDetail>>
      ).detail?.fileId;
      if (updatedFileId === fileId) {
        setChaptersPresent(true);
        setChaptersVersion((version) => version + 1);
      }
    };
    window.addEventListener(FILE_CHAPTERS_UPDATED_EVENT, handleChaptersUpdated);
    return () => {
      window.removeEventListener(
        FILE_CHAPTERS_UPDATED_EVENT,
        handleChaptersUpdated,
      );
    };
  }, [fileId]);

  const refetch = useCallback(() => {
    getFile(fileId)
      .then(setFile)
      .catch((err) => {
        console.error("Failed to refresh file:", err);
      });
  }, [fileId]);

  const onTagsSaved = useCallback(() => {
    refetch();
    setTagSaveVersion((v) => v + 1);
    refreshSidebar();
  }, [refetch, refreshSidebar]);

  // In content-mode the inspector chip group does not own the save path, so
  // subscribe to the registry's save-success channel and refetch `file.tags`.
  useEffect(() => {
    const dispose = markdownContentRegistry.subscribeSaved(fileId, () => {
      onTagsSaved();
    });
    return dispose;
  }, [fileId, onTagsSaved]);

  // Without this the panel hides itself while the region it was the only
  // occupant of stays.
  const onChaptersResolved = useCallback((count: number) => {
    setChaptersPresent(count > 0);
  }, []);

  const save = useCallback(async () => {
    if (!file) return;
    setSaving(true);
    try {
      const updated = await updateFile(file.id, {
        title: editTitle,
        description: editDesc,
      });
      setFile(updated);
      setEditing(false);
    } catch (err) {
      console.error("Failed to save file metadata:", err);
    } finally {
      setSaving(false);
    }
  }, [file, editTitle, editDesc]);

  const rename = useCallback(
    async (newFilename: string) => {
      if (!file) return;
      try {
        const updated = await renameFile(file.id, newFilename);
        setFile(updated);
        // The FolderBrowser is unmounted while the right-pane file detail is
        // open, so it can't receive the WS files.moved event triggered by
        // the rename.
        clearListSnapshot();
        refreshSidebar();
      } catch (err) {
        console.error("Failed to rename file:", err);
      }
    },
    [file, refreshSidebar],
  );

  const startEditing = useCallback(() => setEditing(true), []);
  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditTitle(file?.title ?? "");
    setEditDesc(file?.description ?? "");
  }, [file]);

  return {
    file,
    setFile,
    chaptersPresent,
    chaptersVersion,
    onChaptersResolved,
    editing,
    startEditing,
    cancelEditing,
    editTitle,
    setEditTitle,
    editDesc,
    setEditDesc,
    saving,
    save,
    rename,
    tagSaveVersion,
    onTagsSaved,
    refetch,
  };
}
