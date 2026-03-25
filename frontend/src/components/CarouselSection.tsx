"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Download, Move, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { deleteFile, getDownloadUrl, moveFile, renameFile } from "@/lib/api";
import type { FileItem } from "@/types";
import { FileCard } from "./FileCard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";

interface CarouselSectionProps {
  title: string;
  icon?: React.ReactNode;
  files: FileItem[];
  loading: boolean;
  seeAllHref?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onFileAction?: () => void;
}

function SkeletonCard() {
  return (
    <div className="w-48 flex-shrink-0 snap-start sm:w-56">
      <div className="animate-pulse rounded-xl overflow-hidden">
        <div className="aspect-video bg-bg-elevated" />
        <div className="p-3 space-y-2">
          <div className="h-4 w-3/4 rounded bg-bg-elevated" />
          <div className="h-3 w-1/2 rounded bg-bg-elevated" />
        </div>
      </div>
    </div>
  );
}

export function CarouselSection({
  title,
  icon,
  files,
  loading,
  seeAllHref,
  onRefresh,
  refreshing,
  onFileAction,
}: CarouselSectionProps) {
  const handleAfterAction = useCallback(() => {
    if (onFileAction) onFileAction();
    else if (onRefresh) onRefresh();
  }, [onFileAction, onRefresh]);
  const [menuPos, setMenuPos] = useState<{ open: boolean; x: number; y: number }>({
    open: false, x: 0, y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  if (!loading && files.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          {icon}
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-accent disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">更新</span>
            </button>
          )}
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="text-sm text-text-muted transition-colors hover:text-accent"
            >
              すべて見る
            </Link>
          )}
        </div>
      </div>

      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide sm:-mx-0 sm:px-0">
        <div className="flex gap-3 pb-2 snap-x snap-mandatory">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : files.map((file) => (
                <div key={file.id} className="w-48 flex-shrink-0 snap-start sm:w-56">
                  <FileCard
                    file={file}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTarget(file);
                      setMenuPos({ open: true, x: e.clientX, y: e.clientY });
                    }}
                  />
                </div>
              ))}
        </div>
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
                handleAfterAction();
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
                handleAfterAction();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setMoveOpen(false); clearTarget(); }}
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
                handleAfterAction();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setDeleteOpen(false); clearTarget(); }}
          />
        </>
      )}
    </section>
  );
}
