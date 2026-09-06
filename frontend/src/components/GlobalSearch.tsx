"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useShortcutsContext } from "@/components/ShortcutsProvider";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";

import { useTranslations } from "next-intl";
import { getDriveFiles, getWatchHistory } from "@/lib/api";
import { fetchSemanticHits, isSemanticSearchAvailable } from "@/lib/semanticSearch";
import {
  mergeResults,
  sortMerged,
  type SemanticHit,
} from "@/lib/searchMerge";
import {
  readSearchCache,
  writeSearchCache,
  type SearchCacheKey,
} from "@/lib/searchCache";
import type { FileItemWithMatch, WatchHistoryItem } from "@/types";
import { useCurrentDrive } from "./CurrentDriveProvider";
import { MergedResultItem } from "./search/MergedResultItem";
import { SearchEmptyState, type EmptyItem } from "./search/SearchEmptyState";

const MAX_HISTORY = 20;
const POPUP_LIMIT = 8;

/** How many recently-opened files the empty state offers. */
const RECENT_FILE_LIMIT = 8;

function historyKey(drive: string): string {
  return `search-history:${drive}`;
}

/**
 * Read the persisted search-term history.
 *
 * The value is validated rather than trusted: this key can hold anything a
 * hand edit, an older schema, or another tab left behind, and every caller
 * (including the empty-state list, which maps over it unconditionally) treats
 * the result as a string array.
 */
function getHistory(drive: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyKey(drive));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function saveHistory(drive: string, history: string[]): void {
  try {
    localStorage.setItem(historyKey(drive), JSON.stringify(history));
  } catch {
    // jsdom test envs / Safari private mode can throw on localStorage; the
    // history list is best-effort UX, not a correctness requirement.
  }
}

function addToHistory(drive: string, term: string): string[] {
  const normalized = term.trim();
  if (!normalized) return getHistory(drive);
  const prev = getHistory(drive).filter((h) => h !== normalized);
  const next = [normalized, ...prev].slice(0, MAX_HISTORY);
  saveHistory(drive, next);
  return next;
}

function removeFromHistory(drive: string, term: string): string[] {
  const next = getHistory(drive).filter((h) => h !== term);
  saveHistory(drive, next);
  return next;
}

export function GlobalSearch() {
  const t = useTranslations("search");
  const tsc = useTranslations("shortcuts");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [merged, setMerged] = useState<FileItemWithMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  // Kept with its drive so a stale payload can never be rendered — see the
  // fetch effect below.
  const [recentData, setRecentData] = useState<{
    drive: string;
    items: WatchHistoryItem[];
  } | null>(null);
  const [composing, setComposing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  // Render mobile fullscreen vs. desktop modal based on viewport width.
  // Prior versions dual-rendered both DOM trees and relied on Tailwind
  // `sm:*` classes to hide one — but that surfaces both copies in
  // testing environments without CSS, and forces every consumer of
  // `getByText` to switch to `getAllByText`. The viewport check stays
  // simple (resize listener) and SSR-safe (defaults to desktop).
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drive = useCurrentDrive();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobileViewport(mql.matches);
    apply();
    mql.addEventListener?.("change", apply);
    return () => mql.removeEventListener?.("change", apply);
  }, []);

  const openSearch = useCallback(() => {
    setHistory(drive ? getHistory(drive) : []);
    setOpen(true);
    setTimeout(() => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile) {
        mobileInputRef.current?.focus();
      } else {
        desktopInputRef.current?.focus();
      }
    }, 50);
  }, [drive]);

  const { openCheatSheet } = useShortcutsContext();

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMerged([]);
    setTotal(0);
  }, []);

  /**
   * Close this, then open that.
   *
   * Two overlays at once make Escape ambiguous — the provider ignores every
   * other shortcut while the cheat sheet is up, so the modal underneath
   * would still be there when it closes, and the reader would press Escape
   * twice to leave something they opened once.
   */
  const openShortcuts = useCallback(() => {
    closeSearch();
    openCheatSheet();
  }, [closeSearch, openCheatSheet]);

  // Both bindings open the same modal. ctrl+k is the switcher ergonomics
  // (one chord, reachable one-handed); ctrl+shift+f is kept so existing
  // muscle memory keeps working.
  //
  // `editingOnly` is deliberately left unset here. Unset means "fires only
  // when no editing element has focus", which is what partitions these from
  // the Knowledge editor's own ctrl+k (insert link, editingOnly: true) and
  // stops either chord firing while the user types in any other field.
  // That partition is the reason the flag exists — see ShortcutsProvider.
  useShortcuts("global", tsc("global"), [
    {
      key: "ctrl+shift+f",
      label: tsc("search"),
      handler: openSearch,
    },
    {
      key: "ctrl+k",
      label: tsc("switcher"),
      handler: openSearch,
    },
  ]);

  // Closing needs its own context, pushed on top of the stack while the modal
  // is open, for two reasons:
  //
  //  1. Opening focuses the search input, and the provider classifies a focused
  //     INPUT as "editing". A closing handler registered above with editingOnly
  //     unset would therefore never fire — the chord would look like a toggle
  //     in the source and be dead in the browser.
  //  2. An addon editor mounted beneath (Knowledge binds ctrl+k while editing)
  //     would otherwise win the chord and write a link into the note behind the
  //     modal.
  //
  // `editingOnly: false` means "fires regardless of focus state".
  // `OVERLAY_PRIORITY` puts the context in a tier above plain push order, so a
  // context that enables *after* the modal opened — Knowledge gates its editor
  // shortcuts on the note body having loaded — cannot take the chord back.
  useShortcuts(
    "search-modal",
    tsc("search"),
    [
      { key: "escape", label: tc("close"), editingOnly: false, hidden: true, handler: closeSearch },
      { key: "ctrl+k", label: tc("close"), editingOnly: false, handler: closeSearch },
      { key: "ctrl+shift+f", label: tc("close"), editingOnly: false, handler: closeSearch },
    ],
    open,
    OVERLAY_PRIORITY,
  );

  // Recently-opened files come from the server, not a local list: opening any
  // file detail page records `last_played_at` regardless of media type, so
  // watch history already is the cross-device record of "what I was just on".
  // `filter: "all"` is required — the default `unfinished` applies a 90%
  // completion gate meant for continue-watching, which would drop exactly the
  // notes and videos a user most wants to return to.
  //
  // The loaded files are stored with the drive they came from. GlobalSearch is
  // mounted in the header under the root layout, so it survives drive
  // navigation — a bare array would keep showing (and let the user open) files
  // from the drive they just left until the next request landed, and a drive is
  // a security boundary. Tagging the payload makes the stale set unrenderable
  // the moment `drive` changes, without a clearing flash on re-open.
  useEffect(() => {
    if (!open || !drive) {
      setRecentData(null);
      return;
    }
    let cancelled = false;
    getWatchHistory(drive, RECENT_FILE_LIMIT, "all")
      .then((items) => {
        if (!cancelled) setRecentData({ drive, items });
      })
      .catch(() => {
        // Best-effort: the modal is still usable for searching without it.
        if (!cancelled) setRecentData({ drive, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, drive]);

  const recentFiles =
    recentData && recentData.drive === drive ? recentData.items : [];

  // `selectedIndex` is a position in a list that is assembled asynchronously.
  // Resetting whenever the composition changes stops a late-arriving payload
  // from sliding rows underneath a live selection and retargeting the user's
  // Enter, and keeps the index from pointing past the end of a shorter list.
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query, open, recentData]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const el = document.querySelector<HTMLElement>(`[data-search-item="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Debounced merged search: filename + semantic in parallel.
  // - Cache lookup is synchronous at the top of the effect so a re-opened
  //   popup with the same query renders instantly before the debounce.
  // - AbortController cancels the prior request when the query changes.
  useEffect(() => {
    if (!open || !drive || !query.trim()) {
      setMerged([]);
      setTotal(0);
      return;
    }

    const trimmed = query.trim();
    const cacheKey: SearchCacheKey = {
      drive,
      query: trimmed,
      type: null,
      includeSceneClip: false,
    };

    const cached = readSearchCache(cacheKey);
    if (cached) {
      const m = mergeResults({
        filenameMatches: cached.filenameMatches,
        semanticHits: cached.semanticHits,
        filenameTotal: cached.filenameTotal,
      });
      const sorted = sortMerged(m.files, "relevance", "desc");
      setMerged(sorted.slice(0, POPUP_LIMIT));
      setTotal(m.total);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ctrl = new AbortController();

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const filenameP = getDriveFiles(
        drive,
        { search: trimmed, limit: POPUP_LIMIT },
        { signal: ctrl.signal },
      );
      const semanticP = isSemanticSearchAvailable(drive).then((available) => {
        if (!available || ctrl.signal.aborted) return [] as SemanticHit[];
        return fetchSemanticHits(trimmed, drive, {
          limit: POPUP_LIMIT,
          signal: ctrl.signal,
        });
      });
      Promise.all([filenameP, semanticP])
        .then(([filenameRes, semanticHits]) => {
          if (ctrl.signal.aborted) return;
          const m = mergeResults({
            filenameMatches: filenameRes.data,
            semanticHits,
            filenameTotal: filenameRes.meta.total,
          });
          const sorted = sortMerged(m.files, "relevance", "desc");
          setMerged(sorted.slice(0, POPUP_LIMIT));
          setTotal(m.total);
          writeSearchCache(cacheKey, {
            filenameMatches: filenameRes.data,
            filenameTotal: filenameRes.meta.total,
            semanticHits,
          });
        })
        .catch(() => {
          // Stale-while-revalidate: keep the cached snapshot rendered
          // when revalidation fails on a transient network blip. Only
          // wipe state when there was nothing cached to fall back on.
          if (!ctrl.signal.aborted && !cached) {
            setMerged([]);
            setTotal(0);
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      ctrl.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, drive]);

  const navigateToSearchPage = useCallback(
    (term: string) => {
      const normalized = term.trim();
      if (!normalized || !drive) return;
      try {
        setHistory(addToHistory(drive, normalized));
      } catch {
        // see saveHistory comment
      }
      closeSearch();
      router.push(
        `/drive/${encodeURIComponent(drive)}/search?q=${encodeURIComponent(normalized)}`,
      );
    },
    [drive, router, closeSearch],
  );

  function handleSelect(url: string) {
    try {
      if (drive) setHistory(addToHistory(drive, query));
    } catch {
      // see saveHistory comment
    }
    closeSearch();
    router.push(url);
  }

  function handleSubmit(term: string) {
    navigateToSearchPage(term);
  }

  function handleHistorySubmit(term: string) {
    setQuery(term);
    navigateToSearchPage(term);
  }

  function handleRemoveHistory(term: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (drive) setHistory(removeFromHistory(drive, term));
  }

  function handleFillInput(term: string, e: React.MouseEvent) {
    e.stopPropagation();
    setQuery(term);
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    if (isMobile) {
      mobileInputRef.current?.focus();
    } else {
      desktopInputRef.current?.focus();
    }
  }

  const hasResults = merged.length > 0;
  const hasQuery = query.trim().length > 0;

  // Rows shown when the query is empty. Modelled as one flat list rather
  // than a per-section branch so keyboard navigation runs through every
  // row as a single index space, whatever mix of row kinds is present.
  // Files first: the chord's main use is getting back to what you just had
  // open, which should be one Enter away.
  const emptyItems: EmptyItem[] = hasQuery
    ? []
    : [
        ...recentFiles.map<EmptyItem>((file) => ({ kind: "file", file })),
        ...history.map<EmptyItem>((term) => ({ kind: "term", term })),
      ];
  const showEmptyState = emptyItems.length > 0;
  const recentFileCount = hasQuery ? 0 : recentFiles.length;

  function activateEmptyItem(item: EmptyItem | undefined) {
    if (!item) return;
    if (item.kind === "term") {
      handleHistorySubmit(item.term);
    } else {
      handleSelect(`/files/${item.file.id}`);
    }
  }

  const searchInput = (
    ref: React.RefObject<HTMLInputElement | null>,
    mobile: boolean,
  ) => (
    <input
      ref={ref}
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setComposing(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const maxIdx = showEmptyState
            ? emptyItems.length - 1
            : hasResults
              ? merged.length
              : -1;
          if (maxIdx >= 0) setSelectedIndex((prev) => Math.min(maxIdx, prev + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(-1, prev - 1));
        } else if (e.key === "Enter" && !composing) {
          if (selectedIndex >= 0 && showEmptyState) {
            activateEmptyItem(emptyItems[selectedIndex]);
          } else if (selectedIndex >= 0 && hasResults) {
            if (selectedIndex < merged.length) {
              handleSelect(`/files/${merged[selectedIndex].id}`);
            } else {
              handleSubmit(query);
            }
          } else {
            handleSubmit(query);
          }
        }
      }}
      placeholder={drive ? t("searchInDrive", { drive }) : t("selectDrive")}
      disabled={!drive}
      className={
        mobile
          ? "w-full rounded-full bg-sand px-4 py-2 text-base text-text-primary placeholder:text-text-muted outline-none"
          : "flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted outline-none"
      }
    />
  );

  const resultsList = (mobile: boolean) => (
    <div className={mobile ? "" : "max-h-[50vh] overflow-y-auto"}>
      {loading && merged.length === 0 ? (
        <div className={`flex items-center justify-center ${mobile ? "py-12" : "py-8"}`}>
          <div className={`${mobile ? "h-6 w-6" : "h-5 w-5"} animate-spin rounded-full border-2 border-accent border-t-transparent`} />
        </div>
      ) : (
        <>
          {merged.length > 0 && (
            <>
              {merged.map((file, idx) => (
                <div key={file.id} data-search-item={idx}>
                  <MergedResultItem
                    file={file}
                    onSelect={handleSelect}
                    isSelected={selectedIndex === idx}
                  />
                </div>
              ))}
              <button
                data-search-item={merged.length}
                onClick={() => handleSubmit(query)}
                className={`flex w-full items-center justify-between gap-3 border-t border-bg-border px-4 py-2.5 text-left transition-colors ${selectedIndex === merged.length ? "bg-bg-elevated" : "hover:bg-bg-elevated"}`}
              >
                <span className="truncate text-sm font-medium text-accent">
                  {t("viewAllResults", { total })}
                </span>
                <ArrowRight size={16} className="flex-shrink-0 text-accent" />
              </button>
            </>
          )}

          {!loading && !hasResults && (
            <div className={`text-center text-sm text-text-muted ${mobile ? "py-12" : "py-8"}`}>
              {t("noResults")}
            </div>
          )}
        </>
      )}
    </div>
  );

  const clearQuery = (focusRef?: React.RefObject<HTMLInputElement | null>) => {
    setQuery("");
    setMerged([]);
    setTotal(0);
    focusRef?.current?.focus();
  };

  return (
    <>
      <button
        onClick={openSearch}
        className="rounded-2xl p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        aria-label={t("label")}
        title={t("title")}
      >
        <Search size={18} />
      </button>

      {open &&
        isMobileViewport &&
        createPortal(
          // Mobile: full-screen
          <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-bg-border px-2 py-2">
            <button
              onClick={closeSearch}
              className="flex-shrink-0 rounded-lg p-2 text-text-muted hover:text-text-primary"
              aria-label={tc("close")}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="relative flex-1">
              {searchInput(mobileInputRef, true)}
              {query && (
                <button
                  onClick={() => clearQuery(mobileInputRef)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {!drive ? (
                <div className="py-12 text-center text-sm text-text-muted">
                  {t("goToDrive")}
                </div>
              ) : showEmptyState ? (
                <SearchEmptyState
                  items={emptyItems}
                  selectedIndex={selectedIndex}
                  recentFileCount={recentFileCount}
                  mobile={true}
                  onOpenFile={(file) => handleSelect(`/files/${file.id}`)}
                  onSubmitTerm={handleHistorySubmit}
                  onFillInput={handleFillInput}
                  onRemoveTerm={handleRemoveHistory}
                />
              ) : hasQuery ? (
                resultsList(true)
              ) : null}
            </div>

            {/* Outside the scroll area on purpose: 案 5 (Phase 4) makes
                Cmd+K two-stage, with semantic hits arriving after the
                name matches, and a row inside the list would slide down
                the page every time they land. Two columns, the right one
                empty, so that stage has somewhere to put its progress. */}
            <div className="flex items-center justify-between border-t border-bg-border px-4 py-2">
              <button
                type="button"
                onClick={openShortcuts}
                className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
              >
                <kbd className="rounded border border-bg-border px-1.5 py-0.5 font-sans text-[11px]">?</kbd>
                {tsc("title")}
              </button>
              <span />
            </div>
          </div>,
          document.body
        )}

      {open &&
        !isMobileViewport &&
        createPortal(
          // Desktop: centered modal
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={closeSearch}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-bg-border bg-bg-primary shadow-lg animate-fade-in-scale">
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-bg-border px-4 py-3">
              <Search size={18} className="flex-shrink-0 text-text-muted" />
              {searchInput(desktopInputRef, false)}
              {query && (
                <button
                  onClick={() => clearQuery()}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              )}
              <kbd className="rounded-lg bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
                ESC
              </kbd>
            </div>

            {/* History or Results */}
            {!drive ? (
              <div className="py-8 text-center text-sm text-text-muted">
                {t("goToDrive")}
              </div>
            ) : showEmptyState ? (
              <SearchEmptyState
                  items={emptyItems}
                  selectedIndex={selectedIndex}
                  recentFileCount={recentFileCount}
                  mobile={false}
                  onOpenFile={(file) => handleSelect(`/files/${file.id}`)}
                  onSubmitTerm={handleHistorySubmit}
                  onFillInput={handleFillInput}
                  onRemoveTerm={handleRemoveHistory}
                />
            ) : hasQuery ? (
              resultsList(false)
            ) : null}

            {/* Outside the scroll area on purpose: 案 5 (Phase 4) makes
                Cmd+K two-stage, with semantic hits arriving after the
                name matches, and a row inside the list would slide down
                the page every time they land. Two columns, the right one
                empty, so that stage has somewhere to put its progress. */}
            <div className="flex items-center justify-between border-t border-bg-border px-4 py-2">
              <button
                type="button"
                onClick={openShortcuts}
                className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
              >
                <kbd className="rounded border border-bg-border px-1.5 py-0.5 font-sans text-[11px]">?</kbd>
                {tsc("title")}
              </button>
              <span />
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
