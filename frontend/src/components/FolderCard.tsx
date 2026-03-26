import Link from "next/link";
import { Folder } from "lucide-react";
import type { Folder as FolderType } from "@/types";
import { FolderActions } from "./FolderActions";

interface FolderCardProps {
  folder: FolderType;
  driveName: string;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onUpdate?: () => void;
  isDropTarget?: boolean;
  dropTargetProps?: Record<string, (e: React.DragEvent) => void>;
}

export function FolderCard({ folder, driveName, isPinned, onTogglePin, onUpdate, isDropTarget, dropTargetProps }: FolderCardProps) {
  return (
    <div
      className={`group relative flex items-center gap-3 rounded-xl bg-bg-card p-4 transition-all duration-200 hover:scale-[1.02] hover:bg-bg-elevated hover:shadow-lg active:scale-[0.98]${
        isDropTarget ? " ring-2 ring-accent bg-accent/10 scale-[1.02]" : ""
      }`}
      {...dropTargetProps}
    >
      <Link
        href={`/drive/${encodeURIComponent(driveName)}/${folder.path.split("/").map(encodeURIComponent).join("/")}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {folder.thumbnail_file_id ? (
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
            <img
              src={`/api/files/${folder.thumbnail_file_id}/thumbnail`}
              alt={folder.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-accent/20">
            <Folder size={24} className="text-accent" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-text-primary group-hover:text-accent">
            {folder.name}
          </h3>
          <p className="text-sm text-text-muted">{folder.file_count} 件</p>
        </div>
      </Link>
      {onUpdate && (
        <div className="flex-shrink-0 md:absolute md:right-3 md:top-1/2 md:-translate-y-1/2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <FolderActions folder={folder} drive={driveName} isPinned={isPinned} onTogglePin={onTogglePin} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
