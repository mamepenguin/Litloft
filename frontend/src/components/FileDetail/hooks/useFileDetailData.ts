"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getFile,
  getFileShared,
  recordFileView,
  renameFile,
  updateFile,
} from "@/lib/api";
import { peekFileSeed } from "@/lib/fileSeed";
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
  /** False while `file` is a list's copy rather than this file's own answer. */
  fresh: boolean;
  failed: boolean;
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

interface FileEntry {
  id: string;
  file: FileItem | null;
  fresh: boolean;
  failed: boolean;
}

function seededEntry(id: string): FileEntry {
  return { id, file: peekFileSeed(id), fresh: false, failed: false };
}

export function useFileDetailData(fileId: string): FileDetailData {
  const { requestRefresh: refreshSidebar } = useSidebar();

  // Keyed by id so that nothing belonging to the previous file is handed
  // back under the next file's id, not even for the render before the
  // effect below runs.
  const [stored, setStored] = useState<FileEntry>(() => seededEntry(fileId));
  const entry = stored.id === fileId ? stored : seededEntry(fileId);
  const { file, fresh, failed } = entry;

  const setFile = useCallback<FileDetailData["setFile"]>(
    (action) =>
      setStored((prev) => {
        const next = typeof action === "function" ? action(prev.file) : action;
        if (next && next.id !== prev.id) return prev;
        return { ...prev, file: next };
      }),
    [],
  );
  /**
   * Held apart from ``file`` on purpose: the mutation endpoints answer with
   * the plain ``FileResponse`` and every one does ``setFile(updated)``, so
   * keeping the flag on the file object would make chapters disappear.
   */
  const [chaptersPresent, setChaptersPresent] = useState(false);
  const [chaptersVersion, setChaptersVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(() => peekFileSeed(fileId)?.title ?? "");
  const [editDesc, setEditDesc] = useState(
    () => peekFileSeed(fileId)?.description ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [tagSaveVersion, setTagSaveVersion] = useState(0);

  useEffect(() => {
    const seed = peekFileSeed(fileId);
    setStored(seededEntry(fileId));
    setEditTitle(seed?.title ?? "");
    setEditDesc(seed?.description ?? "");
    setChaptersPresent(false);
    setChaptersVersion(0);
    setEditing(false);
    let cancelled = false;
    getFileShared(fileId)
      .then((f) => {
        if (cancelled) return;
        setStored({ id: fileId, file: f, fresh: true, failed: false });
        setChaptersPresent(f.has_chapters === true);
        setEditTitle(f.title);
        setEditDesc(f.description);
      })
      .catch(() => {
        if (cancelled) return;
        setStored({ id: fileId, file: null, fresh: false, failed: true });
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
    if (!file || !fresh) return;
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
  }, [file, fresh, editTitle, editDesc]);

  const rename = useCallback(
    async (newFilename: string) => {
      if (!file || !fresh) return;
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
    [file, fresh, refreshSidebar],
  );

  const startEditing = useCallback(() => {
    if (fresh) setEditing(true);
  }, [fresh]);
  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditTitle(file?.title ?? "");
    setEditDesc(file?.description ?? "");
  }, [file]);

  return {
    file,
    fresh,
    failed,
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
