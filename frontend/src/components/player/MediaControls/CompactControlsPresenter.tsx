"use client";

import { useTranslations } from "next-intl";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { MediaControlsPresenterProps } from "./types";
import { ControlBarScrim } from "./parts/ControlBarScrim";
import { ControlButton } from "./parts/ControlButton";
import { ProgressHairline } from "./parts/ProgressHairline";
import { SeekBar } from "./parts/SeekBar";
import { TimeDisplay } from "./parts/TimeDisplay";

/**
 * Not the touch layout. That one's hero button exists because a single
 * tap is spoken for, and it can drop the skip buttons because a double
 * tap does the skipping. Under a mouse a click on the frame already
 * toggles playback, and the double click means fullscreen, so nothing
 * would be left holding skip.
 *
 * Colours are white-on-scrim rather than theme tokens, since the
 * backdrop is always a black video frame.
 */
export function CompactControlsPresenter({
  displayTime,
  duration,
  bufferedFraction,
  paused,
  muted,
  interrupted,
  visible,
  backendOwnsFrame = false,
  onTogglePlay,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
  onToggleMute,
}: MediaControlsPresenterProps) {
  const t = useTranslations("player");

  const seekable = duration > 0 && !interrupted;
  const playedFraction = duration > 0 ? displayTime / duration : 0;

  return (
    <>
      <div
        data-testid="compact-controls-root"
        className={[
          // No horizontal or bottom padding on the block: the scrub bar
          // is meant to run the full width of the frame and sit on its
          // very edge, so the padding lives on the status row instead.
          "absolute inset-x-0 bottom-0 z-10 flex flex-col pt-8",
          // A long press on the timings otherwise brings up iOS's
          // selection loupe on top of the player.
          "select-none [-webkit-user-select:none] [-webkit-touch-callout:none]",
          "transition-opacity duration-200 ease-out motion-reduce:transition-none",
          // Keyboard users must be able to reach the bar even once the
          // idle timer has faded it out.
          "focus-within:opacity-100 focus-within:pointer-events-auto",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <ControlBarScrim backendOwnsFrame={backendOwnsFrame} />

        {/* The negative margin closes the gap the button's own 44px
            target leaves above the bar. */}
        <div className="-mb-2 flex items-center gap-0.5 px-2">
          <ControlButton
            label={paused ? t("play") : t("pause")}
            onClick={onTogglePlay}
          >
            {paused ? <Play size={20} /> : <Pause size={20} />}
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

          {/* No volume slider: at this width the mute toggle is the part
              that earns its space, and the frame's owner still has the
              system volume. */}
          <ControlButton
            className="ml-auto"
            label={muted ? t("unmute") : t("mute")}
            onClick={onToggleMute}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </ControlButton>
        </div>

        {/* `edge` so the line sits on the frame's own boundary, the way
            the touch layout draws it, while the row above keeps a
            full-size target. */}
        <SeekBar
          variant="edge"
          displayTime={displayTime}
          duration={duration}
          bufferedFraction={bufferedFraction}
          disabled={!seekable}
          onScrubStart={onScrubStart}
          onScrubChange={onScrubChange}
          onScrubEnd={onScrubEnd}
        />
      </div>

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
