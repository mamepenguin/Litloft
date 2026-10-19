"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { getFileChapters, type FileChapter } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useMediaClock } from "@/lib/mediaClock";
import type { MediaController } from "@/lib/mediaController";

/**
 * Reads `start_time` only: `end_time` is nullable, so a range test would
 * answer "no chapter" for a position the file is plainly inside.
 *
 * Scans the whole list rather than stopping at the first future start:
 * display order is `ordering`, and nothing guarantees it ascends with time.
 */
export function activeChapterIndex(
  chapters: FileChapter[],
  currentTime: number,
): number {
  let active = -1;
  let latestStart = -Infinity;
  for (let i = 0; i < chapters.length; i += 1) {
    const start = chapters[i].start_time;
    if (start <= currentTime && start > latestStart) {
      latestStart = start;
      active = i;
    }
  }
  return active;
}

interface ChaptersPanelProps {
  fileId: string;
  mediaController: MediaController | null;
  /** Changes when an addon replaces this file's core chapter set. */
  refreshToken?: number;
  /**
   * Hiding itself is not enough when this is the only occupant: the region
   * would stay, so the panel reports nothing-to-show rather than only acting
   * on it.
   */
  onResolved?: (count: number) => void;
  className?: string;
}

export function ChaptersPanel({
  fileId,
  mediaController,
  refreshToken = 0,
  onResolved,
  className,
}: ChaptersPanelProps) {
  const t = useTranslations("player");
  const [chapters, setChapters] = useState<FileChapter[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const { currentTime } = useMediaClock(mediaController);

  // Held in a ref so an inline arrow from the host does not re-run the
  // fetch on every render of a component that renders on every tick.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  });

  useEffect(() => {
    let cancelled = false;
    getFileChapters(fileId)
      .then((res) => {
        if (cancelled) return;
        setChapters(res.chapters);
        onResolvedRef.current?.(res.chapters.length);
      })
      .catch(() => {
        if (cancelled) return;
        setChapters([]);
        onResolvedRef.current?.(0);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, refreshToken]);

  if (chapters.length === 0) return null;

  const active = activeChapterIndex(chapters, currentTime);
  const activeTitle = active >= 0 ? chapters[active].title : null;

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-bg-border bg-bg-card${className ? ` ${className}` : ""}`}
      aria-label={t("chapters")}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-text-primary transition-colors hover:bg-bg-elevated"
      >
        {collapsed ? (
          <ChevronRight size={14} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-text-muted" />
        )}
        {/* Expanded it goes back to the plain label — the highlighted
            row already says where you are, and a header that repeats it
            changes under the reader every time playback crosses a boundary. */}
        <span className="truncate">
          {collapsed ? (activeTitle ?? t("chapters")) : t("chapters")}
        </span>
      </button>

      {!collapsed && (
        <ol className="min-h-0 overflow-y-auto px-1 pb-1">
          {chapters.map((chapter, i) => (
            <li key={`${chapter.ordering}-${chapter.start_time}`}>
              <button
                type="button"
                onClick={() => mediaController?.seek(chapter.start_time)}
                disabled={!mediaController}
                aria-current={i === active ? "true" : undefined}
                className={
                  "flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-default " +
                  (i === active
                    ? "bg-bg-elevated text-text-primary"
                    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary")
                }
              >
                <span className="shrink-0 tabular-nums">
                  {formatDuration(chapter.start_time)}
                </span>
                <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default ChaptersPanel;
