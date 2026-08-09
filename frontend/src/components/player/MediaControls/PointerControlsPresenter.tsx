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
import { SettingsSheet } from "./SettingsSheet";
import { ControlButton } from "./parts/ControlButton";
import { SeekBar } from "./parts/SeekBar";
import { TimeDisplay } from "./parts/TimeDisplay";
import { VolumeSlider } from "./parts/VolumeSlider";

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
  backendOwnsFrame = false,
  onTogglePlay,
  onSkip,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
  onToggleMute,
  onVolumeChange,
  onPlaybackRateChange,
  onToggleFullscreen,
  captions,
  onToggleCaptions,
  settingsOpen = false,
  onSettingsOpenChange,
  settingsExtra,
}: MediaControlsPresenterProps) {
  const t = useTranslations("player");

  const seekable = duration > 0 && !interrupted;

  return (
    <>
      <div
        data-testid="control-bar"
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
          // A long press on the timings or a label otherwise brings up
          // iOS's selection loupe on top of the player.
          "select-none [-webkit-user-select:none] [-webkit-touch-callout:none]",
          "transition-opacity duration-200 ease-out motion-reduce:transition-none",
          // Keyboard users must be able to reach the bar even once the
          // idle timer has faded it out.
          "focus-within:opacity-100 focus-within:pointer-events-auto",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
      >
        {/* The scrim, on its own layer so it can carry a blur without the
            content being blurred with it. Negative z-index keeps it
            behind the rows, which are in normal flow.

            An embedded backend draws chrome of its own in this same strip
            — YouTube's pause overlay puts a share pill, a related-video
            card and its wordmark exactly where our transport, volume and
            fullscreen controls sit — and the old scrim was thin enough to
            read as a second, broken row of controls. Blurring what is
            behind us settles that: the backend's chrome falls back to
            being a backdrop, and ours reads as the layer in front.

            Not while the backend owns the frame, though. An ad's skip
            button and the end screen's links live in this strip too, and
            those have to stay legible — obscuring them breaks the player
            and, for ads, the API terms. Then the scrim goes back to the
            plain gradient. */}
        <div
          aria-hidden="true"
          data-testid="control-bar-scrim"
          className={[
            "pointer-events-none absolute inset-0 -z-10",
            backendOwnsFrame
              ? "bg-gradient-to-t from-black/80 via-black/50 to-transparent"
              : [
                  "bg-gradient-to-t from-black/95 to-black/60 backdrop-blur-[3px]",
                  // The gradient alone fades the tint but not the blur,
                  // which would end at a visible horizontal seam. The
                  // mask fades the whole layer, blur included.
                  "[mask-image:linear-gradient(to_top,black_0%,black_55%,transparent_100%)]",
                  "[-webkit-mask-image:linear-gradient(to_top,black_0%,black_55%,transparent_100%)]",
                ].join(" "),
          ].join(" ")}
        />

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
              <div className="hidden [@media(pointer:fine)]:block">
                <VolumeSlider
                  value={muted ? 0 : volume}
                  onChange={onVolumeChange}
                />
              </div>
            </div>

            {/* Speed used to be a bare <select> here. Its width was set by
                the widest option, so "1x" sat a gap away from the arrow
                the OS drew, and the whole control matched nothing else in
                the row. It moves into the settings panel, which is also
                the only place the caption toggle and whatever the frame's
                owner contributes could be reached from — neither had a
                route on the mouse layout at all. */}
            <ControlButton
              label={t("settings")}
              onClick={() => onSettingsOpenChange?.(!settingsOpen)}
              disabled={interrupted}
            >
              <Settings size={18} />
            </ControlButton>

            <ControlButton
              label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
              onClick={onToggleFullscreen}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </ControlButton>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <SettingsSheet
          placement="popover"
          playbackRate={playbackRate}
          onSelectRate={onPlaybackRateChange}
          captions={captions}
          onToggleCaptions={onToggleCaptions}
          onClose={() => onSettingsOpenChange?.(false)}
          extra={settingsExtra}
        />
      )}
    </>
  );
}
