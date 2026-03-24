"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpLeft, Clock, Search, X } from "lucide-react";

import { getDriveFiles } from "@/lib/api";
import type { FileItem } from "@/types";
import { FileTypeIcon } from "./FileTypeIcon";
import { useCurrentDrive } from "./CurrentDriveProvider";

const HISTORY_KEY = "search-history";
const MAX_HISTORY = 20;

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

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drive = useCurrentDrive();

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
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await getDriveFiles(drive, {
          search: query.trim(),
          limit: 100,
        });
        setResults(res.data);
        setTotal(res.meta.total);
      } catch {
        setResults([]);
        setTotal(0);
      }
      setLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, drive]);

  function handleSelect(file: FileItem) {
    setHistory(addToHistory(query));
    closeSearch();
    router.push(`/files/${file.id}`);
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

  const showHistory = !query.trim() && history.length > 0;

  return (
    <>
      <button
        onClick={openSearch}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        aria-label="検索"
        title="検索 (Cmd+Shift+F)"
      >
        <Search size={18} />
      </button>

      {open && (
        <>
          {/* Mobile: full-screen */}
          <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary sm:hidden">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-bg-border px-2 py-2">
              <button
                onClick={closeSearch}
                className="flex-shrink-0 rounded-lg p-2 text-text-muted hover:text-text-primary"
                aria-label="閉じる"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="relative flex-1">
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit(query);
                  }}
                  placeholder={drive ? `${drive} 内を検索...` : "ドライブを選択してください"}
                  disabled={!drive}
                  className="w-full rounded-full bg-bg-elevated px-4 py-2 text-base text-text-primary placeholder:text-text-muted outline-none"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setResults([]); setTotal(0); mobileInputRef.current?.focus(); }}
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
                  ドライブページに移動してから検索してください
                </div>
              ) : showHistory ? (
                /* History */
                <div>
                  {history.map((term) => (
                    <button
                      key={term}
                      onClick={() => handleSubmit(term)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-bg-elevated"
                    >
                      <Clock size={18} className="flex-shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{term}</span>
                      <button
                        onClick={(e) => handleFillInput(term, e)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-text-muted active:bg-bg-elevated"
                        aria-label={`「${term}」を入力欄に設定`}
                      >
                        <ArrowUpLeft size={16} />
                      </button>
                      <button
                        onClick={(e) => handleRemoveHistory(term, e)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-text-muted active:bg-bg-elevated"
                        aria-label={`「${term}」を履歴から削除`}
                      >
                        <X size={16} />
                      </button>
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                /* Results */
                loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="py-12 text-center text-sm text-text-muted">
                    一致するファイルが見つかりません
                  </div>
                ) : (
                  <>
                    {results.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => handleSelect(file)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-bg-elevated"
                      >
                        <FileTypeIcon fileType={file.file_type} size={18} className="flex-shrink-0 text-text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-text-primary">{file.title}</p>
                          <p className="truncate text-xs text-text-muted">
                            {file.folder_path ? `${file.folder_path}/` : ""}{file.filename}
                          </p>
                        </div>
                      </button>
                    ))}
                    {total > 100 && (
                      <div className="border-t border-bg-border px-4 py-3 text-center text-xs text-text-muted">
                        {total} 件中 100 件を表示
                      </div>
                    )}
                  </>
                )
              ) : null}
            </div>
          </div>

          {/* Desktop: modal */}
          <div className="fixed inset-0 z-50 hidden items-start justify-center pt-[10vh] sm:flex">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={closeSearch}
            />
            <div className="relative z-10 w-full max-w-lg rounded-xl border border-bg-border bg-bg-primary shadow-2xl">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-bg-border px-4 py-3">
                <Search size={18} className="flex-shrink-0 text-text-muted" />
                <input
                  ref={desktopInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit(query);
                  }}
                  placeholder={drive ? `${drive} 内を検索...` : "ドライブを選択してください"}
                  disabled={!drive}
                  className="flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted outline-none"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setResults([]); setTotal(0); }}
                    className="text-text-muted hover:text-text-primary"
                  >
                    <X size={16} />
                  </button>
                )}
                <kbd className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] text-text-muted">
                  ESC
                </kbd>
              </div>

              {/* History or Results */}
              {!drive ? (
                <div className="py-8 text-center text-sm text-text-muted">
                  ドライブページに移動してから検索してください
                </div>
              ) : showHistory ? (
                <div className="max-h-[50vh] overflow-y-auto">
                  {history.map((term) => (
                    <button
                      key={term}
                      onClick={() => handleSubmit(term)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-elevated"
                    >
                      <Clock size={16} className="flex-shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{term}</span>
                      <button
                        onClick={(e) => handleFillInput(term, e)}
                        className="flex-shrink-0 rounded p-1 text-text-muted hover:text-text-primary"
                        aria-label={`「${term}」を入力欄に設定`}
                      >
                        <ArrowUpLeft size={14} />
                      </button>
                      <button
                        onClick={(e) => handleRemoveHistory(term, e)}
                        className="flex-shrink-0 rounded p-1 text-text-muted hover:text-text-primary"
                        aria-label={`「${term}」を履歴から削除`}
                      >
                        <X size={14} />
                      </button>
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                <div className="max-h-[50vh] overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    </div>
                  ) : results.length === 0 ? (
                    <div className="py-8 text-center text-sm text-text-muted">
                      一致するファイルが見つかりません
                    </div>
                  ) : (
                    <>
                      {results.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => handleSelect(file)}
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
                      ))}
                      {total > 100 && (
                        <div className="border-t border-bg-border px-4 py-2.5 text-center text-xs text-text-muted">
                          {total} 件中 100 件を表示
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}
