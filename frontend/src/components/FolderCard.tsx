import Link from "next/link";
import { Folder } from "lucide-react";
import type { Folder as FolderType } from "@/types";

interface FolderCardProps {
  folder: FolderType;
  driveName: string;
}

export function FolderCard({ folder, driveName }: FolderCardProps) {
  return (
    <Link
      href={`/drive/${encodeURIComponent(driveName)}/${folder.path.split("/").map(encodeURIComponent).join("/")}`}
      className="group flex items-center gap-3 rounded-xl bg-bg-card p-4 transition-all duration-200 hover:scale-[1.02] hover:bg-bg-elevated hover:shadow-lg"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
        <Folder size={24} className="text-accent" />
      </div>
      <div>
        <h3 className="font-semibold text-text-primary group-hover:text-accent">
          {folder.name}
        </h3>
        <p className="text-sm text-text-muted">{folder.video_count} 本</p>
      </div>
    </Link>
  );
}
