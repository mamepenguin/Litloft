"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { useInlineRename } from "@/hooks/useInlineRename";
import { useShortcuts } from "@/hooks/useShortcuts";
import { renameFolder } from "@/lib/api";
import { siblingPath } from "@/lib/filename";
import type { Folder } from "@/types";

export interface FolderCardRenameApi {
  /** Reason an edit was abandoned, for the host's transient banner. */
  error: string | null;
  /** Wire to `FolderContextMenu`'s `onStartInlineRename`. */
  start: (path: string) => void;
  /** Spread onto every `FolderCard` the host renders. */
  cardProps: (folder: Folder) => {
    isEditing: boolean;
    onRenameCommit: (next: string) => Promise<void>;
    onRenameCancel: (error?: string) => void;
    onCardFocus: () => void;
    onCardBlur: () => void;
  };
}

/**
 * Inline rename for a grid of folder cards.
 *
 * Whether a card can be renamed in place is decided by its host passing
 * `onStartInlineRename`, so every host of `FolderCard` needs the same
 * block of wiring. It lives here rather than in each of them: the drive
 * home was left behind on the first pass precisely because the wiring was
 * copied rather than shared, and the same right-click meant two different
 * things depending on which screen you were on.
 */
export function useFolderCardRename(
  driveName: string,
  onRenamed: () => void,
): FolderCardRenameApi {
  const tShortcuts = useTranslations("shortcuts");
  const rename = useInlineRename(onRenamed);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const handleCommit = useCallback(
    (next: string) => {
      const path = rename.editingPath;
      if (path === null) return Promise.resolve();
      return rename.commit(
        () => renameFolder(driveName, path, next),
        siblingPath(path, next),
      );
    },
    [rename, driveName],
  );

  // Registered only while a card holds focus, so the tree pane's own F2
  // context cannot be shadowed by this one sitting on the stack.
  useShortcuts(
    "folder-cards",
    tShortcuts("folderCards"),
    [
      {
        key: "f2",
        label: tShortcuts("rename"),
        handler: () => {
          if (focusedPath !== null) rename.start(focusedPath);
        },
      },
    ],
    focusedPath !== null,
  );

  const cardProps = useCallback(
    (folder: Folder) => ({
      isEditing: rename.editingPath === folder.path,
      onRenameCommit: handleCommit,
      onRenameCancel: rename.cancel,
      onCardFocus: () => setFocusedPath(folder.path),
      onCardBlur: () =>
        setFocusedPath((prev) => (prev === folder.path ? null : prev)),
    }),
    [rename.editingPath, rename.cancel, handleCommit],
  );

  return { error: rename.error, start: rename.start, cardProps };
}
