"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import {
  PLAYBACK_RATES,
  nearestOfferedRate,
} from "./hooks/usePlaybackRatePreference";

const DEFAULT_RATE = 1;

export interface PlaybackRateSheetProps {
  /** The rate the player reports, which may not be one we offer. */
  playbackRate: number;
  onSelect: (rate: number) => void;
  onClose: () => void;
}

/**
 * Speed picker for the touch layout, rising from the bottom of the
 * frame.
 *
 * Rendered *inside* the player frame rather than portalled to the body:
 * the frame is `position: fixed` while faking fullscreen on Apple
 * mobile, so anything outside it would end up behind the video.
 *
 * A radiogroup rather than a listbox — this is a set of mutually
 * exclusive settings, and radios come with the arrow-key navigation and
 * checked semantics already wired up.
 */
export function PlaybackRateSheet({
  playbackRate,
  onSelect,
  onClose,
}: PlaybackRateSheetProps) {
  const t = useTranslations("player");
  const current = nearestOfferedRate(playbackRate);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        data-testid="rate-sheet-backdrop"
        aria-label={t("closeSettings")}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div
        role="radiogroup"
        aria-label={t("speed")}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className={[
          "relative rounded-t-2xl bg-black/85 px-3 pb-3 pt-2 text-white",
          "animate-slide-up-bar",
        ].join(" ")}
      >
        <div className="px-1 pb-2 text-xs font-medium text-white/70">
          {t("speed")}
        </div>
        <div className="flex flex-wrap gap-1">
          {PLAYBACK_RATES.map((rate) => {
            const checked = rate === current;
            return (
              <button
                key={rate}
                type="button"
                role="radio"
                aria-checked={checked}
                className={[
                  "inline-flex h-11 min-w-16 items-center justify-center gap-1 rounded-2xl px-3",
                  "text-sm tabular-nums transition-colors motion-reduce:transition-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                  checked ? "bg-white/20 font-medium" : "hover:bg-white/10",
                ].join(" ")}
                onClick={() => {
                  onSelect(rate);
                  // Nothing else to do in here, and the sheet covers
                  // the video while it is up.
                  onClose();
                }}
              >
                {checked && <Check size={14} aria-hidden="true" />}
                {rate === DEFAULT_RATE ? t("normalSpeed") : `${rate}x`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
