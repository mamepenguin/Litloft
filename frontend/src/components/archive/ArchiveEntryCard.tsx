"use client";

import { useEffect, useRef, useState } from "react";
import { Folder } from "lucide-react";
import { getArchiveEntryUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { FileTypeIcon } from "../FileTypeIcon";
import type { ArchiveEntry, FileType } from "@/types";

interface ArchiveEntryCardProps {
  entry: ArchiveEntry;
  fileId: string;
  onClick: () => void;
  isClickable: boolean;
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

export function ArchiveEntryCard({
  entry,
  fileId,
  onClick,
  isClickable,
}: ArchiveEntryCardProps) {
  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={`aspect-square w-full overflow-hidden rounded-xl bg-bg-card transition-colors ${
        isClickable
          ? "cursor-pointer hover:bg-bg-elevated"
          : "cursor-default opacity-60"
      }`}
    >
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
          <div className="shrink-0 px-2 py-1 text-left">
            <p className="truncate text-xs text-text-primary">{entry.filename}</p>
          </div>
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
    </button>
  );
}
