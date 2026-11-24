import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import { FindProvider } from "@/components/FileDetail/find/FindContext";
import type { FindContextValue } from "@/components/FileDetail/find/types";
import { MiniPlayerBoxContext } from "@/hooks/useMiniPlayer";
import type { FindRow } from "@/lib/fileFind";
import type { MediaController } from "@/lib/mediaController";

import { FindOutlineLayer } from "../FindOutlineLayer";

const BOX_A = [0.1, 0.4, 0.7, 0.4, 0.7, 0.46, 0.1, 0.46];
const BOX_B = [0.6, 0.85, 0.8, 0.85, 0.8, 0.9, 0.6, 0.9];

function sceneRow(extra: Partial<FindRow> = {}): FindRow {
  return {
    kind: "scene",
    start: 10,
    end: 20,
    ordinal: 1,
    snippet: "a needle",
    match_start: 2,
    match_length: 6,
    boxes: [BOX_A],
    frame_size: [1280, 720],
    ...extra,
  };
}

function findValue(
  rows: FindRow[],
  currentRow: FindRow | null,
  status: FindContextValue["status"] = {
    kind: "hits",
    answer: { query: "needle", indexed: true, total: rows.length, truncated: false, rows },
  },
): FindContextValue {
  return {
    enabled: true,
    shortcutEnabled: true,
    open: true,
    query: "needle",
    status,
    filter: "all",
    rows,
    visibleRows: rows,
    currentRow,
    currentIndex: null,
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

interface ControllerState {
  time: number;
  duration: number;
  interrupted: boolean;
  paused: boolean;
}

function controller(initial: Partial<ControllerState> = {}) {
  const state: ControllerState = {
    time: 15,
    duration: 600,
    interrupted: false,
    paused: false,
    ...initial,
  };
  const mc: MediaController = {
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: vi.fn(() => state.time),
    getDuration: vi.fn(() => state.duration),
    isPaused: () => state.paused,
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: vi.fn(),
    getPlaybackRate: () => 1,
    setPlaybackRate: vi.fn(),
    getBufferedFraction: () => 0,
    isInterrupted: () => state.interrupted,
  };
  return { mc, state };
}

function layOut(width: number, height: number) {
  const rect = { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ ...rect, toJSON: () => rect }) as DOMRect,
  );
}

function layer(props: {
  rows?: FindRow[];
  currentRow?: FindRow | null;
  status?: FindContextValue["status"];
  mc: MediaController | null;
  mini?: boolean;
}) {
  const rows = props.rows ?? [sceneRow()];
  const currentRow = props.currentRow === undefined ? rows[0] : props.currentRow;
  return (
    <FindProvider value={findValue(rows, currentRow, props.status)}>
      <MiniPlayerBoxContext value={props.mini ?? false}>
        <div style={{ position: "relative", width: 640, height: 360 }}>
          <FindOutlineLayer controller={props.mc} />
        </div>
      </MiniPlayerBoxContext>
    </FindProvider>
  );
}

const outlines = () => ({
  current: document.querySelectorAll(".find-box-current").length,
  marks: document.querySelectorAll(".find-box:not(.find-box-current)").length,
});

const DRAWN = { current: 1, marks: 0 };
const NONE = { current: 0, marks: 0 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SPEC-CORE-135 I7 the embed layer's own conditions", () => {
  it("draws the current row's quads at its frame_size while the time is in the segment", () => {
    layOut(640, 360);
    const { mc } = controller();
    render(layer({ mc }));
    expect(outlines()).toEqual(DRAWN);
  });

  it("draws from start - 0.5 up to, not including, end", () => {
    vi.useFakeTimers();
    layOut(640, 360);
    const rows = [sceneRow()];
    const { mc, state } = controller({ time: 9.49 });
    render(layer({ mc, rows }));
    expect(outlines()).toEqual(NONE);

    state.time = 9.5;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(outlines()).toEqual(DRAWN);

    state.time = 20;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(outlines()).toEqual(NONE);
  });

  it("draws the current row's quads in the current style and the segment's other quads as marks", () => {
    layOut(640, 360);
    const current = sceneRow();
    const other = sceneRow({ boxes: [BOX_B] });
    const { mc } = controller();
    render(layer({ mc, rows: [current, other], currentRow: current }));
    expect(outlines()).toEqual({ current: 1, marks: 1 });
  });

  it("draws nothing when the duration is known and the time has reached it", () => {
    layOut(640, 360);
    const row = sceneRow({ end: 700 });
    const { mc } = controller({ time: 600, duration: 600 });
    render(layer({ mc, rows: [row] }));
    expect(outlines()).toEqual(NONE);
  });

  it("draws nothing during an interruption", () => {
    layOut(640, 360);
    const { mc } = controller({ interrupted: true });
    render(layer({ mc }));
    expect(outlines()).toEqual(NONE);
  });

  it("draws nothing in the mini player", () => {
    layOut(640, 360);
    const { mc } = controller();
    render(layer({ mc, mini: true }));
    expect(outlines()).toEqual(NONE);
  });

  it.each([
    ["no frame_size", undefined],
    ["a one-number frame_size", [1280]],
    ["a zero width", [0, 720]],
    ["a negative height", [1280, -720]],
    ["a non-finite number", [Number.POSITIVE_INFINITY, 720]],
    ["a non-number", ["1280", 720]],
  ])("draws nothing for %s", (_name, frameSize) => {
    layOut(640, 360);
    const { mc } = controller();
    const row = sceneRow({ frame_size: frameSize as never });
    render(layer({ mc, rows: [row] }));
    expect(outlines()).toEqual(NONE);
  });

  it.each([
    ["zero width", 0, 360],
    ["zero height", 640, 0],
  ])("draws nothing over a picture box of %s", (_name, width, height) => {
    layOut(width, height);
    const { mc } = controller();
    render(layer({ mc }));
    expect(outlines()).toEqual(NONE);
  });

  it("draws nothing before the answer, with no current row, or with a row without boxes", () => {
    layOut(640, 360);
    const { mc } = controller();
    const pending: FindContextValue["status"] = { kind: "pending" };
    const view = render(layer({ mc, status: pending }));
    expect(outlines()).toEqual(NONE);
    view.unmount();

    const empty = render(layer({ mc, currentRow: null }));
    expect(outlines()).toEqual(NONE);
    empty.unmount();

    const boxless = sceneRow({ boxes: null });
    render(layer({ mc, rows: [boxless] }));
    expect(outlines()).toEqual(NONE);
  });
});

describe("SPEC-CORE-135 step 19 the embed layer subscribes to the clock only while it has a row to draw", () => {
  it("leaves the controller alone with no current row, and follows it once there is one", () => {
    vi.useFakeTimers();
    layOut(640, 360);
    const { mc } = controller();
    const current = sceneRow();

    const view = render(layer({ mc, rows: [current], currentRow: null }));
    expect(mc.getCurrentTime).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mc.getCurrentTime).not.toHaveBeenCalled();

    view.rerender(layer({ mc, rows: [current], currentRow: current }));
    const subscribed = (mc.getCurrentTime as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(subscribed).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(
      (mc.getCurrentTime as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(subscribed);

    view.rerender(layer({ mc, rows: [current], currentRow: null }));
    const afterLeaving = (mc.getCurrentTime as ReturnType<typeof vi.fn>).mock.calls
      .length;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      (mc.getCurrentTime as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(afterLeaving);
  });
});
