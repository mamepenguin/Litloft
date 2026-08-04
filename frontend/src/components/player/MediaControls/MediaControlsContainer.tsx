"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { MediaController } from "@/lib/mediaController";
import { MediaControlsPresenter } from "./MediaControlsPresenter";
import { useMediaControlsState } from "./hooks/useMediaControlsState";
import { usePlaybackRatePreference } from "./hooks/usePlaybackRatePreference";

export interface MediaControlsContainerProps {
  mc: MediaController | null;
  /**
   * The player frame the bar sits inside. Pointer movement anywhere on
   * it resets the idle timer, so the caller does not have to wire up
   * reveal handling itself.
   */
  frameRef: RefObject<HTMLElement | null>;
  /** Duration from our own metadata; see useMediaControlsState. */
  durationHint?: number | null;
  autoHideMs?: number;
  /**
   * Fullscreen handling supplied by the frame's owner. Needed wherever
   * pseudo-fullscreen is in play: the MediaController route only knows
   * about the browser's Fullscreen API, which iPhone does not have.
   *
   * Omit for players with nothing to fall back to (native <video>);
   * the bar then drives fullscreen through the MediaController and
   * reads the state off the document, as before.
   */
  fullscreen?: { isFullscreen: boolean; toggle: () => void };
  /** True while the frame is faking fullscreen with position: fixed. */
  isPseudoFullscreen?: boolean;
}

/**
 * Owns the state behind the control bar: polling the MediaController,
 * scrub handling, the idle timer, and the persisted playback rate.
 * Rendering lives entirely in MediaControlsPresenter.
 */
export default function MediaControlsContainer({
  mc,
  frameRef,
  durationHint,
  autoHideMs,
  fullscreen,
  isPseudoFullscreen = false,
}: MediaControlsContainerProps) {
  const state = useMediaControlsState({ mc, durationHint, autoHideMs });
  const [preferredRate, setPreferredRate] = usePlaybackRatePreference();
  const [nativeFullscreen, setNativeFullscreen] = useState(false);

  const { revealControls } = state;

  // Applying the preference in one effect keeps a single write path:
  // the change handler only records the preference, and this reacts.
  useEffect(() => {
    mc?.setPlaybackRate(preferredRate);
  }, [mc, preferredRate]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // pointerdown as well as pointermove: touch devices produce no
    // hover stream, so a tap is the only signal that the viewer wants
    // the controls back.
    frame.addEventListener("pointermove", revealControls);
    frame.addEventListener("pointerdown", revealControls);
    return () => {
      frame.removeEventListener("pointermove", revealControls);
      frame.removeEventListener("pointerdown", revealControls);
    };
  }, [frameRef, revealControls]);

  // Only consulted in the fallback path; when the owner supplies a
  // fullscreen controller it already tracks this itself.
  useEffect(() => {
    if (fullscreen) return;
    const sync = () => setNativeFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [fullscreen]);

  const withReveal = useCallback(
    (action: () => void) => () => {
      action();
      revealControls();
    },
    [revealControls],
  );

  const handleSkip = useCallback(
    (seconds: number) => {
      if (!mc) return;
      // Seek from the controller's live position, not the rendered
      // one: the rendered value can be up to a poll interval stale.
      mc.seek(mc.getCurrentTime() + seconds);
      revealControls();
    },
    [mc, revealControls],
  );

  const handleVolumeChange = useCallback(
    (volume: number) => {
      mc?.setVolume(volume);
      revealControls();
    },
    [mc, revealControls],
  );

  const handleRateChange = useCallback(
    (rate: number) => {
      setPreferredRate(rate);
      revealControls();
    },
    [setPreferredRate, revealControls],
  );

  return (
    <MediaControlsPresenter
      displayTime={state.displayTime}
      duration={state.duration}
      bufferedFraction={state.bufferedFraction}
      paused={state.paused}
      muted={state.muted}
      volume={state.volume}
      playbackRate={state.playbackRate}
      interrupted={state.interrupted}
      visible={state.controlsVisible}
      isFullscreen={fullscreen ? fullscreen.isFullscreen : nativeFullscreen}
      isPseudoFullscreen={isPseudoFullscreen}
      onTogglePlay={withReveal(() => mc?.togglePlay())}
      onSkip={handleSkip}
      onScrubStart={state.beginScrub}
      onScrubChange={state.updateScrub}
      onScrubEnd={state.endScrub}
      onToggleMute={withReveal(() => mc?.toggleMute())}
      onVolumeChange={handleVolumeChange}
      onPlaybackRateChange={handleRateChange}
      onToggleFullscreen={withReveal(() =>
        fullscreen ? fullscreen.toggle() : mc?.toggleFullscreen(),
      )}
    />
  );
}
