"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Folder } from "lucide-react";
import { getArchiveEntryUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { clampRatio } from "@/lib/justifiedGrid";
import { FileTypeIcon } from "../FileTypeIcon";
import type { ArchiveEntry, FileType } from "@/types";

interface ArchiveEntryCardProps {
  entry: ArchiveEntry;
  fileId: string;
  onClick: () => void;
  isClickable: boolean;
  showFilename?: boolean;
}

export const UNMEASURED_PAGE_RATIO = 0.7;

export const NON_IMAGE_RATIO = 1;

function ImageCard({
  entry,
  fileId,
  onRatio,
}: {
  entry: ArchiveEntry;
  fileId: string;
  onRatio: (ratio: number) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSrc(getArchiveEntryUrl(fileId, entry.path));
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fileId, entry.path]);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      {src && !error ? (
        <img
          src={src}
          alt={entry.filename}
          className="h-full w-full object-cover"
          // The archive has no stored dimensions — the zip's directory
          // carries none — so the browser is asked once the image loads.
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              onRatio(clampRatio(img.naturalWidth / img.naturalHeight));
            }
          }}
          onError={() => {
            setError(true);
            onRatio(NON_IMAGE_RATIO);
          }}
        />
      ) : (
        <FileTypeIcon
          fileType={(entry.file_type as FileType) || "image"}
          size={32}
          className="text-text-muted"
        />
      )}
    </div>
  );
}

/* No `h-full w-full` on the cell: `.justified-grid > .justified-grid-cell`
   sizes the whole box from `--jg-ratio`. */
const CELL_CLASS = "overflow-hidden rounded-xl bg-bg-card";

/**
 * The dead-end cell is a `<div>` and not a disabled `<button>`: it carries a
 * download link, which cannot be nested inside a button.
 */
function CellBox({
  clickable,
  onClick,
  ratio,
  children,
}: {
  clickable: boolean;
  onClick: () => void;
  ratio: number;
  children: React.ReactNode;
}) {
  const style = { "--jg-ratio": ratio } as React.CSSProperties;
  if (!clickable) {
    return (
      <div className={`justified-grid-cell relative ${CELL_CLASS}`} style={style}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`justified-grid-cell relative ${CELL_CLASS} cursor-pointer transition-colors hover:bg-bg-elevated`}
    >
      {children}
    </button>
  );
}

export function ArchiveEntryCard({
  entry,
  fileId,
  onClick,
  isClickable,
  showFilename = true,
}: ArchiveEntryCardProps) {
  const t = useTranslations("archive");
  // Portrait, until the picture says otherwise: a square placeholder that
  // grows taller on load moves every cell after it on the row.
  const [ratio, setRatio] = useState(
    entry.is_dir || entry.file_type !== "image"
      ? NON_IMAGE_RATIO
      : UNMEASURED_PAGE_RATIO,
  );
  return (
    <CellBox clickable={isClickable} onClick={onClick} ratio={ratio}>
      {!entry.is_dir && !isClickable && (
        <a
          href={getArchiveEntryUrl(fileId, entry.path)}
          download={entry.filename}
          className="absolute right-1 top-1 z-10 flex items-center justify-center rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11"
          // No `title` beside it: the tooltip arrives as a redundant
          // accessible description read after the name.
          aria-label={t("downloadFile", { name: entry.filename })}
        >
          <Download size={16} />
        </a>
      )}
      {entry.is_dir ? (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <Folder size={40} className="text-accent" />
          <span className="max-w-full truncate px-2 text-xs text-text-primary">
            {entry.filename}
          </span>
        </div>
      ) : entry.file_type === "image" ? (
        <div className="relative h-full w-full">
          <ImageCard entry={entry} fileId={fileId} onRatio={setRatio} />
          {/* Over the picture, not under it: a caption in the flex column
              shortens the image area while the cell's width still comes
              from the picture's ratio, so `object-fit: cover` crops the
              difference. */}
          {showFilename && (
            <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-left text-xs text-white">
              {entry.filename}
            </p>
          )}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-2">
          <FileTypeIcon
            fileType={(entry.file_type as FileType) || "other"}
            size={32}
            className="shrink-0 text-text-muted"
          />
          <span
            className={`max-w-full truncate text-xs ${
              isClickable ? "text-text-primary" : "text-text-muted"
            }`}
          >
            {entry.filename}
          </span>
          <span className="max-w-full truncate text-xs text-text-muted">
            {isClickable
              ? formatFileSize(entry.file_size)
              : `${formatFileSize(entry.file_size)} · ${t("previewUnavailable")}`}
          </span>
        </div>
      )}
    </CellBox>
  );
}
