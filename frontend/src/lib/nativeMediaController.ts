"use client";

/**
 * A `MediaController` over the native shell. The getters read the shadow the
 * channel keeps, so the contract stays synchronous and `mediaClock` polls it
 * the same way it polls every other backend.
 */

import type { MediaController } from "./mediaController";
import type { MediaChannel } from "./nativeMedia";

export function createNativeShellController(channel: MediaChannel): MediaController {
  // The shell has no mute of its own, so it is a volume the toggle restores.
  let volumeBeforeMute: number | null = null;

  const unmute = () => {
    channel.setVolume(volumeBeforeMute ?? 1);
    volumeBeforeMute = null;
  };

  return {
    play: () => channel.play(),
    pause: () => channel.pause(),
    seek: (seconds) => channel.seek(seconds),

    togglePlay: () => {
      if (channel.read().paused) channel.play();
      else channel.pause();
    },

    toggleMute: () => {
      if (volumeBeforeMute !== null) {
        unmute();
        return;
      }
      volumeBeforeMute = channel.read().volume;
      channel.setVolume(0);
    },

    // Audio has no frame to fill, and the shell draws no video of its own.
    toggleFullscreen: () => {},

    getCurrentTime: () => channel.read().time,
    getDuration: () => channel.read().duration,
    isPaused: () => channel.read().paused,
    isMuted: () => channel.read().volume === 0,
    getVolume: () => channel.read().volume,
    setVolume: (value) => {
      volumeBeforeMute = null;
      channel.setVolume(Math.min(Math.max(value, 0), 1));
    },
    getPlaybackRate: () => channel.read().rate,
    setPlaybackRate: (rate) => channel.setRate(rate),

    getBufferedFraction: () => {
      const { buffered, duration } = channel.read();
      if (!(duration > 0)) return 0;
      return Math.min(buffered / duration, 1);
    },
  };
}
