"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { FileTypeIcon } from "@/components/FileTypeIcon";
import { getThumbnailUrl, type ShelfItem } from "@/lib/api";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { formatRelativeDate } from "@/lib/format";
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
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-bg-elevated">
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
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
          {t(`formats.${format}`)}
        </span>
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
      <span className="mt-0.5 block truncate text-xs text-text-muted">
        {folderLabel(item.folder_path, drive)} · {formatRelativeDate(item.created_at, locale)}
      </span>
    </Link>
  );
}
