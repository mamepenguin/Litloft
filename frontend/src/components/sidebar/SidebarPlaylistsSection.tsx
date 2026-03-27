import type { RefObject } from "react";
import { ListMusic, Pencil, Plus, Trash2 } from "lucide-react";

import type { PlaylistSummary } from "@/types";

interface SidebarPlaylistsSectionProps {
  driveBase: string;
  playlistList: PlaylistSummary[];
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
  playlistList,
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
          aria-label="プレイリスト作成"
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
            placeholder="プレイリスト名..."
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
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                pl.item_count === 0
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
                リネーム
              </button>
              <button
                onClick={() => handleDeletePlaylist(pl.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10"
              >
                <Trash2 size={14} />
                削除
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
