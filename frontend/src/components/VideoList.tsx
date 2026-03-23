import Link from "next/link";
import type { Video } from "@/types";
import { formatDuration, formatFileSize } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";

export function VideoList({ videos }: { videos: Video[] }) {
  return (
    <div className="flex flex-col gap-2">
      {videos.map((video) => (
        <Link
          key={video.id}
          href={`/videos/${video.id}`}
          className="flex items-center gap-3 rounded-lg bg-bg-card p-2 transition-colors hover:bg-bg-elevated"
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
            <p className="text-xs text-text-muted">
              {video.category} · {formatFileSize(video.file_size)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
