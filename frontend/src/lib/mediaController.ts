/**
 * MediaController abstracts away the differences between a native
 * `<video>`/`<audio>` element and an embedded YouTube IFrame Player.
 *
 * Why: LoftRef files render YouTube via the IFrame Player API (rather
 * than a native HTMLMediaElement). VideoPlayer keyboard shortcuts and
 * the intelligence addon's citation jump used to bind directly to
 * `HTMLVideoElement`. By talking to a `MediaController` instead, the
 * same shortcut/jump code paths work for both backends.
 *
 * Trade-off: the YouTube IFrame Player exposes mute/play state via
 * imperative getters (no `paused` / `muted` properties), so we route
 * everything through method calls. The native controller wraps the
 * existing DOM mutations (currentTime, muted, requestFullscreen) — DOM
 * mutation is unavoidable here because the browser API is mutation-
 * shaped, but no application-level state is mutated in place.
 */

export interface MediaController {
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  toggleMute(): void;
  toggleFullscreen(): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  isMuted(): boolean;
  /**
   * Volume on a 0-1 scale. YouTube reports 0-100 natively; that
   * difference is normalised away here so callers never branch on the
   * backend.
   */
  getVolume(): number;
  setVolume(v: number): void;
  getPlaybackRate(): number;
  setPlaybackRate(r: number): void;
  /** Buffered-ahead progress as a 0-1 fraction of the total duration. */
  getBufferedFraction(): number;
  /**
   * True when the backend is playing something other than the
   * requested media (a YouTube ad break being the motivating case), so
   * controls should degrade: position/duration readings belong to the
   * interruption rather than the file, and any click-capturing overlay
   * must let events through to the underlying player.
   *
   * Optional because most backends have nothing that can interrupt
   * them, and because detection is inherently provider-specific — the
   * heuristic is injected by whoever constructs the controller rather
   * than living here. Treat an absent implementation as "never
   * interrupted".
   */
  isInterrupted?(): boolean;
  /**
   * Whether the backend can show captions at all, and whether it is
   * doing so. `"unavailable"` means the backend has no caption control
   * to offer, and callers should leave the toggle out entirely rather
   * than render one that does nothing.
   *
   * Optional because most backends have no captions to speak of.
   * Treat an absent implementation as `"unavailable"`.
   */
  getCaptions?(): CaptionsState;
  setCaptions?(enabled: boolean): void;
}

/**
 * `"off"` means the backend could show captions if asked. It does not
 * promise this particular video has any — see createYouTubeController
 * for why that cannot be known in advance.
 */
export type CaptionsState = "on" | "off" | "unavailable";

/**
 * The player restores captions somewhere in the time it takes to settle
 * on a new position, and exactly when depends on how long it buffers.
 * Repeating "off" across that whole window is more reliable than
 * guessing a single moment to say it.
 */
const CAPTION_REASSERT_INTERVAL_MS = 250;
const CAPTION_REASSERT_ATTEMPTS = 8;

/**
 * Minimal subset of the YouTube IFrame Player API we depend on. Kept
 * here (rather than as a global type) so the controller stays
 * testable with a plain object stub and so the rest of the codebase
 * doesn't need to know about the YT namespace.
 *
 * Reference: https://developers.google.com/youtube/iframe_api_reference
 */
export interface YouTubePlayerLike {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  /**
   * YT.PlayerState codes:
   *   -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
   */
  getPlayerState(): number;
  /** 0-100, unlike HTMLMediaElement.volume which is 0-1. */
  getVolume(): number;
  setVolume(volume: number): void;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  /** 0-1 fraction of the video that has been buffered. */
  getVideoLoadedFraction(): number;
  /**
   * Caption control. Undocumented — these are not in the IFrame API
   * reference, but they are what every player that offers a caption
   * toggle over an embed ends up calling. Optional so a stub or a
   * future API change simply leaves captions unavailable rather than
   * throwing.
   */
  loadModule?(name: string): void;
  unloadModule?(name: string): void;
  getOption?(module: string, option: string): unknown;
  setOption?(module: string, option: string, value: unknown): void;
}

/** Extra wiring a caller can supply when constructing a controller. */
export interface YouTubeControllerOptions {
  /**
   * Detector for "an ad is playing right now". Injected rather than
   * implemented here: the YouTube IFrame API exposes no ad state, so
   * every detection strategy is a heuristic owned by the embed that
   * has the surrounding context (e.g. the real duration from our own
   * metadata). Keeping it out of core also keeps this module free of
   * provider-specific guesswork.
   */
  isInterrupted?: () => boolean;
}

const YT_STATE_PLAYING = 1;
const YT_STATE_BUFFERING = 3;

function clampSeek(seconds: number, duration: number): number {
  if (seconds < 0) return 0;
  // Guard against the YT player returning 0 / NaN before metadata is
  // ready: treat non-finite or non-positive duration as "no upper
  // bound" so we don't snap every seek to 0.
  if (!Number.isFinite(duration) || duration <= 0) {
    return seconds;
  }
  if (seconds > duration) return duration;
  return seconds;
}

/** Clamp into [0, 1]; non-finite input degrades to 0 rather than NaN. */
function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Playback rates must stay positive and finite. A 0 or negative rate
 * is not "slow motion" — it either throws or silently wedges the
 * player — so reject rather than pass it through.
 */
function isUsableRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

export function createNativeVideoController(
  video: HTMLVideoElement,
): MediaController {
  return {
    seek(seconds) {
      video.currentTime = clampSeek(seconds, video.duration);
    },
    play() {
      void video.play();
    },
    pause() {
      video.pause();
    },
    togglePlay() {
      if (video.paused) {
        void video.play();
      } else {
        video.pause();
      }
    },
    toggleMute() {
      video.muted = !video.muted;
    },
    toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        video.requestFullscreen().catch(() => {});
      }
    },
    getCurrentTime() {
      return video.currentTime;
    },
    getDuration() {
      return video.duration;
    },
    isPaused() {
      return video.paused;
    },
    isMuted() {
      return video.muted;
    },
    getVolume() {
      return video.volume;
    },
    setVolume(v) {
      if (!Number.isFinite(v)) return;
      video.volume = clampFraction(v);
    },
    getPlaybackRate() {
      return video.playbackRate;
    },
    setPlaybackRate(r) {
      if (!isUsableRate(r)) return;
      video.playbackRate = r;
    },
    getBufferedFraction() {
      const { buffered, duration } = video;
      if (!Number.isFinite(duration) || duration <= 0) return 0;
      if (buffered.length === 0) return 0;
      // Read the END of the LAST range rather than summing every
      // range. The bar communicates "buffered up to here"; a video
      // that was seeked backwards leaves earlier ranges behind, and
      // summing them would claim more contiguous buffer than exists.
      return clampFraction(buffered.end(buffered.length - 1) / duration);
    },
    getCaptions() {
      const { textTracks } = video;
      if (textTracks.length === 0) return "unavailable";
      for (let index = 0; index < textTracks.length; index += 1) {
        if (textTracks[index]?.mode === "showing") return "on";
      }
      return "off";
    },
    setCaptions(enabled) {
      const { textTracks } = video;
      for (let index = 0; index < textTracks.length; index += 1) {
        const track = textTracks[index];
        if (!track) continue;
        track.mode = enabled && index === 0 ? "showing" : "disabled";
      }
    },
    // isInterrupted is deliberately absent: a local file has nothing
    // that can preempt it.
  };
}

export function createYouTubeController(
  player: YouTubePlayerLike,
  container: HTMLElement,
  opts: YouTubeControllerOptions = {},
): MediaController {
  const { isInterrupted } = opts;

  // Tracked here because the IFrame API has no getter for it. The
  // nearest thing, getOption("captions", "tracklist"), returns nothing
  // until the module has been loaded at least once — so it can report
  // "this video has captions" only after they have already been shown,
  // which is useless for deciding whether to offer the toggle.
  //
  // The consequence is deliberate and worth stating: the toggle is
  // offered for every YouTube video, and on one with no caption track
  // pressing it does nothing visible. Hiding it instead would mean
  // flashing captions on every video just to find out.
  let captionsOn = false;
  let captionReassertTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Hide captions. Two calls because they do different things:
   * blanking the track is what actually sticks, while unloading the
   * module is what takes effect immediately. Unloading alone is undone
   * the moment the player decides to load the module again — which it
   * does on its own after a seek.
   */
  function hideCaptions(): boolean {
    let acted = false;
    try {
      player.setOption?.("captions", "track", {});
      acted = true;
    } catch {
      // Fall through; the unload below may still work.
    }
    try {
      player.unloadModule?.("captions");
      acted = true;
    } catch {
      // Both undocumented calls refused.
    }
    return acted;
  }

  /**
   * Show captions. Loading the module is not enough on its own: having
   * been turned off by blanking the track, that blank is still in
   * place, so a track has to be chosen again. The tracklist is only
   * readable once the module is loaded, which is why this order.
   */
  function showCaptions(): boolean {
    try {
      player.loadModule?.("captions");
    } catch {
      return false;
    }
    try {
      const tracks = player.getOption?.("captions", "tracklist");
      if (Array.isArray(tracks) && tracks.length > 0) {
        player.setOption?.("captions", "track", tracks[0]);
      }
    } catch {
      // Best effort: the module is loaded either way, and the player
      // picks a default track in most cases.
    }
    return true;
  }

  function stopReasserting() {
    if (captionReassertTimer === null) return;
    clearInterval(captionReassertTimer);
    captionReassertTimer = null;
  }

  /**
   * Keep saying "off" for a couple of seconds. A seek makes the player
   * restore captions by itself, and a single call — before or just
   * after seekTo — lands at one arbitrary point in a window whose
   * length depends on buffering.
   */
  function reassertCaptionsOff() {
    if (captionsOn) return;
    hideCaptions();
    stopReasserting();
    let attempts = 0;
    captionReassertTimer = setInterval(() => {
      if (captionsOn) {
        stopReasserting();
        return;
      }
      hideCaptions();
      if (++attempts >= CAPTION_REASSERT_ATTEMPTS) stopReasserting();
    }, CAPTION_REASSERT_INTERVAL_MS);
  }

  return {
    // Spread first so the key is simply absent when no detector was
    // injected, matching the optional-method contract (callers check
    // `mc.isInterrupted?.()`). The wrapper delegates on every call
    // rather than capturing a value, so the detector stays live.
    ...(isInterrupted ? { isInterrupted: () => isInterrupted() } : {}),
    seek(seconds) {
      player.seekTo(clampSeek(seconds, player.getDuration()), true);
      reassertCaptionsOff();
    },
    play() {
      player.playVideo();
    },
    pause() {
      player.pauseVideo();
    },
    togglePlay() {
      // 1 = playing → pause; everything else (paused/ended/cued/
      // buffering/unstarted) → play. Matches user expectation that
      // Space at end of video restarts playback.
      if (player.getPlayerState() === YT_STATE_PLAYING) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    },
    toggleMute() {
      if (player.isMuted()) {
        player.unMute();
      } else {
        player.mute();
      }
    },
    toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        container.requestFullscreen().catch(() => {});
      }
    },
    getCurrentTime() {
      return player.getCurrentTime();
    },
    getDuration() {
      return player.getDuration();
    },
    isPaused() {
      // BUFFERING (3) happens transiently during a seek: the user is
      // not pausing, the player is just catching up. Report it as
      // "still playing" so observers (e.g. the floating mini-player)
      // don't flicker out on every scrub. PAUSED (2), ENDED (0),
      // CUED (5), UNSTARTED (-1) remain paused.
      const state = player.getPlayerState();
      return state !== YT_STATE_PLAYING && state !== YT_STATE_BUFFERING;
    },
    isMuted() {
      return player.isMuted();
    },
    getVolume() {
      const raw = player.getVolume();
      // Normalise YouTube's 0-100 down to the 0-1 contract.
      return Number.isFinite(raw) ? clampFraction(raw / 100) : 0;
    },
    setVolume(v) {
      if (!Number.isFinite(v)) return;
      player.setVolume(clampFraction(v) * 100);
    },
    getPlaybackRate() {
      const raw = player.getPlaybackRate();
      return isUsableRate(raw) ? raw : 1;
    },
    setPlaybackRate(r) {
      if (!isUsableRate(r)) return;
      player.setPlaybackRate(r);
    },
    getBufferedFraction() {
      return clampFraction(player.getVideoLoadedFraction());
    },
    getCaptions() {
      // Undocumented API: absent on a stub, and liable to disappear if
      // YouTube ever tidies up. Both cases mean "no toggle".
      if (typeof player.loadModule !== "function") return "unavailable";
      if (typeof player.unloadModule !== "function") return "unavailable";
      return captionsOn ? "on" : "off";
    },
    setCaptions(enabled) {
      const acted = enabled ? showCaptions() : hideCaptions();
      // Leave the flag alone if the player refused, so the UI keeps
      // reporting the truth.
      if (!acted) return;
      captionsOn = enabled;
      if (enabled) stopReasserting();
      else reassertCaptionsOff();
    },
  };
}

/**
 * Shared keyboard handler for video-style media controllers. Used by
 * VideoPlayer (native HTMLVideoElement) and LoftPlayer (YouTube
 * IFrame Player) so both surface the same shortcut behaviour.
 *
 * Bindings:
 *   ←/→  ±10s
 *   ↑/↓  ±60s (note: ↑ = forward, ↓ = back, mirroring the existing
 *               native VideoPlayer convention rather than YouTube's
 *               volume mapping which we suppress via `disablekb=1`)
 *   Space toggle play
 *   M     toggle mute
 *   F     toggle fullscreen
 *
 * Returns true if the event was handled (caller may use this to
 * preventDefault even though the handler itself already does).
 */
export function handleMediaShortcut(
  e: KeyboardEvent,
  mc: MediaController,
): boolean {
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target?.isContentEditable) return false;

  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      mc.seek(mc.getCurrentTime() - 10);
      return true;
    case "ArrowRight":
      e.preventDefault();
      mc.seek(mc.getCurrentTime() + 10);
      return true;
    case "ArrowUp":
      e.preventDefault();
      mc.seek(mc.getCurrentTime() + 60);
      return true;
    case "ArrowDown":
      e.preventDefault();
      mc.seek(mc.getCurrentTime() - 60);
      return true;
    case " ":
      e.preventDefault();
      mc.togglePlay();
      return true;
    case "m":
    case "M":
      e.preventDefault();
      mc.toggleMute();
      return true;
    case "f":
    case "F":
      e.preventDefault();
      mc.toggleFullscreen();
      return true;
    default:
      return false;
  }
}
