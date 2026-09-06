"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Captions, CaptionsOff, Check } from "lucide-react";
import type { CaptionsState } from "@/lib/mediaController";
import { SettingToggle } from "./parts/SettingToggle";
import {
  OverFrameSettingsPanel,
  type OverFramePlacement,
} from "./parts/OverFrameSettingsPanel";
import {
  PLAYBACK_RATES,
  nearestOfferedRate,
} from "./hooks/usePlaybackRatePreference";

const DEFAULT_RATE = 1;

/**
 * Kept as an alias so callers naming the player's own type still read
 * naturally; the two shapes are described on `OverFramePlacement`.
 */
export type SettingsSheetPlacement = OverFramePlacement;

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
 * Player settings, in the frame-local panel `OverFrameSettingsPanel`
 * provides. This file owns the rows; the panel owns the shape.
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

  return (
    <OverFrameSettingsPanel
      placement={placement}
      onClose={onClose}
      closeLabel={t("closeSettings")}
      testId="settings-sheet"
      backdropTestId="settings-sheet-backdrop"
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
    </OverFrameSettingsPanel>
  );
}
