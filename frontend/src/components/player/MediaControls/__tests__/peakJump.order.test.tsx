// SPEC-CORE-151: which spot each press goes to, and what the order remembers (I1, I2, I3).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import { installPointerEvent } from "@/test/pointerEvent";
import {
  band,
  bandOnHover,
  fetchMock,
  flush,
  installPointerMode,
  pagehide,
  play,
  renderPage,
  restoreMatchMedia,
  routeFetch,
  segmentsResponse,
  settle,
  stubController,
  tick,
  wait,
} from "./watchedBandHarness";
import {
  FIVE_ORDER,
  FIVE_SPOTS,
  installFrameWidth,
  jumpButton,
  label,
  lastSeek,
  pressJump,
  restoreWidths,
} from "./peakJumpHarness";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getWatchProgress: vi.fn(),
    saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
  clearProgress: vi.fn(),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: vi.fn(),
}));

let nickname: string | null = "kaori";

beforeEach(() => {
  installPointerEvent();
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getWatchProgress).mockResolvedValue({ position: 0, duration: 0 });
  vi.mocked(saveWatchProgress).mockResolvedValue(undefined);
  nickname = "kaori";
  vi.mocked(useProfile).mockImplementation(() => ({
    nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }));
  localStorage.clear();
  installPointerMode("fine");
  installFrameWidth(900);
});

afterEach(() => {
  restoreWidths();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreMatchMedia();
});

function serve(segments: Record<number, number>, segment_seconds?: number) {
  routeFetch({ segments: async () => segmentsResponse({ segments, segment_seconds }) });
}

async function page(overrides: Parameters<typeof stubController>[0] = {}, fileId = "f1") {
  const { mc, state } = stubController(overrides);
  const utils = renderPage({ mc, fileId });
  await settle();
  return { mc, state, page: utils };
}

/** Presses once and returns where it went and the label it showed. */
function jump(mc: { seek: unknown }): [number | undefined, string | null] {
  const before = vi.mocked(mc.seek as (s: number) => void).mock.calls.length;
  pressJump();
  const after = vi.mocked(mc.seek as (s: number) => void).mock.calls.length;
  return [after > before ? lastSeek(mc) : undefined, label()];
}

describe("SPEC-CORE-151 spots and their order (I1, I2)", () => {
  it("SPEC-CORE-151 presses walk the spots by strength, then length, then start, and wrap", async () => {
    serve(FIVE_SPOTS);
    const { mc } = await page();
    expect(bandOnHover().length).toBeGreaterThan(0);

    const seen = [...FIVE_ORDER, FIVE_ORDER[0]].map(() => jump(mc));
    expect(seen).toEqual([
      [50, "Most watched 1 / 5"],
      [25, "Most watched 2 / 5"],
      [10, "Most watched 3 / 5"],
      [75, "Most watched 4 / 5"],
      [85, "Most watched 5 / 5"],
      [50, "Most watched 1 / 5"],
    ]);
  });

  it.each([
    ["one spot: every press goes to it", { 4: 10 }, 5, 100, [[20, "Most watched 1 / 1"], [20, "Most watched 1 / 1"]]],
    [
      "a level 2 run beside a level 3 run is one spot, of strength 3",
      { 0: 10, 1: 15, 8: 15, 9: 15 },
      5,
      100,
      [[0, "Most watched 1 / 2"], [40, "Most watched 2 / 2"]],
    ],
    [
      "a segment with no row cuts a spot",
      { 0: 10, 2: 10, 3: 10 },
      5,
      100,
      [[10, "Most watched 1 / 2"], [0, "Most watched 2 / 2"]],
    ],
    [
      "the last segment's level is over its clipped length",
      // D = 97: segment 19 is [95, 97); 4 s played is level 2 there.
      { 0: 10, 19: 4 },
      5,
      97,
      [[0, "Most watched 1 / 2"], [95, "Most watched 2 / 2"]],
    ],
    [
      "the response's segment_seconds sets each spot's start and level",
      // s = 10: segment 3 is [30, 40) at level 2, segment 6 is [60, 70) at level 3.
      { 3: 20, 6: 30, 8: 10 },
      10,
      100,
      [[60, "Most watched 1 / 2"], [30, "Most watched 2 / 2"]],
    ],
  ])("SPEC-CORE-151 %s", async (_name, segments, s, duration, expected) => {
    serve(segments, s);
    const { mc } = await page({ duration });
    expect(bandOnHover().length).toBeGreaterThan(0);

    const seen = expected.map(() => jump(mc));
    expect(seen).toEqual(expected);
  });

  it("SPEC-CORE-151 play or pause is unchanged by a press", async () => {
    serve(FIVE_SPOTS);
    const { mc, state } = await page({ paused: true });
    expect(jump(mc)[0]).toBe(50);
    expect(state.paused).toBe(true);

    state.paused = false;
    tick(2);
    expect(jump(mc)[0]).toBe(25);
    expect(state.paused).toBe(false);
    expect(mc.play).not.toHaveBeenCalled();
    expect(mc.pause).not.toHaveBeenCalled();
    expect(mc.togglePlay).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-151 a seek that throws shows no label, reports no skip and leaves the order where it was", async () => {
    serve(FIVE_SPOTS);
    const { mc } = await page();
    const realSeek = vi.mocked(mc.seek).getMockImplementation()!;
    const failing = () => {
      throw new Error("backend torn down");
    };

    vi.mocked(mc.seek).mockImplementationOnce(failing);
    pressJump();
    expect(mc.seek).toHaveBeenCalledTimes(1);
    expect(label()).toBeNull();
    expect(band()).toBeNull();

    vi.mocked(mc.seek).mockImplementation(realSeek);
    expect(jump(mc)).toEqual([50, "Most watched 1 / 5"]);

    wait(2100);
    expect(label()).toBeNull();
    vi.mocked(mc.seek).mockImplementationOnce(failing);
    pressJump();
    expect(label()).toBeNull();
    expect(band()).toBeNull();

    expect(jump(mc)).toEqual([25, "Most watched 2 / 5"]);
  });
});

describe("SPEC-CORE-151 the remembered spot (I2, I3)", () => {
  it("SPEC-CORE-151 a seek by other means does not move the order", async () => {
    serve(FIVE_SPOTS);
    const { mc } = await page();
    expect(jump(mc)[0]).toBe(50);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    });
    expect(lastSeek(mc)).toBe(60);
    act(() => {
      mc.seek(5);
    });

    expect(jump(mc)).toEqual([25, "Most watched 2 / 5"]);
  });

  it("SPEC-CORE-151 a spot list that changes keeps the remembered spot, and the next press follows it in the new order", async () => {
    // 50 (level 3, 5 s), then 10 and 80 (level 2, 10 s each).
    serve({ 10: 15, 2: 10, 3: 10, 16: 10, 17: 10 });
    const { mc, state } = await page();
    expect(jump(mc)).toEqual([50, "Most watched 1 / 3"]);

    // Playing 80..90 again makes 80 level 3 for 10 s: the order becomes 80, 50, 10.
    state.currentTime = 80;
    tick();
    play(state, 10);
    pagehide();
    await flush();

    expect(jump(mc)).toEqual([10, "Most watched 3 / 3"]);
  });

  it("SPEC-CORE-151 when no spot starts at the remembered second any more, the press goes to spot 1", async () => {
    // 50 (level 3), 10 (level 2), and segment 9 at level 1 just before 50.
    serve({ 10: 15, 2: 10, 3: 10, 9: 5 });
    const { mc, state } = await page();
    expect(jump(mc)).toEqual([50, "Most watched 1 / 2"]);

    // Playing 45..55 lifts segment 9 to level 2: the spot at 50 now starts at 45.
    state.currentTime = 45;
    tick();
    play(state, 10);
    pagehide();
    await flush();

    expect(jump(mc)).toEqual([45, "Most watched 1 / 2"]);
  });

  it("SPEC-CORE-151 a duration change recomputes the spots and keeps the remembered spot", async () => {
    serve(FIVE_SPOTS);
    const { mc, state } = await page();
    expect(jump(mc)[0]).toBe(50);
    expect(jump(mc)[0]).toBe(25);

    // At D = 60, segment 12 is gone: 50 (10 s, level 3), 25 (level 3), 10 (level 2).
    state.duration = 60;
    tick(2);

    expect(jump(mc)).toEqual([10, "Most watched 3 / 3"]);
    expect(jump(mc)).toEqual([50, "Most watched 1 / 3"]);
  });

  it("SPEC-CORE-151 a spot that vanishes with a duration change sends the next press to spot 1", async () => {
    // At D = 97 segment 19 is [95, 97); 7 s played is level 3 there and level 1 at D = 100.
    serve({ 19: 7, 0: 10, 10: 10 });
    const { mc, state } = await page({ duration: 97 });
    expect(jump(mc)).toEqual([95, "Most watched 1 / 3"]);

    state.duration = 100;
    tick(2);

    expect(jump(mc)).toEqual([0, "Most watched 1 / 2"]);
  });

  it("SPEC-CORE-151 a spell of unavailability keeps the remembered spot", async () => {
    serve(FIVE_SPOTS);
    const { mc, state } = await page();
    expect(jump(mc)[0]).toBe(50);
    expect(jump(mc)[0]).toBe(25);

    state.interrupted = true;
    tick(2);
    expect(jumpButton()).toBeNull();
    state.interrupted = false;
    tick(2);

    expect(jump(mc)).toEqual([10, "Most watched 3 / 5"]);
  });

  it("SPEC-CORE-151 a change of file starts the order again", async () => {
    serve(FIVE_SPOTS);
    const { mc, page: p } = await page();
    expect(jump(mc)[0]).toBe(50);
    expect(jump(mc)[0]).toBe(25);

    p.update({ fileId: "f2" });
    await settle();

    expect(jump(mc)).toEqual([50, "Most watched 1 / 5"]);
  });

  it("SPEC-CORE-151 a change of nickname starts the order again", async () => {
    serve(FIVE_SPOTS);
    const { mc, page: p } = await page();
    expect(jump(mc)[0]).toBe(50);
    expect(jump(mc)[0]).toBe(25);

    nickname = "rin";
    p.update({});
    await settle();

    expect(jump(mc)).toEqual([50, "Most watched 1 / 5"]);
  });

  it("SPEC-CORE-151 a remount of the controls starts the order again", async () => {
    serve(FIVE_SPOTS);
    const { mc, page: p } = await page();
    expect(jump(mc)[0]).toBe(50);
    expect(jump(mc)[0]).toBe(25);

    p.update({ controls: false });
    await settle();
    p.update({ controls: true });
    await settle();

    expect(jump(mc)).toEqual([50, "Most watched 1 / 5"]);
  });
});
