"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { getDriveFiles } from "@/lib/api";
import type { FileItem } from "@/types";
import { FileTypeIcon } from "./FileTypeIcon";

function useCurrentDrive(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/drive\/([^/]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drive = useCurrentDrive();

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        setQuery("");
        setResults([]);
        setTotal(0);
      }
      return !prev;
    });
  }, []);

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
        setResults([]);
        setTotal(0);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, toggle]);

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
          limit: 200,
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
    setOpen(false);
    setQuery("");
    setResults([]);
    setTotal(0);
    router.push(`/files/${file.id}`);
  }

  return (
    <>
      <button
        onClick={toggle}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        aria-label="検索"
        title="検索 (Cmd+Shift+F)"
      >
        <Search size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => {
              setOpen(false);
              setQuery("");
              setResults([]);
              setTotal(0);
            }}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-bg-border bg-bg-primary shadow-2xl">
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-bg-border px-4 py-3">
              <Search size={18} className="flex-shrink-0 text-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={drive ? `${drive} 内を検索...` : "ドライブを選択してください"}
                disabled={!drive}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setResults([]); setTotal(0); }}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              )}
              <kbd className="hidden rounded bg-bg-card px-1.5 py-0.5 text-[10px] text-text-muted sm:block">
                ESC
              </kbd>
            </div>

            {/* Results */}
            {query.trim() && (
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
                    {total > 200 && (
                      <div className="border-t border-bg-border px-4 py-2.5 text-center text-xs text-text-muted">
                        {total} 件中 200 件を表示
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!drive && (
              <div className="py-8 text-center text-sm text-text-muted">
                ドライブページに移動してから検索してください
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
