"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { CaptionsState } from "@/lib/mediaController";
import {
  PLAYBACK_RATES,
  nearestOfferedRate,
} from "./hooks/usePlaybackRatePreference";

const DEFAULT_RATE = 1;

export interface SettingsSheetProps {
  /** The rate the player reports, which may not be one we offer. */
  playbackRate: number;
  onSelectRate: (rate: number) => void;
  /** `"unavailable"` leaves the caption row out entirely. */
  captions: CaptionsState;
  onToggleCaptions: (enabled: boolean) => void;
  onClose: () => void;
  /** Rows contributed by the frame's owner; see MediaControlsPresenterProps. */
  extra?: ReactNode;
}

/**
 * Player settings for the touch layout, rising from the bottom of the
 * frame.
 *
 * Rendered *inside* the player frame rather than portalled to the body:
 * the frame is `position: fixed` while faking fullscreen on Apple
 * mobile, so anything outside it would end up behind the video.
 */
export function SettingsSheet({
  playbackRate,
  onSelectRate,
  captions,
  onToggleCaptions,
  onClose,
  extra,
}: SettingsSheetProps) {
  const t = useTranslations("player");
  const current = nearestOfferedRate(playbackRate);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        data-testid="settings-sheet-backdrop"
        aria-label={t("closeSettings")}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div
        data-testid="settings-sheet"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className={[
          "relative flex flex-col gap-3 rounded-t-2xl bg-black/85 px-3 pb-3 pt-3 text-white",
          "animate-slide-up-bar",
        ].join(" ")}
      >
        {extra}

        {captions !== "unavailable" && (
          <div className="flex items-center justify-between gap-3">
            <span className="px-1 text-sm">{t("captions")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={captions === "on"}
              aria-label={t("captions")}
              // Deliberately does not close the sheet: seeing whether
              // captions actually appeared is the point of the toggle,
              // and on a video without a caption track nothing will.
              onClick={() => onToggleCaptions(captions !== "on")}
              className={[
                "inline-flex h-11 min-w-20 items-center justify-center gap-1 rounded-2xl px-3 text-sm",
                "transition-colors motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                captions === "on" ? "bg-white/20 font-medium" : "hover:bg-white/10",
              ].join(" ")}
            >
              {captions === "on" && <Check size={14} aria-hidden="true" />}
              {captions === "on" ? t("captionsOn") : t("captionsOff")}
            </button>
          </div>
        )}

        <div role="radiogroup" aria-label={t("speed")}>
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
                    onSelectRate(rate);
                    // Nothing else to do once a speed is picked, and
                    // the sheet covers the video while it is up.
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
    </div>
  );
}
