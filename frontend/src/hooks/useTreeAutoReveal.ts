"use client";

import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import type { FlatTreeRow } from "@/components/folder/FolderTreeRow";

interface UseTreeAutoRevealArgs {
  /** Flat list backing the virtualizer (same array indices). */
  flatList: FlatTreeRow[];
  /** The virtualizer instance — used for `scrollToIndex`. */
  virtualizer: Pick<
    Virtualizer<HTMLDivElement, Element>,
    "scrollToIndex"
  >;
  /** The tree's scrollable container — used to read viewport metrics. */
  scrollElement: HTMLDivElement | null;
  /** Currently selected folder path, or null when a file is open. */
  selectedPath: string | null | undefined;
  /** Currently selected file id, or null when no file is open. */
  selectedFileId: string | null | undefined;
  /** Fixed row height assumed by the virtualizer. */
  rowHeight: number;
}

function buildKey(
  selectedFileId: string | null | undefined,
  selectedPath: string | null | undefined,
): string | null {
  if (selectedFileId) return `file:${selectedFileId}`;
  if (selectedPath !== undefined && selectedPath !== null) {
    return `folder:${selectedPath}`;
  }
  return null;
}

function findRowIndex(
  flatList: FlatTreeRow[],
  selectedFileId: string | null | undefined,
  selectedPath: string | null | undefined,
): number {
  if (selectedFileId) {
    return flatList.findIndex(
      (row) => row.node.kind === "file" && row.node.file_id === selectedFileId,
    );
  }
  if (selectedPath !== undefined && selectedPath !== null) {
    return flatList.findIndex(
      (row) => row.node.kind === "folder" && row.node.path === selectedPath,
    );
  }
  return -1;
}

/**
 * Auto-scroll the folder tree so the currently selected row is visible
 * after the user navigates from outside the tree (clicking a file in
 * the right pane, hitting a `?file=` link, …).
 *
 * Design constraints (see the brainstorm thread):
 *
 * - **Off-screen only.** Only scroll when the row is fully out of the
 *   viewport; if it's partially visible we leave the user's scroll
 *   position alone.
 * - **Smooth.** Use `behavior: "smooth"` and `align: "center"` so the
 *   reveal reads as a deliberate jump, not a snap.
 * - **No re-fire on echo.** A clicked tree row updates the URL, which
 *   re-flows back into `selectedPath`/`selectedFileId`. Tracking the
 *   last revealed selection key prevents the hook from chasing its
 *   own tail (and from re-scrolling on unrelated re-renders).
 * - **No ancestor expansion.** The tree is the user's hand-built map
 *   after the initial mount (`useInitialReveal`, hako
 *   `1m4EhzyjWms6nUimi_0sO`). If the target row isn't in `flatList`
 *   because an ancestor is collapsed, we wait — the moment the user
 *   expands and the row appears, the effect runs again and reveals it.
 */
export function useTreeAutoReveal({
  flatList,
  virtualizer,
  scrollElement,
  selectedPath,
  selectedFileId,
  rowHeight,
}: UseTreeAutoRevealArgs): void {
  const lastRevealedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scrollElement) return;

    const key = buildKey(selectedFileId, selectedPath);
    if (!key) {
      lastRevealedKeyRef.current = null;
      return;
    }

    const index = findRowIndex(flatList, selectedFileId, selectedPath);
    if (index < 0) {
      // Ancestor collapsed; wait for the row to appear without marking
      // this key as revealed.
      return;
    }

    if (lastRevealedKeyRef.current === key) return;
    lastRevealedKeyRef.current = key;

    const rowTop = index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    const viewportTop = scrollElement.scrollTop;
    const viewportBottom = viewportTop + scrollElement.clientHeight;

    const fullyAbove = rowBottom <= viewportTop;
    const fullyBelow = rowTop >= viewportBottom;
    if (!fullyAbove && !fullyBelow) return;

    virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
  }, [
    flatList,
    selectedFileId,
    selectedPath,
    scrollElement,
    virtualizer,
    rowHeight,
  ]);
}
