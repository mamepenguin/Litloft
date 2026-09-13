"use client";

import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import type { FlatTreeRow } from "@/components/folder/FolderTreeRow";

interface UseTreeAutoRevealArgs {
  flatList: FlatTreeRow[];
  virtualizer: Pick<
    Virtualizer<HTMLDivElement, Element>,
    "scrollToIndex"
  >;
  scrollElement: HTMLDivElement | null;
  selectedPath: string | null | undefined;
  selectedFileId: string | null | undefined;
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
 * - **No re-fire on echo.** A clicked tree row updates the URL, which
 *   re-flows back into `selectedPath`/`selectedFileId`. Tracking the
 *   last revealed selection key prevents the hook from chasing its
 *   own tail.
 * - **No ancestor expansion.** The tree is the user's hand-built map.
 *   If the target row isn't in `flatList` because an ancestor is
 *   collapsed, we wait — the moment the user expands and the row
 *   appears, the effect runs again and reveals it.
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
