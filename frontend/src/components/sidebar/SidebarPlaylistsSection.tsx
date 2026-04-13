import { type RefObject, useCallback, useRef, useState } from "react";
import { ListMusic, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { PlaylistSummary } from "@/types";
import { addPlaylistItems, getPlaylists } from "@/lib/api";

interface SidebarPlaylistsSectionProps {
  currentDrive: string | null;
  driveBase: string;
  playlistList: PlaylistSummary[];
  setPlaylistList: (v: PlaylistSummary[]) => void;
  creatingPlaylist: boolean;
  setCreatingPlaylist: (v: boolean) => void;
  newPlaylistName: string;
  setNewPlaylistName: (v: string) => void;
  renamingId: string | null;
  setRenamingId: (v: string | null) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  contextMenu: { id: string; x: number; y: number } | null;
  setContextMenu: (v: { id: string; x: number; y: number } | null) => void;
  createInputRef: RefObject<HTMLInputElement | null>;
  renameInputRef: RefObject<HTMLInputElement | null>;
  handleCreatePlaylist: () => void;
  handleRenamePlaylist: () => void;
  handleDeletePlaylist: (id: string) => void;
  handlePlaylistClick: (pl: PlaylistSummary) => void;
}

export function SidebarPlaylistsSection({
  currentDrive,
  playlistList,
  setPlaylistList,
  creatingPlaylist,
  setCreatingPlaylist,
  newPlaylistName,
  setNewPlaylistName,
  renamingId,
  setRenamingId,
  renameValue,
  setRenameValue,
  contextMenu,
  setContextMenu,
  createInputRef,
  renameInputRef,
  handleCreatePlaylist,
  handleRenamePlaylist,
  handleDeletePlaylist,
  handlePlaylistClick,
}: SidebarPlaylistsSectionProps) {
  const t = useTranslations("sidebar");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragCounterRef = useRef<Map<string, number>>(new Map());

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-file-ids")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, playlistId: string) => {
    if (!e.dataTransfer.types.includes("application/x-file-ids")) return;
    e.preventDefault();
    const counter = (dragCounterRef.current.get(playlistId) ?? 0) + 1;
    dragCounterRef.current.set(playlistId, counter);
    setDropTargetId(playlistId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, playlistId: string) => {
    e.preventDefault();
    const counter = (dragCounterRef.current.get(playlistId) ?? 0) - 1;
    dragCounterRef.current.set(playlistId, Math.max(0, counter));
    if (counter <= 0) {
      dragCounterRef.current.delete(playlistId);
      setDropTargetId((prev) => (prev === playlistId ? null : prev));
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, playlistId: string) => {
      e.preventDefault();
      dragCounterRef.current.clear();
      setDropTargetId(null);

      if (!currentDrive) return;

      const raw = e.dataTransfer.getData("application/x-file-ids");
      if (!raw) return;

      try {
        const fileIds: string[] = JSON.parse(raw);
        if (fileIds.length === 0) return;
        await addPlaylistItems(currentDrive, playlistId, fileIds);
        const updated = await getPlaylists(currentDrive);
        setPlaylistList(updated);
      } catch {
        // silently ignore errors (e.g. duplicate items)
      }
    },
    [currentDrive, setPlaylistList],
  );

  return (
    <>
      <div className="mb-1 mt-4 flex items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Playlists
        </span>
        <button
          onClick={() => {
            setCreatingPlaylist(true);
            setNewPlaylistName("");
          }}
          className="text-text-muted hover:text-text-primary"
          aria-label={t("createPlaylist")}
        >
          <Plus size={14} />
        </button>
      </div>

      {creatingPlaylist && (
        <div className="px-3">
          <input
            ref={createInputRef}
            type="text"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreatePlaylist();
              if (e.key === "Escape") {
                setCreatingPlaylist(false);
                setNewPlaylistName("");
              }
            }}
            onBlur={handleCreatePlaylist}
            placeholder={t("playlistNamePlaceholder")}
            className="w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      {playlistList.map((pl) => (
        <div key={pl.id} className="relative">
          {renamingId === pl.id ? (
            <div className="px-3">
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenamePlaylist();
                  if (e.key === "Escape") {
                    setRenamingId(null);
                    setRenameValue("");
                  }
                }}
                onBlur={handleRenamePlaylist}
                className="w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          ) : (
            <button
              onClick={() => handlePlaylistClick(pl)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ id: pl.id, x: e.clientX, y: e.clientY });
              }}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, pl.id)}
              onDragLeave={(e) => handleDragLeave(e, pl.id)}
              onDrop={(e) => handleDrop(e, pl.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                dropTargetId === pl.id
                  ? "bg-accent/20 text-accent ring-1 ring-accent/50"
                  : pl.item_count === 0
                    ? "text-text-muted/50 cursor-default"
                    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
              }`}
            >
              <ListMusic size={16} />
              <span className="flex-1 truncate text-left">{pl.name}</span>
              <span className="text-xs opacity-60">{pl.item_count}</span>
            </button>
          )}

          {contextMenu?.id === pl.id && (
            <div
              className="fixed z-50 min-w-[140px] rounded-lg border border-bg-border bg-bg-primary py-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={() => {
                  setRenamingId(pl.id);
                  setRenameValue(pl.name);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              >
                <Pencil size={14} />
                {t("renamePlaylist")}
              </button>
              <button
                onClick={() => handleDeletePlaylist(pl.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-accent/10"
              >
                <Trash2 size={14} />
                {t("deletePlaylist")}
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
