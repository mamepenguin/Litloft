"use client";

import type { ReactElement } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItemWithMatch } from "@/types";
import type { SearchScope } from "./GlobalSearchProvider";
import { JumpRows } from "./JumpRows";
import { MergedResultItem } from "./MergedResultItem";
import { ScopedResultItem } from "./ScopedSearchParts";
import type { JumpDestination } from "./useJumpDestinations";

interface SearchResultsListProps {
  mobile: boolean;
  query: string;
  scope: SearchScope | null;
  pageJumps: readonly JumpDestination[];
  folderJumps: readonly JumpDestination[];
  merged: readonly FileItemWithMatch[];
  total: number;
  loading: boolean;
  semanticPending: boolean;
  selectedIndex: number;
  onOpenJump: (jump: JumpDestination) => void;
  onEnterFolder: (path: string) => void;
  onSelect: (url: string) => void;
  onSubmit: (term: string) => void;
}

/** What a typed query shows: Go to, Folders, the file results and the see-all row. */
export function SearchResultsList({
  mobile,
  query,
  scope,
  pageJumps,
  folderJumps,
  merged,
  total,
  loading,
  semanticPending,
  selectedIndex,
  onOpenJump,
  onEnterFolder,
  onSelect,
  onSubmit,
}: SearchResultsListProps): ReactElement {
  const t = useTranslations("search");
  const tj = useTranslations("pageJump");

  return (
    <div className={mobile ? "" : "max-h-[50vh] overflow-y-auto"}>
      {pageJumps.length > 0 && (
        <JumpRows
          heading={tj("section")}
          jumps={pageJumps}
          offset={0}
          selectedIndex={selectedIndex}
          mobile={mobile}
          onOpen={onOpenJump}
          onEnterFolder={onEnterFolder}
        />
      )}
      {folderJumps.length > 0 && (
        <JumpRows
          heading={tj("folders")}
          jumps={folderJumps}
          offset={pageJumps.length}
          selectedIndex={selectedIndex}
          mobile={mobile}
          onOpen={onOpenJump}
          onEnterFolder={onEnterFolder}
        />
      )}
      {loading && merged.length === 0 ? (
        <div className={`flex items-center justify-center ${mobile ? "py-12" : "py-8"}`}>
          <div className={`${mobile ? "h-6 w-6" : "h-5 w-5"} animate-spin rounded-full border-2 border-accent border-t-transparent`} />
        </div>
      ) : (
        <>
          {merged.length > 0 && scope && (
            <div className="py-1.5">
              {merged.map((file, idx) => (
                <div key={file.id} data-search-item={pageJumps.length + folderJumps.length + idx}>
                  <ScopedResultItem
                    file={file}
                    query={query}
                    isSelected={selectedIndex === pageJumps.length + folderJumps.length + idx}
                    onSelect={onSelect}
                  />
                </div>
              ))}
            </div>
          )}
          {merged.length > 0 && !scope && (
            <>
              {merged.map((file, idx) => (
                <div key={file.id} data-search-item={pageJumps.length + folderJumps.length + idx}>
                  <MergedResultItem
                    file={file}
                    onSelect={onSelect}
                    isSelected={selectedIndex === pageJumps.length + folderJumps.length + idx}
                  />
                </div>
              ))}
              <button
                data-search-item={pageJumps.length + folderJumps.length + merged.length}
                onClick={() => onSubmit(query)}
                className={`flex w-full items-center justify-between gap-3 border-t border-bg-border px-4 py-2.5 text-left transition-colors ${selectedIndex === pageJumps.length + folderJumps.length + merged.length ? "bg-bg-elevated" : "hover:bg-bg-elevated"}`}
              >
                <span className="truncate text-sm font-medium text-accent">
                  {t("viewAllResults", { total })}
                </span>
                <ArrowRight size={16} className="flex-shrink-0 text-accent" />
              </button>
            </>
          )}

          {/* `semanticPending` belongs in this gate as much as `loading`
              does: the phrase a semantic search exists for is exactly the
              one no filename matches. */}
          {!loading && !semanticPending && merged.length === 0 && (
            <div className={`text-center text-sm text-text-muted ${mobile ? "py-12" : "py-8"}`}>
              {t("noResults")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
