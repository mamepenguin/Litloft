import Link from "next/link";
import type { Video } from "@/types";
import { formatDuration } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";

export function VideoCard({
  video,
  onFavoriteToggle,
}: {
  video: Video;
  onFavoriteToggle?: (video: Video) => void;
}) {
  return (
    <Link
      href={`/videos/${video.id}`}
      className="group block rounded-xl bg-bg-card overflow-hidden transition-transform duration-200 ease-out hover:scale-[1.02] hover:shadow-lg"
    >
      <div className="relative aspect-video bg-bg-elevated">
        <img
          src={getThumbnailUrl(video.id)}
          alt={video.title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(video.duration)}
        </span>
        {onFavoriteToggle && (
          <div className={`absolute top-2 right-2 ${video.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
            <FavoriteButton
              videoId={video.id}
              isFavorite={video.is_favorite}
              onToggle={onFavoriteToggle}
            />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary group-hover:text-accent">
          {video.title}
        </h3>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-xs text-text-muted">{video.folder_path || video.drive}</span>
          {video.tags.length > 0 && <TagList tags={video.tags} maxVisible={2} />}
        </div>
      </div>
    </Link>
  );
}
