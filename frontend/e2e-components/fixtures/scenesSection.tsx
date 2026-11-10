import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import type { MediaController } from "@/lib/mediaController";
import enMessages from "@/messages-core/en.json";

import ScenesSection from "../../src/addons/intelligence/ScenesSection";
import intelligenceEn from "../../src/addons/intelligence/messages/en.json";
import {
  SCENES_DRIVE,
  SCENES_DURATION,
  SCENES_FILE,
  SCENES_PLAYBACK,
  SCENES_TIMESTAMPS,
  SCENES_VISUAL_INDEX,
} from "./scenesSectionData";

const mediaController: MediaController = {
  seek(seconds) {
    SCENES_PLAYBACK.time = seconds;
  },
  play() {
    SCENES_PLAYBACK.paused = false;
  },
  pause() {
    SCENES_PLAYBACK.paused = true;
  },
  togglePlay() {
    SCENES_PLAYBACK.paused = !SCENES_PLAYBACK.paused;
  },
  toggleMute() {},
  toggleFullscreen() {},
  getCurrentTime: () => SCENES_PLAYBACK.time,
  getDuration: () => SCENES_DURATION,
  isPaused: () => SCENES_PLAYBACK.paused,
  isMuted: () => true,
  getVolume: () => 1,
  setVolume() {},
  getPlaybackRate: () => 1,
  setPlaybackRate() {},
  getBufferedFraction: () => 0,
};

declare global {
  interface Window {
    __scenesPlayback: typeof SCENES_PLAYBACK;
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Nothing here reaches a server: the fixture runs from `file://`. */
function stubIntelligenceApi(): void {
  window.__scenesPlayback = SCENES_PLAYBACK;
  window.fetch = (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes(`/api/drives/${SCENES_DRIVE}/addon-policies`)) {
      return Promise.resolve(
        jsonResponse({
          addons: {
            intelligence: {
              default: true,
              features: { video_visual_index: true },
            },
          },
        }),
      );
    }
    if (url.includes(`/files/${SCENES_FILE}/clip-timestamps`)) {
      return Promise.resolve(
        jsonResponse({
          file_id: SCENES_FILE,
          drive: SCENES_DRIVE,
          timestamps: SCENES_TIMESTAMPS,
        }),
      );
    }
    if (url.includes(`/files/${SCENES_FILE}/visual-index`)) {
      return Promise.resolve(jsonResponse(SCENES_VISUAL_INDEX));
    }
    return Promise.resolve(new Response("", { status: 404 }));
  };
}

/** The real Scenes section in a host of the given width. */
export function ScenesSectionArrangement({
  hostWidth,
}: {
  hostWidth: number;
}): ReactElement {
  stubIntelligenceApi();

  return (
    <div id="scenes-host" className="bg-bg-primary" style={{ width: hostWidth }}>
      <NextIntlClientProvider
        locale="en"
        messages={{ ...enMessages, ...intelligenceEn }}
      >
        <ScenesSection
          fileId={SCENES_FILE}
          drive={SCENES_DRIVE}
          fileType="video"
          mediaController={mediaController}
        />
      </NextIntlClientProvider>
    </div>
  );
}
