"use client";

import Link from "next/link";

import { FileTypeIcon } from "@/components/FileTypeIcon";
import { getThumbnailUrl, type ShelfItem } from "@/lib/api";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { formatDuration } from "@/lib/format";
import { hasKnownLength } from "@/lib/primaryMeta";

function progressPercent(item: ShelfItem): number | null {
  const progress = item.watch_progress;
  if (!progress || !(progress.duration > 0)) return null;
  return Math.min(100, Math.max(0, (progress.position / progress.duration) * 100));
}

export function VideoCard({ item }: { item: ShelfItem }) {
  const percent = progressPercent(item);
  return (
    <Link
      href={fileLinkHref(item)}
      className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-bg-elevated">
        {item.has_thumbnail ? (
          <img
            src={getThumbnailUrl(item.id)}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileTypeIcon fileType={item.file_type} size={40} className="text-text-muted" />
          </div>
        )}
        {hasKnownLength(item) && (
          <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
            {formatDuration(item.duration)}
          </span>
        )}
        {percent !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div
              data-testid="progress-fill"
              className="h-full bg-white"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      <span className="mt-2 line-clamp-2 text-sm font-semibold text-text-primary">
        {item.title}
      </span>
    </Link>
  );
}
