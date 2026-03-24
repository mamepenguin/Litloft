import Link from "next/link";
import type { FileItem } from "@/types";
import { formatDuration, formatFileSize } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";
import { FileTypeIcon } from "./FileTypeIcon";

export function FileList({
  files,
  onFavoriteToggle,
}: {
  files: FileItem[];
  onFavoriteToggle?: (file: FileItem) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => {
        const isVideo = file.file_type === "video";
        const hasDuration = (file.file_type === "video" || file.file_type === "audio") && file.duration != null;

        return (
          <div
            key={file.id}
            className="flex items-center gap-3 rounded-lg bg-bg-card p-2 transition-colors hover:bg-bg-elevated"
          >
            <Link
              href={`/files/${file.id}`}
              className="flex flex-1 items-center gap-3 min-w-0"
            >
              <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-md bg-bg-elevated">
                {isVideo ? (
                  <img
                    src={getThumbnailUrl(file.id)}
                    alt={file.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <FileTypeIcon fileType={file.file_type} size={24} className="text-text-muted" />
                  </div>
                )}
                {hasDuration && (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
                    {formatDuration(file.duration)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-text-primary">
                  {file.title}
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-muted">
                    {file.folder_path || file.drive} · {formatFileSize(file.file_size)}
                  </span>
                  {file.tags.length > 0 && <TagList tags={file.tags} maxVisible={3} />}
                </div>
              </div>
            </Link>
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
  );
}
