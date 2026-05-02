"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpLeft, Clock, Search, X } from "lucide-react";
import { useShortcuts } from "@/hooks/useShortcuts";

import { useTranslations } from "next-intl";
import { getDriveFiles } from "@/lib/api";
import {
  fetchSemanticHits,
  isSemanticSearchAvailable,
} from "@/lib/semanticSearch";
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
import type { FileItemWithMatch } from "@/types";
import { useCurrentDrive } from "./CurrentDriveProvider";
import { MergedResultItem } from "./search/MergedResultItem";

const HISTORY_KEY = "search-history";
const MAX_HISTORY = 20;
const POPUP_LIMIT = 8;

function getHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // jsdom test envs / Safari private mode can throw on localStorage; the
    // history list is best-effort UX, not a correctness requirement.
  }
}

function addToHistory(term: string): string[] {
  const normalized = term.trim();
  if (!normalized) return getHistory();
  const prev = getHistory().filter((h) => h !== normalized);
  const next = [normalized, ...prev].slice(0, MAX_HISTORY);
  saveHistory(next);
  return next;
}

function removeFromHistory(term: string): string[] {
  const next = getHistory().filter((h) => h !== term);
  saveHistory(next);
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
  const [composing, setComposing] = useState(false);
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
    setHistory(getHistory());
    setOpen(true);
    setTimeout(() => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile) {
        mobileInputRef.current?.focus();
      } else {
        desktopInputRef.current?.focus();
      }
    }, 50);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMerged([]);
    setTotal(0);
  }, []);

  useShortcuts("global", tsc("global"), [
    {
      key: "ctrl+shift+f",
      label: tsc("search"),
      handler: () => {
        if (open) {
          closeSearch();
        } else {
          openSearch();
        }
      },
    },
  ]);

  // Handle Escape to close search (processed by ShortcutsProvider when open)
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeSearch();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeSearch]);

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
      const semanticP = isSemanticSearchAvailable(drive).then((available) =>
        available
          ? fetchSemanticHits(trimmed, drive, {
              limit: POPUP_LIMIT,
              signal: ctrl.signal,
            })
          : ([] as SemanticHit[]),
      );
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
        setHistory(addToHistory(normalized));
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
      setHistory(addToHistory(query));
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
    setHistory(removeFromHistory(term));
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

  const showHistory = !query.trim() && history.length > 0;
  const hasResults = merged.length > 0;
  const hasQuery = query.trim().length > 0;

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
        // Skip Enter while IME composition is active (e.g. Japanese
        // conversion), otherwise the conversion-confirming Enter would
        // navigate to the search page.
        if (e.key === "Enter" && !composing) handleSubmit(query);
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

  const historyList = (mobile: boolean) => (
    <div className={mobile ? "" : "max-h-[50vh] overflow-y-auto"}>
      {history.map((term) => (
        <button
          key={term}
          onClick={() => handleHistorySubmit(term)}
          className={`flex w-full items-center gap-3 px-4 text-left transition-colors ${
            mobile
              ? "py-3 active:bg-bg-elevated"
              : "py-2.5 hover:bg-bg-elevated"
          }`}
        >
          <Clock size={mobile ? 18 : 16} className="flex-shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{term}</span>
          <button
            onClick={(e) => handleFillInput(term, e)}
            className={`flex-shrink-0 rounded text-text-muted ${
              mobile ? "p-1.5 active:bg-bg-elevated" : "p-1 hover:text-text-primary"
            }`}
            aria-label={t("fillInput", { term })}
          >
            <ArrowUpLeft size={mobile ? 16 : 14} />
          </button>
          <button
            onClick={(e) => handleRemoveHistory(term, e)}
            className={`flex-shrink-0 rounded text-text-muted ${
              mobile ? "p-1.5 active:bg-bg-elevated" : "p-1 hover:text-text-primary"
            }`}
            aria-label={t("removeHistory", { term })}
          >
            <X size={mobile ? 16 : 14} />
          </button>
        </button>
      ))}
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
          {merged.length > 0 && (
            <>
              {merged.map((file) => (
                <MergedResultItem
                  key={file.id}
                  file={file}
                  onSelect={handleSelect}
                />
              ))}
              <button
                onClick={() => handleSubmit(query)}
                className="flex w-full items-center justify-between gap-3 border-t border-bg-border px-4 py-2.5 text-left transition-colors hover:bg-bg-elevated"
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

      {open && isMobileViewport && (
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
            ) : showHistory ? (
              historyList(true)
            ) : hasQuery ? (
              resultsList(true)
            ) : null}
          </div>
        </div>
      )}

      {open && !isMobileViewport && (
        // Desktop: centered modal
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={closeSearch}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-bg-border bg-bg-primary shadow-2xl animate-fade-in-scale">
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
            ) : showHistory ? (
              historyList(false)
            ) : hasQuery ? (
              resultsList(false)
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
