"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Folder } from "lucide-react";
import { getArchiveEntryUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { FileTypeIcon } from "../FileTypeIcon";
import type { ArchiveEntry, FileType } from "@/types";

interface ArchiveEntryCardProps {
  entry: ArchiveEntry;
  fileId: string;
  onClick: () => void;
  isClickable: boolean;
  /**
   * Whether an image entry's filename tells this level's reader
   * anything. Decided once by the grid — see the note there. Folder and
   * non-image names are unaffected; those carry no thumbnail to
   * identify them by.
   */
  showFilename?: boolean;
}

function ImageCard({ entry, fileId }: { entry: ArchiveEntry; fileId: string }) {
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
          onError={() => setError(true)}
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

const CELL_CLASS = "aspect-square w-full overflow-hidden rounded-xl bg-bg-card";

/**
 * A cell, pressable or not.
 *
 * The dead-end cell is a `<div>` and not a disabled `<button>` for the same
 * two reasons the listing's rows are: it carries a download link, which
 * cannot be nested inside a button, and a thing that was never openable is
 * not a control in the off position.
 */
function CellBox({
  clickable,
  onClick,
  children,
}: {
  clickable: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  if (!clickable) {
    return <div className={`${CELL_CLASS} relative`}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CELL_CLASS} cursor-pointer transition-colors hover:bg-bg-elevated`}
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
  return (
    <CellBox clickable={isClickable} onClick={onClick}>
      {/* The listing puts a labelled button beside the row; a 193px cell has
          no line to put one on, so the affordance is an icon with an
          accessible name. `p-2` on a 16px glyph is a 32x32 target, over the
          24x24 floor a repeated disclosure control needs. */}
      {!entry.is_dir && !isClickable && (
        <a
          href={getArchiveEntryUrl(fileId, entry.path)}
          download={entry.filename}
          className="absolute right-1 top-1 z-10 rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          aria-label={t("downloadFile", { name: entry.filename })}
          title={t("download")}
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
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ImageCard entry={entry} fileId={fileId} />
          </div>
          {showFilename && (
            <div className="shrink-0 px-2 py-1 text-left">
              <p className="truncate text-xs text-text-primary">{entry.filename}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-2">
          <FileTypeIcon
            fileType={(entry.file_type as FileType) || "other"}
            size={32}
            className="shrink-0 text-text-muted"
          />
          <span className="max-w-full truncate text-xs text-text-primary">
            {entry.filename}
          </span>
          <span className="text-xs text-text-muted">
            {formatFileSize(entry.file_size)}
          </span>
        </div>
      )}
    </CellBox>
  );
}
