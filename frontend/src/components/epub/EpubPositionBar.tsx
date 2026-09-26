"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslations } from "next-intl";

export const SLIDER_STEPS = 1000;

export type PageTurn = "left" | "right" | "next" | "prev";

/**
 * A step of the range is usually less than a page, and a seek that stays on
 * the page shown lands back where it started; the arrows turn pages instead.
 */
const ARROW_TURNS: Record<string, PageTurn> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "next",
  ArrowDown: "prev",
};

/**
 * The input is kept for the keyboard and assistive tech only. A pointer never
 * reaches it: a native range moves its own value under a finger in ways the
 * engines disagree on, and a second writer of the value undoes the first.
 */
const INPUT_CLASS =
  "peer pointer-events-none absolute inset-0 h-full w-full appearance-none opacity-0";

export interface EpubPositionBarProps {
  fraction: number | null;
  chapter: string | null;
  pagesLeft: number | null;
  dir: "ltr" | "rtl";
  /** The chapter a dragged thumb would land in. */
  chapterAt: (fraction: number) => string | null;
  onSeek: (fraction: number) => void;
  onTurn: (turn: PageTurn) => void;
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
  onTurn,
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
  const disabled = fraction === null;
  const shown = drag ?? (fraction === null ? 0 : Math.round(fraction * SLIDER_STEPS));
  const percent = Math.floor((shown / SLIDER_STEPS) * 100);
  const label = drag === null ? chapter : chapterAt(drag / SLIDER_STEPS);

  const rowRef = useRef<HTMLDivElement | null>(null);
  // A finger only moves a native range when it lands on the thumb, so the
  // value is taken from where it lands anywhere on the row.
  const valueAt = (clientX: number): number | null => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || !Number.isFinite(clientX)) return null;
    const along = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.round((dir === "rtl" ? 1 - along : along) * SLIDER_STEPS);
  };
  const dragTo = (e: PointerEvent<HTMLDivElement>) => {
    const value = valueAt(e.clientX);
    if (value !== null) setDrag(value);
  };
  const visual = (dir === "rtl" ? SLIDER_STEPS - shown : shown) / SLIDER_STEPS;

  const commit = () => {
    if (drag === null) return;
    setDrag(null);
    onSeek(drag / SLIDER_STEPS);
    onPointerCommit?.();
  };

  return (
    <div className={`flex min-w-0 flex-col justify-center px-3 ${className}`}>
      <div
        ref={rowRef}
        data-player-scrub
        className={`relative h-6 w-full touch-none ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        onPointerDown={(e) => {
          if (disabled) return;
          // Keeps the press from moving focus: focus goes back to the book on release.
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          dragTo(e);
        }}
        onPointerMove={(e) => {
          if (drag !== null && e.buttons !== 0) dragTo(e);
        }}
        onPointerUp={commit}
        // A drag the system takes over ends without a pointerup.
        onPointerCancel={() => setDrag(null)}
      >
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={shown}
          dir={dir}
          disabled={disabled}
          aria-label={t("epubPosition")}
          aria-valuetext={`${percent}%`}
          onKeyDown={(e) => {
            const turn = ARROW_TURNS[e.key];
            if (!turn || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            e.preventDefault();
            onTurn(turn);
          }}
          // A key or a screen reader's step has no release to wait for.
          onChange={(e) => onSeek(Number(e.target.value) / SLIDER_STEPS)}
          className={INPUT_CLASS}
        />
        <div
          className={[
            "pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-bg-border",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-disabled:opacity-40",
          ].join(" ")}
        >
          <div
            data-testid="epub-position-fill"
            className="absolute inset-y-0 rounded-full bg-accent"
            style={dir === "rtl" ? { right: 0, width: `${(1 - visual) * 100}%` } : { left: 0, width: `${visual * 100}%` }}
          />
        </div>
        {!disabled && (
          <div
            data-testid="epub-position-knob"
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `calc(${visual * 100}% + ${(0.5 - visual) * 16}px)` }}
          />
        )}
      </div>
      <p
        data-testid="epub-position-line"
        className="flex min-w-0 items-baseline gap-2 whitespace-nowrap text-xs text-text-muted"
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
