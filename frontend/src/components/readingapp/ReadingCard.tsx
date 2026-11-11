"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { getThumbnailUrl, type ShelfItem } from "@/lib/api";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { formatRelativeAge } from "@/lib/format";
import { bookFormat, folderLabel } from "./labels";

function progressPercent(item: ShelfItem): number | null {
  const progress = item.watch_progress;
  if (!progress || !(progress.duration > 0)) return null;
  return Math.min(100, Math.max(0, (progress.position / progress.duration) * 100));
}

export function ReadingCard({
  item,
  drive,
  showProgress = false,
}: {
  item: ShelfItem;
  drive: string;
  /** Only Continue reading carries a bar. */
  showProgress?: boolean;
}) {
  const t = useTranslations("readingApp");
  const locale = useLocale();
  const format = bookFormat(item);
  const percent = showProgress ? progressPercent(item) : null;

  return (
    <Link
      href={fileLinkHref(item)}
      className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <div
        data-testid="reading-cover"
        className="relative aspect-[2/3] overflow-hidden rounded-xl bg-bg-elevated"
      >
        {item.has_thumbnail ? (
          <img
            src={getThumbnailUrl(item.id)}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-x-0 top-0 whitespace-pre-line px-3 pt-3.5 text-[13px] font-bold leading-[1.4] text-text-primary/[0.78]">
            {item.title}
          </div>
        )}
        <span className="absolute bottom-[10px] left-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
          {t(`formats.${format}`)}
        </span>
        {percent !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div
              data-testid="progress-fill"
              className="h-full bg-accent"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      <span className="mt-2 line-clamp-2 text-sm font-semibold text-text-primary">
        {item.title}
      </span>
      <span className="mt-0.5 block truncate text-xs text-text-muted">
        {folderLabel(item.folder_path, drive)} · {formatRelativeAge(item.created_at, locale)}
      </span>
    </Link>
  );
}
