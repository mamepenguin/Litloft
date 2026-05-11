"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { FileContextMenu } from "@/components/FileContextMenu";
import { FolderContextMenu } from "@/components/FolderContextMenu";
import { useCreateFile } from "@/hooks/useCreateFile";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useFolderTreeQuery } from "@/hooks/useFolderTreeQuery";
import { useInitialReveal } from "@/hooks/useInitialReveal";
import { useTreeAutoReveal } from "@/hooks/useTreeAutoReveal";
import { useTreeExpansion } from "@/hooks/useTreeExpansion";
import { useTreeTextFilter } from "@/hooks/useTreeTextFilter";
import { useTreeTypeFilter } from "@/hooks/useTreeTypeFilter";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";

/**
 * WS events that imply the folder tree's shape may have changed. The
 * right pane subscribes to the same set inside `useFolderFiles`.
 */
const TREE_STRUCTURE_EVENTS = [
  "files.created",
  "files.moved",
  "files.deleted",
  "files.restored",
  "files.recovered",
  "files.purged",
  "folders.created",
  "folders.deleted",
  "folders.moved",
  "scan.complete",
];
import {
  buildFilteredRows,
  computeMatchTables,
  groupByParent,
  type FilteredTreeRow,
} from "@/lib/treeFilterTransform";
import type { FileItem, Folder, FolderTreeNode } from "@/types";

import { FilterField } from "./FilterField";
import { FolderTreeRow, type FlatTreeRow } from "./FolderTreeRow";
import { usePinnedFolders } from "./usePinnedFolders";

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

const ROW_HEIGHT = 32;

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

/**
 * Build a minimal {@link Folder} from a tree node so the existing
 * {@link FolderContextMenu} can mutate it without us touching its
 * surface. Fields the menu does not consume (`thumbnail_file_id`,
 * `dominant_kind`, full `file_count` accuracy) are stubbed.
 */
function nodeToFolder(node: Extract<FolderTreeNode, { kind: "folder" }>): Folder {
  return {
    name: node.name,
    path: node.path,
    file_count: node.file_count,
    thumbnail_file_id: null,
    dominant_kind: null,
  };
}

/**
 * Build a minimal {@link FileItem} from a tree node so the existing
 * {@link FileContextMenu} can mutate it without a metadata fetch. The
 * menu only reads `id`, `filename`, `drive`, `folder_path` for its
 * mutating actions; we leave the rest as safe defaults.
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
    likes: 0,
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
}: FolderTreePaneProps) {
  const t = useTranslations("tree");
  const tFilter = useTranslations("filter");
  const expansion = useTreeExpansion(drive);
  const { filter, setFilter } = useTreeTypeFilter(drive);
  const text = useTreeTextFilter(drive, true);
  const { pinnedPaths, handleTogglePin } = usePinnedFolders(drive);

  const filterActive = text.debouncedText.length > 0 || filter !== null;

  // Reveal-in-tree: expand ancestors of the URL location only on first
  // mount. Subsequent navigation must NOT reshape the tree — see
  // docs/superpowers/specs/2026-05-09-tree-pane-separated-interaction.md
  // and hako 1m4EhzyjWms6nUimi_0sO.
  useInitialReveal(currentFolderPath, expansion.expand);

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Auto-refresh on any structural WS event so the tree stays in sync
  // with mutations from the right pane, other clients, and the
  // scanner. Spec 2026-05-09-tree-and-pane-refresh-sync.
  useWebSocketRefresh(TREE_STRUCTURE_EVENTS, refresh);

  const pathsToLoad = useMemo(
    () => gatherPathsToLoad(expansion.expanded),
    [expansion.expanded],
  );
  const { childrenByPath, loading } = useFolderTreeQuery({
    drive,
    typeFilter: filter,
    pathsToLoad,
    flatLoad: filterActive,
    refreshKey,
  });

  // Tree-pane "new file here" creates a Markdown file at the row's path
  // (not the URL location), then navigates to the editor. The hook owns
  // its own in-flight latch so a second right-click while the first
  // request is pending is a no-op.
  const { createFile } = useCreateFile(drive, "");

  // Drag-and-drop. Tree has no multi-select UI, so we hand the hook an
  // empty selectedIds set; it degrades cleanly to single-item drags.
  // Cross-pane drops (drag a card from the right pane → drop on a tree
  // row) work via the DataTransfer fallback inside the hook, so we
  // don't need to share state with the right pane's instance.
  const dnd = useDragAndDrop({
    drive,
    selectedIds: useMemo(() => new Set<string>(), []),
    onComplete: refresh,
  });
  const draggedFolderPath = dnd.dragState.draggedFolderPath;
  const draggedFileIds = dnd.dragState.draggedFileIds;

  // Both context menus are always mounted; only `open` and `target` flip
  // when the user right-clicks a row. Conditionally rendering them would
  // unmount the dialog state (renameOpen / moveOpen / ...) the moment the
  // outer ContextMenu calls onClose right before invoking the menu item's
  // handler, swallowing the click. The right pane (FolderContent) uses the
  // same always-mounted pattern.
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

  // Auto-reveal: when the URL location changes from outside the tree
  // (file click in the right pane, deep link, …) scroll the matching
  // row into view if it is currently off-screen.
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

  // Drag wiring per row. While a filter is active the visible list mixes
  // ancestor-context rows with matched rows; dragging in that mode would
  // be ambiguous, so we disable the drag source until the filter is
  // cleared. Drop targets stay live (the user might drop a card from
  // outside the tree).
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
      // initiates dragstart. FolderContent uses the same gate (line 83)
      // and dragging works there.
      if (!dnd.dragState.isDragging) return null;
      if (row.node.kind !== "folder") return null;
      // Refuse drops onto self or onto a descendant of the dragged folder.
      if (dnd.isDropDisabled(row.node.path)) return null;
      return dnd.getDropTargetProps(row.node.path);
    },
    [dnd],
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

  // Root drop band — separate path "" so users can drop into the drive
  // root without an explicit row. Same gate as the per-row drop props:
  // only wire handlers while a drag is in progress, so they don't
  // interfere with future drag sources.
  const rootDropProps =
    dnd.dragState.isDragging && !dnd.isDropDisabled("")
      ? dnd.getDropTargetProps("")
      : null;
  const rootDropHover = dnd.isDropTarget("");

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
    <div className="flex h-full flex-col border-r border-bg-border bg-bg-card">
      <div className="px-3 py-2">
        <FilterField
          text={text.text}
          onTextChange={(next) => text.setText(next)}
          placeholder={tFilter("placeholder.tree")}
          typeFilter={filter}
          onTypeFilterChange={setFilter}
        />
      </div>
      {/* Root drop band — only renders while a drag is in progress, so it
          doesn't take vertical space in the resting layout. */}
      {dnd.dragState.isDragging && rootDropProps && (
        <div
          {...rootDropProps}
          aria-label={t("dropToRoot")}
          className={`mx-2 mt-1 rounded-lg border border-dashed px-2 py-1.5 text-xs transition-colors ${
            rootDropHover
              ? "border-accent bg-accent/10 text-text-primary"
              : "border-bg-border text-text-muted"
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
      />
      <div ref={scrollRef} className="scrollbar-hover flex-1 overflow-y-auto py-2">
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
    </div>
  );
}
