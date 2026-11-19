/**
 * The real controls over a stub controller whose duration is 5:55:20, so the
 * pointer row carries its widest time display without a five-hour medium.
 * `?w=` sets the frame's width, `?t=` the starting playhead in seconds.
 */

import { useRef, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import MediaControls from "@/components/player/MediaControls";
import { ProfileProvider } from "@/components/ProfileProvider";
import type { MediaController } from "@/lib/mediaController";
import { usePlaybackProgress } from "@/lib/playbackProgress";

export const PEAK_JUMP_SECONDS = 5 * 3600 + 55 * 60 + 20;

function stubController(): MediaController {
  const state = {
    currentTime: Number(new URLSearchParams(location.search).get("t") ?? "0"),
    paused: true,
  };
  return {
    seek: (seconds: number) => {
      state.currentTime = seconds;
    },
    play: () => {
      state.paused = false;
    },
    pause: () => {
      state.paused = true;
    },
    togglePlay: () => {
      state.paused = !state.paused;
    },
    toggleMute: () => {},
    toggleFullscreen: () => {},
    getCurrentTime: () => state.currentTime,
    getDuration: () => PEAK_JUMP_SECONDS,
    isPaused: () => state.paused,
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: () => {},
    getPlaybackRate: () => 1,
    setPlaybackRate: () => {},
    getBufferedFraction: () => 0,
    isInterrupted: () => false,
  };
}

function Host({ mc }: { mc: MediaController }): null {
  usePlaybackProgress({ mc, fileId: "e2e-peak" });
  return null;
}

export function PeakJumpArrangement(): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const [mc] = useState(stubController);
  const width = Number(new URLSearchParams(location.search).get("w") ?? "524");

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProfileProvider>
        <Host mc={mc} />
      </ProfileProvider>
      <div
        ref={frameRef}
        id="player-frame"
        className="relative overflow-hidden bg-black"
        style={{ width, height: (width * 9) / 16 }}
      >
        <MediaControls mc={mc} frameRef={frameRef} />
      </div>
    </NextIntlClientProvider>
  );
}
