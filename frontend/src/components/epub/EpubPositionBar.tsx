"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { List, Maximize } from "lucide-react";

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

/** The slider stays a hairline until it is pointed at, focused or dragged. */
const TRACK_CLASS = [
  "pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-bg-border",
  "group-hover/scrub:h-1 peer-focus-visible:h-1 group-data-[dragging=true]/scrub:h-1",
  "peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring",
].join(" ");

const FILL_CLASS = [
  "absolute inset-y-0 rounded-full bg-warm-silver",
  "group-hover/scrub:bg-accent peer-focus-visible:bg-accent group-data-[dragging=true]/scrub:bg-accent",
].join(" ");

/** Without hover on a touch screen, a small neutral thumb says it can be dragged. */
const KNOB_CLASS = [
  "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent",
  "opacity-0 group-hover/scrub:opacity-100 peer-focus-visible:opacity-100 group-data-[dragging=true]/scrub:opacity-100 pointer-coarse:opacity-100",
  "pointer-coarse:size-2 pointer-coarse:bg-text-muted",
  "pointer-coarse:group-data-[dragging=true]/scrub:size-5 pointer-coarse:group-data-[dragging=true]/scrub:bg-accent",
].join(" ");

const BAR_BUTTON_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors pointer-coarse:h-11 pointer-coarse:w-11 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:text-warm-silver";

export interface EpubPositionBarProps {
  fraction: number | null;
  chapter: string | null;
  pagesLeft: number | null;
  dir: "ltr" | "rtl";
  /** Chapter starts, 0–1 from the start of the book. */
  marks: readonly number[];
  /** The chapter a dragged thumb would land in. */
  chapterAt: (fraction: number) => string | null;
  onSeek: (fraction: number) => void;
  onTurn: (turn: PageTurn) => void;
  /** After a pointer drag, so the keys turn pages again instead of moving the thumb. */
  onPointerCommit?: () => void;
  /** Whether a drag is under way, so the bar is not withdrawn mid-drag. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  /** The panel buttons sit beside the scrub row so a press on one never seeks. */
  openPanel: "typography" | "toc" | null;
  onTogglePanel: (panel: "typography" | "toc") => void;
  tocDisabled: boolean;
  /** Inline only: in full screen the close button lives in the top band. */
  onEnterFullscreen?: () => void;
  enterFullscreenDisabled?: boolean;
  className?: string;
}

export function EpubPositionBar({
  fraction,
  chapter,
  pagesLeft,
  dir,
  marks,
  chapterAt,
  onSeek,
  onTurn,
  onPointerCommit,
  onScrubbingChange,
  openPanel,
  onTogglePanel,
  tocDisabled,
  onEnterFullscreen,
  enterFullscreenDisabled = false,
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
  const current = fraction === null ? 0 : Math.round(fraction * SLIDER_STEPS);
  const shown = drag ?? current;
  const percentOf = (value: number) => Math.floor((value / SLIDER_STEPS) * 100);
  const toVisual = (value: number) => (dir === "rtl" ? SLIDER_STEPS - value : value) / SLIDER_STEPS;

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
  const visual = toVisual(shown);

  const commit = () => {
    if (drag === null) return;
    setDrag(null);
    onSeek(drag / SLIDER_STEPS);
    onPointerCommit?.();
  };

  return (
    <div data-testid="epub-position-bar" className={`flex min-w-0 flex-col ${className}`}>
      <div className="px-4">
        <div
          ref={rowRef}
          data-player-scrub
          data-dragging={drag !== null}
          className={`group/scrub relative h-5 w-full touch-none pointer-coarse:h-11 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
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
            aria-valuetext={`${percentOf(shown)}%`}
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
          <div className={TRACK_CLASS}>
            {!disabled && (
              <div
                data-testid="epub-position-fill"
                className={FILL_CLASS}
                style={dir === "rtl" ? { right: 0, width: `${(1 - visual) * 100}%` } : { left: 0, width: `${visual * 100}%` }}
              />
            )}
            {marks.map((mark) => (
              <div
                key={mark}
                data-testid="epub-position-mark"
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-bg-primary"
                style={{ left: `${Math.round(toVisual(mark * SLIDER_STEPS) * 1000) / 10}%` }}
              />
            ))}
          </div>
          {!disabled && (
            <div
              data-testid="epub-position-knob"
              className={KNOB_CLASS}
              style={{ left: `${visual * 100}%` }}
            />
          )}
          {drag !== null && (
            // Moved back by as much of its own width as the thumb is along the
            // track, so it stays inside the bar at both ends.
            <div
              data-testid="epub-position-bubble"
              className="pointer-events-none absolute bottom-full z-10 mb-2 flex max-w-64 items-baseline gap-2 whitespace-nowrap rounded-xl bg-text-primary px-2.5 py-1.5 text-xs text-bg-primary"
              style={{ left: `${visual * 100}%`, transform: `translateX(-${visual * 100}%)` }}
            >
              <span className="min-w-0 truncate font-semibold">{chapterAt(drag / SLIDER_STEPS)}</span>
              <span className="shrink-0 tabular-nums">{percentOf(drag)}%</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex h-10 min-w-0 items-center gap-0.5 px-2 pointer-coarse:h-11">
        <button
          type="button"
          onClick={() => onTogglePanel("toc")}
          disabled={disabled || tocDisabled}
          aria-expanded={openPanel === "toc"}
          aria-label={t("epubContents")}
          className={`${BAR_BUTTON_CLASS} ${openPanel === "toc" ? "text-accent" : "text-text-muted enabled:hover:text-text-primary"}`}
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={() => onTogglePanel("typography")}
          disabled={disabled}
          aria-expanded={openPanel === "typography"}
          aria-label={t("epubTypographyButton")}
          className={`${BAR_BUTTON_CLASS} text-sm font-medium ${
            openPanel === "typography" ? "text-accent" : "text-text-muted enabled:hover:text-text-primary"
          }`}
        >
          Aa
        </button>
        <span className="mx-2 h-4 w-px shrink-0 bg-bg-border" aria-hidden="true" />
        <p
          data-testid="epub-position-line"
          className="flex min-w-0 flex-1 items-baseline gap-2.5 whitespace-nowrap text-xs text-text-muted"
        >
          {chapter && <span className="min-w-0 truncate text-text-primary">{chapter}</span>}
          {pagesLeft !== null && (
            <span className="min-w-0 truncate">{t("epubPagesLeft", { count: pagesLeft })}</span>
          )}
          <span className="ml-auto shrink-0 pl-2 tabular-nums text-text-primary">
            {percentOf(current)}%
          </span>
        </p>
        {onEnterFullscreen && (
          <button
            type="button"
            onClick={onEnterFullscreen}
            disabled={enterFullscreenDisabled}
            aria-label={t("epubFullscreen")}
            className={`${BAR_BUTTON_CLASS} ml-1 text-text-muted enabled:hover:text-text-primary`}
          >
            <Maximize size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
