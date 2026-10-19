"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Download, Folder } from "lucide-react";

import type { ArchiveController } from "@/lib/archiveController";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { getArchiveEntryUrl } from "@/lib/api";
import { canOpenArchiveEntry } from "@/components/archive/archiveUtils";
import type { ArchiveEntry, FileType } from "@/types";

/**
 * Mounting every row of a large archive to show the first twenty of them
 * freezes the page. Typing is how the rest is reached.
 */
export const INITIAL_ROWS = 200;

/**
 * An entry the viewer cannot open is not a control in the off position,
 * so it is not a button.
 */
function IndexRow({
  entry,
  fileId,
  onOpen,
}: {
  entry: ArchiveEntry;
  fileId: string;
  onOpen: () => void;
}) {
  const t = useTranslations("archive");
  const icon = entry.is_dir ? (
    <Folder size={14} className="flex-shrink-0 text-accent" />
  ) : (
    <FileTypeIcon
      fileType={(entry.file_type as FileType) || "other"}
      size={14}
      className="flex-shrink-0 text-text-muted"
    />
  );
  /* Truncated from the *left*: the tail of a path is the part that tells
     two paths apart, and `direction: rtl` is what makes the ellipsis land
     at the front. `bdi` keeps the path itself reading left-to-right. */
  const path = (
    <span className="min-w-0 flex-1 truncate text-left text-xs [direction:rtl]">
      <bdi>{entry.path}</bdi>
    </span>
  );

  if (!canOpenArchiveEntry(entry)) {
    return (
      <div
        data-testid="archive-index-dead-row"
        title={entry.path}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-text-muted"
      >
        {icon}
        {path}
        <a
          href={getArchiveEntryUrl(fileId, entry.path)}
          download={entry.filename}
          aria-label={t("downloadFile", { name: entry.filename })}
          className="flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-bg-elevated hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:p-3"
        >
          <Download size={14} />
        </a>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="archive-index-row"
      title={entry.path}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-text-primary transition-colors hover:bg-bg-elevated pointer-coarse:min-h-11"
    >
      {icon}
      {path}
    </button>
  );
}

/**
 * The filter is plain substring matching, not the semantic search behind
 * Cmd+K: a filter that moves you somewhere has to be predictable, and a
 * ranked answer to "main" is not.
 */
export function ArchivePagesPanel({
  controller,
  fileId,
  className = "",
}: {
  controller: ArchiveController;
  fileId: string;
  className?: string;
}) {
  const t = useTranslations("archive");
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const snapshot = useCallback(() => controller.getState(), [controller]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.entries;
    return state.entries.filter((entry) =>
      entry.path.toLowerCase().includes(needle),
    );
  }, [state.entries, query]);

  const shown = matches.slice(0, INITIAL_ROWS);
  const hidden = matches.length - shown.length;

  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("indexFilterPlaceholder")}
        aria-label={t("indexFilterLabel")}
        data-testid="archive-index-filter"
        className="w-full rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none pointer-coarse:min-h-11"
      />

      {matches.length === 0 ? (
        <p className="px-1 py-4 text-sm text-text-muted">{t("indexNoMatch")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="archive-index-list">
          {shown.map((entry) => (
            <li key={entry.path}>
              <IndexRow
                entry={entry}
                fileId={fileId}
                onOpen={() => controller.open(entry)}
              />
            </li>
          ))}
          {hidden > 0 && (
            <li
              className="px-2 py-2 text-xs text-text-muted"
              data-testid="archive-index-overflow"
            >
              {t("indexMoreEntries", { count: hidden })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
