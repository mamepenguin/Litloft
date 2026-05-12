"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Music, Repeat, Trash2, Video } from "lucide-react";

import { useTranslations } from "next-intl";
import {
  getCollection,
  getDriveFiles,
  removeCollectionItem,
  reorderCollectionItems,
} from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import type { FileItem, FileType, SortField, SortOrder } from "@/types";

const LOOP_KEY = "collection-loop";
const LEGACY_LOOP_KEY = "playlist-loop";

function getLoop(): boolean {
  try {
    const v = localStorage.getItem(LOOP_KEY);
    if (v !== null) return v === "1";
    // One-time migration from the legacy key.
    const legacy = localStorage.getItem(LEGACY_LOOP_KEY);
    if (legacy !== null) {
      localStorage.setItem(LOOP_KEY, legacy);
      localStorage.removeItem(LEGACY_LOOP_KEY);
      return legacy === "1";
    }
    return false;
  } catch {
    return false;
  }
}

function setLoopStorage(v: boolean): void {
  try {
    localStorage.setItem(LOOP_KEY, v ? "1" : "0");
  } catch {
    // localStorage unavailable
  }
}

interface CollectionPanelProps {
  collectionId?: string;
  folderPlay?: boolean;
  currentFileId: string;
  currentFileType: FileType;
  drive: string;
  folderPath: string;
  sort?: string;
  order?: string;
  onNavigate: (fileId: string) => void;
}

interface TrackEntry {
  itemId?: number;
  file: FileItem;
}

export function CollectionPanel({
  collectionId,
  folderPlay,
  currentFileId,
  currentFileType,
  drive,
  folderPath,
  sort,
  order,
  onNavigate,
}: CollectionPanelProps) {
  const t = useTranslations("playback");
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [queueName, setQueueName] = useState("");
  const [loop, setLoop] = useState(getLoop);
  const [collapsed, setCollapsed] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);
  const isUserCollection = !!collectionId;

  const loadQueue = useCallback(async () => {
    if (collectionId) {
      try {
        const detail = await getCollection(drive, collectionId);
        setQueueName(detail.name);
        setTracks(detail.items.map((item) => ({ itemId: item.id, file: item.file })));
      } catch {
        setTracks([]);
      }
    } else if (folderPlay) {
      try {
        const allFiles: FileItem[] = [];
        for (const type of ["audio", "video"] as const) {
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const res = await getDriveFiles(drive, {
              path: folderPath,
              type,
              sort: (sort || "created_at") as SortField,
              order: (order || "desc") as SortOrder,
              limit: 500,
              page,
            });
            allFiles.push(...res.data);
            hasMore = res.meta.total > page * 500;
            page++;
          }
        }
        const folderName = folderPath ? folderPath.split("/").pop() || drive : drive;
        setQueueName(folderName);
        setTracks(allFiles.map((f) => ({ file: f })));
      } catch {
        setTracks([]);
      }
    }
  }, [collectionId, folderPlay, drive, folderPath, sort, order]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentFileId, tracks]);

  const currentIndex = tracks.findIndex((t) => t.file.id === currentFileId);
  const totalTracks = tracks.length;

  const toggleLoop = useCallback(() => {
    setLoop((prev) => {
      const next = !prev;
      setLoopStorage(next);
      return next;
    });
  }, []);

  const getNextFileId = useCallback((): string | null => {
    if (tracks.length === 0) return null;
    const idx = tracks.findIndex((t) => t.file.id === currentFileId);
    if (idx < 0) return null;
    if (idx < tracks.length - 1) return tracks[idx + 1].file.id;
    if (loop) return tracks[0].file.id;
    return null;
  }, [tracks, currentFileId, loop]);

  const handleEnded = useCallback(() => {
    const nextId = getNextFileId();
    if (nextId) onNavigate(nextId);
  }, [getNextFileId, onNavigate]);

  const handleMoveUp = useCallback(async (index: number) => {
    if (index <= 0 || !collectionId) return;
    const newTracks = [...tracks];
    const [item] = newTracks.splice(index, 1);
    newTracks.splice(index - 1, 0, item);
    setTracks(newTracks);
    const itemIds = newTracks.map((t) => t.itemId!);
    try {
      await reorderCollectionItems(drive, collectionId, itemIds);
    } catch {
      loadQueue();
    }
  }, [tracks, collectionId, drive, loadQueue]);

  const handleMoveDown = useCallback(async (index: number) => {
    if (index >= tracks.length - 1 || !collectionId) return;
    const newTracks = [...tracks];
    const [item] = newTracks.splice(index, 1);
    newTracks.splice(index + 1, 0, item);
    setTracks(newTracks);
    const itemIds = newTracks.map((t) => t.itemId!);
    try {
      await reorderCollectionItems(drive, collectionId, itemIds);
    } catch {
      loadQueue();
    }
  }, [tracks, collectionId, drive, loadQueue]);

  const handleRemoveItem = useCallback(async (index: number) => {
    if (!collectionId) return;
    const track = tracks[index];
    if (!track.itemId) return;
    const newTracks = tracks.filter((_, i) => i !== index);
    setTracks(newTracks);
    try {
      await removeCollectionItem(drive, collectionId, track.itemId);
    } catch {
      loadQueue();
    }
  }, [tracks, collectionId, drive, loadQueue]);

  if (tracks.length === 0) return null;

  const isVideoLayout = currentFileType === "video";

  return (
    <>
      {/* Expose handleEnded for parent to call */}
      <CollectionEndedHandler onEnded={handleEnded} />

      <div className={`${
        isVideoLayout
          ? "mt-4 w-full"
          : "mt-0 w-full md:w-[360px] md:flex-shrink-0"
      }`}>
        <div className="rounded-2xl border border-bg-border bg-bg-card p-4">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-text-primary">
                {queueName}
              </div>
              <div className="text-sm text-text-muted">
                {t("tracks", { current: currentIndex >= 0 ? currentIndex + 1 : "–", total: totalTracks })}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleLoop}
                className={`rounded-lg p-2 transition-colors ${
                  loop
                    ? "bg-accent/20 text-accent"
                    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                }`}
                aria-label={loop ? t("loopOff") : t("loopOn")}
              >
                <Repeat size={18} />
              </button>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="rounded-lg p-2 text-text-muted hover:bg-bg-elevated hover:text-text-primary md:hidden"
                aria-label={collapsed ? t("expand") : t("collapse")}
              >
                {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
            </div>
          </div>

          {/* Track list */}
          {!collapsed && (
            isVideoLayout ? (
              <VideoTrackList
                tracks={tracks}
                currentFileId={currentFileId}
                isUserCollection={isUserCollection}
                onNavigate={onNavigate}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onRemove={handleRemoveItem}
              />
            ) : (
              <AudioTrackList
                tracks={tracks}
                currentFileId={currentFileId}
                isUserCollection={isUserCollection}
                activeRef={activeRef}
                onNavigate={onNavigate}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onRemove={handleRemoveItem}
              />
            )
          )}
        </div>
      </div>
    </>
  );
}

// Invisible component to expose onEnded callback to parent via ref pattern
function CollectionEndedHandler({ onEnded }: { onEnded: () => void }) {
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__collectionOnEnded = onEnded;
    return () => {
      delete (window as unknown as Record<string, unknown>).__collectionOnEnded;
    };
  }, [onEnded]);
  return null;
}

export function getCollectionOnEnded(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>).__collectionOnEnded as (() => void) | undefined;
}

// Video layout: horizontal scroll thumbnail cards
function VideoTrackList({
  tracks,
  currentFileId,
  isUserCollection,
  onNavigate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  tracks: TrackEntry[];
  currentFileId: string;
  isUserCollection: boolean;
  onNavigate: (fileId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {tracks.map((track, index) => {
        const isCurrent = track.file.id === currentFileId;
        return (
          <div
            key={track.itemId ?? track.file.id}
            className={`group relative w-48 sm:w-52 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl ${
              isCurrent
                ? "ring-2 ring-accent"
                : "hover:ring-1 hover:ring-bg-border"
            }`}
            onClick={() => onNavigate(track.file.id)}
          >
            <div className="aspect-video bg-bg-elevated">
              {track.file.file_type === "video" ? (
                <img
                  src={getThumbnailUrl(track.file.id)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-text-muted">
                  <Music size={32} />
                </div>
              )}
              {isCurrent && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-2xl text-accent">▶</span>
                </div>
              )}
            </div>
            <div className="p-2">
              <div className={`truncate text-sm ${isCurrent ? "font-semibold text-text-primary" : "text-text-muted"}`}>
                {track.file.title}
              </div>
              {track.file.duration != null && (
                <div className={`text-xs ${isCurrent ? "text-accent" : "text-text-muted/60"}`}>
                  {formatDuration(track.file.duration)}
                </div>
              )}
            </div>
            {isUserCollection && (
              <div className="absolute top-1 right-1 hidden gap-1 group-hover:flex">
                {index > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); onMoveUp(index); }} className="rounded-lg bg-black/60 p-1 text-white hover:bg-black/80">
                    <ChevronUp size={14} />
                  </button>
                )}
                {index < tracks.length - 1 && (
                  <button onClick={(e) => { e.stopPropagation(); onMoveDown(index); }} className="rounded-lg bg-black/60 p-1 text-white hover:bg-black/80">
                    <ChevronDown size={14} />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onRemove(index); }} className="rounded-lg bg-black/60 p-1 text-danger hover:bg-black/80">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Audio layout: vertical list
function AudioTrackList({
  tracks,
  currentFileId,
  isUserCollection,
  activeRef,
  onNavigate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  tracks: TrackEntry[];
  currentFileId: string;
  isUserCollection: boolean;
  activeRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: (fileId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
      {tracks.map((track, index) => {
        const isCurrent = track.file.id === currentFileId;
        return (
          <div
            key={track.itemId ?? track.file.id}
            ref={isCurrent ? activeRef : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
              isCurrent
                ? "bg-accent/10 ring-1 ring-accent/40"
                : "hover:bg-bg-elevated"
            }`}
          >
            <button
              onClick={() => onNavigate(track.file.id)}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span className={`w-6 text-center text-sm ${isCurrent ? "text-accent" : "text-text-muted/70"}`}>
                {isCurrent ? "▶" : index + 1}
              </span>
              <span className="text-text-muted/70">
                {track.file.file_type === "video" ? <Video size={18} /> : <Music size={18} />}
              </span>
              <span className={`flex-1 truncate text-left text-sm ${isCurrent ? "font-semibold text-text-primary" : "text-text-muted"}`}>
                {track.file.title}
              </span>
              {track.file.duration != null && (
                <span className={`flex-shrink-0 text-sm ${isCurrent ? "text-accent" : "text-text-muted/70"}`}>
                  {formatDuration(track.file.duration)}
                </span>
              )}
            </button>
            {isUserCollection && (
              <div className="hidden flex-shrink-0 items-center gap-1 group-hover:flex">
                {index > 0 && (
                  <button onClick={() => onMoveUp(index)} className="rounded-lg p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary">
                    <ChevronUp size={16} />
                  </button>
                )}
                {index < tracks.length - 1 && (
                  <button onClick={() => onMoveDown(index)} className="rounded-lg p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary">
                    <ChevronDown size={16} />
                  </button>
                )}
                <button onClick={() => onRemove(index)} className="rounded-lg p-1.5 text-danger hover:bg-danger/10 hover:text-danger">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
