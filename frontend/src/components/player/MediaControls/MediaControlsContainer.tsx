"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { MediaController } from "@/lib/mediaController";
import { CompactControlsPresenter } from "./CompactControlsPresenter";
import { PointerControlsPresenter } from "./PointerControlsPresenter";
import { TouchControlsPresenter } from "./TouchControlsPresenter";
import { GestureOverlay } from "./GestureOverlay";
import { JUMP_BUTTON_MIN_WIDTH, pickControlsLayout } from "./layout";
import { useMediaControlsState } from "./hooks/useMediaControlsState";
import { usePlaybackRatePreference } from "./hooks/usePlaybackRatePreference";
import { useCaptionsPreference } from "./hooks/useCaptionsPreference";
import { BOOST_RATE, usePlayerGestures } from "./hooks/usePlayerGestures";
import { usePointerMode } from "../hooks/usePointerMode";
import { useWatchedPieces, watchedRangesStore } from "@/lib/watchedRangesStore";
import { useMostWatchedSpots, useWatchedRegistration } from "@/lib/mostWatched";

/** How long the jump label stays after a press. */
const MOST_WATCHED_LABEL_MS = 2000;

export interface MediaControlsContainerProps {
  mc: MediaController | null;
  /**
   * The player frame the bar sits inside. Pointer movement anywhere on
   * it resets the idle timer, so the caller does not have to wire up
   * reveal handling itself.
   */
  frameRef: RefObject<HTMLElement | null>;
  durationHint?: number | null;
  autoHideMs?: number;
  /**
   * Needed wherever pseudo-fullscreen is in play: the MediaController
   * route only knows about the browser's Fullscreen API, which iPhone
   * does not have.
   */
  fullscreen?: { isFullscreen: boolean; toggle: () => void };
  isPseudoFullscreen?: boolean;
  /**
   * False while an ad or the end screen owns the frame. The gesture
   * overlay then lets every pointer through — covering YouTube's own
   * UI breaks the player and counts as interfering with ads.
   */
  interactive?: boolean;
  /**
   * Reports the long-press speed boost so the frame's owner can hold
   * off its swipe-to-dismiss while a finger is planted on the video.
   */
  onBoostingChange?: (boosting: boolean) => void;
  settingsExtra?: ReactNode;
  settingsToggles?: ReactNode;
}

export default function MediaControlsContainer({
  mc,
  frameRef,
  durationHint,
  autoHideMs,
  fullscreen,
  isPseudoFullscreen = false,
  interactive = true,
  onBoostingChange,
  settingsExtra,
  settingsToggles,
}: MediaControlsContainerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pointerMode = usePointerMode();
  const state = useMediaControlsState({
    mc,
    durationHint,
    autoHideMs,
    touch: pointerMode === "coarse",
    holdVisible: settingsOpen,
  });
  const [preferredRate, setPreferredRate] = usePlaybackRatePreference();
  const [captionsPreferred, setCaptionsPreferred] = useCaptionsPreference();
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const watchedPieces = useWatchedPieces(mc, state.duration);
  const spots = useMostWatchedSpots(mc, state.duration);
  const registration = useWatchedRegistration(mc);
  const registrationKey = registration
    ? `${registration.fileId}\u0000${registration.nickname ?? ""}`
    : "";
  const jumpAvailable =
    mc !== null &&
    registration?.nickname != null &&
    state.duration > 0 &&
    !state.interrupted &&
    interactive &&
    spots.length > 0;
  const [mostWatched, setMostWatched] = useState<{
    key: string;
    index: number;
    count: number;
  } | null>(null);
  const rememberedRef = useRef<{ key: string; start: number } | null>(null);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    revealControls,
    hideControls,
    controlsVisible,
    bottomOnly,
    noteSkip,
    restartSkipWindow,
  } = state;

  // Every skip -- the gesture layer's taps, the buttons and the
  // arrow-key shortcuts -- travels through the store, so one
  // subscription catches all of them. The callback is stable, so this
  // does not resubscribe on ticks.
  useEffect(() => {
    if (!mc) return;
    return watchedRangesStore.subscribeSkip(mc, noteSkip);
  }, [mc, noteSkip]);

  // The remembered spot belongs to one file and one viewer; the label
  // goes with it, because it names a position in that file's order.
  useEffect(() => {
    rememberedRef.current = null;
    setMostWatched(null);
    if (labelTimerRef.current) {
      clearTimeout(labelTimerRef.current);
      labelTimerRef.current = null;
    }
  }, [registrationKey]);

  useEffect(() => {
    if (!jumpAvailable) setMostWatched(null);
  }, [jumpAvailable]);

  useEffect(() => {
    if (!mc) return;
    watchedRangesStore.publishJumpAvailable(mc, jumpAvailable);
    return () => watchedRangesStore.publishJumpAvailable(mc, false);
  }, [mc, jumpAvailable]);

  useEffect(
    () => () => {
      if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
    },
    [],
  );

  // Guarded because a controller can outlive its player by a moment:
  // whoever owns the frame may tear the backend down in the same commit
  // that mounts us, and a write to a destroyed one throws from inside
  // the backend's own code rather than returning an error.
  useEffect(() => {
    try {
      mc?.setPlaybackRate(preferredRate);
    } catch {
      // Backend gone; the next one will get the preference on mount.
    }
  }, [mc, preferredRate]);

  useEffect(() => {
    if (captionsPreferred === null) return;
    try {
      mc?.setCaptions?.(captionsPreferred);
    } catch {
      // Same as above.
    }
  }, [mc, captionsPreferred]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // Touch drives the bar entirely from the gesture layer, where a tap
    // toggles it. Revealing on every pointerdown here as well would
    // make "tap to put the controls away" impossible, and a finger
    // sliding to scroll would keep summoning them.
    if (pointerMode === "coarse") return;
    frame.addEventListener("pointermove", revealControls);
    frame.addEventListener("pointerdown", revealControls);
    return () => {
      frame.removeEventListener("pointermove", revealControls);
      frame.removeEventListener("pointerdown", revealControls);
    };
  }, [frameRef, revealControls, pointerMode]);

  // Measured rather than read off a breakpoint: the same player sits in a
  // full-width page, in a narrow right pane and in the mini window. A
  // container query would express it directly but cannot be used here —
  // `container-type: inline-size` around a subtree holding a <video> or a
  // cross-origin iframe makes iOS Safari rotate the page indefinitely.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setFrameWidth(frame.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef]);

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

  const reportSkip = useCallback(() => {
    if (mc) watchedRangesStore.reportSkip(mc);
  }, [mc]);

  const handleSkip = useCallback(
    (seconds: number) => {
      if (!mc) return;
      // Seek from the controller's live position, not the rendered
      // one: the rendered value can be up to a poll interval stale.
      mc.seek(mc.getCurrentTime() + seconds);
      watchedRangesStore.reportSkip(mc);
    },
    [mc],
  );

  // Goes through the state hook rather than straight to the controller:
  // it holds the requested level until the poll confirms it, so a drag
  // does not trail the pointer by up to a poll interval.
  const { setVolume } = state;
  const handleVolumeChange = useCallback(
    (volume: number) => {
      setVolume(volume);
      revealControls();
    },
    [setVolume, revealControls],
  );

  const handleRateChange = useCallback(
    (rate: number) => {
      setPreferredRate(rate);
      revealControls();
    },
    [setPreferredRate, revealControls],
  );

  const handleToggleFullscreen = useCallback(() => {
    if (fullscreen) fullscreen.toggle();
    else mc?.toggleFullscreen();
    // In bottom-only the bar stays as it is; the press only buys the
    // viewer another skip window's worth of it.
    if (bottomOnly) restartSkipWindow();
    else revealControls();
  }, [fullscreen, mc, bottomOnly, restartSkipWindow, revealControls]);

  // The switch is drawn from what the player reports, so a press can ask
  // for the value already stored. Recording the preference alone would
  // then change no state, nothing would reach the player, and the press
  // would do nothing at all.
  const handleToggleCaptions = useCallback(
    (enabled: boolean) => {
      setCaptionsPreferred(enabled);
      try {
        mc?.setCaptions?.(enabled);
      } catch {
        // Backend gone; the next one gets the preference on mount.
      }
      revealControls();
    },
    [mc, setCaptionsPreferred, revealControls],
  );

  const toggleControls = useCallback(() => {
    if (bottomOnly || !controlsVisible) revealControls();
    else hideControls();
  }, [bottomOnly, controlsVisible, hideControls, revealControls]);

  const gestures = usePlayerGestures({
    mc,
    mode: pointerMode,
    interactive,
    interrupted: state.interrupted,
    duration: state.duration,
    preferredRate,
    onToggleControls: toggleControls,
    onSkipTap: reportSkip,
    onTogglePlay: withReveal(() => mc?.togglePlay()),
    onToggleFullscreen: handleToggleFullscreen,
  });

  const { boosting, resetTapSequence } = gestures;

  // The button and the gesture overlay are different surfaces. Without
  // clearing the tap history here, pressing play and then tapping
  // beside it would read as a double tap and skip, when the viewer only
  // meant to press play twice.
  const handleTogglePlayFromControls = useCallback(() => {
    resetTapSequence();
    mc?.togglePlay();
    revealControls();
  }, [mc, resetTapSequence, revealControls]);

  useEffect(() => {
    onBoostingChange?.(boosting);
  }, [boosting, onBoostingChange]);

  const handleJump = useCallback(() => {
    if (!mc || spots.length === 0) return;
    const remembered = rememberedRef.current;
    const at =
      remembered && remembered.key === registrationKey
        ? spots.findIndex((spot) => spot.start === remembered.start)
        : -1;
    const index = at === -1 ? 0 : (at + 1) % spots.length;
    const spot = spots[index];
    try {
      mc.seek(spot.start);
    } catch {
      // A seek the player refuses leaves the order and the label alone.
      return;
    }
    rememberedRef.current = { key: registrationKey, start: spot.start };
    setMostWatched({ key: registrationKey, index: index + 1, count: spots.length });
    if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
    labelTimerRef.current = setTimeout(() => {
      labelTimerRef.current = null;
      setMostWatched(null);
    }, MOST_WATCHED_LABEL_MS);
    // The button and the gesture overlay are different surfaces, as for
    // the play button: a tap beside it must not complete a double tap.
    resetTapSequence();
    watchedRangesStore.reportSkip(mc);
  }, [mc, spots, resetTapSequence, registrationKey]);

  useEffect(() => {
    if (!mc) return;
    return watchedRangesStore.subscribeJump(mc, handleJump);
  }, [mc, handleJump]);

  const layout = pickControlsLayout(pointerMode, frameWidth);

  // The compact layout draws no settings sheet, so a sheet left open
  // when the frame narrows would be invisible while `settingsOpen` went
  // on holding the bar awake — the idle timer would never fire again and
  // the bar would sit over the video for good.
  const compact = layout === "compact";
  useEffect(() => {
    if (compact) setSettingsOpen(false);
  }, [compact]);

  const Presenter = {
    touch: TouchControlsPresenter,
    compact: CompactControlsPresenter,
    pointer: PointerControlsPresenter,
  }[layout];

  const showJump =
    jumpAvailable &&
    layout !== "compact" &&
    (layout === "touch" || (frameWidth ?? 0) >= JUMP_BUTTON_MIN_WIDTH);
  const jumpLabel =
    jumpAvailable && mostWatched?.key === registrationKey
      ? { index: mostWatched.index, count: mostWatched.count }
      : null;

  return (
    <>
      <GestureOverlay
        interactive={interactive}
        skip={gestures.skip}
        boosting={boosting}
        boostRate={BOOST_RATE}
        mostWatched={jumpLabel}
        handlers={gestures.handlers}
      />
      <Presenter
        displayTime={state.displayTime}
        duration={state.duration}
        bufferedFraction={state.bufferedFraction}
        paused={state.paused}
        muted={state.muted}
        volume={state.volume}
        playbackRate={state.playbackRate}
        interrupted={state.interrupted}
        visible={state.controlsVisible}
        bottomOnly={state.bottomOnly}
        watchedPieces={watchedPieces}
        bandVisible={state.bandVisible}
        onChromeFocus={revealControls}
        isFullscreen={fullscreen ? fullscreen.isFullscreen : nativeFullscreen}
        isPseudoFullscreen={isPseudoFullscreen}
        // The same condition that stands the gestures down: what makes
        // the backend's own chrome untouchable also makes it something
        // we must not paint over.
        backendOwnsFrame={!interactive}
        onTogglePlay={handleTogglePlayFromControls}
        onSkip={handleSkip}
        showJump={showJump}
        onJump={handleJump}
        onScrubStart={state.beginScrub}
        onScrubChange={state.updateScrub}
        onScrubEnd={state.endScrub}
        onToggleMute={withReveal(() => mc?.toggleMute())}
        onVolumeChange={handleVolumeChange}
        onPlaybackRateChange={handleRateChange}
        onToggleFullscreen={handleToggleFullscreen}
        captions={state.captions}
        onToggleCaptions={handleToggleCaptions}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        settingsExtra={settingsExtra}
        settingsToggles={settingsToggles}
      />
    </>
  );
}
