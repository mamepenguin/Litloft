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
}: MediaControlsContainerProps) {
  const state = useMediaControlsState({ mc, durationHint, autoHideMs });
  const [preferredRate, setPreferredRate] = usePlaybackRatePreference();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { revealControls } = state;

  // Applying the preference in one effect keeps a single write path:
  // the change handler only records the preference, and this reacts.
  useEffect(() => {
    mc?.setPlaybackRate(preferredRate);
  }, [mc, preferredRate]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.addEventListener("pointermove", revealControls);
    return () => frame.removeEventListener("pointermove", revealControls);
  }, [frameRef, revealControls]);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

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
      isFullscreen={isFullscreen}
      onTogglePlay={withReveal(() => mc?.togglePlay())}
      onSkip={handleSkip}
      onScrubStart={state.beginScrub}
      onScrubChange={state.updateScrub}
      onScrubEnd={state.endScrub}
      onToggleMute={withReveal(() => mc?.toggleMute())}
      onVolumeChange={handleVolumeChange}
      onPlaybackRateChange={handleRateChange}
      onToggleFullscreen={withReveal(() => mc?.toggleFullscreen())}
    />
  );
}
