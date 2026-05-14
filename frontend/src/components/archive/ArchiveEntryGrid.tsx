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
