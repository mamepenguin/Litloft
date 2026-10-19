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
  /** Volume on a 0-1 scale, whatever the backend reports natively. */
  getVolume(): number;
  setVolume(v: number): void;
  getPlaybackRate(): number;
  setPlaybackRate(r: number): void;
  getBufferedFraction(): number;
  /**
   * True when the backend is playing something other than the
   * requested media (a YouTube ad break), so position/duration readings
   * belong to the interruption rather than the file, and any
   * click-capturing overlay must let events through to the player.
   * Treat an absent implementation as "never interrupted".
   */
  isInterrupted?(): boolean;
  /** Treat an absent implementation as `"unavailable"`. */
  getCaptions?(): CaptionsState;
  setCaptions?(enabled: boolean): void;
}

/**
 * `"off"` means the backend could show captions if asked. It does not
 * promise this particular video has any.
 */
export type CaptionsState = "on" | "off" | "unavailable";

/**
 * The player restores captions somewhere in the time it takes to settle
 * on a new position, and exactly when depends on how long it buffers.
 */
const CAPTION_REASSERT_INTERVAL_MS = 250;
const CAPTION_REASSERT_ATTEMPTS = 8;

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
  getVideoLoadedFraction(): number;
  /**
   * Undocumented — these are not in the IFrame API reference. Optional so
   * a stub or a future API change simply leaves captions unavailable
   * rather than throwing.
   */
  loadModule?(name: string): void;
  unloadModule?(name: string): void;
  getOption?(module: string, option: string): unknown;
  setOption?(module: string, option: string, value: unknown): void;
}

export interface YouTubeControllerOptions {
  /**
   * Injected rather than implemented here: the YouTube IFrame API exposes
   * no ad state, so every detection strategy is a heuristic owned by the
   * embed that has the surrounding context.
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

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * A 0 or negative rate is not "slow motion" — it either throws or
 * silently wedges the player.
 */
function isUsableRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

export function createNativeVideoController(
  video: HTMLVideoElement,
): MediaController {
  let selectedCaptionTrack = 0;
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
      // range: a video that was seeked backwards leaves earlier ranges
      // behind, and summing them would claim more contiguous buffer
      // than exists.
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
        if (textTracks[index]?.mode === "showing") {
          selectedCaptionTrack = index;
          break;
        }
      }
      for (let index = 0; index < textTracks.length; index += 1) {
        const track = textTracks[index];
        if (!track) continue;
        track.mode =
          enabled && index === selectedCaptionTrack ? "showing" : "disabled";
      }
    },
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
  // until the module has been loaded at least once.
  //
  // So the toggle is offered for every YouTube video, and on one with no
  // caption track pressing it does nothing visible. Hiding it instead
  // would mean flashing captions on every video just to find out.
  let captionsOn = false;
  let captionReassertTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Two calls because they do different things: blanking the track is
   * what actually sticks, while unloading the module is what takes effect
   * immediately.
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
   * Loading the module is not enough on its own: having been turned off
   * by blanking the track, that blank is still in place, so a track has
   * to be chosen again. The tracklist is only readable once the module is
   * loaded, which is why this order.
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
   * A seek makes the player restore captions by itself, and a single
   * call — before or just after seekTo — lands at one arbitrary point in
   * a window whose length depends on buffering.
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
    // The key is absent when no detector was injected, matching the
    // optional-method contract.
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
      // BUFFERING happens transiently during a seek. Report it as
      // "still playing" so observers don't flicker out on every scrub.
      const state = player.getPlayerState();
      return state !== YT_STATE_PLAYING && state !== YT_STATE_BUFFERING;
    },
    isMuted() {
      return player.isMuted();
    },
    getVolume() {
      const raw = player.getVolume();
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
      if (typeof player.loadModule !== "function") return "unavailable";
      if (typeof player.unloadModule !== "function") return "unavailable";
      return captionsOn ? "on" : "off";
    },
    setCaptions(enabled) {
      const acted = enabled ? showCaptions() : hideCaptions();
      if (!acted) return;
      captionsOn = enabled;
      if (enabled) stopReasserting();
      else reassertCaptionsOff();
    },
  };
}

/**
 * ↑ = forward, ↓ = back, rather than YouTube's volume mapping, which is
 * suppressed via `disablekb=1`.
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
