"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

import { useFolderTreeQuery } from "@/hooks/useFolderTreeQuery";
import { useTreeExpansion } from "@/hooks/useTreeExpansion";
import { useTreeTypeFilter } from "@/hooks/useTreeTypeFilter";
import type { FolderTreeNode, TreeTypeFilter } from "@/types";

import { FolderTreeRow, type FlatTreeRow } from "./FolderTreeRow";
import { TypeFilterChips } from "./TypeFilterChips";

interface FolderTreePaneProps {
  drive: string;
  /**
   * Currently selected node path. Folders highlight when their `path`
   * matches; files use their full file path. Used for visual highlight
   * only — selection itself is owned by the URL state hook upstream.
   */
  selectedPath?: string | null;
  onSelectFolder: (path: string) => void;
  onSelectFile: (fileId: string, path: string) => void;
}

const ROW_HEIGHT = 28;

function buildFlatList(
  rootNodes: FolderTreeNode[],
  childrenByPath: Map<string, FolderTreeNode[]>,
  expanded: Set<string>,
  loading: Set<string>,
): FlatTreeRow[] {
  const result: FlatTreeRow[] = [];
  const walk = (nodes: FolderTreeNode[], depth: number) => {
    for (const node of nodes) {
      const isFolder = node.kind === "folder";
      const isExpanded = isFolder && expanded.has(node.path);
      const isLoading = isFolder && loading.has(node.path) && !childrenByPath.has(node.path);
      result.push({ node, depth, isExpanded, isLoading });
      if (isFolder && isExpanded) {
        const children = childrenByPath.get(node.path);
        if (children) walk(children, depth + 1);
      }
    }
  };
  walk(rootNodes, 0);
  return result;
}

function gatherPathsToLoad(expanded: Set<string>): Set<string> {
  // Always load root ("") plus every expanded folder path.
  const paths = new Set<string>([""]);
  for (const path of expanded) paths.add(path);
  return paths;
}

export function FolderTreePane({
  drive,
  selectedPath,
  onSelectFolder,
  onSelectFile,
}: FolderTreePaneProps) {
  const t = useTranslations("tree");
  const expansion = useTreeExpansion(drive);
  const { filter, setFilter } = useTreeTypeFilter(drive);

  const pathsToLoad = useMemo(() => gatherPathsToLoad(expansion.expanded), [expansion.expanded]);
  const { childrenByPath, loading } = useFolderTreeQuery({
    drive,
    typeFilter: filter,
    pathsToLoad,
  });

  const rootNodes = childrenByPath.get("") ?? [];
  const flatList = useMemo(
    () => buildFlatList(rootNodes, childrenByPath, expansion.expanded, loading),
    [rootNodes, childrenByPath, expansion.expanded, loading],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => flatList[index]?.node.path ?? index,
  });

  const handleSelect = (row: FlatTreeRow) => {
    if (row.node.kind === "folder") {
      expansion.toggle(row.node.path);
      onSelectFolder(row.node.path);
    } else {
      onSelectFile(row.node.file_id, row.node.path);
    }
  };

  const isRootLoading = loading.has("") && !childrenByPath.has("");
  const isEmpty = !isRootLoading && flatList.length === 0;

  // When typeFilter changes, the cache is dropped upstream. Surface the
  // root-level fetch state explicitly so the user sees feedback.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filter, drive]);

  return (
    <div className="flex h-full flex-col border-r border-bg-border bg-bg-sidebar">
      <TypeFilterChips filter={filter} onChange={(f: TreeTypeFilter | null) => setFilter(f)} />
      <div ref={scrollRef} className="scrollbar-hover flex-1 overflow-y-auto">
        {isRootLoading ? (
          <div className="px-3 py-4 text-xs text-text-muted">{t("loading")}</div>
        ) : isEmpty ? (
          <div className="px-3 py-4 text-xs text-text-muted">{t("empty")}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = flatList[virtualRow.index];
              if (!row) return null;
              const rowPath = row.node.kind === "folder" ? row.node.path : row.node.path;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FolderTreeRow
                    row={row}
                    selected={selectedPath === rowPath}
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
