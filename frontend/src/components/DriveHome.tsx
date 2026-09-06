"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Folder, History, Clock, Star, ThumbsUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem, Folder as FolderType, PaginatedResponse, WatchHistoryItem } from "@/types";
import { addPin, createFolder, getDriveFiles, getFolders, getPins, getWatchHistory, removePin } from "@/lib/api";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useContextMenu } from "@/hooks/useContextMenu";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { useTreeRefresh } from "@/components/TreeRefreshContext";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";
import { AddButton } from "./AddButton";
import { AddonSlot } from "./AddonSlot";
import { Breadcrumb } from "./Breadcrumb";
import { Button } from "./Button";
import { CarouselSection } from "./CarouselSection";
import { ContinueWatchingSection } from "./ContinueWatchingSection";
import { FolderCard } from "./FolderCard";
import { useFolderCardRename } from "./folder/useFolderCardRename";
import { FolderContextMenu } from "./FolderContextMenu";
import { PageHeader } from "./PageHeader";
import { RootFileListing } from "./RootFileListing";
import { TreeToggle } from "./TreeToggle";
import { useSidebar } from "./SidebarProvider";
import { useProfile } from "./ProfileProvider";

interface DriveHomeProps {
  driveName: string;
}

interface SectionState {
  files: FileItem[];
  /**
   * How many files match the section's query, not how many it holds.
   *
   * `getDriveFiles` returns it in `meta.total` and the row shows at most
   * `SECTION_LIMIT` of them, so this is the only thing that can say how
   * much is past the edge. `undefined` while loading, and after a failed
   * fetch — where it is moot, since a row with no files does not render.
   * `CarouselSection` falls back to an unqualified "See all" either way,
   * rather than claiming a number it does not have.
   */
  total?: number;
  loading: boolean;
}

const SECTION_LIMIT = 12;
const MAX_FOLDERS = 8;

export function DriveHome({ driveName }: DriveHomeProps) {
  const t = useTranslations("drive");
  const tc = useTranslations("common");
  const tf = useTranslations("folder");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const [continueWatching, setContinueWatching] = useState<WatchHistoryItem[]>([]);
  const [continueWatchingLoading, setContinueWatchingLoading] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState<WatchHistoryItem[]>([]);
  const [recentlyPlayedLoading, setRecentlyPlayedLoading] = useState(false);
  const [recent, setRecent] = useState<SectionState>({ files: [], loading: true });
  const [favorites, setFavorites] = useState<SectionState>({ files: [], loading: true });
  const [liked, setLiked] = useState<SectionState>({ files: [], loading: true });
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const [menuTarget, setMenuTarget] = useState<FolderType | null>(null);
  const { ref: folderGridRef, columns } = useCardColumns();
  const { menuState: folderMenuState, close: closeFolderMenu, handlers: folderMenuHandlers } = useContextMenu();
  const { requestRefresh: refreshSidebar } = useSidebar();
  const emptySelection = useMemo(() => new Set<string>(), []);
  const refreshTree = useTreeRefresh();

  const refreshFolders = useCallback(async () => {
    try {
      const updated = await getFolders(driveName);
      setFolders(updated);
    } catch {
      // ignore
    }
    refreshTree();
  }, [driveName, refreshTree]);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  const cancelCreateFolder = useCallback(() => {
    setCreatingFolder(false);
    setNewFolderName("");
    setFolderError(null);
  }, []);

  // Only the folder grid and the tree are refetched, not the file
  // listing below: a new folder holds no files, so nothing in that
  // listing changes. `refreshFolders` covers the tree on its way past.
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (name.includes("/") || name.includes("\\") || name === ".." || name === "." || name.startsWith(".")) {
      setFolderError(tf("invalidName"));
      return;
    }
    if (name.length > 255) {
      setFolderError(tf("nameTooLong"));
      return;
    }
    setFolderError(null);
    try {
      await createFolder(driveName, "", name);
      cancelCreateFolder();
      await refreshFolders();
    } catch {
      setFolderError(tf("createFailed"));
    }
  }, [newFolderName, tf, driveName, cancelCreateFolder, refreshFolders]);

  // Inline rename for the folder grid, the same wiring FolderContent
  // uses. Both hosts share it so the same right-click cannot mean two
  // different things depending on the screen.
  const rename = useFolderCardRename(driveName, refreshFolders);

  // Auto-refresh the folder grid when cross-pane drops or WS events arrive.
  // Two complementary signals:
  //   1. WS events — covers backend-emitted structural changes (scan, other clients)
  //   2. loft-move-complete window event — immediate signal after any in-page
  //      drag-and-drop completes, including cross-pane drops that don't trigger
  //      this component's own onComplete callback.
  useEffect(() => {
    const handler = () => refreshFolders();
    window.addEventListener("loft-move-complete", handler);
    return () => window.removeEventListener("loft-move-complete", handler);
  }, [refreshFolders]);

  const {
    dragState,
    handleFolderDragStart,
    handleDragEnd,
    getDropTargetProps,
    isDropTarget,
    isDropDisabled,
  } = useDragAndDrop({
    drive: driveName,
    selectedIds: emptySelection,
    onComplete: () => {
      refreshFolders();
      refreshSidebar();
    },
  });

  const applyFileSections = useCallback((results: PromiseSettledResult<PaginatedResponse>[]) => {
    const section = (result: PromiseSettledResult<PaginatedResponse>): SectionState =>
      result.status === "fulfilled"
        ? {
            files: result.value.data,
            total: result.value.meta.total,
            loading: false,
          }
        : { files: [], loading: false };

    setRecent(section(results[0]));
    setFavorites(section(results[1]));
    setLiked(section(results[2]));
  }, []);

  const fetchFileSections = useCallback((): Promise<PromiseSettledResult<PaginatedResponse>[]> => {
    return Promise.allSettled([
      getDriveFiles(driveName, { sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(driveName, { favorite: true, sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(driveName, { liked: true, sort: "liked_at", order: "desc", limit: SECTION_LIMIT }),
    ]);
  }, [driveName]);

  useEffect(() => {
    const fetchAll = async () => {
      setRecent({ files: [], loading: true });
      setFavorites({ files: [], loading: true });
      setLiked({ files: [], loading: true });
      setFoldersLoading(true);
      if (hasProfile) {
        setContinueWatchingLoading(true);
        setRecentlyPlayedLoading(true);
      }

      const promises: [
        Promise<PromiseSettledResult<PaginatedResponse>[]>,
        Promise<FolderType[]>,
        Promise<{ path: string }[]>,
        Promise<WatchHistoryItem[]> | null,
        Promise<WatchHistoryItem[]> | null,
      ] = [
        fetchFileSections(),
        getFolders(driveName).catch(() => [] as FolderType[]),
        getPins(driveName).catch(() => [] as { path: string }[]),
        hasProfile ? getWatchHistory(driveName, SECTION_LIMIT).catch(() => [] as WatchHistoryItem[]) : null,
        hasProfile ? getWatchHistory(driveName, SECTION_LIMIT, "all").catch(() => [] as WatchHistoryItem[]) : null,
      ];

      const [fileResults, foldersResult, pinsResult, watchResult, recentlyPlayedResult] = await Promise.all([
        promises[0],
        promises[1],
        promises[2],
        promises[3] ?? Promise.resolve([] as WatchHistoryItem[]),
        promises[4] ?? Promise.resolve([] as WatchHistoryItem[]),
      ]);

      applyFileSections(fileResults);

      setFolders(foldersResult);
      setFoldersLoading(false);
      setPinnedPaths(new Set(pinsResult.map((p) => p.path)));
      if (hasProfile) {
        setContinueWatching(watchResult);
        setContinueWatchingLoading(false);
        setRecentlyPlayed(recentlyPlayedResult);
        setRecentlyPlayedLoading(false);
      }
    };

    fetchAll();
  }, [driveName, fetchFileSections, applyFileSections, hasProfile, nickname]);

  const handleTogglePin = useCallback(
    async (folderPath: string) => {
      try {
        const isPinned = pinnedPaths.has(folderPath);
        if (isPinned) {
          await removePin(driveName, folderPath);
          setPinnedPaths((prev) => {
            const next = new Set(prev);
            next.delete(folderPath);
            return next;
          });
        } else {
          await addPin(driveName, folderPath);
          setPinnedPaths((prev) => new Set(prev).add(folderPath));
        }
        refreshSidebar();
      } catch {
        // ignore
      }
    },
    [driveName, pinnedPaths, refreshSidebar]
  );

  const refetchAllSections = useCallback(async () => {
    const results = await fetchFileSections();
    applyFileSections(results);
  }, [fetchFileSections, applyFileSections]);

  // Both halves of the page follow the drive: the folder grid *and* the
  // Recently added / Favourites / Popular rows. Refreshing only the
  // grid left the rows showing files that had been deleted or moved
  // elsewhere.
  //
  // `drive.file_updated` matters here because favouriting is a content
  // update, not a structural one, so the Favourites row would otherwise
  // never notice a change made on another device.
  const refreshPage = useCallback(() => {
    void refreshFolders();
    void refetchAllSections();
  }, [refreshFolders, refetchAllSections]);

  useWebSocketRefresh(
    ["drive.structure_changed", "drive.file_updated"],
    refreshPage,
    driveName,
  );

  const handleRemoveWatchItem = useCallback((fileId: string) => {
    setContinueWatching((prev) => prev.filter((item) => item.id !== fileId));
    setRecentlyPlayed((prev) => prev.filter((item) => item.id !== fileId));
  }, []);

  const driveBase = `/drive/${encodeURIComponent(driveName)}`;

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      {/* The same header the folder and file views draw, in its titleless
          form: the breadcrumb is the subject here, so `PageHeader` emits
          no `<h1>` and puts the actions on the trail row beside it.
          Y-aligned with FolderBrowser's, so the tree toggle sits at the
          same height on the drive root, in a sub folder and on a file.

          Add is here rather than in the file listing below because the
          listing is the last of up to seven sections — roughly a
          screenful of scrolling from the top of the page it acts on
          (D-2). It is also this screen's one accent fill, so it is moved
          rather than duplicated. */}
      <PageHeader
        leading={<TreeToggle drive={driveName} />}
        breadcrumb={<Breadcrumb driveName={driveName} folderPath="" />}
        actions={
          <AddButton
            // Rightmost here, unlike the folder toolbar's leftmost one:
            // the menu is wider than its trigger, so anchored left it
            // would grow off the right edge of the page.
            align="right"
            onCreateFolder={() => setCreatingFolder(true)}
          />
        }
      />

      {/* The name field opens directly under the button that asked for
          it. It used to open beside the Add button in the file listing;
          with the button here, leaving it there would split one action
          across the length of the page. */}
      {creatingFolder && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") cancelCreateFolder();
            }}
            placeholder={tf("namePlaceholder")}
            aria-invalid={folderError !== null}
            className="min-w-0 flex-1 rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring sm:w-40 sm:flex-initial"
          />
          {/* The twin of the folder toolbar's inline Create, and not a
              second accent fill for the same reason: Add stays on screen
              above this row (DESIGN.md §2.2). */}
          <Button variant="secondary" size="sm" onClick={handleCreateFolder}>
            {tc("create")}
          </Button>
          <Button
            iconOnly
            variant="ghost"
            aria-label={tc("cancel")}
            onClick={cancelCreateFolder}
          >
            <X size={16} />
          </Button>
          {/* Announced, like the rename error further down this file. A
              rejected name is the only feedback there is, and the row
              stays open for it to be fixed. */}
          {folderError && (
            <span role="alert" className="text-xs text-danger">
              {folderError}
            </span>
          )}
        </div>
      )}
      <div className="space-y-8 px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-4">
      {(foldersLoading || folders.length > 0) && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
              <Folder size={20} className="text-text-muted" />
              {t("folders")}
            </h2>
            {folders.length > MAX_FOLDERS && (
              <Link
                href={`${driveBase}?view=all`}
                className="text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                {tc("seeAll")}
              </Link>
            )}
          </div>

          {rename.error && (
            <div
              role="alert"
              className="mb-3 rounded-lg bg-danger px-3 py-1.5 text-xs text-white"
            >
              {rename.error}
            </div>
          )}

          {foldersLoading ? (
            <div
              ref={folderGridRef}
              className="grid gap-3"
              style={{ gridTemplateColumns: cardGridTemplate(columns) }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl bg-bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-bg-elevated" />
                    <div className="space-y-2">
                      <div className="h-4 w-24 rounded-lg bg-bg-elevated" />
                      <div className="h-3 w-16 rounded-lg bg-bg-elevated" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              ref={folderGridRef}
              className="grid gap-3"
              style={{ gridTemplateColumns: cardGridTemplate(columns) }}
            >
              {folders.slice(0, MAX_FOLDERS).map((folder) => {
                const disabled = isDropDisabled(folder.path);
                return (
                  <FolderCard
                    key={folder.path}
                    folder={folder}
                    driveName={driveName}
                    draggable
                    isDragging={dragState.draggedFolderPath === folder.path}
                    onDragStart={(e) => handleFolderDragStart(e, folder.path)}
                    onDragEnd={handleDragEnd}
                    isDropTarget={dragState.isDragging && !disabled && isDropTarget(folder.path)}
                    dropTargetProps={dragState.isDragging && !disabled ? getDropTargetProps(folder.path) : undefined}
                    onContextMenu={(e) => {
                      setMenuTarget(folder);
                      folderMenuHandlers.onContextMenu(e);
                    }}
                    onTouchStart={(e) => {
                      setMenuTarget(folder);
                      folderMenuHandlers.onTouchStart(e);
                    }}
                    onTouchEnd={folderMenuHandlers.onTouchEnd}
                    onTouchMove={folderMenuHandlers.onTouchMove}
                    {...rename.cardProps(folder)}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {hasProfile && (
        <ContinueWatchingSection
          items={continueWatching}
          loading={continueWatchingLoading}
          // The same destination Recently played uses, and for the same
          // reason it is needed at all: the row draws only what fits, so
          // without a link the rest of the history is unreachable from
          // here. Recently played is this history without the 90%
          // completion gate — a superset, so nothing a reader came for
          // is missing from it.
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      {hasProfile && (
        <ContinueWatchingSection
          items={recentlyPlayed}
          loading={recentlyPlayedLoading}
          title={t("recentlyPlayed")}
          icon={<History size={20} className="text-text-muted" />}
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      <AddonSlot id="drive-home-sections" props={{ drive: driveName }} />

      <CarouselSection
        title={t("recentAdded")}
        icon={<Clock size={20} className="text-text-muted" />}
        files={recent.files}
        loading={recent.loading}
        totalCount={recent.total}
        seeAllHref={`${driveBase}?view=recent-added`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("favorites")}
        icon={<Star size={20} className="text-text-muted" />}
        files={favorites.files}
        loading={favorites.loading}
        totalCount={favorites.total}
        seeAllHref={`${driveBase}?view=favorites`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("liked")}
        icon={<ThumbsUp size={20} className="text-text-muted" />}
        files={liked.files}
        loading={liked.loading}
        totalCount={liked.total}
        seeAllHref={`${driveBase}?view=liked`}
        onFileAction={refetchAllSections}
      />

      <RootFileListing
        driveName={driveName}
        onFileAction={refetchAllSections}
        onFolderChange={refreshFolders}
      />

      <FolderContextMenu
        open={folderMenuState.open}
        position={folderMenuState.position}
        target={menuTarget}
        drive={driveName}
        isPinned={menuTarget ? pinnedPaths.has(menuTarget.path) : false}
        onTogglePin={menuTarget ? () => handleTogglePin(menuTarget.path) : undefined}
        onUpdate={refreshFolders}
        onClose={closeFolderMenu}
        onStartInlineRename={
          menuTarget ? () => rename.start(menuTarget.path) : undefined
        }
      />
      </div>
    </div>
  );
}
