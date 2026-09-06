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
  const [legendOpen, setLegendOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [merged, setMerged] = useState<FileItemWithMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // Stage two of the two-stage search: true only between the moment the
  // drive is known to have semantic search and the moment its hits land.
  // A drive without the intelligence addon never sets it, so the footer
  // never says "also searching by meaning" where nothing is.
  const [semanticPending, setSemanticPending] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  // Kept with its drive so a stale payload can never be rendered — see the
  // fetch effect below.
  const [recentData, setRecentData] = useState<{
    drive: string;
    items: WatchHistoryItem[];
  } | null>(null);
  const [composing, setComposing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  /**
   * The file the highlight is on, once the reader has put it somewhere.
   *
   * The highlight is a promise about where the next Enter lands, and the
   * list moves underneath it: the second stage reorders by relevance, so
   * the row at a given position is a different file a second later. A
   * position cannot keep that promise; a file can.
   *
   * `null` while the reader has not moved it. An untouched highlight is
   * not about any file, so it must not be pinned to one — the default
   * belongs wherever the default belongs after a reorder.
   */
  const highlightedIdRef = useRef<string | null>(null);
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
    setLegendOpen(false);
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

  // Both bindings open the same modal, in the same state, with the cursor
  // in the same input. ctrl+k is the ergonomics (one chord, reachable
  // one-handed); ctrl+shift+f is there because that is what many people's
  // fingers already know.
  //
  // They carry the same label for that reason. Two rows in the cheat sheet
  // naming one action is honest; two names for it would be the screen
  // claiming a difference that the handlers do not have, which is the
  // reading `docs/user-guide/keyboard-shortcuts.md` §Global was corrected
  // to remove.
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
      label: tsc("search"),
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

  /**
   * While the legend is up, Escape closes the legend and nothing else.
   *
   * A tier above the modal's own context rather than a later push at the
   * same one: "registered further down this component" is not a rule a
   * reader can see, and the modal's Escape has to stay exactly where it is
   * for every other moment. Closing the legend leaves the search where the
   * reader left it — they opened one thing and they close one thing.
   */
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
  //
  // The row order is in here because the search resolves in two stages and
  // the second one reorders: relevance sorting sees only name matches until
  // the semantic hits arrive, so the row at a given position is a different
  // file afterwards. The highlight follows its *file* through that — the
  // accident being avoided is "the next Enter opens something the reader
  // did not choose", and a file that is still listed has not stopped being
  // the answer just because it moved. It is dropped when its file leaves
  // the list, which is the only case where there is nothing to point at.
  //
  // It is the *order*, not the array. `paint()` builds a fresh array every
  // run, including the one where the second stage came back with nothing to
  // add, so keying on the array would yank the highlight off a list that
  // never moved.
  const mergedOrder = merged.map((f) => f.id).join("\u0000");
  useEffect(() => {
    const held = highlightedIdRef.current;
    if (held === null) return;
    const next = merged.findIndex((file) => file.id === held);
    if (next === -1) highlightedIdRef.current = null;
    setSelectedIndex(next);
    // `merged` is deliberately absent: `mergedOrder` is the same fact in a
    // form that does not change when the array is rebuilt identically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedOrder]);

  // A new question, a new list. Nothing here is the same list moving, so
  // there is no file to keep pointing at.
  useEffect(() => {
    highlightedIdRef.current = null;
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

      // Two stages, resolving independently. Name matching is one round
      // trip; semantic search is around five seconds on a cold index. So
      // the name matches paint the moment they land, and the semantic hits
      // merge in and re-rank when they arrive — the switcher is as fast as
      // the faster of the two rather than as slow as the slower.
      //
      // `ctrl.signal.aborted` is the whole generation guard. The cleanup
      // below aborts synchronously when the query, the drive or `open`
      // changes, and every write to React state is behind that check, so
      // a stage belonging to an older query cannot reach `setMerged`
      // however the two stages interleave. A second guard keyed on the
      // query string would say the same thing twice and could never be
      // observed false.
      //
      // For the same reason the guard sits in `paint`, once, rather than
      // in each stage's `.then`. Two guards on one path hide each other:
      // remove either and the other still stops the write, so neither can
      // be shown to matter. The locals below are closure-scoped, so a
      // stage that resolves after its generation ends assigns to an object
      // nothing will read.
      let filenameRes: Awaited<ReturnType<typeof getDriveFiles>> | null = null;
      let semanticHits: SemanticHit[] = [];

      const paint = () => {
        // Nothing to draw from until stage one lands. If semantic search
        // is the faster of the two, its hits wait here rather than
        // rendering a list with no name matches in it.
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
        { search: trimmed, limit: POPUP_LIMIT },
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

      const semanticP = isSemanticSearchAvailable(drive)
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

      // The cache still holds one entry per query with both stages in it,
      // so a re-opened popup paints the finished list in one go rather
      // than replaying the two stages from a snapshot.
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

  /**
   * Move the highlight, and record which file it landed on.
   *
   * The recording happens here rather than in an effect on `selectedIndex`:
   * an effect also runs when the *list* changes, and would re-read the row
   * at the old position — writing down whichever file had just slid under
   * the highlight, which is the accident this exists to prevent.
   *
   * The "view all results" row is a position, not a file, and so is every
   * row of the empty state, whose list a new query replaces outright.
   */
  function moveHighlight(next: (prev: number) => number) {
    setSelectedIndex((prev) => {
      const index = next(prev);
      const file = showEmptyState ? undefined : merged[index];
      highlightedIdRef.current = file ? file.id : null;
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
          if (maxIdx >= 0) moveHighlight((prev) => Math.min(maxIdx, prev + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveHighlight((prev) => Math.max(-1, prev - 1));
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

  // The right column of the footer row. It exists because the search runs in
  // two stages and only the first is fast: name matches come back in one
  // round trip, semantic hits take seconds on a cold index. Putting the
  // "still looking" line here rather than in the results keeps it out of the
  // list that is about to be reordered — a row inside the list would slide
  // the results down the moment the second stage landed.
  const searchProgress = () =>
    semanticPending ? (
      <span className="text-xs text-text-muted">{t("semanticPending")}</span>
    ) : (
      <span />
    );

  /**
   * The way into the legend, beside the shortcut entry.
   *
   * A toggle, not a second modal: A-4 settled that two overlays make
   * Escape ambiguous, and the reader who opens this has a list of results
   * in front of them they are trying to read. `pointer-coarse:min-h-11`
   * matches the shortcut entry — 44px is the tap target, and this row is
   * outside the scrolling list so it does not move under the thumb when
   * the second stage lands.
   */
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

          {/* `semanticPending` belongs in this gate as much as `loading`
              does. "No results" is a verdict, and while a stage that
              could still produce some is out, it is a verdict on a search
              that has not finished — the phrase a semantic search exists
              for is exactly the one no filename matches. On a drive
              without that stage the flag is never set, so the verdict
              arrives as soon as it is true. */}
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
              ) : legendOpen ? (
                <MatchLegend />
              ) : hasQuery ? (
                resultsList(true)
              ) : null}
            </div>

            {/* Outside the scroll area on purpose: the search resolves in
                two stages, and a row inside the list would slide the
                results down the page every time the second one lands.
                Two columns — the shortcut entry, and the progress the
                second stage reports. */}
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
          </div>,
          document.body
        )}

      {open &&
        !isMobileViewport &&
        createPortal(
          // Desktop: centered modal
        // `px-4`: between 640px (where the mobile sheet stops) and 768px
        // (where `max-w-3xl` starts binding) the panel is `w-full` against
        // an unpadded container, so without it the card's border and its
        // rounded corners sit flush against the viewport edge and the
        // backdrop disappears at the sides.
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={closeSearch}
          />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-bg-border bg-bg-primary shadow-lg animate-fade-in-scale">
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
            {/* The legend first: its entry is always in the footer, so
                pressing it always answers. */}
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

            {/* Outside the scroll area on purpose: the search resolves in
                two stages, and a row inside the list would slide the
                results down the page every time the second one lands.
                Two columns — the shortcut entry, and the progress the
                second stage reports. */}
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
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
