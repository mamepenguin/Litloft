import type { ReactElement } from "react";
import { useMemo } from "react";
import { NextIntlClientProvider } from "next-intl";

import type { MediaController } from "@/lib/mediaController";
import enMessages from "@/messages-core/en.json";

import ScenesSection from "../../src/addons/intelligence/ScenesSection";
import intelligenceEn from "../../src/addons/intelligence/messages/en.json";
import {
  SCENES_DRIVE,
  SCENES_DURATION,
  SCENES_FILE,
  SCENES_LONG_DURATION,
  SCENES_LONG_FILE,
  SCENES_LONG_TIMESTAMPS,
  SCENES_LONG_VISUAL_INDEX,
  SCENES_PLAYBACK,
  SCENES_TIMESTAMPS,
  SCENES_VISUAL_INDEX,
} from "./scenesSectionData";

interface ScenesDataset {
  file: string;
  duration: number;
  timestamps: { start: number; content_preview: string }[];
  visualIndex: unknown;
}

const SHORT: ScenesDataset = {
  file: SCENES_FILE,
  duration: SCENES_DURATION,
  timestamps: SCENES_TIMESTAMPS,
  visualIndex: SCENES_VISUAL_INDEX,
};

const LONG: ScenesDataset = {
  file: SCENES_LONG_FILE,
  duration: SCENES_LONG_DURATION,
  timestamps: SCENES_LONG_TIMESTAMPS,
  visualIndex: SCENES_LONG_VISUAL_INDEX,
};

declare global {
  interface Window {
    __scenesPlayback: typeof SCENES_PLAYBACK;
  }
}

function makeController(duration: number): MediaController {
  return {
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
    getDuration: () => duration,
    isPaused: () => SCENES_PLAYBACK.paused,
    isMuted: () => true,
    getVolume: () => 1,
    setVolume() {},
    getPlaybackRate: () => 1,
    setPlaybackRate() {},
    getBufferedFraction: () => 0,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Nothing here reaches a server: the fixture runs from `file://`. */
function stubIntelligenceApi(data: ScenesDataset): void {
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
    if (url.includes(`/files/${data.file}/clip-timestamps`)) {
      return Promise.resolve(
        jsonResponse({
          file_id: data.file,
          drive: SCENES_DRIVE,
          timestamps: data.timestamps,
        }),
      );
    }
    if (url.includes(`/files/${data.file}/visual-index`)) {
      return Promise.resolve(jsonResponse(data.visualIndex));
    }
    return Promise.resolve(new Response("", { status: 404 }));
  };
}

/** The real Scenes section in a host of the given width. */
export function ScenesSectionArrangement({
  hostWidth,
  long = false,
}: {
  hostWidth: number;
  long?: boolean;
}): ReactElement {
  const data = long ? LONG : SHORT;
  stubIntelligenceApi(data);
  const mediaController = useMemo(
    () => makeController(data.duration),
    [data.duration],
  );

  return (
    <div id="scenes-host" className="bg-bg-primary" style={{ width: hostWidth }}>
      <NextIntlClientProvider
        locale="en"
        messages={{ ...enMessages, ...intelligenceEn }}
      >
        <ScenesSection
          fileId={data.file}
          drive={SCENES_DRIVE}
          fileType="video"
          mediaController={mediaController}
        />
      </NextIntlClientProvider>
    </div>
  );
}
