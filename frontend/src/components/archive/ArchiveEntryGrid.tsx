"use client";

import { useTranslations } from "next-intl";
import { ArchiveEntryCard } from "./ArchiveEntryCard";
import type { ArchiveEntry } from "@/types";

interface ArchiveEntryGridProps {
  entries: ArchiveEntry[];
  fileId: string;
  handleDirClick: (entry: ArchiveEntry) => void;
  handleFileClick: (entry: ArchiveEntry) => void;
  isClickable: (entry: ArchiveEntry) => boolean;
}

export function ArchiveEntryGrid({
  entries,
  fileId,
  handleDirClick,
  handleFileClick,
  isClickable,
}: ArchiveEntryGridProps) {
  const t = useTranslations("archive");

  // A level of comic pages carries the same name 190 times over 190
  // identical thumbnails; the picture is what the reader is choosing
  // between. Same rule as the file listing's repeated columns
  // (`lib/listMeta.ts`), and here the count is exact — the grid is
  // handed every entry of the level, not a page of them. Folders are
  // judged separately: they keep their names either way, so they must
  // not be what makes the images look mixed.
  const images = entries.filter((e) => !e.is_dir && e.file_type === "image");
  const showImageFilenames =
    images.length < 2 || images.length !== entries.filter((e) => !e.is_dir).length;

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-text-muted">
        {t("emptyFolder")}
      </div>
    );
  }

  // Justified rather than a column count, and the column count is gone
  // rather than moved: `grid-cols-2 sm: md: lg: xl:` measured the
  // *window*, and this grid renders beside a 384px inspector, so it was
  // counting columns for a width it does not have (`DESIGN.md` §8.5,
  // "Measure against the container, not the viewport"). A justified row
  // has no column count to get wrong, and a scanned page stops being
  // cropped square into the bargain.
  return (
    <div className="justified-grid-host">
      <div className="justified-grid">
        {entries.map((entry) => (
          <ArchiveEntryCard
            key={entry.path}
            entry={entry}
            fileId={fileId}
            isClickable={isClickable(entry)}
            showFilename={showImageFilenames}
            onClick={() => {
              if (entry.is_dir) {
                handleDirClick(entry);
              } else {
                handleFileClick(entry);
              }
            }}
          />
        ))}
        {/* Keeps the last line from stretching. See globals.css. */}
        <div className="justified-grid-tail" aria-hidden />
      </div>
    </div>
  );
}
