import Link from "next/link";
import { Folder } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Folder as FolderType } from "@/types";

interface FolderCardProps {
  folder: FolderType;
  driveName: string;
  isDropTarget?: boolean;
  dropTargetProps?: Record<string, (e: React.DragEvent) => void>;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
}

export function FolderCard({
  folder,
  driveName,
  isDropTarget,
  dropTargetProps,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
}: FolderCardProps) {
  const t = useTranslations("folder");
  return (
    <div
      className={`group relative flex items-center gap-3 rounded-2xl bg-bg-card p-4 transition-all duration-200 hover:bg-bg-elevated hover:shadow-md active:scale-[0.98]${
        isDropTarget ? " ring-2 ring-accent bg-accent/10 scale-[1.02]" : ""
      }${isDragging ? " opacity-40" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      {...dropTargetProps}
    >
      <Link
        href={`/drive/${encodeURIComponent(driveName)}/${folder.path.split("/").map(encodeURIComponent).join("/")}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {folder.thumbnail_file_id ? (
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl">
            <img
              src={`/api/files/${folder.thumbnail_file_id}/thumbnail`}
              alt={folder.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
            <Folder size={24} className="text-accent" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-text-primary group-hover:text-accent">
            {folder.name}
          </h3>
          <p className="text-sm text-text-muted">{t("items", { count: folder.file_count })}</p>
        </div>
      </Link>
    </div>
  );
}
