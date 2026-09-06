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

/**
 * What a cell is drawn at before its picture has loaded — the
 * proportions of a scanned page.
 */
export const UNMEASURED_PAGE_RATIO = 0.7;

/** Folders, text and binaries have no proportions of their own. */
export const NON_IMAGE_RATIO = 1;

/* No `h-full w-full`: the row rule sets the height and `flex-basis`
   sets the width, so both were being overridden. */
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
          // The archive has no stored dimensions — the entry list is
          // read out of the zip's directory, which carries none. But
          // the cell loads the original image rather than a thumbnail,
          // so the browser can be asked once it has one.
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              onRatio(img.naturalWidth / img.naturalHeight);
            }
          }}
          onError={() => {
            setError(true);
            // The cell now draws a 32px icon, not a page. Leaving it at
            // a page's proportions gives the icon a tall portrait box.
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

/* No `h-full w-full` here: `.justified-grid > .justified-grid-cell`
   sets the height and `flex-basis` sets the width, so both would be
   overridden anyway. */
const CELL_CLASS = "overflow-hidden rounded-xl bg-bg-card";

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
  ratio,
  children,
}: {
  clickable: boolean;
  onClick: () => void;
  ratio: number;
  children: React.ReactNode;
}) {
  // The row geometry reads this; see `.justified-grid` in globals.css
  // and DESIGN.md §8.5.
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
  // Portrait, until the picture says otherwise. A scanned page is the
  // shape this grid is mostly made of, and a square placeholder that
  // grows taller on load moves every cell after it on the row; starting
  // at the common case makes that the exception rather than the rule.
  const [ratio, setRatio] = useState(
    entry.is_dir || entry.file_type !== "image"
      ? NON_IMAGE_RATIO
      : UNMEASURED_PAGE_RATIO,
  );
  return (
    <CellBox clickable={isClickable} onClick={onClick} ratio={ratio}>
      {/* The listing puts a labelled button beside the row; a 193px cell has
          no line to put one on, so the affordance is an icon with an
          accessible name. `p-2` on a 16px glyph is a 32x32 target, over the
          24x24 floor a repeated disclosure control needs. */}
      {!entry.is_dir && !isClickable && (
        <a
          href={getArchiveEntryUrl(fileId, entry.path)}
          download={entry.filename}
          className="absolute right-1 top-1 z-10 flex items-center justify-center rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11"
          // No `title` beside it: the two say the same thing, and the tooltip
          // arrives as a redundant accessible description read after the name.
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
          {/* Over the picture, not under it. A caption in the flex
              column shortened the image area while the cell's width
              still came from the *picture's* ratio, so `object-fit:
              cover` cropped the difference — about 12% of the height on
              a 200px row and 20% on a 120px one. The photo grid's
              `.justified-grid-name` band is the same answer to the same
              problem. */}
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
          {/* The reason, in the same words the listing uses. A corner icon on
              its own says there is a download and not why it is the only
              thing on offer, which is less than the `opacity-60` it replaced
              managed to convey. */}
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
