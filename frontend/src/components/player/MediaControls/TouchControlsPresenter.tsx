"use client";

import { useTranslations } from "next-intl";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { MediaControlsPresenterProps } from "./types";
import { PlaybackRateSheet } from "./PlaybackRateSheet";
import { ControlButton } from "./parts/ControlButton";
import { ProgressHairline } from "./parts/ProgressHairline";
import { SeekBar } from "./parts/SeekBar";
import { TimeDisplay } from "./parts/TimeDisplay";

const SKIP_SECONDS = 10;

/**
 * The rotate arrow with its interval written inside it, the way mobile
 * players label their skip buttons. `aria-hidden` because the button
 * around it already carries the full label.
 */
function SkipIcon({ direction }: { direction: "back" | "forward" }) {
  return (
    <span aria-hidden="true" className="relative inline-flex items-center justify-center">
      {direction === "back" ? <RotateCcw size={30} /> : <RotateCw size={30} />}
      <span className="absolute text-[9px] font-semibold tabular-nums">
        {SKIP_SECONDS}
      </span>
    </span>
  );
}

/**
 * The touch layout: transport on large targets in the middle of the
 * frame, status and the remaining controls along the bottom.
 *
 * The parts that take input are separate absolutely-positioned blocks
 * rather than one full-frame container, and only those blocks carry
 * `data-player-controls`. A full-frame marker would tell useFullscreen
 * that every swipe belongs to the controls, killing swipe-to-dismiss
 * outright.
 *
 * Colours are white-on-scrim rather than theme tokens, since the
 * backdrop is always a black video frame (DESIGN.md, "Over-video
 * chrome").
 */
export function TouchControlsPresenter({
  displayTime,
  duration,
  bufferedFraction,
  paused,
  muted,
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
  onPlaybackRateChange,
  onToggleFullscreen,
  rateSheetOpen = false,
  onRateSheetOpenChange,
}: MediaControlsPresenterProps) {
  const t = useTranslations("player");

  const seekable = duration > 0 && !interrupted;
  const playedFraction = duration > 0 ? displayTime / duration : 0;
  // Faded-out controls must not take taps: an invisible play button
  // under the viewer's finger would toggle playback on the tap that
  // was only meant to bring the controls back. Keyboard focus still
  // reaches them, which pointer-events does not affect.
  const takesInput = visible ? "pointer-events-auto" : "pointer-events-none";

  return (
    <>
      <div
        data-testid="touch-controls-root"
        className={[
          "absolute inset-0 z-10 transition-opacity duration-200 ease-out motion-reduce:transition-none",
          // This box covers the whole frame purely to position its
          // children, and it sits above the gesture overlay. Taking
          // input here would swallow every tap, long press and double
          // tap on the video. The children opt back in individually.
          "pointer-events-none",
          // iOS runs its own long-press behaviour over anything
          // selectable — the loupe appears and the gesture is lost.
          "select-none [-webkit-user-select:none] [-webkit-touch-callout:none]",
          // Keyboard users must be able to reach the controls even once
          // the idle timer has faded them out.
          "focus-within:opacity-100",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {/* The row itself takes no input. Its box spans roughly 220px,
            and a double tap landing between two buttons would otherwise
            hit a dead zone in the middle of the frame — exactly where
            people tap. Only the buttons opt back in. */}
        <div
          data-testid="transport"
          className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-6"
        >
          <ControlButton
            size="hero"
            className={takesInput}
            label={t("skipBack10")}
            onClick={() => onSkip(-SKIP_SECONDS)}
            // The overlay's interactive gate does not reach this far:
            // these buttons sit in the control layer, above it.
            disabled={interrupted}
          >
            <SkipIcon direction="back" />
          </ControlButton>
          <ControlButton
            size="heroPrimary"
            className={takesInput}
            label={paused ? t("play") : t("pause")}
            onClick={onTogglePlay}
          >
            {paused ? <Play size={32} /> : <Pause size={32} />}
          </ControlButton>
          <ControlButton
            size="hero"
            className={takesInput}
            label={t("skipForward10")}
            onClick={() => onSkip(SKIP_SECONDS)}
            disabled={interrupted}
          >
            <SkipIcon direction="forward" />
          </ControlButton>
        </div>

        <div
          data-player-controls=""
          style={
            isPseudoFullscreen
              ? {
                  paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
                  // Landscape puts the notch on a side, not the top.
                  paddingRight: "calc(env(safe-area-inset-right, 0px) + 8px)",
                }
              : undefined
          }
          className={`absolute right-0 top-0 flex items-center gap-0.5 p-2 ${takesInput}`}
        >
          {/* No volume slider: iOS silently ignores writes to volume,
              so it would look broken rather than absent. The mute
              toggle still works there. */}
          <ControlButton
            label={muted ? t("unmute") : t("mute")}
            onClick={onToggleMute}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </ControlButton>
          <ControlButton
            label={t("settings")}
            onClick={() => onRateSheetOpenChange?.(true)}
            disabled={interrupted}
          >
            <Settings size={20} />
          </ControlButton>
        </div>

        <div
          data-player-controls=""
          style={
            isPseudoFullscreen
              ? {
                  // Flush against the bottom edge, iOS gives the tap to
                  // Reachability or the home-bar swipe instead of the bar.
                  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
                  // Landscape puts the notch on a side, not the top.
                  paddingLeft: "calc(env(safe-area-inset-left, 0px) + 8px)",
                  paddingRight: "calc(env(safe-area-inset-right, 0px) + 8px)",
                }
              : undefined
          }
          className={[
            "absolute inset-x-0 bottom-0 flex flex-col gap-1 pt-8",
            "bg-gradient-to-t from-black/80 via-black/50 to-transparent",
            takesInput,
          ].join(" ")}
        >
          {/* The padding lives on the status row, not the block, so the
              scrub bar below can run the full width of the frame the
              way mobile players draw it. */}
          <div className="flex items-center gap-1 px-2">
            <TimeDisplay
              displayTime={displayTime}
              duration={duration}
              interrupted={interrupted}
            />

            {interrupted && (
              <span className="ml-1 rounded-2xl bg-white/15 px-2 py-0.5 text-xs text-white">
                {t("adBreak")}
              </span>
            )}

            <div className="ml-auto flex items-center gap-0.5">
              <ControlButton
                label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
                onClick={onToggleFullscreen}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </ControlButton>
            </div>
          </div>

          <SeekBar
            displayTime={displayTime}
            duration={duration}
            bufferedFraction={bufferedFraction}
            disabled={!seekable}
            onScrubStart={onScrubStart}
            onScrubChange={onScrubChange}
            onScrubEnd={onScrubEnd}
          />
        </div>
      </div>

      {rateSheetOpen && (
        <PlaybackRateSheet
          playbackRate={playbackRate}
          onSelect={onPlaybackRateChange}
          onClose={() => onRateSheetOpenChange?.(false)}
        />
      )}

      {/* Outside the faded container: this is what remains once the
          controls go away. */}
      {!visible && (
        <ProgressHairline
          playedFraction={playedFraction}
          bufferedFraction={bufferedFraction}
        />
      )}
    </>
  );
}
