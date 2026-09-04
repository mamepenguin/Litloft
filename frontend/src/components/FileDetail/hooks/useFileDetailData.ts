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
  /** Bumped after every tag save; the .md viewer refetches `source` on it. */
  tagSaveVersion: number;
  onTagsSaved: () => void;
  refetch: () => void;
}

/**
 * Everything `FileDetailContent` knows about the file itself: the
 * fetch, the view record, the chapter flag, the title/description edit
 * form, and the three mutations that write back.
 *
 * Held apart from the layout so the presenter can be given a file and
 * a set of callbacks and decide nothing about where either came from.
 */
export function useFileDetailData(fileId: string): FileDetailData {
  const { requestRefresh: refreshSidebar } = useSidebar();

  const [file, setFile] = useState<FileItem | null>(null);
  /**
   * Whether the companion region has chapters to show — held apart from
   * ``file`` on purpose.
   *
   * ``has_chapters`` is a detail-only field, but ``FileItem`` is also what
   * the mutation endpoints return (like / dislike / favourite / metadata /
   * rename all answer with the plain ``FileResponse``). Every one of those
   * does ``setFile(updated)``, so keeping the flag on the file object means
   * liking a video makes its chapters disappear until the next reload.
   * Separate state cannot be clobbered by a whole-object replace, now or
   * from a call site added later.
   *
   * Seeded from the detail response so the layout is decided without a
   * second round trip, then corrected by the panel once its fetch settles
   * (see ``ChaptersPanel``'s ``onResolved``).
   */
  const [chaptersPresent, setChaptersPresent] = useState(false);
  const [chaptersVersion, setChaptersVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  // Bumped after every tag save (from either the outer File.tags chip
  // row or the .md Properties Panel chip row). The .md MarkdownFileViewer
  // watches this to refetch ``source`` so its frontmatter display
  // matches the server-projected state. For non-.md files this is
  // unused but harmless.
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
    // Server-side mirror of the localStorage record so personal_history
    // (Ask Stage B) can find non-media files. Fire-and-forget. Per
    // spec §4.5 / Phase 1 acceptance: must fire exactly once per
    // mounted fileId.
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
      .catch(() => {
        // Optimistic state stays correct; the next navigation refetches.
      });
  }, [fileId]);

  const onTagsSaved = useCallback(() => {
    refetch();
    setTagSaveVersion((v) => v + 1);
    refreshSidebar();
  }, [refetch, refreshSidebar]);

  // Phase 3 follow-up (hako 0RnZ1KdtomAfIJPLAGIHA): in content-mode the
  // inspector chip group does not own the save path, so its
  // `onSaveSuccess` was unwired. Subscribe to the registry's
  // save-success channel instead — the editor signals after every
  // successful PUT, and we refetch `file.tags` so the file detail UI
  // does not sit on a stale array if the user navigates away
  // immediately after editing chips.
  useEffect(() => {
    const dispose = markdownContentRegistry.subscribeSaved(fileId, () => {
      onTagsSaved();
    });
    return dispose;
  }, [fileId, onTagsSaved]);

  // Folds the region away when the list turns out to be empty or
  // unreadable. Without this the panel hides itself while the region it
  // was the only occupant of stays — an empty 24rem column with the
  // player squeezed beside it.
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
        // Clear the folder-view snapshot so the FolderBrowser doesn't
        // hydrate from stale sessionStorage when it remounts. The
        // FolderBrowser is unmounted while the right-pane file detail is
        // open, so it can't receive the WS files.moved event triggered by
        // the rename — without this the old filename persists until the
        // user opens a new tab.
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
