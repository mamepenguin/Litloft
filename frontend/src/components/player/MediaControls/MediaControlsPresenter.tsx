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
import { formatDuration } from "@/lib/format";
import { PLAYBACK_RATES } from "./hooks/usePlaybackRatePreference";

export interface MediaControlsPresenterProps {
  /** Playhead, or the drag position while the user is scrubbing. */
  displayTime: number;
  duration: number;
  bufferedFraction: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  /** An ad (or similar) is playing, so file-scoped controls are meaningless. */
  interrupted: boolean;
  visible: boolean;
  isFullscreen: boolean;
  /**
   * True while the frame fakes fullscreen with position: fixed. The bar
   * then sits against the physical screen edge rather than inside the
   * page, so it has to respect the device's safe areas itself.
   */
  isPseudoFullscreen?: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onScrubStart: (seconds: number) => void;
  onScrubChange: (seconds: number) => void;
  onScrubEnd: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
}

/** One decimal is plenty for a progress bar, and it keeps float noise
 *  (0.42 * 100 === 42.00000000000001) out of the rendered style. */
function toPercent(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `${Math.round(clamped * 1000) / 10}%`;
}

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
 * Keys that actually move a range input. Treating *every* keydown as
 * the start of a scrub means Tab-ing through the bar commits a seek to
 * the position already playing — harmless in principle, but the
 * YouTube player re-buffers on any seekTo, so it shows up as a stutter.
 */
const SCRUB_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const BUTTON_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40 motion-reduce:transition-none";

// A transparent track: the visible bar is painted by the sibling divs,
// so the input only contributes the thumb and the interaction surface.
//
// `h-full` matters more than it looks: an appearance-none range input
// collapses to the height of its track, which is 4px here, leaving a
// target no finger can land on. The element is stretched to fill its
// row while the visible track stays thin. `touch-none` stops the drag
// being claimed as a pan gesture.
const RANGE_CLASS =
  "h-full w-full cursor-pointer touch-none appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed " +
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent " +
  "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white " +
  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white " +
  "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-focus-ring";

/**
 * Pure presentation for the player control bar. Every value and every
 * callback arrives as a prop — no state, no effects, no polling.
 *
 * Colours are deliberately not theme tokens: this bar always sits on
 * top of a black video frame, so it stays white-on-scrim in both light
 * and dark themes, matching the existing over-video chrome in
 * MiniPlayerContainer. The accent token is used for the played range
 * because it reads clearly against black in both themes.
 */
export function MediaControlsPresenter({
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
  const playedFraction = duration > 0 ? displayTime / duration : 0;

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
      {/* Taller on touch: 24px is a comfortable mouse target and an
          impossible finger one. */}
      <div className="relative flex h-6 items-center [@media(pointer:coarse)]:h-10">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
          <div
            data-testid="buffered-range"
            className="absolute inset-y-0 left-0 bg-white/40"
            style={{ width: toPercent(bufferedFraction) }}
          />
          <div
            data-testid="played-range"
            className="absolute inset-y-0 left-0 bg-accent"
            style={{ width: toPercent(playedFraction) }}
          />
        </div>
        <input
          type="range"
          className={`relative ${RANGE_CLASS}`}
          aria-label={t("seek")}
          min={0}
          max={duration}
          step="any"
          value={displayTime}
          disabled={!seekable}
          onPointerDown={() => onScrubStart(displayTime)}
          onKeyDown={(e) => {
            if (SCRUB_KEYS.has(e.key)) onScrubStart(displayTime);
          }}
          onChange={(e) => onScrubChange(Number(e.target.value))}
          onPointerUp={onScrubEnd}
          onKeyUp={(e) => {
            if (SCRUB_KEYS.has(e.key)) onScrubEnd();
          }}
          // Safety net: a pointer released outside the input, or focus
          // lost mid-drag, would otherwise leave the scrub uncommitted
          // and the bar frozen on the drag position.
          onBlur={onScrubEnd}
        />
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={BUTTON_CLASS}
          aria-label={paused ? t("play") : t("pause")}
          onClick={onTogglePlay}
        >
          {paused ? <Play size={20} /> : <Pause size={20} />}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          aria-label={t("skipBack10")}
          onClick={() => onSkip(-10)}
          disabled={interrupted}
        >
          <RotateCcw size={18} />
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          aria-label={t("skipForward10")}
          onClick={() => onSkip(10)}
          disabled={interrupted}
        >
          <RotateCw size={18} />
        </button>

        <div className="ml-1 flex items-center gap-1 text-xs tabular-nums text-white">
          <span>{formatDuration(interrupted ? null : displayTime)}</span>
          <span aria-hidden="true" className="text-white/50">
            /
          </span>
          <span className="text-white/70">
            {formatDuration(interrupted || duration <= 0 ? null : duration)}
          </span>
        </div>

        {interrupted && (
          <span className="ml-2 rounded-2xl bg-white/15 px-2 py-0.5 text-xs text-white">
            {t("adBreak")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <div className="flex items-center">
            <button
              type="button"
              className={BUTTON_CLASS}
              aria-label={muted ? t("unmute") : t("mute")}
              onClick={onToggleMute}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
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

          <button
            type="button"
            className={BUTTON_CLASS}
            aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
