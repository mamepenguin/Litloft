"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { RelatedFileSummary } from "@/lib/api";
import { buildCanonicalFileUrl } from "@/lib/canonicalFileUrl";
import { formatDuration } from "@/lib/format";
import type { FileType } from "@/types";
import { FileTypeIcon } from "../../FileTypeIcon";

const MEDIA_TYPES = new Set(["video", "audio", "image"]);
const TIMED_TYPES = new Set(["video", "audio"]);

export function RelatedFileRow({ file }: { file: RelatedFileSummary }) {
  const t = useTranslations("file");
  const isMissing = file.missing_since !== null;
  const showsThumbnail = file.has_thumbnail && MEDIA_TYPES.has(file.file_type);
  const showsDuration = TIMED_TYPES.has(file.file_type) && file.duration != null;

  return (
    <Link
      href={buildCanonicalFileUrl(file, file.id)}
      className={
        `flex gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-bg-elevated ${
          showsThumbnail ? "items-center" : "items-start"
        }` + (isMissing ? " opacity-60" : "")
      }
    >
      {showsThumbnail ? (
        <span className="relative h-8 w-14 shrink-0 overflow-hidden rounded-lg bg-bg-elevated">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.thumbnail_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
          {showsDuration && (
            <span
              data-related-duration
              className="absolute right-0.5 bottom-0.5 rounded-lg bg-black/70 px-1 text-[9px] leading-tight font-medium text-white"
            >
              {formatDuration(file.duration)}
            </span>
          )}
        </span>
      ) : (
        <span className="mt-0.5 shrink-0 text-text-muted">
          <FileTypeIcon fileType={file.file_type as FileType} size={16} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          data-related-title
          className="line-clamp-2 text-sm leading-[1.45] wrap-anywhere text-text-primary"
        >
          {file.title || file.filename}
        </span>
        <span className="mt-px flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
          <span className="truncate">
            {file.folder_path || t("relatedDriveRoot")}
          </span>
          {isMissing && (
            <span className="shrink-0 rounded-lg bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase">
              {t("relatedFileMissing")}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
