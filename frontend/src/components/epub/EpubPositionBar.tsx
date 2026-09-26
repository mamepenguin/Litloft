"use client";

import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

export const SLIDER_STEPS = 1000;

/** Keys that move a range input; any other key must not commit a seek. */
const VALUE_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export interface EpubPositionBarProps {
  fraction: number | null;
  chapter: string | null;
  pagesLeft: number | null;
  dir: "ltr" | "rtl";
  /** The chapter a dragged thumb would land in. */
  chapterAt: (fraction: number) => string | null;
  onSeek: (fraction: number) => void;
  /** After a pointer drag, so the keys turn pages again instead of moving the thumb. */
  onPointerCommit?: () => void;
  /** Whether a drag is under way, so the bar is not withdrawn mid-drag. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  className?: string;
}

export function EpubPositionBar({
  fraction,
  chapter,
  pagesLeft,
  dir,
  chapterAt,
  onSeek,
  onPointerCommit,
  onScrubbingChange,
  className = "",
}: EpubPositionBarProps) {
  const t = useTranslations("file");
  const [drag, setDragState] = useState<number | null>(null);
  const setDrag = (value: number | null) => {
    setDragState(value);
    onScrubbingChange?.(value !== null);
  };
  const disabled = fraction === null;
  const shown = drag ?? (fraction === null ? 0 : Math.round(fraction * SLIDER_STEPS));
  const percent = Math.floor((shown / SLIDER_STEPS) * 100);
  const label = drag === null ? chapter : chapterAt(drag / SLIDER_STEPS);

  const commit = (byPointer: boolean) => {
    if (drag === null) return;
    setDrag(null);
    onSeek(drag / SLIDER_STEPS);
    if (byPointer) onPointerCommit?.();
  };

  return (
    <div className={`flex min-w-0 items-center gap-3 px-3 ${className}`}>
      <input
        type="range"
        data-player-scrub
        min={0}
        max={SLIDER_STEPS}
        step={1}
        value={shown}
        dir={dir}
        disabled={disabled}
        aria-label={t("epubPosition")}
        aria-valuetext={`${percent}%`}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => commit(true)}
        onKeyUp={(e: KeyboardEvent) => {
          if (VALUE_KEYS.has(e.key)) commit(false);
        }}
        // A drag the system takes over ends without a pointerup.
        onPointerCancel={() => setDrag(null)}
        onBlur={() => commit(false)}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-bg-border accent-accent disabled:cursor-not-allowed disabled:opacity-40"
      />
      <p
        data-testid="epub-position-line"
        className="flex w-[45%] min-w-0 items-baseline gap-2 whitespace-nowrap text-xs text-text-muted"
      >
        <span className="shrink-0 tabular-nums text-text-primary">{percent}%</span>
        {label && <span className="min-w-0 truncate">{label}</span>}
        {drag === null && pagesLeft !== null && (
          <span className="ml-auto shrink-0 tabular-nums">
            {t("epubPagesLeft", { count: pagesLeft })}
          </span>
        )}
      </p>
    </div>
  );
}
