"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/Button";
import { FileContextMenu } from "@/components/FileContextMenu";
import { FolderContextMenu } from "@/components/FolderContextMenu";
import { useCreateFile } from "@/hooks/useCreateFile";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useFolderTreeQuery } from "@/hooks/useFolderTreeQuery";
import { useTreeIncludeFiles } from "@/hooks/useTreeIncludeFiles";
import { useInitialReveal } from "@/hooks/useInitialReveal";
import { useInlineRename } from "@/hooks/useInlineRename";
import { useIsInternalDragging } from "@/hooks/useIsInternalDragging";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useSpringLoadedExpand } from "@/hooks/useSpringLoadedExpand";
import { useTreeAutoReveal } from "@/hooks/useTreeAutoReveal";
import { useTreeExpansion } from "@/hooks/useTreeExpansion";
import { useTreeTextFilter } from "@/hooks/useTreeTextFilter";
import { useTreeKindFilter } from "@/hooks/useTreeKindFilter";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";

// Structure only. The tree deliberately ignores content writes: the
// Markdown editor autosaves on a 2s debounce, and refetching the tree on
// every keystroke pause would make it flicker while the user types.
const TREE_STRUCTURE_EVENTS = ["drive.structure_changed"];
import {
  buildFilteredRows,
  computeMatchTables,
  groupByParent,
  type FilteredTreeRow,
} from "@/lib/treeFilterTransform";
import { renameFile, renameFolder } from "@/lib/api";
import { siblingPath } from "@/lib/filename";
import type { FileItem, Folder, FolderTreeNode } from "@/types";

import { FilterField } from "./FilterField";
import { FolderTreeRow, type FlatTreeRow } from "./FolderTreeRow";
import { usePinnedFolders } from "./usePinnedFolders";

interface FolderTreePaneProps {
  drive: string;
  selectedPath?: string | null;
  selectedFileId?: string | null;
  /** The tree itself is never re-shaped by this value. */
  currentFolderPath?: string;
  onSelectFolder: (path: string) => void;
  onSelectFile: (fileId: string, path: string) => void;
  externalRefreshKey?: number;
}

const ROW_HEIGHT = 32;

function buildFlatList(
  rootNodes: FolderTreeNode[],
  childrenByPath: Map<string, FolderTreeNode[]>,
  expanded: Set<string>,
  loading: Set<string>,
): FlatTreeRow[] {
  const result: FlatTreeRow[] = [];
  // The drive root may be served as a flat list (when the tree filter
  // is on), so a toggled-off filter could leak deep nodes into the
  // unfiltered view.
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
  const paths = new Set<string>([""]);
  for (const path of expanded) paths.add(path);
  return paths;
}

function nodeToFolder(node: Extract<FolderTreeNode, { kind: "folder" }>): Folder {
  return {
    name: node.name,
    path: node.path,
    file_count: node.file_count,
    kind_counts: {},
    dominant_kind: null,
  };
}

/**
 * The menu only reads `id`, `filename`, `drive`, `folder_path` for its
 * mutating actions; the rest are safe defaults.
 */
function nodeToFile(
  node: Extract<FolderTreeNode, { kind: "file" }>,
  drive: string,
): FileItem {
  const folderPath = node.path.includes("/")
    ? node.path.split("/").slice(0, -1).join("/")
    : "";
  return {
    id: node.file_id,
    filename: node.name,
    title: node.name,
    description: "",
    drive,
    folder_path: folderPath,
    file_type: node.file_type,
    mime_type: node.mime_type,
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 0,
    duration: null,
    image_width: null,
    image_height: null,
    liked_at: null,
    // Display placeholder: this stand-in never grounds an answer (Ask
    // filters server-side) and never mounts the trust control, so it
    // follows core's column default rather than inventing a tier.
    trust_tier: "verified" as const,
    trust_reviewed_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "",
    updated_at: "",
  };
}

export function FolderTreePane({
  drive,
  selectedPath,
  selectedFileId,
  currentFolderPath,
  onSelectFolder,
  onSelectFile,
  externalRefreshKey,
}: FolderTreePaneProps) {
  const t = useTranslations("tree");
  const tFilter = useTranslations("filter");
  const tShortcuts = useTranslations("shortcuts");
  const expansion = useTreeExpansion(drive);
  const { filter, setFilter } = useTreeKindFilter(drive);
  const text = useTreeTextFilter(drive, true);
  const { pinnedPaths, handleTogglePin } = usePinnedFolders(drive);

  const filterActive = text.debouncedText.length > 0 || filter !== null;

  // The URL location never re-shapes the tree. The hook is a no-op kept in
  // place so reviving auto-expansion is a single-file change there.
  useInitialReveal(currentFolderPath, expansion.expand);

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useWebSocketRefresh(TREE_STRUCTURE_EVENTS, refresh, drive);

  const prevExternalKeyRef = useRef(externalRefreshKey ?? 0);
  useEffect(() => {
    const key = externalRefreshKey ?? 0;
    if (key !== prevExternalKeyRef.current) {
      prevExternalKeyRef.current = key;
      refresh();
    }
  }, [externalRefreshKey, refresh]);

  const pathsToLoad = useMemo(
    () => gatherPathsToLoad(expansion.expanded),
    [expansion.expanded],
  );
  const { includeFiles, setIncludeFiles } = useTreeIncludeFiles(drive);
  const { childrenByPath, loading } = useFolderTreeQuery({
    drive,
    typeFilter: filter,
    pathsToLoad,
    flatLoad: filterActive,
    includeFiles,
    refreshKey,
  });

  const { createFile } = useCreateFile(drive, "");

  // `useDragAndDrop` reports the drop target, and the spring-load hook
  // consumes it — but the spring-load hook also needs the drag state that
  // `useDragAndDrop` produces. The indirection breaks that cycle; the
  // report only ever fires on a user drop, long after mount effects have
  // filled the ref.
  const notifyDropRef = useRef<(targetPath: string) => void>(() => {});
  const reportDropTarget = useCallback(
    (targetPath: string) => notifyDropRef.current(targetPath),
    [],
  );

  const dnd = useDragAndDrop({
    drive,
    selectedIds: useMemo(() => new Set<string>(), []),
    onComplete: refresh,
    onDropTarget: reportDropTarget,
  });
  const draggedFolderPath = dnd.dragState.draggedFolderPath;
  const draggedFileIds = dnd.dragState.draggedFileIds;

  const isInternalDragging = useIsInternalDragging();

  // Both context menus are always mounted. Conditionally rendering them would
  // unmount the dialog state (renameOpen / moveOpen / ...) the moment the
  // outer ContextMenu calls onClose right before invoking the menu item's
  // handler, swallowing the click.
  const [menuRow, setMenuRow] = useState<FlatTreeRow | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleContextMenu = useCallback(
    (row: FlatTreeRow, event: React.MouseEvent) => {
      setMenuRow(row);
      setMenuPosition({ x: event.clientX, y: event.clientY });
      setMenuOpen(true);
    },
    [],
  );

  const folderTarget =
    menuRow?.node.kind === "folder" ? nodeToFolder(menuRow.node) : null;
  const fileTarget =
    menuRow?.node.kind === "file" ? nodeToFile(menuRow.node, drive) : null;

  const rootNodes = childrenByPath.get("") ?? [];

  const filteredRows: FilteredTreeRow[] | null = useMemo(() => {
    if (!filterActive) return null;
    if (rootNodes.length === 0) return [];
    const byParent = groupByParent(rootNodes);
    const rootEntries = byParent.get("") ?? rootNodes;
    const tables = computeMatchTables(rootNodes, text.debouncedText);
    return buildFilteredRows(rootEntries, byParent, tables);
  }, [filterActive, rootNodes, text.debouncedText]);

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

  // While the filter is active the visible list is built from
  // `filteredRows` and ignores the expansion set entirely, so auto-expanding
  // there would change nothing on screen while quietly mutating persisted
  // state.
  const isSpringLoadable = useCallback(
    (path: string) => {
      if (filterActive) return false;
      if (expansion.expanded.has(path)) return false;
      const row = flatList.find((r) => r.node.path === path);
      return row?.node.kind === "folder" && row.node.has_children;
    },
    [filterActive, expansion.expanded, flatList],
  );

  const spring = useSpringLoadedExpand({
    // Cross-pane drags never set this instance's `isDragging` (the drag
    // started on the right pane's hook), but their dragenter still lands
    // on tree rows, so the shared signal is the one to gate on.
    isDragging: dnd.dragState.isDragging || isInternalDragging,
    dropTargetPath: dnd.dragState.dropTargetPath,
    isSpringLoadable,
    expand: expansion.expand,
    collapseMany: expansion.collapseMany,
  });
  useEffect(() => {
    notifyDropRef.current = spring.notifyDrop;
  }, [spring.notifyDrop]);

  const rename = useInlineRename(refresh);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const handleRenameCommit = useCallback(
    (next: string) => {
      const row = flatList.find((r) => r.node.path === rename.editingPath);
      if (!row) return Promise.resolve();
      const node = row.node;
      return rename.commit(
        () =>
          node.kind === "folder"
            ? renameFolder(drive, node.path, next)
            : renameFile(node.file_id, next),
        siblingPath(node.path, next),
      );
    },
    [flatList, rename, drive],
  );

  // Registered only while a row holds focus, so the right pane's own F2
  // context cannot be shadowed by this one sitting on the stack.
  useShortcuts(
    "folder-tree",
    tShortcuts("folderTree"),
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => flatList[index]?.node.path ?? index,
  });

  useTreeAutoReveal({
    flatList,
    virtualizer,
    scrollElement: scrollRef.current,
    selectedPath,
    selectedFileId,
    rowHeight: ROW_HEIGHT,
  });

  const handleSelect = (row: FlatTreeRow) => {
    if (row.node.kind === "folder") {
      onSelectFolder(row.node.path);
    } else {
      onSelectFile(row.node.file_id, row.node.path);
    }
  };

  const handleToggle = (row: FlatTreeRow) => {
    if (row.node.kind === "folder") {
      expansion.toggle(row.node.path);
    }
  };

  // While a filter is active the visible list mixes ancestor-context rows
  // with matched rows; dragging in that mode would be ambiguous. Drop
  // targets stay live.
  const handleRowDragStart = useCallback(
    (row: FlatTreeRow, event: React.DragEvent) => {
      if (filterActive) return;
      if (row.node.kind === "file") {
        dnd.handleDragStart(event, row.node.file_id);
      } else {
        dnd.handleFolderDragStart(event, row.node.path);
      }
    },
    [dnd, filterActive],
  );

  const computeDropTargetProps = useCallback(
    (row: FlatTreeRow) => {
      // Drop handlers are wired ONLY while a drag is in progress.
      // Permanently attaching dragenter/dragover/dragleave/drop to the
      // same element that is also a draggable source confuses the
      // browser's drag-intent detection — the source element never
      // initiates dragstart.
      if (!dnd.dragState.isDragging && !isInternalDragging) return null;
      if (row.node.kind !== "folder") return null;
      if (dnd.isDropDisabled(row.node.path)) return null;
      return dnd.getDropTargetProps(row.node.path);
    },
    [dnd, isInternalDragging],
  );

  const isRowDragSource = useCallback(
    (row: FlatTreeRow) => {
      if (row.node.kind === "folder") {
        return draggedFolderPath === row.node.path;
      }
      return draggedFileIds.includes(row.node.file_id);
    },
    [draggedFolderPath, draggedFileIds],
  );

  const rootDropProps =
    (dnd.dragState.isDragging || isInternalDragging) && !dnd.isDropDisabled("")
      ? dnd.getDropTargetProps("")
      : null;
  const rootDropHover = dnd.isDropTarget("");

  const isRootLoading = loading.has("") && !childrenByPath.has("");
  const isEmpty = !isRootLoading && flatList.length === 0;
  const isFilterEmpty = filterActive && isEmpty;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filter, drive]);

  const handleClear = () => {
    text.clear();
    setFilter(null);
  };

  return (
    <div className="relative flex h-full flex-col border-r border-bg-border bg-bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-shrink-0 text-[11px] font-semibold text-text-muted">
          {t("paneHeading")}
        </span>
        <div className="min-w-0 flex-1">
          <FilterField
            variant="underline"
            text={text.text}
            onTextChange={(next) => text.setText(next)}
            placeholder={tFilter("placeholder.treeSearch")}
            typeFilter={filter}
            onTypeFilterChange={setFilter}
          />
        </div>
      </div>
      {/* Overlayed so showing it during dragstart does not reflow the tree
          rows and cancel the native drag gesture. */}
      {(dnd.dragState.isDragging || isInternalDragging) && rootDropProps && (
        <div
          {...rootDropProps}
          aria-label={t("dropToRoot")}
          className={`absolute left-2 right-2 top-[52px] z-20 rounded-lg border border-dashed px-2 py-1.5 text-xs shadow-card transition-colors ${
            rootDropHover
              ? "border-accent bg-accent/10 text-text-primary"
              : "border-bg-border bg-bg-card/95 text-text-muted"
          }`}
        >
          {t("dropToRoot")}
        </div>
      )}
      <FolderContextMenu
        open={menuOpen && folderTarget !== null}
        position={menuPosition}
        target={folderTarget}
        drive={drive}
        isPinned={folderTarget ? pinnedPaths.has(folderTarget.path) : false}
        onTogglePin={
          folderTarget ? () => handleTogglePin(folderTarget.path) : undefined
        }
        onUpdate={refresh}
        onClose={closeMenu}
        onOpen={folderTarget ? () => onSelectFolder(folderTarget.path) : undefined}
        onCreateFileHere={
          folderTarget
            ? () => {
                void createFile(folderTarget.path);
              }
            : undefined
        }
        onCreateFolderHere={folderTarget ? refresh : undefined}
        onStartInlineRename={
          folderTarget ? () => rename.start(folderTarget.path) : undefined
        }
      />
      <FileContextMenu
        open={menuOpen && fileTarget !== null}
        position={menuPosition}
        target={fileTarget}
        onClose={closeMenu}
        onUpdate={refresh}
        onOpenInNewTab={
          fileTarget
            ? () => {
                window.open(`/files/${fileTarget.id}`, "_blank");
              }
            : undefined
        }
        onStartInlineRename={
          menuRow && fileTarget
            ? () => rename.start(menuRow.node.path)
            : undefined
        }
      />
      {rename.error && (
        <div
          role="alert"
          className="absolute left-2 right-2 top-[52px] z-30 rounded-lg bg-danger px-2 py-1.5 text-xs text-white shadow-card"
        >
          {rename.error}
        </div>
      )}
      <div ref={scrollRef} className="scrollbar-hover flex-1 overflow-y-auto py-2">
        {isRootLoading ? (
          <div className="px-3 py-4 text-xs text-text-muted">{t("loading")}</div>
        ) : isFilterEmpty ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4 text-xs text-text-muted">
            <p>{tFilter(includeFiles ? "empty.treeWithFiles" : "empty.tree")}</p>
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
                    isEditing={rename.editingPath === row.node.path}
                    onRenameCommit={handleRenameCommit}
                    onRenameCancel={rename.cancel}
                    onRowFocus={() => setFocusedPath(row.node.path)}
                    onRowBlur={() =>
                      setFocusedPath((prev) =>
                        prev === row.node.path ? null : prev,
                      )
                    }
                    onSelect={handleSelect}
                    onToggle={handleToggle}
                    onContextMenu={handleContextMenu}
                    onDragStart={filterActive ? undefined : handleRowDragStart}
                    onDragEnd={dnd.handleDragEnd}
                    dropTargetProps={computeDropTargetProps(row)}
                    isDragSource={isRowDragSource(row)}
                    isDropHover={
                      row.node.kind === "folder" &&
                      dnd.isDropTarget(row.node.path)
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 border-t border-bg-border px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={includeFiles}
          onClick={() => setIncludeFiles(!includeFiles)}
          className="w-full justify-start"
        >
          {includeFiles ? <Check size={14} /> : <span className="w-3.5" />}
          {t("includeFiles")}
        </Button>
      </div>
    </div>
  );
}
