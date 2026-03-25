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
}

export function FolderCard({ folder, driveName, isPinned, onTogglePin, onUpdate }: FolderCardProps) {
  return (
    <div className="group relative flex items-center gap-3 rounded-xl bg-bg-card p-4 transition-all duration-200 hover:scale-[1.02] hover:bg-bg-elevated hover:shadow-lg">
      <Link
        href={`/drive/${encodeURIComponent(driveName)}/${folder.path.split("/").map(encodeURIComponent).join("/")}`}
        className="flex flex-1 items-center gap-3"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
          <Folder size={24} className="text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary group-hover:text-accent">
            {folder.name}
          </h3>
          <p className="text-sm text-text-muted">{folder.file_count} 件</p>
        </div>
      </Link>
      {onUpdate && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <FolderActions folder={folder} drive={driveName} isPinned={isPinned} onTogglePin={onTogglePin} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
