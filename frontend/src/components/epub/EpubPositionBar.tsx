"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const onScrubbingChangeRef = useRef(onScrubbingChange);
  onScrubbingChangeRef.current = onScrubbingChange;
  // Leaving full screen mid-drag unmounts the bar without a release.
  useEffect(() => () => onScrubbingChangeRef.current?.(false), []);
  // Where the thumb was let go, shown until the reader reports any other place.
  const [released, setReleased] = useState<{ from: number | null; to: number } | null>(null);
  const landing = released && released.from === fraction ? released.to : null;
  const pending = drag ?? landing;
  const disabled = fraction === null;
  const shown = pending ?? (fraction === null ? 0 : Math.round(fraction * SLIDER_STEPS));
  const percent = Math.floor((shown / SLIDER_STEPS) * 100);
  const label = pending === null ? chapter : chapterAt(pending / SLIDER_STEPS);

  const commit = (byPointer: boolean) => {
    if (drag === null) return;
    setDrag(null);
    setReleased({ from: fraction, to: drag });
    onSeek(drag / SLIDER_STEPS);
    if (byPointer) onPointerCommit?.();
  };

  return (
    <div className={`flex min-w-0 flex-col justify-center gap-1 px-3 ${className}`}>
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
        className="h-1 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-bg-border accent-accent disabled:cursor-not-allowed disabled:opacity-40"
      />
      <p
        data-testid="epub-position-line"
        className="flex min-w-0 items-baseline gap-2 whitespace-nowrap text-xs text-text-muted"
      >
        <span className="shrink-0 tabular-nums text-text-primary">{percent}%</span>
        {label && <span className="min-w-0 truncate">{label}</span>}
        {pending === null && pagesLeft !== null && (
          <span className="ml-auto shrink-0 tabular-nums">
            {t("epubPagesLeft", { count: pagesLeft })}
          </span>
        )}
      </p>
    </div>
  );
}
