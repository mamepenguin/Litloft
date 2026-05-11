"use client";

import { ChevronRight, Download, Folder } from "lucide-react";

import { useTranslations } from "next-intl";
import { getArchiveEntryUrl, getDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { FileTypeIcon } from "../FileTypeIcon";
import type { ArchiveContents, ArchiveEntry, FileType } from "@/types";

interface ArchiveFileListingProps {
  fileId: string;
  archive: ArchiveContents | null;
  currentEntries: ArchiveEntry[];
  breadcrumbs: Array<{ label: string; path: string }>;
  handleBreadcrumbClick: (path: string) => void;
  handleDirClick: (entry: ArchiveEntry) => void;
  handleFileClick: (entry: ArchiveEntry) => void;
  isClickable: (entry: ArchiveEntry) => boolean;
  children?: React.ReactNode;
}

export function ArchiveFileListing({
  fileId,
  archive,
  currentEntries,
  breadcrumbs,
  handleBreadcrumbClick,
  handleDirClick,
  handleFileClick,
  isClickable,
  children,
}: ArchiveFileListingProps) {
  const t = useTranslations("archive");
  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-xl bg-bg-card">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 border-b border-bg-border px-4 py-3">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  size={14}
                  className="text-text-muted"
                />
              )}
              <button
                onClick={() => handleBreadcrumbClick(crumb.path)}
                className={`text-sm transition-colors ${
                  i === breadcrumbs.length - 1
                    ? "font-medium text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {crumb.label}
              </button>
            </span>
          ))}

          {archive && (
            <span className="ml-auto flex items-center gap-2 text-xs text-text-muted">
              <span>
                {t("fileCount", { count: archive.total_entries, size: formatFileSize(archive.total_size) })}
              </span>
              <a
                href={getDownloadUrl(fileId)}
                download
                className="rounded-lg p-1 transition-colors hover:bg-bg-card hover:text-text-primary"
                aria-label={t("downloadArchive")}
                title={t("downloadArchive")}
              >
                <Download size={14} />
              </a>
            </span>
          )}
        </div>

        {/* Entry list */}
        <div className="max-h-[60vh] overflow-auto">
          {currentEntries.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">
              {t("emptyFolder")}
            </div>
          ) : (
            <ul role="list">
              {currentEntries.map((entry) => {
                const clickable = isClickable(entry);
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => {
                        if (entry.is_dir) {
                          handleDirClick(entry);
                        } else if (clickable) {
                          handleFileClick(entry);
                        }
                      }}
                      disabled={!clickable}
                      className={`flex w-full items-center gap-3 border-b border-bg-border px-4 py-2.5 text-left transition-colors ${
                        clickable
                          ? "hover:bg-bg-elevated cursor-pointer"
                          : "opacity-60 cursor-default"
                      }`}
                    >
                      {entry.is_dir ? (
                        <Folder
                          size={20}
                          className="shrink-0 text-accent"
                        />
                      ) : (
                        <FileTypeIcon
                          fileType={
                            (entry.file_type as FileType) || "other"
                          }
                          size={20}
                          className="shrink-0 text-text-muted"
                        />
                      )}

                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          clickable
                            ? "text-text-primary"
                            : "text-text-muted"
                        }`}
                      >
                        {entry.filename}
                      </span>

                      {!entry.is_dir && (
                        <span className="shrink-0 text-xs text-text-muted">
                          {formatFileSize(entry.file_size)}
                        </span>
                      )}

                      {!entry.is_dir && (
                        <a
                          href={getArchiveEntryUrl(fileId, entry.path)}
                          download={entry.filename}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-card hover:text-text-primary"
                          aria-label={t("downloadFile", { name: entry.filename })}
                        >
                          <Download size={14} />
                        </a>
                      )}

                      {entry.is_dir && (
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-text-muted"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
