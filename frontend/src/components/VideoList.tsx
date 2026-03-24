import Link from "next/link";
import type { Video } from "@/types";
import { formatDuration, formatFileSize } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";

export function VideoList({
  videos,
  onFavoriteToggle,
}: {
  videos: Video[];
  onFavoriteToggle?: (video: Video) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {videos.map((video) => (
        <div
          key={video.id}
          className="flex items-center gap-3 rounded-lg bg-bg-card p-2 transition-colors hover:bg-bg-elevated"
        >
          <Link
            href={`/videos/${video.id}`}
            className="flex flex-1 items-center gap-3 min-w-0"
          >
            <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-md bg-bg-elevated">
              <img
                src={getThumbnailUrl(video.id)}
                alt={video.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
                {formatDuration(video.duration)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-text-primary">
                {video.title}
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">
                  {video.folder_path || video.drive} · {formatFileSize(video.file_size)}
                </span>
                {video.tags.length > 0 && <TagList tags={video.tags} maxVisible={3} />}
              </div>
            </div>
          </Link>
          {onFavoriteToggle && (
            <FavoriteButton
              videoId={video.id}
              isFavorite={video.is_favorite}
              onToggle={onFavoriteToggle}
            />
          )}
        </div>
      ))}
    </div>
  );
}
