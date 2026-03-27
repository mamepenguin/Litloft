"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Folder,
  Pause,
  Play,
  X,
} from "lucide-react";

import { useRouter, useSearchParams } from "next/navigation";

import { getArchiveContents, getArchiveEntryUrl, getDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { isTextPreviewable } from "./TextPreview";
import { FileTypeIcon } from "./FileTypeIcon";
import type { ArchiveContents, ArchiveEntry, FileType } from "@/types";

const INTERVAL_OPTIONS = [3, 5, 10] as const;
const MAX_TEXT_AUTO_LOAD = 1024 * 1024; // 1MB

type ViewMode = "listing" | "image" | "text";

function getDirname(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.substring(0, lastSlash);
}

function getEntriesInDir(
  entries: ArchiveEntry[],
  dirPath: string
): ArchiveEntry[] {
  return entries.filter((entry) => {
    if (dirPath === "") {
      // Root: entries with no slash in path, or direct children
      const slashIdx = entry.path.indexOf("/");
      if (entry.is_dir) {
        // Directory at root: path like "dirname/" — no slash before the trailing one
        const withoutTrailing = entry.path.endsWith("/")
          ? entry.path.slice(0, -1)
          : entry.path;
        return !withoutTrailing.includes("/");
      }
      return slashIdx === -1;
    }
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    if (!entry.path.startsWith(prefix)) return false;
    const rest = entry.path.slice(prefix.length);
    if (entry.is_dir) {
      const cleaned = rest.endsWith("/") ? rest.slice(0, -1) : rest;
      // Skip the directory entry that represents the current directory itself
      if (cleaned === "") return false;
      return !cleaned.includes("/");
    }
    return !rest.includes("/");
  });
}

function inferDirectories(
  entries: ArchiveEntry[],
  currentPath: string
): ArchiveEntry[] {
  // Some ZIPs don't have explicit directory entries.
  // Infer directories from file paths.
  const prefix = currentPath ? `${currentPath}/` : "";
  const dirNames = new Set<string>();

  for (const entry of entries) {
    if (!entry.path.startsWith(prefix) && currentPath !== "") continue;
    if (currentPath === "" && !entry.path.includes("/")) continue;

    const rest =
      currentPath === "" ? entry.path : entry.path.slice(prefix.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx > 0) {
      dirNames.add(rest.substring(0, slashIdx));
    }
  }

  // Filter out dirs that already exist as explicit entries (compare full paths)
  const existingDirPaths = new Set(
    entries
      .filter((e) => e.is_dir)
      .map((e) => (e.path.endsWith("/") ? e.path.slice(0, -1) : e.path))
  );

  const inferred: ArchiveEntry[] = [];
  for (const name of dirNames) {
    const fullPath = prefix ? `${prefix}${name}` : name;
    if (!existingDirPaths.has(fullPath)) {
      inferred.push({
        path: `${fullPath}/`,
        filename: name,
        file_size: 0,
        compressed_size: 0,
        file_type: "other",
        mime_type: "",
        is_dir: true,
      });
    }
  }

  return inferred;
}

export function ArchivePreview({ fileId }: { fileId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPath = searchParams.get("archivePath") || "";

  const [archive, setArchive] = useState<ArchiveContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("listing");
  const [viewingEntry, setViewingEntry] = useState<ArchiveEntry | null>(null);

  // Image viewer state
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  // Text viewer state
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [textConfirmed, setTextConfirmed] = useState(false);

  // Fetch archive contents
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getArchiveContents(fileId)
      .then((data) => {
        if (!cancelled) {
          setArchive(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load archive"
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // Compute entries for current directory
  const currentEntries = archive
    ? [
        ...getEntriesInDir(archive.entries, currentPath),
        ...inferDirectories(archive.entries, currentPath),
      ].sort((a, b) => {
        // Directories first, then alphabetical
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.filename.localeCompare(b.filename);
      })
    : [];

  // Get image entries in current directory for the image viewer
  const imageEntries = useMemo(
    () =>
      archive
        ? archive.entries
            .filter(
              (e) =>
                !e.is_dir &&
                e.file_type === "image" &&
                getDirname(e.path) === currentPath
            )
            .sort((a, b) => a.path.localeCompare(b.path))
        : [],
    [archive, currentPath]
  );

  const currentImage = imageEntries[imageIndex] ?? null;

  // Breadcrumb segments
  const pathSegments = currentPath ? currentPath.split("/") : [];
  const breadcrumbs = [
    { label: "Archive", path: "" },
    ...pathSegments.map((seg, i) => ({
      label: seg,
      path: pathSegments.slice(0, i + 1).join("/"),
    })),
  ];

  // Reset viewer when directory changes (e.g. browser back button)
  useEffect(() => {
    setViewMode("listing");
    setViewingEntry(null);
    setPlaying(false);
    setShowControls(true);
  }, [currentPath]);

  // Navigate within archive by updating URL (adds to browser history)
  const searchParamsString = searchParams.toString();
  const navigateArchive = useCallback(
    (path: string) => {
      const params = new URLSearchParams(searchParamsString);
      if (path) {
        params.set("archivePath", path);
      } else {
        params.delete("archivePath");
      }
      const qs = params.toString();
      router.push(qs ? `?${qs}` : window.location.pathname);
    },
    [router, searchParamsString]
  );

  // Navigation handlers
  const handleDirClick = useCallback((entry: ArchiveEntry) => {
    const dirPath = entry.path.endsWith("/")
      ? entry.path.slice(0, -1)
      : entry.path;
    navigateArchive(dirPath);
  }, [navigateArchive]);

  const handleBreadcrumbClick = useCallback((path: string) => {
    navigateArchive(path);
  }, [navigateArchive]);

  const handleFileClick = useCallback(
    (entry: ArchiveEntry) => {
      if (entry.file_type === "image") {
        const idx = imageEntries.findIndex((e) => e.path === entry.path);
        setImageIndex(idx >= 0 ? idx : 0);
        setViewingEntry(entry);
        setViewMode("image");
        setShowControls(true);
        setPlaying(false);
      } else if (isTextPreviewable(entry.mime_type)) {
        setViewingEntry(entry);
        setViewMode("text");
        setTextContent(null);
        setTextError(null);
        setTextConfirmed(entry.file_size <= MAX_TEXT_AUTO_LOAD);
      }
    },
    [imageEntries]
  );

  const closeViewer = useCallback(() => {
    setViewMode("listing");
    setViewingEntry(null);
    setPlaying(false);
    setShowControls(true);
    setTextContent(null);
    setTextError(null);
    setTextConfirmed(false);
  }, []);

  // Set loading state when image changes
  useEffect(() => {
    if (viewMode === "image") {
      setImageLoading(true);
    }
  }, [viewMode, imageIndex]);

  // Image viewer: prefetch
  useEffect(() => {
    if (viewMode !== "image" || imageEntries.length === 0) return;

    const prefetchIndices = [
      imageIndex - 1,
      imageIndex + 1,
      imageIndex - 2,
      imageIndex + 2,
    ].filter((i) => i >= 0 && i < imageEntries.length && i !== imageIndex);

    prefetchIndices.forEach((i) => {
      const img = new Image();
      img.src = getArchiveEntryUrl(fileId, imageEntries[i].path);
    });
  }, [viewMode, imageIndex, imageEntries, fileId]);

  // Image viewer: slideshow timer
  useEffect(() => {
    if (!playing || viewMode !== "image" || imageEntries.length <= 1) return;

    const timer = window.setTimeout(() => {
      setImageIndex((prev) =>
        prev >= imageEntries.length - 1 ? 0 : prev + 1
      );
    }, slideshowInterval * 1000);

    return () => window.clearTimeout(timer);
  }, [playing, imageIndex, slideshowInterval, imageEntries.length, viewMode]);

  // Image viewer: keyboard
  useEffect(() => {
    if (viewMode !== "image") return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          setImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          setImageIndex((prev) =>
            prev < imageEntries.length - 1 ? prev + 1 : prev
          );
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          closeViewer();
          break;
        case " ":
          e.preventDefault();
          if (imageEntries.length > 1) {
            setPlaying((p) => !p);
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [viewMode, imageEntries.length, closeViewer]);

  // Auto-hide controls during slideshow
  useEffect(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playing && viewMode === "image") {
      hideTimerRef.current = window.setTimeout(
        () => setShowControls(false),
        3000
      );
    }
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [playing, imageIndex, viewMode]);

  // Text viewer: load content
  useEffect(() => {
    if (viewMode !== "text" || !viewingEntry || !textConfirmed) return;

    let cancelled = false;
    setTextLoading(true);
    setTextError(null);

    fetch(getArchiveEntryUrl(fileId, viewingEntry.path), {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setTextContent(text);
      })
      .catch((err) => {
        if (!cancelled)
          setTextError(
            err instanceof Error ? err.message : "Failed to load"
          );
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, viewingEntry, fileId, textConfirmed]);

  function handleImageAreaClick() {
    setShowControls((prev) => !prev);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playing) {
      hideTimerRef.current = window.setTimeout(
        () => setShowControls(false),
        3000
      );
    }
  }

  const isClickable = (entry: ArchiveEntry): boolean => {
    if (entry.is_dir) return true;
    if (entry.file_type === "image") return true;
    if (isTextPreviewable(entry.mime_type)) return true;
    return false;
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-red-400">
          アーカイブの読み込みに失敗しました: {error}
        </p>
      </div>
    );
  }

  // Image viewer (fullscreen overlay)
  if (viewMode === "image" && currentImage) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-black">
        {/* Header */}
        <div
          className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-300"
          style={{
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? "auto" : "none",
          }}
        >
          <span className="max-w-[40%] truncate text-sm text-white/80">
            {currentImage.filename}
          </span>

          {imageEntries.length > 0 && (
            <span className="text-sm text-white/60">
              {imageIndex + 1} / {imageEntries.length}
            </span>
          )}

          <div className="flex items-center gap-2">
            {imageEntries.length > 1 && (
              <>
                <select
                  value={slideshowInterval}
                  onChange={(e) =>
                    setSlideshowInterval(Number(e.target.value))
                  }
                  className="rounded bg-white/10 px-2 py-1 text-sm text-white outline-none"
                  aria-label="スライドショー間隔"
                >
                  {INTERVAL_OPTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}秒
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={playing ? "一時停止" : "再生"}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
              </>
            )}
            {currentImage && (
              <a
                href={getArchiveEntryUrl(fileId, currentImage.path)}
                download={currentImage.filename}
                className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="ダウンロード"
              >
                <Download size={18} />
              </a>
            )}
            <button
              onClick={closeViewer}
              className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main image area */}
        <div
          className="flex flex-1 cursor-pointer items-center justify-center"
          onClick={handleImageAreaClick}
        >
          {imageLoading && (
            <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          <img
            key={currentImage.path}
            src={getArchiveEntryUrl(fileId, currentImage.path)}
            alt={currentImage.filename}
            className="max-h-full max-w-full select-none object-contain"
            onLoad={() => setImageLoading(false)}
            draggable={false}
          />
        </div>

        {/* Navigation buttons */}
        {showControls && imageIndex > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImageIndex((prev) => prev - 1);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
            aria-label="前の画像"
          >
            <ChevronLeft size={32} />
          </button>
        )}
        {showControls && imageIndex < imageEntries.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImageIndex((prev) => prev + 1);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
            aria-label="次の画像"
          >
            <ChevronRight size={32} />
          </button>
        )}
      </div>
    );
  }

  // Text viewer (inline below listing)
  const textViewer =
    viewMode === "text" && viewingEntry ? (
      <div className="mt-4 rounded-xl bg-bg-card" data-testid="text-viewer">
        <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
          <button
            onClick={closeViewer}
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
          >
            <ArrowLeft size={16} />
            一覧に戻る
          </button>
          <span className="text-sm text-text-muted">
            {viewingEntry.filename}
          </span>
        </div>

        {!textConfirmed ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-text-muted">
              ファイルサイズが大きいです (
              {formatFileSize(viewingEntry.file_size)})
            </p>
            <button
              type="button"
              onClick={() => setTextConfirmed(true)}
              className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent/80"
            >
              読み込む
            </button>
          </div>
        ) : textLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-text-muted">読み込み中...</p>
          </div>
        ) : textError ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-red-400">
              読み込みに失敗しました: {textError}
            </p>
          </div>
        ) : (
          <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
            {textContent}
          </pre>
        )}
      </div>
    ) : null;

  // File listing mode
  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-xl bg-bg-card">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 border-b border-bg-border px-4 py-3">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  size={14}
                  className="text-text-muted"
                />
              )}
              <button
                onClick={() => handleBreadcrumbClick(crumb.path)}
                className={`text-sm transition-colors ${
                  i === breadcrumbs.length - 1
                    ? "font-medium text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {crumb.label}
              </button>
            </span>
          ))}

          {archive && (
            <span className="ml-auto flex items-center gap-2 text-xs text-text-muted">
              <span>
                {archive.total_entries} ファイル /{" "}
                {formatFileSize(archive.total_size)}
              </span>
              <a
                href={getDownloadUrl(fileId)}
                download
                className="rounded p-1 transition-colors hover:bg-bg-card hover:text-text-primary"
                aria-label="アーカイブをダウンロード"
                title="アーカイブをダウンロード"
              >
                <Download size={14} />
              </a>
            </span>
          )}
        </div>

        {/* Entry list */}
        <div className="max-h-[60vh] overflow-auto">
          {currentEntries.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">
              このフォルダは空です
            </div>
          ) : (
            <ul role="list">
              {currentEntries.map((entry) => {
                const clickable = isClickable(entry);
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => {
                        if (entry.is_dir) {
                          handleDirClick(entry);
                        } else if (clickable) {
                          handleFileClick(entry);
                        }
                      }}
                      disabled={!clickable}
                      className={`flex w-full items-center gap-3 border-b border-bg-border px-4 py-2.5 text-left transition-colors ${
                        clickable
                          ? "hover:bg-bg-elevated cursor-pointer"
                          : "opacity-60 cursor-default"
                      }`}
                    >
                      {entry.is_dir ? (
                        <Folder
                          size={20}
                          className="shrink-0 text-accent"
                        />
                      ) : (
                        <FileTypeIcon
                          fileType={
                            (entry.file_type as FileType) || "other"
                          }
                          size={20}
                          className="shrink-0 text-text-muted"
                        />
                      )}

                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          clickable
                            ? "text-text-primary"
                            : "text-text-muted"
                        }`}
                      >
                        {entry.filename}
                      </span>

                      {!entry.is_dir && (
                        <span className="shrink-0 text-xs text-text-muted">
                          {formatFileSize(entry.file_size)}
                        </span>
                      )}

                      {!entry.is_dir && (
                        <a
                          href={getArchiveEntryUrl(fileId, entry.path)}
                          download={entry.filename}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-bg-card hover:text-text-primary"
                          aria-label={`${entry.filename} をダウンロード`}
                        >
                          <Download size={14} />
                        </a>
                      )}

                      {entry.is_dir && (
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-text-muted"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {textViewer}
    </div>
  );
}
