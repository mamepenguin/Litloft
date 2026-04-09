"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpLeft, Clock, Search, X } from "lucide-react";

import { useTranslations } from "next-intl";
import { getDriveFiles, semanticSearch } from "@/lib/api";
import type { SemanticSearchResult, SemanticSearchResponse, SemanticSearchSegment } from "@/lib/api";
import type { FileItem, FileType } from "@/types";
import { formatDuration } from "@/lib/format";
import { FileTypeIcon } from "./FileTypeIcon";
import { useCurrentDrive } from "./CurrentDriveProvider";

const HISTORY_KEY = "search-history";
const MAX_HISTORY = 20;

type FilterType = "all" | "video" | "image" | "audio" | "document";

const FILTER_TYPES: FilterType[] = ["all", "video", "image", "audio", "document"];

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
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
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

const MATCH_TYPE_STYLES: Record<string, string> = {
  transcript: "bg-blue-500/15 text-blue-400",
  transcript_keyword: "bg-cyan-500/15 text-cyan-400",
  clip: "bg-emerald-500/15 text-emerald-400",
  metadata: "bg-zinc-500/15 text-zinc-400",
  content: "bg-purple-500/15 text-purple-400",
  text_content_keyword: "bg-violet-500/15 text-violet-400",
};

function MatchBadge({ type, label }: { type: string; label: string }) {
  const style = MATCH_TYPE_STYLES[type] ?? "bg-zinc-500/15 text-zinc-400";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style}`}>
      {label}
    </span>
  );
}

function TimestampLink({
  seconds,
  fileId,
  onClick,
}: {
  seconds: number;
  fileId: string;
  onClick: (url: string) => void;
}) {
  const label = formatDuration(seconds);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(`/files/${fileId}?t=${Math.floor(seconds)}`);
      }}
      className="rounded px-1 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors"
    >
      {label}
    </button>
  );
}

function SemanticResultItem({
  result,
  onSelect,
  t,
}: {
  result: SemanticSearchResult;
  onSelect: (url: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const matchLabels: Record<string, string> = {
    transcript: t("matchTranscript"),
    transcript_keyword: t("matchTranscriptKeyword"),
    clip: t("matchClip"),
    metadata: t("matchMetadata"),
    content: t("matchContent"),
    text_content_keyword: t("matchTextContentKeyword"),
  };

  // Collect unique page numbers from text_content matches
  const matchedPages = [
    ...new Set(
      result.segments
        .flatMap((seg) => seg.matches)
        .filter((m) => m.page != null)
        .map((m) => m.page as number)
    ),
  ].sort((a, b) => a - b);

  const timestamps = result.segments
    .filter((seg): seg is SemanticSearchSegment & { time_range: [number, number] } =>
      seg.time_range != null && seg.time_range[0] > 0,
    )
    .slice(0, 5);

  return (
    <button
      onClick={() => onSelect(`/files/${result.file_id}`)}
      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-elevated"
    >
      <img
        src={`/api/files/${result.file_id}/thumbnail`}
        alt=""
        className="h-10 w-16 flex-shrink-0 rounded bg-bg-elevated object-cover"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{result.filename}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {result.match_types.map((type) => (
            <MatchBadge
              key={type}
              type={type}
              label={matchLabels[type] ?? type}
            />
          ))}
        </div>
        {timestamps.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-0.5">
            {timestamps.map((seg) => (
              <TimestampLink
                key={seg.time_range[0]}
                seconds={seg.time_range[0]}
                fileId={result.file_id}
                onClick={onSelect}
              />
            ))}
          </div>
        )}
        {matchedPages.length > 0 && (
          <p className="mt-1 text-[11px] text-text-tertiary">
            {t("matchedPages", { pages: matchedPages.join(", ") })}
          </p>
        )}
      </div>
    </button>
  );
}

function FilterTabs({
  active,
  onChange,
  t,
}: {
  active: FilterType;
  onChange: (f: FilterType) => void;
  t: (key: string) => string;
}) {
  const labels: Record<FilterType, string> = {
    all: t("filterAll"),
    video: t("filterVideo"),
    image: t("filterImage"),
    audio: t("filterAudio"),
    document: t("filterDocument"),
  };

  return (
    <div className="flex gap-1 overflow-x-auto px-4 py-2 border-b border-bg-border">
      {FILTER_TYPES.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            active === f
              ? "bg-accent text-white"
              : "bg-bg-elevated text-text-muted hover:text-text-primary"
          }`}
        >
          {labels[f]}
        </button>
      ))}
    </div>
  );
}

function TextResultItem({
  file,
  onSelect,
}: {
  file: FileItem;
  onSelect: (file: FileItem) => void;
}) {
  return (
    <button
      onClick={() => onSelect(file)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-elevated"
    >
      <FileTypeIcon fileType={file.file_type} size={18} className="flex-shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{file.title}</p>
        <p className="truncate text-xs text-text-muted">
          {file.folder_path ? `${file.folder_path}/` : ""}{file.filename}
        </p>
      </div>
    </button>
  );
}

export function GlobalSearch() {
  const t = useTranslations("search");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [semanticAvailable, setSemanticAvailable] = useState<boolean | null>(null);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [semanticTotal, setSemanticTotal] = useState(0);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drive = useCurrentDrive();

  // Check semantic search availability on open
  useEffect(() => {
    if (!open) return;
    if (semanticAvailable !== null) return;

    let cancelled = false;
    (async () => {
      const res = await semanticSearch("test", { limit: 1 });
      if (!cancelled) {
        setSemanticAvailable(res.available);
      }
    })();
    return () => { cancelled = true; };
  }, [open, semanticAvailable]);

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
    setResults([]);
    setTotal(0);
    setSemanticResults([]);
    setSemanticTotal(0);
    setFilter("all");
  }, []);

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        if (open) {
          closeSearch();
        } else {
          openSearch();
        }
      }
      if (e.key === "Escape" && open) {
        closeSearch();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, openSearch, closeSearch]);

  // Debounced search
  useEffect(() => {
    if (!open || !drive || !query.trim()) {
      setResults([]);
      setTotal(0);
      setSemanticResults([]);
      setSemanticTotal(0);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const trimmed = query.trim();
      const filterType = filter === "all" ? undefined : filter as FileType;

      // Text search
      setLoading(true);
      const textPromise = getDriveFiles(drive, {
        search: trimmed,
        limit: 100,
        type: filterType,
      }).then((res) => {
        setResults(res.data);
        setTotal(res.meta.total);
        setLoading(false);
      }).catch(() => {
        setResults([]);
        setTotal(0);
        setLoading(false);
      });

      // Semantic search (only if available)
      if (semanticAvailable) {
        setSemanticLoading(true);
        const semanticPromise = semanticSearch(trimmed, {
          limit: 20,
          type: filterType,
          drive,
        }).then((res) => {
          setSemanticResults(res.results);
          setSemanticTotal(res.total);
          setSemanticLoading(false);
        }).catch(() => {
          setSemanticResults([]);
          setSemanticTotal(0);
          setSemanticLoading(false);
        });

        await Promise.allSettled([textPromise, semanticPromise]);
      } else {
        await textPromise;
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, drive, semanticAvailable, filter]);

  function handleSelect(file: FileItem) {
    setHistory(addToHistory(query));
    closeSearch();
    router.push(`/files/${file.id}`);
  }

  function handleSemanticSelect(url: string) {
    setHistory(addToHistory(query));
    closeSearch();
    router.push(url);
  }

  function handleSubmit(term: string) {
    const normalized = term.trim();
    if (normalized) {
      setQuery(normalized);
      setHistory(addToHistory(normalized));
    }
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

  // Deduplicate text results that are already in semantic results
  const deduplicatedText = useMemo(() => {
    const semanticIds = new Set(semanticResults.map((r) => r.file_id));
    return results.filter((f) => !semanticIds.has(f.id));
  }, [results, semanticResults]);

  const showHistory = !query.trim() && history.length > 0;
  const showFilters = semanticAvailable && open && drive;
  const isSearching = loading || semanticLoading;
  const hasResults = semanticResults.length > 0 || deduplicatedText.length > 0;
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
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSubmit(query);
      }}
      placeholder={drive ? t("searchInDrive", { drive }) : t("selectDrive")}
      disabled={!drive}
      className={
        mobile
          ? "w-full rounded-full bg-bg-elevated px-4 py-2 text-base text-text-primary placeholder:text-text-muted outline-none"
          : "flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted outline-none"
      }
    />
  );

  const historyList = (mobile: boolean) => (
    <div className={mobile ? "" : "max-h-[50vh] overflow-y-auto"}>
      {history.map((term) => (
        <button
          key={term}
          onClick={() => handleSubmit(term)}
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
      {isSearching && semanticResults.length === 0 && deduplicatedText.length === 0 ? (
        <div className={`flex items-center justify-center ${mobile ? "py-12" : "py-8"}`}>
          <div className={`${mobile ? "h-6 w-6" : "h-5 w-5"} animate-spin rounded-full border-2 border-accent border-t-transparent`} />
        </div>
      ) : !hasResults ? (
        <div className={`text-center text-sm text-text-muted ${mobile ? "py-12" : "py-8"}`}>
          {t("noResults")}
        </div>
      ) : (
        <>
          {semanticResults.length > 0 && (
            <>
              {semanticResults.map((result) => (
                <SemanticResultItem
                  key={result.file_id}
                  result={result}
                  onSelect={handleSemanticSelect}
                  t={t}
                />
              ))}
            </>
          )}

          {semanticLoading && results.length > 0 && (
            <div className="flex items-center justify-center border-t border-bg-border py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}

          {deduplicatedText.length > 0 && (
            <>
              <div className="border-t border-bg-border px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                {t("textResults")}
              </div>
              {deduplicatedText.map((file) => (
                <TextResultItem
                  key={file.id}
                  file={file}
                  onSelect={handleSelect}
                />
              ))}
              {total > 100 && (
                <div className="border-t border-bg-border px-4 py-2.5 text-center text-xs text-text-muted">
                  {t("showingResults", { total })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  const clearQuery = (focusRef?: React.RefObject<HTMLInputElement | null>) => {
    setQuery("");
    setResults([]);
    setTotal(0);
    setSemanticResults([]);
    setSemanticTotal(0);
    focusRef?.current?.focus();
  };

  return (
    <>
      <button
        onClick={openSearch}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        aria-label={t("label")}
        title={t("title")}
      >
        <Search size={18} />
      </button>

      {open && (
        <>
          {/* Mobile: full-screen */}
          <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary sm:hidden animate-fade-in">
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

            {showFilters && hasQuery && (
              <FilterTabs active={filter} onChange={setFilter} t={t} />
            )}

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

          {/* Desktop: modal */}
          <div className="fixed inset-0 z-50 hidden items-start justify-center pt-[10vh] sm:flex">
            <div
              className="fixed inset-0 bg-black/50 animate-fade-in"
              onClick={closeSearch}
            />
            <div className="relative z-10 w-full max-w-lg rounded-xl border border-bg-border bg-bg-primary shadow-2xl animate-fade-in-scale">
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
                <kbd className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] text-text-muted">
                  ESC
                </kbd>
              </div>

              {showFilters && hasQuery && (
                <FilterTabs active={filter} onChange={setFilter} t={t} />
              )}

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
        </>
      )}
    </>
  );
}
