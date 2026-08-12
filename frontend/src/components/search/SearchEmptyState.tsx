"use client";

import type { MouseEvent, ReactElement } from "react";
import { ArrowUpLeft, Clock, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { WatchHistoryItem } from "@/types";
import { FileTypeIcon } from "../FileTypeIcon";

/**
 * A row shown while the search query is empty.
 *
 * Modelled as a discriminated union rather than two separate lists so that
 * keyboard navigation in the parent walks one index space, whatever mix of
 * row kinds is present.
 */
export type EmptyItem =
  | { kind: "file"; file: WatchHistoryItem }
  | { kind: "term"; term: string };

interface SearchEmptyStateProps {
  items: EmptyItem[];
  /** Index of the row the parent's keyboard navigation has selected, or -1. */
  selectedIndex: number;
  /** Where the file rows stop and the term rows begin, for the headings. */
  recentFileCount: number;
  mobile: boolean;
  onOpenFile: (file: WatchHistoryItem) => void;
  onSubmitTerm: (term: string) => void;
  onFillInput: (term: string, e: MouseEvent) => void;
  onRemoveTerm: (term: string, e: MouseEvent) => void;
}

/**
 * The body of the search modal before anything is typed: recently-opened
 * files, then previously-used search terms.
 *
 * Purely presentational — every piece of state and every side effect lives in
 * GlobalSearch.
 */
export function SearchEmptyState({
  items,
  selectedIndex,
  recentFileCount,
  mobile,
  onOpenFile,
  onSubmitTerm,
  onFillInput,
  onRemoveTerm,
}: SearchEmptyStateProps): ReactElement {
  const t = useTranslations("search");

  const rowClass = (idx: number) =>
    `flex w-full items-center gap-3 px-4 text-left transition-colors ${
      mobile
        ? `py-3 ${selectedIndex === idx ? "bg-bg-elevated" : "active:bg-bg-elevated"}`
        : `py-2.5 ${selectedIndex === idx ? "bg-bg-elevated" : "hover:bg-bg-elevated"}`
    }`;

  const heading = (text: string) => (
    <div className="px-4 pt-3 pb-1 text-xs font-medium text-text-muted">
      {text}
    </div>
  );

  return (
    <div className={mobile ? "" : "max-h-[50vh] overflow-y-auto"}>
      {items.map((item, idx) => {
        // Headings are not selectable, so they ride along with the row that
        // opens their section instead of consuming a keyboard index.
        const sectionHeading =
          idx === 0 && item.kind === "file"
            ? heading(t("recentFiles"))
            : idx === recentFileCount && item.kind === "term"
              ? heading(t("recentSearches"))
              : null;

        return (
          <div
            key={item.kind === "file" ? `f:${item.file.id}` : `t:${item.term}`}
          >
            {sectionHeading}
            {item.kind === "file" ? (
              <button
                data-search-item={idx}
                onClick={() => onOpenFile(item.file)}
                className={rowClass(idx)}
              >
                <FileTypeIcon
                  fileType={item.file.file_type}
                  size={mobile ? 18 : 16}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text-primary">
                    {item.file.title || item.file.filename}
                  </div>
                  {item.file.folder_path && (
                    <div className="truncate text-xs text-text-muted">
                      {item.file.folder_path}
                    </div>
                  )}
                </div>
              </button>
            ) : (
              <button
                data-search-item={idx}
                onClick={() => onSubmitTerm(item.term)}
                className={rowClass(idx)}
              >
                <Clock
                  size={mobile ? 18 : 16}
                  className="flex-shrink-0 text-text-muted"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {item.term}
                </span>
                <button
                  onClick={(e) => onFillInput(item.term, e)}
                  className={`flex-shrink-0 rounded-lg text-text-muted ${
                    mobile
                      ? "p-1.5 active:bg-bg-elevated"
                      : "p-1 hover:text-text-primary"
                  }`}
                  aria-label={t("fillInput", { term: item.term })}
                >
                  <ArrowUpLeft size={mobile ? 16 : 14} />
                </button>
                <button
                  onClick={(e) => onRemoveTerm(item.term, e)}
                  className={`flex-shrink-0 rounded-lg text-text-muted ${
                    mobile
                      ? "p-1.5 active:bg-bg-elevated"
                      : "p-1 hover:text-text-primary"
                  }`}
                  aria-label={t("removeHistory", { term: item.term })}
                >
                  <X size={mobile ? 16 : 14} />
                </button>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
