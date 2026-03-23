import Link from "next/link";
import type { Video } from "@/types";
import { formatDuration } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";

export function VideoCard({ video }: { video: Video }) {
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
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary group-hover:text-accent">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-text-muted">{video.category}</p>
      </div>
    </Link>
  );
}
