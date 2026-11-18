/**
 * The real `TranscriptSection` on a phone, with every fetch it makes
 * answered here. Mounted directly rather than through the transcript slot,
 * whose stub draws prose of its own.
 */

import { useEffect, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import type { MediaController } from "@/lib/mediaController";
import TranscriptSection from "../../src/addons/intelligence/TranscriptSection";
import jaMessages from "@/messages-core/ja.json";
import intelligenceJa from "../../src/addons/intelligence/messages/ja.json";

const FILE_ID = "touchfile01";
const DRIVE = "touchdrive";

const SHORT_TEXTS = [
  "今日は会議の議題を三つ確認してから、順番に進めていきます。",
  "まず先週の作業の振り返りですが、予定していた部分はほぼ終わりました。",
  "残っているのは画面のレイアウトの調整と、細かい文言の修正です。",
  "次に今週の予定です。新しい機能の設計を始めたいと考えています。",
  "設計については来週の水曜日までに案をまとめて共有します。",
];
const LONG_START = 25;
const LONG_TEXT = "長い発話の続きです。".repeat(200);

const LINES = [
  ...SHORT_TEXTS.map((text, index) => ({
    index,
    text,
    start: index * 5,
    end: index * 5 + 5,
  })),
  {
    index: SHORT_TEXTS.length,
    text: LONG_TEXT,
    start: LONG_START,
    end: LONG_START + 5,
  },
  {
    index: SHORT_TEXTS.length + 1,
    text: "最後に、その他の連絡事項があればお願いします。",
    start: 130,
    end: 135,
  },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const transcript = {
  available: true,
  file_id: FILE_ID,
  drive: DRIVE,
  language: "ja",
  chunks: LINES,
  has_original: false,
  corrected: false,
  busy: false,
  followups_pending: false,
};

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.includes(`/files/${FILE_ID}/transcript/utterances/`)) {
    return Promise.resolve(json({ ...LINES[0], text: "保存しました" }));
  }
  if (url.endsWith(`/files/${FILE_ID}/transcript`)) {
    return Promise.resolve(json(transcript));
  }
  if (url.includes("/subtitles.vtt")) {
    return Promise.resolve(new Response("", { status: 404 }));
  }
  return nativeFetch(input, init);
};

let currentTime = 0;

const mediaController: MediaController = {
  seek(seconds) {
    currentTime = seconds;
  },
  play() {},
  pause() {},
  togglePlay() {},
  toggleMute() {},
  toggleFullscreen() {},
  getCurrentTime: () => currentTime,
  getDuration: () => 200,
  isPaused: () => false,
  isMuted: () => false,
  getVolume: () => 1,
  setVolume() {},
  getPlaybackRate: () => 1,
  setPlaybackRate() {},
  getBufferedFraction: () => 0,
};

declare global {
  interface Window {
    __transcriptTouch?: {
      seekTo: (seconds: number) => void;
      remount: () => void;
    };
  }
}

function TouchArrangement(): ReactElement {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    window.__transcriptTouch = {
      seekTo: (seconds) => {
        currentTime = seconds;
      },
      remount: () => setMounted((wasMounted) => !wasMounted),
    };
  }, []);

  return (
    <NextIntlClientProvider
      locale="ja"
      messages={{ ...jaMessages, ...intelligenceJa }}
    >
      <div className="flex h-screen flex-col">
        {mounted && (
          <TranscriptSection
            fileId={FILE_ID}
            drive={DRIVE}
            filename="meeting.mp4"
            mediaController={mediaController}
            fillHeight
          />
        )}
      </div>
    </NextIntlClientProvider>
  );
}

export const TRANSCRIPT_TOUCH_ARRANGEMENTS: Record<string, () => ReactElement> =
  {
    "transcript-touch": TouchArrangement,
  };
