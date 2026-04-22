/**
 * MediaController abstracts away the differences between a native
 * `<video>`/`<audio>` element and an embedded YouTube IFrame Player.
 *
 * Why: HvLink files render YouTube via the IFrame Player API (rather
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
}

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
  };
}

export function createYouTubeController(
  player: YouTubePlayerLike,
  container: HTMLElement,
): MediaController {
  return {
    seek(seconds) {
      player.seekTo(clampSeek(seconds, player.getDuration()), true);
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
  };
}

/**
 * Shared keyboard handler for video-style media controllers. Used by
 * VideoPlayer (native HTMLVideoElement) and HvlinkPlayer (YouTube
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
