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

  // Folders are judged separately: they keep their names either way, so
  // they must not be what makes the images look mixed.
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

  // Not breakpoint columns: those follow the window, and this grid renders
  // beside the inspector.
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
        {/* Keeps the last line from stretching. */}
        <div className="justified-grid-tail" aria-hidden />
      </div>
    </div>
  );
}
