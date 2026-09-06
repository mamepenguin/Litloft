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
 * How many rows are drawn before the filter has narrowed anything.
 *
 * A 2439-file source zip is the case this tab exists for, and mounting
 * 2439 rows to show the first twenty of them is the same freeze the PDF
 * rail bounds itself against. Typing is how the rest is reached, which
 * is also how anyone finds a path in a tree that size.
 */
export const INITIAL_ROWS = 200;

/**
 * A flat index of the whole archive, with a filter.
 *
 * The canvas shows the level you are on; this shows what is in the
 * archive. They do not overlap, which is the condition for the tab
 * existing at all (`buildInspectorTabs` rule 1) — walking down to
 * `lib/main.dart` one directory at a time is not a way of finding it.
 *
 * The filter is plain substring matching, not the semantic search
 * behind Cmd+K. `00-basis.md` F-4: a filter that moves you somewhere has
 * to be predictable, and a ranked answer to "main" is not.
 */
/**
 * One path, pressable or not.
 *
 * The same rule the canvas keeps: an entry the viewer cannot open is
 * not a control in the off position, so it is not a button. Pressing one
 * used to move the canvas into a folder nobody asked for and then do
 * nothing — `handleFileClick` matches neither the image nor the text
 * arm and returns silently. The download is the way out, exactly as it
 * is in the listing.
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
  /* Truncated from the *left*: in a 384px column the tail of
     `lib/src/widgets/main.dart` is the part that tells two paths apart,
     and `direction: rtl` is what makes the ellipsis land at the front.
     `bdi` keeps the path itself reading left-to-right inside it. */
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

export function ArchivePagesPanel({
  controller,
  fileId,
  className = "",
}: {
  controller: ArchiveController;
  /** For the download an unopenable entry offers instead of a press. */
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
