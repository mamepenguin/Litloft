"use client";

import { useCallback, useEffect, useState } from "react";

import { getFolderTree } from "@/lib/api";
import type { BrowseNode } from "@/lib/folderBrowse";

interface Level {
  drive: string;
  path: string;
}

export interface FolderBrowse {
  /** The browsed folder ("" is the drive root), or null outside browse mode. */
  path: string | null;
  /** The browsed folder's direct children; empty until they arrive. */
  nodes: readonly BrowseNode[];
  loading: boolean;
  enter: (path: string) => void;
  /** One level up; from the drive root, out of browse mode. */
  up: () => void;
  leave: () => void;
}

const NO_NODES: BrowseNode[] = [];

function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/**
 * The level is kept with its drive and only counts while that is still the
 * current drive, so a drive switch leaves browse mode before anything else
 * renders.
 */
export function useFolderBrowse(
  open: boolean,
  drive: string | null,
  available: boolean,
): FolderBrowse {
  const [level, setLevel] = useState<Level | null>(null);
  const [loaded, setLoaded] = useState<(Level & { nodes: BrowseNode[] }) | null>(null);

  const current =
    open && available && drive !== null && level !== null && level.drive === drive ? level : null;

  useEffect(() => {
    if (!open || !available) setLevel(null);
  }, [open, available]);
  useEffect(() => {
    setLevel(null);
  }, [drive]);

  const currentDrive = current?.drive ?? null;
  const currentPath = current?.path ?? null;
  useEffect(() => {
    if (currentDrive === null || currentPath === null) return;
    const ctrl = new AbortController();
    const done = (nodes: BrowseNode[]) => {
      if (!ctrl.signal.aborted) setLoaded({ drive: currentDrive, path: currentPath, nodes });
    };
    getFolderTree(currentDrive, { root: currentPath, include_files: true }, { signal: ctrl.signal })
      .then((nodes) => done(nodes as BrowseNode[]))
      .catch(() => done([]));
    return () => ctrl.abort();
  }, [currentDrive, currentPath]);

  const enter = useCallback(
    (path: string) => {
      if (drive !== null) setLevel({ drive, path });
    },
    [drive],
  );
  const up = useCallback(() => {
    setLevel((prev) => (prev === null || prev.path === "" ? null : { ...prev, path: parentOf(prev.path) }));
  }, []);
  const leave = useCallback(() => setLevel(null), []);

  const arrived =
    current !== null && loaded !== null && loaded.drive === current.drive && loaded.path === current.path;

  return {
    path: current?.path ?? null,
    nodes: arrived ? loaded.nodes : NO_NODES,
    loading: current !== null && !arrived,
    enter,
    up,
    leave,
  };
}
