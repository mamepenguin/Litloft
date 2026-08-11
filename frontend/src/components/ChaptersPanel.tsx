"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { getFileChapters, type FileChapter } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useMediaClock } from "@/lib/mediaClock";
import type { MediaController } from "@/lib/mediaController";

/**
 * Index of the last chapter that has started, or -1 before the first one.
 *
 * Deliberately reads `start_time` only. `end_time` is nullable — a producer
 * may not state one — so a range test would answer "no chapter" for a
 * position the file plainly is inside. Chapters partition the timeline, so
 * "the last one that began" is the same answer wherever both are known and
 * the only available answer where they are not.
 */
export function activeChapterIndex(
  chapters: FileChapter[],
  currentTime: number,
): number {
  let active = -1;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i].start_time <= currentTime) active = i;
    else break;
  }
  return active;
}

interface ChaptersPanelProps {
  fileId: string;
  mediaController: MediaController | null;
}

export function ChaptersPanel({ fileId, mediaController }: ChaptersPanelProps) {
  const t = useTranslations("player");
  const [chapters, setChapters] = useState<FileChapter[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const { currentTime } = useMediaClock(mediaController);

  useEffect(() => {
    let cancelled = false;
    getFileChapters(fileId)
      .then((res) => {
        if (!cancelled) setChapters(res.chapters);
      })
      .catch(() => {
        // A chapter list that cannot be read is not a reason to take the
        // player or the transcript down with it. Render nothing.
        if (!cancelled) setChapters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

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
