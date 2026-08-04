"use client";

import { useTranslations } from "next-intl";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { PLAYBACK_RATES } from "./hooks/usePlaybackRatePreference";
import type { MediaControlsPresenterProps } from "./types";
import { ControlButton } from "./parts/ControlButton";
import { SeekBar, RANGE_CLASS } from "./parts/SeekBar";
import { TimeDisplay } from "./parts/TimeDisplay";

/**
 * Snap a reported rate onto the offered set. A backend may apply a
 * speed we never offer; rendering a select with no matching option
 * would blank the control, so show the closest match instead. Ties go
 * to the faster rate (`<=` keeps the later, larger candidate).
 */
function nearestOfferedRate(rate: number): number {
  return PLAYBACK_RATES.reduce((best, candidate) =>
    Math.abs(candidate - rate) <= Math.abs(best - rate) ? candidate : best,
  );
}

/**
 * The mouse layout: one row of controls under a scrub bar, everything
 * reachable without a gesture. Pure presentation — every value and
 * every callback arrives as a prop.
 *
 * Colours are deliberately not theme tokens: this bar always sits on
 * top of a black video frame, so it stays white-on-scrim in both light
 * and dark themes (DESIGN.md, "Over-video chrome").
 */
export function PointerControlsPresenter({
  displayTime,
  duration,
  bufferedFraction,
  paused,
  muted,
  volume,
  playbackRate,
  interrupted,
  visible,
  isFullscreen,
  isPseudoFullscreen = false,
  onTogglePlay,
  onSkip,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
  onToggleMute,
  onVolumeChange,
  onPlaybackRateChange,
  onToggleFullscreen,
}: MediaControlsPresenterProps) {
  const t = useTranslations("player");

  const seekable = duration > 0 && !interrupted;

  return (
    <div
      // Read by useFullscreen: a swipe that starts here belongs to the
      // controls (scrubbing) and must not be taken as a dismiss.
      data-player-controls=""
      style={
        isPseudoFullscreen
          ? {
              // Flush against the bottom edge, iOS gives the tap to
              // Reachability or the home-bar swipe instead of the bar.
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
              // Landscape puts the notch on a side, not the top. The
              // extra 8px also keeps the bar off the screen edge,
              // which it otherwise sits flush against in fullscreen.
              paddingLeft: "calc(env(safe-area-inset-left, 0px) + 8px)",
              paddingRight: "calc(env(safe-area-inset-right, 0px) + 8px)",
            }
          : undefined
      }
      className={[
        "absolute inset-x-0 bottom-0 z-10 flex flex-col gap-0.5 px-2 pb-1 pt-8",
        "bg-gradient-to-t from-black/80 via-black/50 to-transparent",
        "transition-opacity duration-200 ease-out motion-reduce:transition-none",
        // Keyboard users must be able to reach the bar even once the
        // idle timer has faded it out.
        "focus-within:opacity-100 focus-within:pointer-events-auto",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      ].join(" ")}
    >
      <SeekBar
        displayTime={displayTime}
        duration={duration}
        bufferedFraction={bufferedFraction}
        disabled={!seekable}
        onScrubStart={onScrubStart}
        onScrubChange={onScrubChange}
        onScrubEnd={onScrubEnd}
      />

      <div className="flex items-center gap-0.5">
        <ControlButton label={paused ? t("play") : t("pause")} onClick={onTogglePlay}>
          {paused ? <Play size={20} /> : <Pause size={20} />}
        </ControlButton>
        <ControlButton
          label={t("skipBack10")}
          onClick={() => onSkip(-10)}
          disabled={interrupted}
        >
          <RotateCcw size={18} />
        </ControlButton>
        <ControlButton
          label={t("skipForward10")}
          onClick={() => onSkip(10)}
          disabled={interrupted}
        >
          <RotateCw size={18} />
        </ControlButton>

        <div className="ml-1">
          <TimeDisplay
            displayTime={displayTime}
            duration={duration}
            interrupted={interrupted}
          />
        </div>

        {interrupted && (
          <span className="ml-2 rounded-2xl bg-white/15 px-2 py-0.5 text-xs text-white">
            {t("adBreak")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <div className="flex items-center">
            <ControlButton
              label={muted ? t("unmute") : t("mute")}
              onClick={onToggleMute}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </ControlButton>
            {/* Hidden on touch devices: iOS silently ignores writes to
                volume, so the slider would look broken rather than
                merely absent. The mute toggle still works there. */}
            <div className="hidden h-11 w-20 items-center [@media(pointer:fine)]:flex">
              <input
                type="range"
                className={RANGE_CLASS}
                aria-label={t("volume")}
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
              />
            </div>
          </div>

          <select
            className="h-11 rounded-2xl bg-transparent px-1 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40"
            aria-label={t("speed")}
            value={String(nearestOfferedRate(playbackRate))}
            disabled={interrupted}
            onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
          >
            {PLAYBACK_RATES.map((rate) => (
              // The open dropdown is drawn by the OS and inherits the
              // select's background. Left transparent, the popup
              // renders white-on-white; the options need a real
              // surface of their own.
              <option key={rate} value={rate} className="bg-bg-card text-text-primary">
                {rate}x
              </option>
            ))}
          </select>

          <ControlButton
            label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
