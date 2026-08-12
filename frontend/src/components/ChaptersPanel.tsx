"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { getFileChapters, type FileChapter } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useMediaClock } from "@/lib/mediaClock";
import type { MediaController } from "@/lib/mediaController";

/**
 * Index of the chapter the playhead is inside, or -1 before any has begun.
 *
 * Reads `start_time` only. `end_time` is nullable — a producer may not state
 * one — so a range test would answer "no chapter" for a position the file is
 * plainly inside. Chapters partition the timeline, so "the latest one that
 * began" is the same answer wherever both are known and the only available
 * answer where they are not.
 *
 * Scans the whole list rather than stopping at the first future start.
 * Display order is `ordering`, which the schema keeps precisely so a
 * producer can commit an order of its own; nothing guarantees it ascends
 * with time. Stopping early would report the wrong chapter for any set
 * where it does not, and lists are short enough that the full pass is free.
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
   * How many chapters actually arrived, reported once the fetch settles.
   *
   * The host sizes the companion region from the detail response's
   * `has_chapters`, which is what keeps the layout from re-gridding after
   * a second round trip. But hiding itself is not enough when this is the
   * only occupant: the region would stay, and on a wide container that is
   * a 24rem empty column with the player squeezed beside it. So the panel
   * reports nothing-to-show rather than only acting on it.
   */
  onResolved?: (count: number) => void;
}

export function ChaptersPanel({
  fileId,
  mediaController,
  refreshToken = 0,
  onResolved,
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
        // A chapter list that cannot be read is not a reason to take the
        // player or the transcript down with it.
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
      className="media-detail-companion-lead flex flex-col overflow-hidden rounded-xl border border-bg-border bg-bg-card"
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
        {/* Collapsed, the header is the whole feature: the one thing
            chapters answer is "where am I", and that fits on a line.
            Expanded it goes back to the plain label — the highlighted
            row already says where you are, and a header that repeats it
            is both noise and a line of text that changes under the
            reader every time playback crosses a boundary. */}
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
