"use client";

import { useTranslations } from "next-intl";
import { ChevronsRight, RotateCcw, RotateCw } from "lucide-react";
import type { GestureHandlers, SkipFeedback } from "./hooks/usePlayerGestures";

export interface GestureOverlayProps {
  /**
   * False while an ad or the end screen owns the frame. The overlay
   * then lets every pointer through: covering YouTube's own UI breaks
   * the player and counts as interfering with ads.
   */
  interactive: boolean;
  skip: SkipFeedback | null;
  boosting: boolean;
  boostRate: number;
  handlers: GestureHandlers;
}

/**
 * The transparent surface that turns pointer input over the video into
 * player commands, plus the feedback for the two gestures that have no
 * button of their own.
 *
 * A cross-origin iframe never delivers its own events, so this overlay
 * is the only way to react to a tap on the video at all.
 *
 * Colours are white-on-scrim rather than theme tokens: the backdrop is
 * always a black video frame (DESIGN.md, "Over-video chrome").
 */
export function GestureOverlay({
  interactive,
  skip,
  boosting,
  boostRate,
  handlers,
}: GestureOverlayProps) {
  const t = useTranslations("player");

  return (
    <div
      // Symmetric with the bar's `data-player-controls`: lets the frame's
      // owner address the overlay without depending on its classes.
      data-player-gestures=""
      className="absolute inset-0 z-0 touch-none select-none [-webkit-touch-callout:none]"
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      {...handlers}
    >
      {/* Gated on `interactive` as well: the ripple covers half the
          frame, and leaving one on screen when an ad takes over would
          obscure the ad itself. Hiding the player visually is a clearer
          terms violation than covering it, and pointer-events does
          nothing about that. */}
      {interactive && skip && (
        <div
          data-testid="skip-feedback"
          data-side={skip.side}
          aria-hidden="true"
          // Re-keyed on the running total so each further tap replays
          // the animation instead of sitting there statically.
          key={`${skip.side}-${skip.seconds}`}
          className={[
            "absolute inset-y-0 flex w-1/2 flex-col items-center justify-center gap-1",
            "bg-white/15 text-white animate-fade-in-scale",
            skip.side === "back" ? "left-0 rounded-r-full" : "right-0 rounded-l-full",
          ].join(" ")}
        >
          {skip.side === "back" ? <RotateCcw size={28} /> : <RotateCw size={28} />}
          <span className="text-sm font-medium tabular-nums">
            {t("skipSeconds", { seconds: skip.seconds })}
          </span>
        </div>
      )}

      {interactive && boosting && (
        <div
          data-testid="boost-pill"
          aria-hidden="true"
          className={[
            "absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1",
            "rounded-2xl bg-black/70 px-3 py-1.5 text-sm font-medium text-white",
            "animate-fade-in",
          ].join(" ")}
        >
          <span className="tabular-nums">{t("speedBoost", { rate: boostRate })}</span>
          <ChevronsRight size={16} />
        </div>
      )}
    </div>
  );
}
