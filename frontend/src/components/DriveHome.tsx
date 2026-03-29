"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Folder, Heart, Sparkles, Clock, ThumbsUp } from "lucide-react";
import type { FileItem, Folder as FolderType } from "@/types";
import { addPin, getDriveFiles, getFolders, getPins, removePin } from "@/lib/api";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { CarouselSection } from "./CarouselSection";
import { FolderCard } from "./FolderCard";
import { RootFileListing } from "./RootFileListing";
import { useSidebar } from "./SidebarProvider";

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
  const [pickup, setPickup] = useState<SectionState>({ files: [], loading: true });
  const [recent, setRecent] = useState<SectionState>({ files: [], loading: true });
  const [favorites, setFavorites] = useState<SectionState>({ files: [], loading: true });
  const [popular, setPopular] = useState<SectionState>({ files: [], loading: true });
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
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

      const [fileResults, foldersResult, pinsResult] = await Promise.all([
        fetchFileSections(),
        getFolders(driveName).catch(() => [] as FolderType[]),
        getPins(driveName).catch(() => [] as { path: string }[]),
      ]);

      applyFileSections(fileResults);

      setFolders(foldersResult);
      setFoldersLoading(false);
      setPinnedPaths(new Set(pinsResult.map((p) => p.path)));
    };

    fetchAll();
  }, [driveName, fetchFileSections, applyFileSections]);

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
              フォルダ
            </h2>
            {folders.length > MAX_FOLDERS && (
              <Link
                href={`${driveBase}?view=all`}
                className="text-sm text-text-muted transition-colors hover:text-accent"
              >
                すべて見る
              </Link>
            )}
          </div>

          {foldersLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl bg-bg-card p-4">
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
                    isPinned={pinnedPaths.has(folder.path)}
                    onTogglePin={() => handleTogglePin(folder.path)}
                    onUpdate={refreshFolders}
                    draggable
                    isDragging={dragState.draggedFolderPath === folder.path}
                    onDragStart={(e) => handleFolderDragStart(e, folder.path)}
                    onDragEnd={handleDragEnd}
                    isDropTarget={dragState.isDragging && !disabled && isDropTarget(folder.path)}
                    dropTargetProps={dragState.isDragging && !disabled ? getDropTargetProps(folder.path) : undefined}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      <CarouselSection
        title="ピックアップ"
        icon={<Sparkles size={20} className="text-accent-cta" />}
        files={pickup.files}
        loading={pickup.loading}
        onRefresh={handleRefreshPickup}
        refreshing={refreshing}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title="最近追加"
        icon={<Clock size={20} className="text-accent-teal" />}
        files={recent.files}
        loading={recent.loading}
        seeAllHref={`${driveBase}?view=recent-added`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title="お気に入り"
        icon={<Heart size={20} className="text-red-400" />}
        files={favorites.files}
        loading={favorites.loading}
        seeAllHref={`${driveBase}?view=favorites`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title="人気"
        icon={<ThumbsUp size={20} className="text-amber-400" />}
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
    </div>
  );
}
