import Link from "next/link";
import type { FileItem } from "@/types";
import { formatDuration } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";
import { FileTypeIcon } from "./FileTypeIcon";

export function FileCard({
  file,
  onFavoriteToggle,
  onContextMenu,
}: {
  file: FileItem;
  onFavoriteToggle?: (file: FileItem) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const isVideo = file.file_type === "video";

  return (
    <Link
      href={`/files/${file.id}`}
      className="group block rounded-xl bg-bg-card overflow-hidden transition-transform duration-200 ease-out hover:scale-[1.02] hover:shadow-lg"
      onContextMenu={onContextMenu}
    >
      <div className="relative aspect-video bg-bg-elevated">
        {isVideo ? (
          <img
            src={getThumbnailUrl(file.id)}
            alt={file.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileTypeIcon fileType={file.file_type} size={48} className="text-text-muted" />
          </div>
        )}
        {(isVideo || file.file_type === "audio") && file.duration != null && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            {formatDuration(file.duration)}
          </span>
        )}
        {onFavoriteToggle && (
          <div className={`absolute top-2 right-2 ${file.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
            <FavoriteButton
              fileId={file.id}
              isFavorite={file.is_favorite}
              onToggle={onFavoriteToggle}
            />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary group-hover:text-accent">
          {file.title}
        </h3>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-xs text-text-muted">{file.folder_path || file.drive}</span>
          {file.tags.length > 0 && <TagList tags={file.tags} maxVisible={2} />}
        </div>
      </div>
    </Link>
  );
}
