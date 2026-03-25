"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Music, Repeat, Trash2, Video } from "lucide-react";

import { getDriveFiles, getPlaylist, removePlaylistItem, reorderPlaylistItems } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import type { FileItem, FileType, PlaylistDetail, PlaylistItemEntry, SortField, SortOrder } from "@/types";

const LOOP_KEY = "playlist-loop";

function getLoop(): boolean {
  try {
    return localStorage.getItem(LOOP_KEY) === "1";
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

interface PlaylistPanelProps {
  playlistId?: string;
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

export function PlaylistPanel({
  playlistId,
  folderPlay,
  currentFileId,
  currentFileType,
  drive,
  folderPath,
  sort,
  order,
  onNavigate,
}: PlaylistPanelProps) {
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [playlistName, setPlaylistName] = useState("");
  const [loop, setLoop] = useState(getLoop);
  const [collapsed, setCollapsed] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);
  const isUserPlaylist = !!playlistId;

  const loadPlaylist = useCallback(async () => {
    if (playlistId) {
      try {
        const detail = await getPlaylist(drive, playlistId);
        setPlaylistName(detail.name);
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
        setPlaylistName(folderName);
        setTracks(allFiles.map((f) => ({ file: f })));
      } catch {
        setTracks([]);
      }
    }
  }, [playlistId, folderPlay, drive, folderPath, sort, order]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

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
    if (index <= 0 || !playlistId) return;
    const newTracks = [...tracks];
    const [item] = newTracks.splice(index, 1);
    newTracks.splice(index - 1, 0, item);
    setTracks(newTracks);
    const itemIds = newTracks.map((t) => t.itemId!);
    try {
      await reorderPlaylistItems(drive, playlistId, itemIds);
    } catch {
      loadPlaylist();
    }
  }, [tracks, playlistId, drive, loadPlaylist]);

  const handleMoveDown = useCallback(async (index: number) => {
    if (index >= tracks.length - 1 || !playlistId) return;
    const newTracks = [...tracks];
    const [item] = newTracks.splice(index, 1);
    newTracks.splice(index + 1, 0, item);
    setTracks(newTracks);
    const itemIds = newTracks.map((t) => t.itemId!);
    try {
      await reorderPlaylistItems(drive, playlistId, itemIds);
    } catch {
      loadPlaylist();
    }
  }, [tracks, playlistId, drive, loadPlaylist]);

  const handleRemoveItem = useCallback(async (index: number) => {
    if (!playlistId) return;
    const track = tracks[index];
    if (!track.itemId) return;
    const newTracks = tracks.filter((_, i) => i !== index);
    setTracks(newTracks);
    try {
      await removePlaylistItem(drive, playlistId, track.itemId);
    } catch {
      loadPlaylist();
    }
  }, [tracks, playlistId, drive, loadPlaylist]);

  if (tracks.length === 0) return null;

  const isVideoLayout = currentFileType === "video";

  return (
    <>
      {/* Expose handleEnded for parent to call */}
      <PlaylistEndedHandler onEnded={handleEnded} />

      <div className={`${
        isVideoLayout
          ? "mt-4 w-full"
          : "mt-0 w-full md:w-[300px] md:flex-shrink-0"
      }`}>
        <div className="rounded-xl border border-bg-border bg-bg-card p-3">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-primary">
                {playlistName}
              </div>
              <div className="text-xs text-text-muted">
                {currentIndex >= 0 ? currentIndex + 1 : "–"}/{totalTracks}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleLoop}
                className={`rounded-md p-1.5 text-xs transition-colors ${
                  loop
                    ? "bg-accent/20 text-accent"
                    : "text-text-muted hover:text-text-primary"
                }`}
                aria-label={loop ? "ループOFF" : "ループON"}
              >
                <Repeat size={14} />
              </button>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="rounded-md p-1.5 text-text-muted hover:text-text-primary md:hidden"
                aria-label={collapsed ? "展開" : "折りたたみ"}
              >
                {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>

          {/* Track list */}
          {!collapsed && (
            isVideoLayout ? (
              <VideoTrackList
                tracks={tracks}
                currentFileId={currentFileId}
                isUserPlaylist={isUserPlaylist}
                onNavigate={onNavigate}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onRemove={handleRemoveItem}
              />
            ) : (
              <AudioTrackList
                tracks={tracks}
                currentFileId={currentFileId}
                isUserPlaylist={isUserPlaylist}
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
function PlaylistEndedHandler({ onEnded }: { onEnded: () => void }) {
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__playlistOnEnded = onEnded;
    return () => {
      delete (window as unknown as Record<string, unknown>).__playlistOnEnded;
    };
  }, [onEnded]);
  return null;
}

export function getPlaylistOnEnded(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>).__playlistOnEnded as (() => void) | undefined;
}

// Video layout: horizontal scroll thumbnail cards
function VideoTrackList({
  tracks,
  currentFileId,
  isUserPlaylist,
  onNavigate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  tracks: TrackEntry[];
  currentFileId: string;
  isUserPlaylist: boolean;
  onNavigate: (fileId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tracks.map((track, index) => {
        const isCurrent = track.file.id === currentFileId;
        return (
          <div
            key={track.itemId ?? track.file.id}
            className={`group relative flex-shrink-0 cursor-pointer overflow-hidden rounded-lg ${
              isCurrent
                ? "ring-2 ring-accent"
                : "hover:ring-1 hover:ring-bg-border"
            }`}
            style={{ width: 160 }}
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
                  <Music size={24} />
                </div>
              )}
              {isCurrent && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-lg text-accent">▶</span>
                </div>
              )}
            </div>
            <div className="p-1.5">
              <div className={`truncate text-xs ${isCurrent ? "font-semibold text-text-primary" : "text-text-muted"}`}>
                {track.file.title}
              </div>
              {track.file.duration != null && (
                <div className={`text-[10px] ${isCurrent ? "text-accent" : "text-text-muted/60"}`}>
                  {formatDuration(track.file.duration)}
                </div>
              )}
            </div>
            {isUserPlaylist && (
              <div className="absolute top-0.5 right-0.5 hidden gap-0.5 group-hover:flex">
                {index > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); onMoveUp(index); }} className="rounded bg-black/60 p-0.5 text-white hover:bg-black/80">
                    <ChevronUp size={10} />
                  </button>
                )}
                {index < tracks.length - 1 && (
                  <button onClick={(e) => { e.stopPropagation(); onMoveDown(index); }} className="rounded bg-black/60 p-0.5 text-white hover:bg-black/80">
                    <ChevronDown size={10} />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onRemove(index); }} className="rounded bg-black/60 p-0.5 text-red-400 hover:bg-black/80">
                  <Trash2 size={10} />
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
  isUserPlaylist,
  activeRef,
  onNavigate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  tracks: TrackEntry[];
  currentFileId: string;
  isUserPlaylist: boolean;
  activeRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: (fileId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex max-h-[400px] flex-col gap-0.5 overflow-y-auto">
      {tracks.map((track, index) => {
        const isCurrent = track.file.id === currentFileId;
        return (
          <div
            key={track.itemId ?? track.file.id}
            ref={isCurrent ? activeRef : undefined}
            className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
              isCurrent
                ? "bg-accent/10 ring-1 ring-accent/40"
                : "hover:bg-bg-elevated"
            }`}
          >
            <button
              onClick={() => onNavigate(track.file.id)}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span className={`w-4 text-center ${isCurrent ? "text-accent" : "text-text-muted/50"}`}>
                {isCurrent ? "▶" : index + 1}
              </span>
              <span className="text-text-muted/50">
                {track.file.file_type === "video" ? <Video size={12} /> : <Music size={12} />}
              </span>
              <span className={`flex-1 truncate text-left ${isCurrent ? "font-semibold text-text-primary" : "text-text-muted"}`}>
                {track.file.title}
              </span>
              {track.file.duration != null && (
                <span className={`flex-shrink-0 ${isCurrent ? "text-accent" : "text-text-muted/50"}`}>
                  {formatDuration(track.file.duration)}
                </span>
              )}
            </button>
            {isUserPlaylist && (
              <div className="hidden flex-shrink-0 items-center gap-0.5 group-hover:flex">
                {index > 0 && (
                  <button onClick={() => onMoveUp(index)} className="rounded p-0.5 text-text-muted hover:text-text-primary">
                    <ChevronUp size={12} />
                  </button>
                )}
                {index < tracks.length - 1 && (
                  <button onClick={() => onMoveDown(index)} className="rounded p-0.5 text-text-muted hover:text-text-primary">
                    <ChevronDown size={12} />
                  </button>
                )}
                <button onClick={() => onRemove(index)} className="rounded p-0.5 text-red-400 hover:text-red-300">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
