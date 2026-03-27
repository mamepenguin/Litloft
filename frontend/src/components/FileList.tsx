"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Download, ListMusic, Move, Pencil, Trash2 } from "lucide-react";

import { deleteFile, getDownloadUrl, getThumbnailUrl, moveFile, renameFile } from "@/lib/api";
import { formatDuration, formatFileSize, formatRelativeDate } from "@/lib/format";
import type { FileItem } from "@/types";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";
import { FileTypeIcon } from "./FileTypeIcon";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";
import { PlaylistPicker } from "./PlaylistPicker";

export function FileList({
  files,
  onFavoriteToggle,
  onRefresh,
  selectable,
  isSelected,
  onSelect,
  sortQuery,
  draggable,
  draggedFileIds,
  onDragStart,
  onDragEnd,
}: {
  files: FileItem[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  sortQuery?: string;
  draggable?: boolean;
  draggedFileIds?: string[];
  onDragStart?: (e: React.DragEvent, fileId: string) => void;
  onDragEnd?: () => void;
}) {
  const [menuPos, setMenuPos] = useState<{ open: boolean; x: number; y: number }>({
    open: false, x: 0, y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuPos({ open: false, x: 0, y: 0 });
  }, []);

  const clearTarget = useCallback(() => {
    setTarget(null);
  }, []);

  const menuItems: MenuItem[] = target ? [
    {
      icon: Download,
      label: "ダウンロード",
      onClick: () => window.open(getDownloadUrl(target.id), "_blank"),
    },
    {
      icon: ListMusic,
      label: "プレイリストに追加",
      onClick: () => setPlaylistPickerOpen(true),
    },
    {
      icon: Pencil,
      label: "名前を変更",
      onClick: () => setRenameOpen(true),
    },
    {
      icon: Move,
      label: "移動",
      onClick: () => setMoveOpen(true),
    },
    {
      icon: Trash2,
      label: "削除",
      onClick: () => setDeleteOpen(true),
      danger: true,
    },
  ] : [];

  return (
    <>
      <div className="flex flex-col gap-2.5 sm:gap-2">
        {files.map((file) => {
          const hasThumbnail = file.file_type === "video" || file.file_type === "image";
          const hasDuration = (file.file_type === "video" || file.file_type === "audio") && file.duration != null;
          const fileSelected = isSelected?.(file.id);

          return (
            <div
              key={file.id}
              className={`flex items-center gap-3 rounded-lg bg-bg-card p-2.5 sm:p-2 transition-colors hover:bg-bg-elevated ${
                selectable ? "cursor-pointer select-none" : ""
              } ${fileSelected ? "ring-2 ring-accent" : ""}${
                draggedFileIds?.includes(file.id) ? " opacity-40" : ""
              }`}
              draggable={draggable}
              onDragStart={onDragStart ? (e) => onDragStart(e, file.id) : undefined}
              onDragEnd={onDragEnd}
              onClick={selectable ? () => onSelect?.(file.id) : undefined}
              onContextMenu={selectable ? undefined : (e) => {
                e.preventDefault();
                e.stopPropagation();
                setTarget(file);
                setMenuPos({ open: true, x: e.clientX, y: e.clientY });
              }}
            >
              {selectable && (
                <div
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors pointer-events-none ${
                    fileSelected
                      ? "border-accent bg-accent text-white"
                      : "border-text-muted/50"
                  }`}
                  aria-hidden
                >
                  {fileSelected && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              )}
              {(() => {
                const fileTypeLabel: Record<string, string> = {
                  video: "動画",
                  image: "画像",
                  audio: "音声",
                  document: "文書",
                  archive: "書庫",
                  other: "ファイル",
                };
                const content = (
                  <>
                    <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-md bg-bg-elevated sm:h-14 sm:w-24">
                      {hasThumbnail ? (
                        <img
                          src={getThumbnailUrl(file.id)}
                          alt={file.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <FileTypeIcon fileType={file.file_type} size={22} className="text-text-muted" />
                        </div>
                      )}
                      {hasDuration && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
                          {formatDuration(file.duration)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                          {file.title}
                        </h3>
                        <span className="hidden flex-shrink-0 text-xs tabular-nums text-text-muted sm:inline">
                          {formatFileSize(file.file_size)}
                        </span>
                        <span className="hidden flex-shrink-0 text-xs tabular-nums text-text-muted sm:inline">
                          {formatRelativeDate(file.updated_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted">
                        <span className="flex-shrink-0">{fileTypeLabel[file.file_type] ?? file.file_type}</span>
                        {file.file_type === "other" && file.filename.includes(".") && (
                          <span className="flex-shrink-0 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-muted">
                            {file.filename.split(".").pop()}
                          </span>
                        )}
                        <span className="flex-shrink-0 sm:hidden">{formatFileSize(file.file_size)}</span>
                        <span className="flex-shrink-0 opacity-40 sm:hidden">·</span>
                        <span className="flex-shrink-0 sm:hidden">{formatRelativeDate(file.updated_at)}</span>
                        {file.tags.length > 0 && (
                          <>
                            <span className="hidden flex-shrink-0 opacity-40 sm:inline">·</span>
                            <TagList tags={file.tags} maxVisible={3} />
                          </>
                        )}
                      </div>
                    </div>
                  </>
                );
                return selectable ? (
                  <div className="flex flex-1 items-center gap-3 min-w-0">{content}</div>
                ) : (
                  <Link href={`/files/${file.id}${sortQuery || ""}`} className="flex flex-1 items-center gap-3 min-w-0">{content}</Link>
                );
              })()}
              {onFavoriteToggle && (
                <FavoriteButton
                  fileId={file.id}
                  isFavorite={file.is_favorite}
                  onToggle={onFavoriteToggle}
                />
              )}
            </div>
          );
        })}
      </div>

      <ContextMenu
        open={menuPos.open}
        position={{ x: menuPos.x, y: menuPos.y }}
        items={menuItems}
        onClose={closeMenu}
      />

      {target && (
        <>
          <RenameDialog
            open={renameOpen}
            currentName={target.filename}
            onRename={async (name) => {
              try {
                await renameFile(target.id, name);
                setRenameOpen(false);
                clearTarget();
                if (onRefresh) onRefresh();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setRenameOpen(false); clearTarget(); }}
          />
          <MoveDialog
            open={moveOpen}
            drive={target.drive}
            currentPath={target.folder_path}
            onMove={async (path) => {
              try {
                await moveFile(target.id, path);
                setMoveOpen(false);
                clearTarget();
                if (onRefresh) onRefresh();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setMoveOpen(false); clearTarget(); }}
          />
          <PlaylistPicker
            open={playlistPickerOpen}
            drive={target.drive}
            fileIds={[target.id]}
            onClose={() => { setPlaylistPickerOpen(false); clearTarget(); }}
          />
          <ConfirmDialog
            open={deleteOpen}
            title="ファイルを削除"
            message={`「${target.filename}」を削除しますか？この操作は取り消せません。`}
            confirmLabel="削除"
            onConfirm={async () => {
              try {
                await deleteFile(target.id);
                setDeleteOpen(false);
                clearTarget();
                if (onRefresh) onRefresh();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setDeleteOpen(false); clearTarget(); }}
          />
        </>
      )}
    </>
  );
}
