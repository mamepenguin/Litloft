"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Folder, Heart, History, Play, Sparkles, Clock, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem, Folder as FolderType, WatchHistoryItem } from "@/types";
import { addPin, getDriveFiles, getFolders, getPins, getWatchHistory, removePin } from "@/lib/api";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useContextMenu } from "@/hooks/useContextMenu";
import { CarouselSection } from "./CarouselSection";
import { ContinueWatchingSection } from "./ContinueWatchingSection";
import { FolderCard } from "./FolderCard";
import { FolderContextMenu } from "./FolderContextMenu";
import { RootFileListing } from "./RootFileListing";
import { useSidebar } from "./SidebarProvider";
import { useProfile } from "./ProfileProvider";

interface DriveHomeProps {
  driveName: string;
}

interface SectionState {
  files: FileItem[];
  loading: boolean;
}

const SECTION_LIMIT = 12;
const MAX_FOLDERS = 8;

export function DriveHome({ driveName }: DriveHomeProps) {
  const t = useTranslations("drive");
  const tc = useTranslations("common");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const [continueWatching, setContinueWatching] = useState<WatchHistoryItem[]>([]);
  const [continueWatchingLoading, setContinueWatchingLoading] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState<WatchHistoryItem[]>([]);
  const [recentlyPlayedLoading, setRecentlyPlayedLoading] = useState(false);
  const [pickup, setPickup] = useState<SectionState>({ files: [], loading: true });
  const [recent, setRecent] = useState<SectionState>({ files: [], loading: true });
  const [favorites, setFavorites] = useState<SectionState>({ files: [], loading: true });
  const [popular, setPopular] = useState<SectionState>({ files: [], loading: true });
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const [menuTarget, setMenuTarget] = useState<FolderType | null>(null);
  const { menuState: folderMenuState, close: closeFolderMenu, handlers: folderMenuHandlers } = useContextMenu();
  const { requestRefresh: refreshSidebar } = useSidebar();
  const emptySelection = useMemo(() => new Set<string>(), []);

  const refreshFolders = useCallback(async () => {
    try {
      const updated = await getFolders(driveName);
      setFolders(updated);
    } catch {
      // ignore
    }
  }, [driveName]);

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

  const applyFileSections = useCallback((results: PromiseSettledResult<any>[]) => {
    setPickup({
      files: results[0].status === "fulfilled" ? results[0].value.data : [],
      loading: false,
    });
    setRecent({
      files: results[1].status === "fulfilled" ? results[1].value.data : [],
      loading: false,
    });
    setFavorites({
      files: results[2].status === "fulfilled" ? results[2].value.data : [],
      loading: false,
    });
    const popularFiles = results[3].status === "fulfilled" ? results[3].value.data : [];
    setPopular({
      files: popularFiles.filter((f: FileItem) => f.likes > 0),
      loading: false,
    });
  }, []);

  const fetchFileSections = useCallback(() => {
    return Promise.allSettled([
      getDriveFiles(driveName, { sort: "random", limit: SECTION_LIMIT }),
      getDriveFiles(driveName, { sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(driveName, { favorite: true, sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(driveName, { sort: "likes", order: "desc", limit: SECTION_LIMIT }),
    ]);
  }, [driveName]);

  const fetchPickup = useCallback(async () => {
    try {
      const res = await getDriveFiles(driveName, { sort: "random", limit: SECTION_LIMIT });
      setPickup({ files: res.data, loading: false });
    } catch {
      setPickup((prev) => ({ ...prev, loading: false }));
    }
  }, [driveName]);

  useEffect(() => {
    const fetchAll = async () => {
      setPickup({ files: [], loading: true });
      setRecent({ files: [], loading: true });
      setFavorites({ files: [], loading: true });
      setPopular({ files: [], loading: true });
      setFoldersLoading(true);
      if (hasProfile) {
        setContinueWatchingLoading(true);
        setRecentlyPlayedLoading(true);
      }

      const promises: [
        Promise<PromiseSettledResult<any>[]>,
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
  }, [driveName, fetchFileSections, applyFileSections, hasProfile]);

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

  const handleRemoveWatchItem = useCallback((fileId: string) => {
    setContinueWatching((prev) => prev.filter((item) => item.id !== fileId));
    setRecentlyPlayed((prev) => prev.filter((item) => item.id !== fileId));
  }, []);

  const handleRefreshPickup = async () => {
    setRefreshing(true);
    try {
      await fetchPickup();
    } finally {
      setRefreshing(false);
    }
  };

  const driveBase = `/drive/${encodeURIComponent(driveName)}`;

  return (
    <div className="space-y-8 p-4 sm:p-6">
      {(foldersLoading || folders.length > 0) && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
              <Folder size={20} className="text-accent" />
              {t("folders")}
            </h2>
            {folders.length > MAX_FOLDERS && (
              <Link
                href={`${driveBase}?view=all`}
                className="text-sm text-text-muted transition-colors hover:text-accent"
              >
                {tc("seeAll")}
              </Link>
            )}
          </div>

          {foldersLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl bg-bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-bg-elevated" />
                    <div className="space-y-2">
                      <div className="h-4 w-24 rounded bg-bg-elevated" />
                      <div className="h-3 w-16 rounded bg-bg-elevated" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      {hasProfile && (
        <ContinueWatchingSection
          items={recentlyPlayed}
          loading={recentlyPlayedLoading}
          title={t("recentlyPlayed")}
          icon={<History size={20} className="text-accent" />}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      <CarouselSection
        title={t("pickup")}
        icon={<Sparkles size={20} className="text-accent-cta" />}
        files={pickup.files}
        loading={pickup.loading}
        onRefresh={handleRefreshPickup}
        refreshing={refreshing}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("recentAdded")}
        icon={<Clock size={20} className="text-accent-teal" />}
        files={recent.files}
        loading={recent.loading}
        seeAllHref={`${driveBase}?view=recent-added`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("favorites")}
        icon={<Heart size={20} className="text-accent" />}
        files={favorites.files}
        loading={favorites.loading}
        seeAllHref={`${driveBase}?view=favorites`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("popular")}
        icon={<ThumbsUp size={20} className="text-accent-teal" />}
        files={popular.files}
        loading={popular.loading}
        seeAllHref={`${driveBase}?view=popular`}
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
      />
    </div>
  );
}
