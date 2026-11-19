"use client";

import Link from "next/link";

import { FileTypeIcon } from "@/components/FileTypeIcon";
import { CardProgress } from "@/components/CardProgress";
import { getThumbnailUrl, type ShelfItem } from "@/lib/api";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { formatDuration } from "@/lib/format";
import { hasKnownLength } from "@/lib/primaryMeta";

export function VideoCard({ item, byline }: { item: ShelfItem; byline?: string }) {
  const progress = item.watch_progress;
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
        {progress && progress.duration > 0 && (
          <CardProgress
            position={progress.position}
            duration={progress.duration}
            ranges={item.watched_ranges}
            trackClassName="h-1 bg-black/50"
            fillClassName="bg-white"
          />
        )}
      </div>
      <span className="mt-3 line-clamp-2 text-base/[1.375rem] font-medium text-text-primary">
        {item.title}
      </span>
      {typeof byline === "string" && byline !== "" && (
        <>
          {" "}
          <span className="mt-1 block truncate text-sm text-text-muted">{byline}</span>
        </>
      )}
    </Link>
  );
}
