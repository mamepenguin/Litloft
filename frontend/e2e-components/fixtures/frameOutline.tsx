import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { FindProvider } from "@/components/FileDetail/find/FindContext";
import type { FindContextValue } from "@/components/FileDetail/find/types";
import { FindOutlineLayer } from "@/components/player/FindOutlineLayer";
import { VideoPlayer } from "@/components/VideoPlayer";
import type { FindRow } from "@/lib/fileFind";
import type { MediaController } from "@/lib/mediaController";
import enMessages from "@/messages-core/en.json";

import {
  LOFT_OUTLINE_CASES,
  NATIVE_OUTLINE_CASES,
  type FrameOutlineCase,
} from "../frame-outline.data";

function rowsFor(c: FrameOutlineCase, frameSize: [number, number] | null): FindRow[] {
  return c.quads.map((entry, index): FindRow => ({
    kind: "scene",
    start: 10,
    end: 20,
    ordinal: index + 1,
    snippet: "a line of frame text",
    match_start: 0,
    match_length: 4,
    boxes: [entry.quad],
    ...(frameSize ? { frame_size: frameSize } : {}),
  }));
}

function findValue(rows: FindRow[]): FindContextValue {
  return {
    enabled: true,
    shortcutEnabled: false,
    open: true,
    query: "line",
    status: {
      kind: "hits",
      answer: { query: "line", indexed: true, total: rows.length, truncated: false, rows },
    },
    filter: "all",
    rows,
    visibleRows: rows,
    currentRow: rows[0] ?? null,
    currentIndex: 0,
    truncated: false,
    focusNonce: 0,
    selectRequest: null,
    openFind: () => {},
    closeFind: () => {},
    openFindByShortcut: () => false,
    changeQuery: () => {},
    commitQuery: () => {},
    compositionStart: () => {},
    compositionEnd: () => {},
    keyDown: () => {},
    step: () => {},
    selectRow: () => {},
    selectFilter: () => {},
    retry: () => {},
    reportTab: () => {},
    registerUrlStrip: () => {},
  };
}

/** Time inside both rows' segment, long enough not to be at its end. */
function stubController(): MediaController {
  return {
    seek: () => {},
    play: () => {},
    pause: () => {},
    togglePlay: () => {},
    toggleMute: () => {},
    toggleFullscreen: () => {},
    getCurrentTime: () => 15,
    getDuration: () => 600,
    isPaused: () => true,
    isMuted: () => true,
    getVolume: () => 1,
    setVolume: () => {},
    getPlaybackRate: () => 1,
    setPlaybackRate: () => {},
    getBufferedFraction: () => 0,
    isInterrupted: () => false,
  };
}

function NativeArrangement(): ReactElement {
  const rows = rowsFor(NATIVE_OUTLINE_CASES[0], null);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <FindProvider value={findValue(rows)}>
        <div id="picture-host" style={{ width: "640px" }}>
          <VideoPlayer videoId="outline00001" />
        </div>
      </FindProvider>
    </NextIntlClientProvider>
  );
}

function LoftArrangement({ caseId }: { caseId: string }): ReactElement {
  const c = LOFT_OUTLINE_CASES.find((entry) => entry.id === caseId)!;
  const rows = rowsFor(c, [c.video.width, c.video.height]);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <FindProvider value={findValue(rows)}>
        <div
          id="picture-host"
          style={{ position: "relative", width: "640px", height: "360px", background: "#000" }}
        >
          <FindOutlineLayer controller={stubController()} />
        </div>
      </FindProvider>
    </NextIntlClientProvider>
  );
}

export const FRAME_OUTLINE_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "frame-outline-native": NativeArrangement,
  "frame-outline-loft-letterbox": () => <LoftArrangement caseId="letterbox" />,
  "frame-outline-loft-pillarbox": () => <LoftArrangement caseId="pillarbox" />,
};
