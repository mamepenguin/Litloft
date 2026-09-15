"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Info, Search, X } from "lucide-react";
import { useShortcuts } from "@/hooks/useShortcuts";
import { MatchLegend } from "@/components/search/MatchLegend";
import { useShortcutsContext } from "@/components/ShortcutsProvider";
import { NESTED_OVERLAY_PRIORITY, OVERLAY_PRIORITY } from "@/lib/shortcuts";

import { useTranslations } from "next-intl";
import { getDriveFiles, getWatchHistory } from "@/lib/api";
import { useImeKeyGuard } from "@/lib/ime";
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
import { addToHistory, getHistory, removeFromHistory } from "./search/searchHistory";
import {
  useRegisterGlobalSearch,
  type GlobalSearchOpenOptions,
  type SearchScope,
} from "./search/GlobalSearchProvider";
import { ScopeChip, ScopedFooter, ScopedResultItem } from "./search/ScopedSearchParts";

const POPUP_LIMIT = 8;

const RECENT_FILE_LIMIT = 8;

export function GlobalSearch() {
  const t = useTranslations("search");
  const tsc = useTranslations("shortcuts");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope | null>(null);
  const scopeType = scope?.type ?? null;
  const [merged, setMerged] = useState<FileItemWithMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [semanticPending, setSemanticPending] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [recentData, setRecentData] = useState<{
    drive: string;
    type: SearchScope["type"] | null;
    items: WatchHistoryItem[];
  } | null>(null);
  const ime = useImeKeyGuard();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  /**
   * The highlight is a promise about where the next Enter lands, and the
   * list moves underneath it: the second stage reorders by relevance. A
   * position cannot keep that promise; a file can.
   */
  type Highlighted =
    | { kind: "none" }
    | { kind: "tail" }
    | { kind: "file"; id: string };
  const highlightedRef = useRef<Highlighted>({ kind: "none" });
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

  const focusInput = useCallback(() => {
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    if (isMobile) {
      mobileInputRef.current?.focus();
    } else {
      desktopInputRef.current?.focus();
    }
  }, []);

  const openWith = useCallback(
    (nextScope: SearchScope | null) => {
      setHistory(drive ? getHistory(drive) : []);
      setScope(nextScope);
      setOpen(true);
      setTimeout(focusInput, 50);
    },
    [drive, focusInput],
  );

  const { defaultScope } = useRegisterGlobalSearch((options?: GlobalSearchOpenOptions) => {
    if (!open) openWith(options?.scope ?? defaultScope());
  });

  const openSearch = useCallback(() => openWith(defaultScope()), [openWith, defaultScope]);

  const { openCheatSheet } = useShortcutsContext();

  const closeSearch = useCallback(() => {
    setOpen(false);
    setLegendOpen(false);
    setQuery("");
    setMerged([]);
    setTotal(0);
  }, []);

  /**
   * Two overlays at once make Escape ambiguous: the reader would press Escape
   * twice to leave something they opened once.
   */
  const openShortcuts = useCallback(() => {
    closeSearch();
    openCheatSheet();
  }, [closeSearch, openCheatSheet]);

  // `editingOnly` is deliberately left unset here. Unset means "fires only
  // when no editing element has focus", which is what partitions these from
  // the Knowledge editor's own ctrl+k (insert link, editingOnly: true).
  useShortcuts("global", tsc("global"), [
    {
      key: "ctrl+shift+f",
      label: tsc("search"),
      handler: openSearch,
    },
    {
      key: "ctrl+k",
      label: tsc("search"),
      handler: openSearch,
    },
  ]);

  // Closing needs its own context: opening focuses the search input, which the
  // provider classifies as "editing", so a closing handler registered above
  // would never fire; and an addon editor mounted beneath (Knowledge binds
  // ctrl+k while editing) would otherwise win the chord. `OVERLAY_PRIORITY`
  // stops a context that enables *after* the modal opened taking the chord back.
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

  useShortcuts(
    "search-legend",
    t("badgeLegend"),
    [
      {
        key: "escape",
        label: tc("close"),
        editingOnly: false,
        hidden: true,
        handler: () => setLegendOpen(false),
      },
    ],
    open && legendOpen,
    NESTED_OVERLAY_PRIORITY,
  );

  // `filter: "all"` is required — the default `unfinished` applies a 90%
  // completion gate meant for continue-watching.
  //
  // The loaded files are stored with the drive they came from. GlobalSearch
  // survives drive navigation, so a bare array would keep showing files from
  // the drive they just left until the next request landed, and a drive is a
  // security boundary.
  useEffect(() => {
    if (!open || !drive) {
      setRecentData(null);
      return;
    }
    let cancelled = false;
    const request = scopeType
      ? getWatchHistory(drive, RECENT_FILE_LIMIT, "all", scopeType)
      : getWatchHistory(drive, RECENT_FILE_LIMIT, "all");
    request
      .then((items) => {
        if (!cancelled) setRecentData({ drive, type: scopeType, items });
      })
      .catch(() => {
        if (!cancelled) setRecentData({ drive, type: scopeType, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, drive, scopeType]);

  const recentFiles =
    recentData && recentData.drive === drive && recentData.type === scopeType
      ? recentData.items
      : [];

  // It is the *order*, not the array. `paint()` builds a fresh array every
  // run, including the one where the second stage came back with nothing to
  // add, so keying on the array would yank the highlight off a list that
  // never moved.
  const mergedOrder = merged.map((f) => f.id).join("\u0000");
  useEffect(() => {
    const held = highlightedRef.current;
    if (held.kind === "none") return;
    if (held.kind === "tail") {
      setSelectedIndex(merged.length);
      return;
    }
    const next = merged.findIndex((file) => file.id === held.id);
    if (next === -1) highlightedRef.current = { kind: "none" };
    setSelectedIndex(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedOrder]);

  useEffect(() => {
    highlightedRef.current = { kind: "none" };
    setSelectedIndex(-1);
  }, [query, open, scopeType]);

  // A history reply landing after the reader arrowed onto a result would
  // otherwise take the highlight off a row that never moved.
  const queryIsEmpty = query.trim().length === 0;
  useEffect(() => {
    if (!queryIsEmpty) return;
    highlightedRef.current = { kind: "none" };
    setSelectedIndex(-1);
  }, [recentData, queryIsEmpty]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const el = document.querySelector<HTMLElement>(`[data-search-item="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

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
      type: scopeType,
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

      // `ctrl.signal.aborted` is the whole generation guard. The cleanup
      // below aborts synchronously when the query, the drive or `open`
      // changes, so a stage belonging to an older query cannot reach
      // `setMerged` however the two stages interleave.
      let filenameRes: Awaited<ReturnType<typeof getDriveFiles>> | null = null;
      let semanticHits: SemanticHit[] = [];

      const paint = () => {
        // If semantic search is the faster of the two, its hits wait here
        // rather than rendering a list with no name matches in it.
        if (ctrl.signal.aborted || !filenameRes) return;
        const m = mergeResults({
          filenameMatches: filenameRes.data,
          semanticHits,
          filenameTotal: filenameRes.meta.total,
        });
        const sorted = sortMerged(m.files, "relevance", "desc");
        setMerged(sorted.slice(0, POPUP_LIMIT));
        setTotal(m.total);
      };

      const onStageFailure = () => {
        // Stale-while-revalidate: keep the cached snapshot rendered
        // when revalidation fails on a transient network blip. Only
        // wipe state when there was nothing cached to fall back on.
        if (!ctrl.signal.aborted && !cached && !filenameRes) {
          setMerged([]);
          setTotal(0);
        }
      };

      const filenameP = getDriveFiles(
        drive,
        scopeType
          ? { search: trimmed, limit: POPUP_LIMIT, type: scopeType }
          : { search: trimmed, limit: POPUP_LIMIT },
        { signal: ctrl.signal },
      )
        .then((res) => {
          filenameRes = res;
          paint();
        })
        .catch(onStageFailure)
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });

      // Semantic hits are not filtered by kind, so a scoped search has no
      // second stage.
      const semanticP = (scopeType ? Promise.resolve(false) : isSemanticSearchAvailable(drive))
        .then((available) => {
          if (!available || ctrl.signal.aborted) return [] as SemanticHit[];
          setSemanticPending(true);
          return fetchSemanticHits(trimmed, drive, {
            limit: POPUP_LIMIT,
            signal: ctrl.signal,
          });
        })
        .then((hits) => {
          semanticHits = hits;
          paint();
        })
        .catch(onStageFailure)
        .finally(() => {
          if (!ctrl.signal.aborted) setSemanticPending(false);
        });

      void Promise.all([filenameP, semanticP]).then(() => {
        if (ctrl.signal.aborted || !filenameRes) return;
        writeSearchCache(cacheKey, {
          filenameMatches: filenameRes.data,
          filenameTotal: filenameRes.meta.total,
          semanticHits,
        });
      });
    }, 300);

    return () => {
      ctrl.abort();
      setSemanticPending(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, drive, scopeType]);

  const navigateToSearchPage = useCallback(
    (term: string) => {
      const normalized = term.trim();
      if (!normalized || !drive) return;
      try {
        setHistory(addToHistory(drive, normalized));
      } catch {
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
    }
    closeSearch();
    router.push(url);
  }

  function handleSubmit(term: string) {
    const normalized = term.trim();
    if (scope?.seeAllHref && normalized) {
      handleSelect(scope.seeAllHref(normalized));
      return;
    }
    navigateToSearchPage(term);
  }

  function removeScope() {
    setScope(null);
    focusInput();
  }

  function handleHistorySubmit(term: string) {
    setQuery(term);
    navigateToSearchPage(term);
  }

  function handleRemoveHistory(term: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!drive) return;
    const removedIndex = emptyItems.findIndex(
      (item) => item.kind === "term" && item.term === term,
    );
    if (removedIndex >= 0 && selectedIndex >= 0) {
      if (removedIndex === selectedIndex) setSelectedIndex(-1);
      else if (removedIndex < selectedIndex) setSelectedIndex(selectedIndex - 1);
    }
    setHistory(removeFromHistory(drive, term));
  }

  function handleFillInput(term: string, e: React.MouseEvent) {
    e.stopPropagation();
    setQuery(term);
    focusInput();
  }

  const hasResults = merged.length > 0;
  const hasQuery = query.trim().length > 0;

  // Files first: the chord's main use is getting back to what you just had
  // open, which should be one Enter away. A recent term leads to the unscoped
  // search page, so a scoped modal offers none.
  const emptyItems: EmptyItem[] = hasQuery
    ? []
    : [
        ...recentFiles.map<EmptyItem>((file) => ({ kind: "file", file })),
        ...(scope ? [] : history).map<EmptyItem>((term) => ({ kind: "term", term })),
      ];
  const showEmptyState = emptyItems.length > 0;
  const recentFileCount = hasQuery ? 0 : recentFiles.length;

  /**
   * The recording happens here rather than in an effect on `selectedIndex`:
   * an effect also runs when the *list* changes, and would re-read the row
   * at the old position.
   */
  function moveHighlight(next: (prev: number) => number) {
    setSelectedIndex((prev) => {
      const index = next(prev);
      if (showEmptyState || index < 0) {
        highlightedRef.current = { kind: "none" };
      } else if (index >= merged.length) {
        highlightedRef.current = { kind: "tail" };
      } else {
        highlightedRef.current = { kind: "file", id: merged[index].id };
      }
      return index;
    });
  }

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
      onCompositionEnd={ime.onCompositionEnd}
      onKeyDown={(e) => {
        if (ime.isImeKeystroke(e)) return;
        if (e.key === "Backspace" && scope && query === "") {
          e.preventDefault();
          removeScope();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          const maxIdx = showEmptyState
            ? emptyItems.length - 1
            : hasResults
              ? scope
                ? merged.length - 1
                : merged.length
              : -1;
          if (maxIdx >= 0) moveHighlight((prev) => Math.min(maxIdx, prev + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveHighlight((prev) => Math.max(-1, prev - 1));
        } else if (e.key === "Enter") {
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

  const searchProgress = () =>
    semanticPending ? (
      <span className="text-xs text-text-muted">{t("semanticPending")}</span>
    ) : (
      <span />
    );

  const legendEntry = () => (
    <button
      type="button"
      onClick={() => setLegendOpen((v) => !v)}
      aria-expanded={legendOpen}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
    >
      <Info size={13} className="shrink-0" />
      {t("badgeLegend")}
    </button>
  );

  // Outside the scroll area on purpose: the search resolves in two stages,
  // and a row inside the list would slide the results down the page every
  // time the second one lands.
  const footer = () => (
    <div className="flex items-center justify-between border-t border-bg-border px-4 py-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openShortcuts}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
        >
          <kbd className="rounded border border-bg-border px-1.5 py-0.5 font-sans text-[11px]">?</kbd>
          {tsc("title")}
        </button>
        {legendEntry()}
      </div>
      {searchProgress()}
    </div>
  );

  const resultsList = (mobile: boolean) => (
    <div className={mobile ? "" : "max-h-[50vh] overflow-y-auto"}>
      {loading && merged.length === 0 ? (
        <div className={`flex items-center justify-center ${mobile ? "py-12" : "py-8"}`}>
          <div className={`${mobile ? "h-6 w-6" : "h-5 w-5"} animate-spin rounded-full border-2 border-accent border-t-transparent`} />
        </div>
      ) : (
        <>
          {merged.length > 0 && scope && (
            <div className="py-1.5">
              {merged.map((file, idx) => (
                <div key={file.id} data-search-item={idx}>
                  <ScopedResultItem
                    file={file}
                    query={query}
                    isSelected={selectedIndex === idx}
                    onSelect={handleSelect}
                  />
                </div>
              ))}
            </div>
          )}
          {merged.length > 0 && !scope && (
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

          {/* `semanticPending` belongs in this gate as much as `loading`
              does: the phrase a semantic search exists for is exactly the
              one no filename matches. */}
          {!loading && !semanticPending && !hasResults && (
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
          <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary animate-fade-in">
          <div className="flex items-center gap-2 border-b border-bg-border px-2 py-2">
            <button
              onClick={closeSearch}
              className="flex-shrink-0 rounded-lg p-2 text-text-muted hover:text-text-primary"
              aria-label={tc("close")}
            >
              <ArrowLeft size={20} />
            </button>
            {scope && <ScopeChip scope={scope} onRemove={removeScope} />}
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

            <div className="flex-1 overflow-y-auto">
              {legendOpen ? (
                <MatchLegend />
              ) : !drive ? (
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

            {scope ? (
              <ScopedFooter scope={scope} query={query} mobile onSeeAll={handleSelect} />
            ) : (
              footer()
            )}
          </div>,
          document.body
        )}

      {open &&
        !isMobileViewport &&
        createPortal(
        // `px-4`: between the mobile sheet and `max-w-3xl` binding the panel is
        // `w-full` against an unpadded container, so without it the card sits
        // flush against the viewport edge.
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={closeSearch}
          />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-bg-border bg-bg-primary shadow-lg animate-fade-in-scale">
            <div className="flex items-center gap-3 border-b border-bg-border px-4 py-3">
              <Search size={18} className="flex-shrink-0 text-text-muted" />
              {scope && <ScopeChip scope={scope} onRemove={removeScope} />}
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

            {legendOpen ? (
              <MatchLegend />
            ) : !drive ? (
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

            {scope ? (
              <ScopedFooter
                scope={scope}
                query={query}
                mobile={false}
                onSeeAll={handleSelect}
              />
            ) : (
              footer()
            )}
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
