"use client";

import { ChevronRight, Folder } from "lucide-react";

import { useTranslations } from "next-intl";
import { getArchiveEntryUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { FileTypeIcon } from "../FileTypeIcon";
import { buttonClass } from "../Button";
import type { ArchiveEntry, FileType } from "@/types";

interface ArchiveFileListingProps {
  fileId: string;
  entries: ArchiveEntry[];
  handleDirClick: (entry: ArchiveEntry) => void;
  handleFileClick: (entry: ArchiveEntry) => void;
  isClickable: (entry: ArchiveEntry) => boolean;
}

const ROW_CLASS =
  "flex w-full items-center gap-3 border-b border-bg-border px-4 py-2.5 text-left " +
  "pointer-coarse:min-h-11";

/**
 * Different elements rather than one element with a flag, because a dead-end
 * row holds a download link: nesting an `<a>` inside a `<button>` is invalid
 * HTML, and browsers recover from it by hoisting the link out of the button.
 */
function RowBox({
  clickable,
  onClick,
  children,
}: {
  clickable: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  if (!clickable) {
    return <div className={ROW_CLASS}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ROW_CLASS} cursor-pointer transition-colors hover:bg-bg-elevated`}
    >
      {children}
    </button>
  );
}

export function ArchiveFileListing({
  fileId,
  entries,
  handleDirClick,
  handleFileClick,
  isClickable,
}: ArchiveFileListingProps) {
  const t = useTranslations("archive");

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-xl bg-bg-card">
          {entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">
              {t("emptyFolder")}
            </div>
          ) : (
            <ul role="list">
              {entries.map((entry) => {
                const clickable = isClickable(entry);
                return (
                  <li key={entry.path}>
                    <RowBox
                      clickable={clickable}
                      onClick={() => {
                        if (entry.is_dir) {
                          handleDirClick(entry);
                        } else {
                          handleFileClick(entry);
                        }
                      }}
                    >
                      {entry.is_dir ? (
                        <Folder
                          size={20}
                          className="shrink-0 text-accent"
                        />
                      ) : (
                        <FileTypeIcon
                          fileType={(entry.file_type as FileType) || "other"}
                          size={20}
                          className="shrink-0 text-text-muted"
                        />
                      )}

                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          clickable ? "text-text-primary" : "text-text-muted"
                        }`}
                      >
                        {entry.filename}
                      </span>

                      {!entry.is_dir && (
                        <span className="shrink-0 text-xs text-text-muted">
                          {formatFileSize(entry.file_size)}
                        </span>
                      )}

                      {!entry.is_dir && !clickable && (
                        <>
                          <span className="shrink-0 text-xs text-text-muted">
                            {t("previewUnavailable")}
                          </span>
                          <a
                            href={getArchiveEntryUrl(fileId, entry.path)}
                            download={entry.filename}
                            // Named per row: "Download" repeated in a screen
                            // reader's links list says nothing about which row
                            // is about to be acted on.
                            aria-label={t("downloadFile", { name: entry.filename })}
                            className={`${buttonClass({ variant: "secondary", size: "sm" })} shrink-0`}
                          >
                            {t("download")}
                          </a>
                        </>
                      )}

                      {entry.is_dir && (
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-text-muted"
                        />
                      )}
                    </RowBox>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}
