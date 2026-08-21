"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Finder's spring-loading dwell. Long enough that sweeping a drag across
 * a tree opens nothing, short enough to feel like a reaction.
 */
export const SPRING_LOAD_DELAY_MS = 600;

export interface UseSpringLoadedExpandOptions {
  /**
   * The single row the drag is currently hovering, straight from
   * `useDragAndDrop`'s `dragState`. Its enter/leave bookkeeping already
   * guarantees at most one, and it can only ever hold a folder path or
   * `""` for the drive-root band — non-folder and drop-disabled rows
   * never receive drop handlers, so they cannot appear here.
   */
  dropTargetPath: string | null;
  isDragging: boolean;
  /** True for a folder that is worth opening: has children, not already open. */
  isSpringLoadable: (path: string) => boolean;
  expand: (path: string) => void;
  collapseMany: (paths: Iterable<string>) => void;
  delayMs?: number;
}

export interface SpringLoadedExpandApi {
  /**
   * Wire to `useDragAndDrop`'s `onDropTarget`. Must be called while the
   * drag is still live — the collapse-back runs as soon as `isDragging`
   * goes false, which is the same commit the drop triggers.
   */
  notifyDrop: (targetPath: string) => void;
}

/** True when `candidate` is `path` itself or an ancestor folder of it. */
function isSelfOrAncestorOf(candidate: string, path: string): boolean {
  return path === candidate || path.startsWith(candidate + "/");
}

/**
 * Expand a folder the drag has dwelt on, and undo it afterwards.
 *
 * Passing over a folder is not an instruction to reshape the tree, so
 * branches opened this way close again when the drag ends — everything
 * except the drop target's own chain, which stays open so the user can
 * see where the items landed. Branches the user had already opened are
 * never tracked here and so are never touched.
 */
export function useSpringLoadedExpand({
  dropTargetPath,
  isDragging,
  isSpringLoadable,
  expand,
  collapseMany,
  delayMs = SPRING_LOAD_DELAY_MS,
}: UseSpringLoadedExpandOptions): SpringLoadedExpandApi {
  const springOpenedRef = useRef<Set<string>>(new Set());
  const dropPathRef = useRef<string | null>(null);

  // Read the callbacks through refs so the dwell timer restarts only when
  // the hovered row actually changes. `isSpringLoadable` closes over the
  // expansion set and would otherwise re-arm on every render, meaning the
  // dwell could never complete.
  const isSpringLoadableRef = useRef(isSpringLoadable);
  const expandRef = useRef(expand);
  useEffect(() => {
    isSpringLoadableRef.current = isSpringLoadable;
    expandRef.current = expand;
  });

  useEffect(() => {
    if (!isDragging) return;
    // `""` is the drive-root drop band, which has no disclosure to open.
    if (dropTargetPath === null || dropTargetPath === "") return;
    if (!isSpringLoadableRef.current(dropTargetPath)) return;

    const timer = setTimeout(() => {
      springOpenedRef.current.add(dropTargetPath);
      expandRef.current(dropTargetPath);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [dropTargetPath, isDragging, delayMs]);

  useEffect(() => {
    if (isDragging) return;
    const opened = springOpenedRef.current;
    if (opened.size === 0) return;

    const dropPath = dropPathRef.current;
    const toCollapse = [...opened].filter(
      (path) => dropPath === null || !isSelfOrAncestorOf(path, dropPath),
    );

    springOpenedRef.current = new Set();
    dropPathRef.current = null;
    collapseMany(toCollapse);
  }, [isDragging, collapseMany]);

  const notifyDrop = useCallback((targetPath: string) => {
    dropPathRef.current = targetPath;
  }, []);

  return { notifyDrop };
}
