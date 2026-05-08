"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

import { useFolderTreeQuery } from "@/hooks/useFolderTreeQuery";
import { useTreeExpansion } from "@/hooks/useTreeExpansion";
import { useTreeTextFilter } from "@/hooks/useTreeTextFilter";
import { useTreeTypeFilter } from "@/hooks/useTreeTypeFilter";
import {
  buildFilteredRows,
  computeMatchTables,
  groupByParent,
  type FilteredTreeRow,
} from "@/lib/treeFilterTransform";
import type { FolderTreeNode } from "@/types";

import { FilterField } from "./FilterField";
import { FolderTreeRow, type FlatTreeRow } from "./FolderTreeRow";

interface FolderTreePaneProps {
  drive: string;
  /**
   * Currently selected folder path. Used to highlight the matching
   * folder row. Selection itself is owned by the URL state hook
   * upstream.
   */
  selectedPath?: string | null;
  /**
   * Currently selected file id. When set, the matching file row is
   * highlighted instead of any folder.
   */
  selectedFileId?: string | null;
  /**
   * Current folder path the user is browsing (URL path). The tree
   * automatically expands all ancestors so the user's location is
   * always visible.
   */
  currentFolderPath?: string;
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
  // The drive root may be served as a flat list (when the tree filter
  // is on); ensure we only walk genuine root-level entries here so a
  // toggled-off filter doesn't leak deep nodes into the unfiltered
  // view.
  const trueRoots = rootNodes.filter((n) => !n.path.includes("/"));
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
  walk(trueRoots, 0);
  return result;
}

function gatherPathsToLoad(expanded: Set<string>): Set<string> {
  // Lazy-load mode: the root ("") plus every expanded folder path. The
  // filter-active path runs through `flatLoad` instead and bypasses
  // this helper entirely.
  const paths = new Set<string>([""]);
  for (const path of expanded) paths.add(path);
  return paths;
}

export function FolderTreePane({
  drive,
  selectedPath,
  selectedFileId,
  currentFolderPath,
  onSelectFolder,
  onSelectFile,
}: FolderTreePaneProps) {
  const t = useTranslations("tree");
  const tFilter = useTranslations("filter");
  const expansion = useTreeExpansion(drive);
  const { filter, setFilter } = useTreeTypeFilter(drive);
  const text = useTreeTextFilter(drive, true);

  const filterActive = text.debouncedText.length > 0 || filter !== null;

  // Expand every ancestor (and the leaf itself) of the active folder so
  // the user's URL location is always visible. Topic 2 補遺.
  const expandRef = useRef(expansion.expand);
  expandRef.current = expansion.expand;
  useEffect(() => {
    if (!currentFolderPath) return;
    const parts = currentFolderPath.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      expandRef.current(parts.slice(0, i).join("/"));
    }
  }, [currentFolderPath]);

  const pathsToLoad = useMemo(
    () => gatherPathsToLoad(expansion.expanded),
    [expansion.expanded],
  );
  const { childrenByPath, loading } = useFolderTreeQuery({
    drive,
    typeFilter: filter,
    pathsToLoad,
    flatLoad: filterActive,
  });

  const rootNodes = childrenByPath.get("") ?? [];

  const filteredRows: FilteredTreeRow[] | null = useMemo(() => {
    if (!filterActive) return null;
    if (rootNodes.length === 0) return [];
    // When the filter is active the backend is asked for the full tree;
    // group it by parent path so we can walk the hierarchy without
    // further round-trips.
    const byParent = groupByParent(rootNodes);
    // Distinguish nodes that arrived nested vs. flat. A flat response
    // has `path` strings with deeper segments, so grouping pulls the
    // root entries into the empty-string bucket and everything else
    // under their parents.
    const rootEntries = byParent.get("") ?? rootNodes;
    const tables = computeMatchTables(rootNodes, text.debouncedText, filter);
    return buildFilteredRows(rootEntries, byParent, tables);
  }, [filterActive, rootNodes, text.debouncedText, filter]);

  const flatList = useMemo(() => {
    if (filteredRows) {
      return filteredRows.map<FlatTreeRow>((row) => ({
        node: row.node,
        depth: row.depth,
        isExpanded: row.isExpanded,
        isLoading: row.isLoading,
        isAncestor: row.isAncestor,
      }));
    }
    return buildFlatList(rootNodes, childrenByPath, expansion.expanded, loading);
  }, [filteredRows, rootNodes, childrenByPath, expansion.expanded, loading]);

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
  const isFilterEmpty = filterActive && isEmpty;

  // When typeFilter changes, the cache is dropped upstream. Surface the
  // root-level fetch state explicitly so the user sees feedback.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filter, drive]);

  const handleClear = () => {
    text.clear();
    setFilter(null);
  };

  return (
    <div className="flex h-full flex-col border-r border-bg-border bg-bg-sidebar">
      <FilterField
        text={text.text}
        onTextChange={(next) => text.setText(next)}
        placeholder={tFilter("placeholder.tree")}
        typeFilter={filter}
        onTypeFilterChange={setFilter}
        onClear={handleClear}
      />
      <div ref={scrollRef} className="scrollbar-hover flex-1 overflow-y-auto">
        {isRootLoading ? (
          <div className="px-3 py-4 text-xs text-text-muted">{t("loading")}</div>
        ) : isFilterEmpty ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4 text-xs text-text-muted">
            <p>{tFilter("empty.tree")}</p>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-2xl border border-bg-border bg-bg-card px-3 py-1 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
            >
              {tFilter("clear")}
            </button>
          </div>
        ) : isEmpty ? (
          <div className="px-3 py-4 text-xs text-text-muted">{t("empty")}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = flatList[virtualRow.index];
              if (!row) return null;
              const isSelected =
                row.node.kind === "file"
                  ? selectedFileId != null && row.node.file_id === selectedFileId
                  : selectedPath != null && selectedPath === row.node.path;
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
                    selected={isSelected}
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
