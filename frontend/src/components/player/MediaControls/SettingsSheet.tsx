"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Captions, CaptionsOff, Check } from "lucide-react";
import type { CaptionsState } from "@/lib/mediaController";
import { SettingToggle } from "./parts/SettingToggle";
import {
  PLAYBACK_RATES,
  nearestOfferedRate,
} from "./hooks/usePlaybackRatePreference";

const DEFAULT_RATE = 1;

/**
 * `sheet` spans the frame's width and rises from its bottom edge — the
 * touch layout, where the settings button is a thumb's reach from
 * there. `popover` is the mouse layout's shape: a narrow panel parked
 * above the button that opened it, so the video stays visible.
 */
export type SettingsSheetPlacement = "sheet" | "popover";

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
  /**
   * On/off settings contributed by the frame's owner, rendered as icons
   * on the same line as core's own. Kept apart from `extra` because
   * that one is a stack of blocks and this is a single row.
   */
  toggles?: ReactNode;
  placement?: SettingsSheetPlacement;
}

/**
 * Player settings, rising from the bottom of the frame.
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
  toggles,
  placement = "sheet",
}: SettingsSheetProps) {
  const t = useTranslations("player");
  const current = nearestOfferedRate(playbackRate);
  const isPopover = placement === "popover";

  return (
    <div
      className={[
        "absolute inset-0 z-20 flex flex-col justify-end",
        isPopover ? "items-end" : "",
      ].join(" ")}
    >
      <button
        type="button"
        data-testid="settings-sheet-backdrop"
        aria-label={t("closeSettings")}
        // A mouse user can see the whole frame at once and the panel
        // covers very little of it, so there is nothing to dim; the
        // backdrop stays only to catch the click that dismisses it.
        className={`absolute inset-0 ${isPopover ? "" : "bg-black/40"}`}
        onClick={onClose}
      />

      <div
        data-testid="settings-sheet"
        data-placement={placement}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className={[
          "relative flex flex-col gap-2 bg-black/85 px-3 pb-3 pt-3 text-white",
          isPopover
            ? // Clear of the control bar below it, which is where the
              // button that opened this lives.
              "mb-16 mr-2 w-64 rounded-2xl"
            : "rounded-t-2xl",
          // The frame is only as tall as a 16:9 video, which on a phone
          // leaves barely 200px. The sheet is sized to fit inside that;
          // this is the guard for the cases it still cannot, rather
          // than letting rows fall off the bottom edge unreachable.
          // The popover's own offset comes out of that budget, or a
          // narrow window pushes its top rows off the frame instead.
          isPopover ? "max-h-[calc(100%-5rem)]" : "max-h-full",
          "overflow-y-auto",
          "animate-slide-up-bar",
        ].join(" ")}
      >
        {(captions !== "unavailable" || toggles) && (
          <div className="flex flex-wrap items-center gap-1">
            {captions !== "unavailable" && (
              <SettingToggle
                label={t("captions")}
                checked={captions === "on"}
                // Deliberately does not close the sheet: seeing whether
                // captions actually appeared is the point of the toggle,
                // and on a video without a caption track nothing will.
                onChange={onToggleCaptions}
              >
                {captions === "on" ? (
                  <Captions size={18} aria-hidden="true" />
                ) : (
                  <CaptionsOff size={18} aria-hidden="true" />
                )}
              </SettingToggle>
            )}
            {toggles}
          </div>
        )}

        {extra}

        <div role="radiogroup" aria-label={t("speed")}>
          <div className="px-1 pb-1.5 text-xs font-medium text-white/70">
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
                    "inline-flex h-11 items-center justify-center gap-1 rounded-2xl px-2.5",
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
