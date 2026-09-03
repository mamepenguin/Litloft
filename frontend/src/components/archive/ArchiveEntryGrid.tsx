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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
    </div>
  );
}
