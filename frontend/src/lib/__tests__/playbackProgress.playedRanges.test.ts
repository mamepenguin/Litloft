// SPEC-CORE-025: capture of played ranges inside usePlaybackProgress.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MediaController } from "../mediaController";
import { MEDIA_CLOCK_ACTIVE_MS, MEDIA_CLOCK_IDLE_MS } from "../mediaClock";
import { usePlaybackProgress } from "../playbackProgress";
import { getWatchProgress, saveWatchProgress } from "../api";
import { useProfile } from "@/components/ProfileProvider";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getWatchProgress: vi.fn(),
    saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../recentlyPlayed", () => ({
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: vi.fn(),
}));

const mockGetWatchProgress = vi.mocked(getWatchProgress);
const mockSaveWatchProgress = vi.mocked(saveWatchProgress);
const mockUseProfile = vi.mocked(useProfile);

interface Range {
  start: number;
  end: number;
}

interface StubState {
  currentTime: number;
  duration: number;
  paused: boolean;
  interrupted: boolean;
  rate: number;
  rateThrows: boolean;
  /** Every getter throws: the clock skips the tick. */
  throwing: boolean;
}

function stubController(overrides: Partial<StubState> = {}) {
  const state: StubState = {
    currentTime: 0,
    duration: 600,
    paused: false,
    interrupted: false,
    rate: 1,
    rateThrows: false,
    throwing: false,
    ...overrides,
  };
  const guard = <T,>(read: () => T): T => {
    if (state.throwing) throw new Error("player is swapping media");
    return read();
  };
  const mc: MediaController = {
    seek: vi.fn((seconds: number) => {
      state.currentTime = seconds;
    }),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: () => guard(() => state.currentTime),
    getDuration: () => guard(() => state.duration),
    isPaused: () => guard(() => state.paused),
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: vi.fn(),
    getPlaybackRate: () =>
      guard(() => {
        if (state.rateThrows) throw new Error("rate unavailable");
        return state.rate;
      }),
    setPlaybackRate: vi.fn(),
    getBufferedFraction: () => 0,
    isInterrupted: () => guard(() => state.interrupted),
  };
  return { mc, state };
}

const TICK_S = MEDIA_CLOCK_ACTIVE_MS / 1000;

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function tick(times = 1) {
  wait(MEDIA_CLOCK_ACTIVE_MS * times);
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {});
  }
}

/** Lets the resume read settle, then one tick at the current position. */
async function settle() {
  tick();
  await flush();
  tick();
}

/** Plays `media` seconds at the stub's rate, the position published every tick. */
function play(state: StubState, media: number) {
  const step = TICK_S * state.rate;
  const n = Math.round(media / step);
  for (let i = 0; i < n; i++) {
    state.currentTime += step;
    tick();
  }
}

/** Plays with the position published only every `publishMs` of wall time. */
function playPublishing(state: StubState, media: number, publishMs: number) {
  const step = TICK_S * state.rate;
  const n = Math.round(media / step);
  const every = publishMs / MEDIA_CLOCK_ACTIVE_MS;
  let truePos = state.currentTime;
  for (let i = 1; i <= n; i++) {
    truePos += step;
    if (i % every === 0) state.currentTime = truePos;
    tick();
  }
}

/** Pauses for `ms`, then resumes and lets the idle clock see the resume. */
function pauseFor(state: StubState, ms: number) {
  state.paused = true;
  wait(ms);
  state.paused = false;
  wait(MEDIA_CLOCK_IDLE_MS);
}

function withProfile() {
  mockUseProfile.mockReturnValue({
    nickname: "kaori",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

function withoutProfile() {
  mockUseProfile.mockReturnValue({
    nickname: null,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

function respond(status: number): Response {
  return new Response(null, { status });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

interface Sent {
  url: string;
  init: RequestInit | undefined;
  ranges: Range[];
}

function sends(): Sent[] {
  return fetchMock.mock.calls
    .filter(([input]) => urlOf(input).includes("/played-ranges"))
    .map(([input, init]) => ({
      url: urlOf(input),
      init,
      ranges: (JSON.parse(String(init?.body)) as { ranges: Range[] }).ranges.map(
        ({ start, end }) => ({ start, end }),
      ),
    }));
}

function sendsFor(fileId: string): Sent[] {
  return sends().filter((s) => s.url.endsWith(`/api/files/${fileId}/played-ranges`));
}

/**
 * Every range sent, with the pieces a send-moment cut split apart joined
 * back where one ends exactly where another starts.
 */
function joined(list: Sent[] = sends()): Range[] {
  const out: Range[] = [];
  for (const r of list.flatMap((s) => s.ranges)) {
    const prev = out.find((o) => o.end === r.start);
    if (prev) prev.end = r.end;
    else out.push({ ...r });
  }
  return out.sort((a, b) => a.start - b.start);
}

function totalSent(list: Sent[] = sends()): number {
  return list.flatMap((s) => s.ranges).reduce((sum, r) => sum + (r.end - r.start), 0);
}

function pagehide() {
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
}

function setVisibility(value: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => respond(204));
  vi.stubGlobal("fetch", fetchMock);
  mockGetWatchProgress.mockResolvedValue({ position: 0, duration: 0 });
  mockSaveWatchProgress.mockResolvedValue(undefined);
  localStorage.clear();
  withProfile();
});

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).visibilityState;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mount(mc: MediaController, fileId = "f1", initialTime?: number) {
  return renderHook(
    (props: { mc: MediaController; fileId: string }) =>
      usePlaybackProgress({ mc: props.mc, fileId: props.fileId, initialTime }),
    { initialProps: { mc, fileId } },
  );
}

describe("SPEC-CORE-025 played-range capture", () => {
  describe("normal flow", () => {
    it("SPEC-CORE-025 sends a played stretch on teardown with keepalive, as a POST to the file", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      h.unmount();

      const all = sends();
      expect(all).toHaveLength(1);
      expect(all[0].url).toMatch(/\/api\/files\/f1\/played-ranges$/);
      expect(all[0].init?.method).toBe("POST");
      expect(all[0].init?.keepalive).toBe(true);
      expect(all[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it.each([0, 300])(
      "SPEC-CORE-025 a stretch closed below 10 s sends nothing, one of exactly 10 s is sent (start %s)",
      async (from) => {
        const { mc, state } = stubController({ currentTime: from });
        const h = mount(mc);
        await settle();
        play(state, 9.75);
        // A jump closes the held stretch.
        state.currentTime = from + 100;
        tick();
        play(state, 10);
        h.unmount();

        expect(joined()).toEqual([{ start: from + 100, end: from + 110 }]);
      },
    );

    it("SPEC-CORE-025 a pause continues the same stretch and adds nothing for the paused time", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 6);
      pauseFor(state, 5000);
      play(state, 6);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 12 }]);
      expect(totalSent()).toBe(12);
    });

    it("SPEC-CORE-025 a stall continues the same stretch and adds nothing for the stalled time", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 6);
      tick(16);
      play(state, 6);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 12 }]);
      expect(totalSent()).toBe(12);
    });

    it("SPEC-CORE-025 time on another clock while interrupted adds nothing, and playback continues the stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 6);

      state.interrupted = true;
      state.currentTime = 0;
      play(state, 5);
      state.interrupted = false;
      state.currentTime = 6;
      tick();

      play(state, 6);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 12 }]);
      expect(totalSent()).toBe(12);
    });

    it("SPEC-CORE-025 ticks while the stored position is being read are not counted", async () => {
      let resolveRead!: (p: { position: number; duration: number }) => void;
      mockGetWatchProgress.mockReturnValue(
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      );
      const { mc, state } = stubController();
      const h = mount(mc);
      tick();
      play(state, 12);

      await act(async () => {
        resolveRead({ position: 0, duration: 0 });
      });
      await flush();
      tick();
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([{ start: 12, end: 24 }]);
    });

    it("SPEC-CORE-025 the player's own resume seek adds nothing for the skipped span", async () => {
      mockGetWatchProgress.mockResolvedValue({ position: 120, duration: 600 });
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      expect(mc.seek).toHaveBeenCalledWith(120);
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([{ start: 120, end: 132 }]);
    });

    it("SPEC-CORE-025 a ?t= start adds nothing for the skipped span", async () => {
      const { mc, state } = stubController();
      const h = mount(mc, "f1", 42);
      await settle();
      expect(mc.seek).toHaveBeenCalledWith(42);
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([{ start: 42, end: 54 }]);
    });

    it.each([0, NaN, Infinity])(
      "SPEC-CORE-025 nothing is captured while the duration is %s",
      async (duration) => {
        const { mc, state } = stubController({ duration });
        const h = mount(mc);
        await settle();
        play(state, 12);

        state.duration = 600;
        await settle();
        play(state, 12);
        h.unmount();

        expect(joined()).toEqual([{ start: 12, end: 24 }]);
      },
    );

    it("SPEC-CORE-025 a tick whose getPlaybackRate throws is not eligible, and saving carries on", async () => {
      const { mc, state } = stubController({ rateThrows: true });
      const h = mount(mc);
      await settle();
      play(state, 12);
      expect(mockSaveWatchProgress).toHaveBeenCalled();

      state.rateThrows = false;
      tick();
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([{ start: 12, end: 24 }]);
    });
  });

  describe("playback rate and publish interval", () => {
    it.each([
      { rate: 1, publishMs: 250, media: 12 },
      { rate: 2, publishMs: 250, media: 24 },
      { rate: 0.5, publishMs: 250, media: 12 },
      { rate: 1, publishMs: 3000, media: 12 },
      { rate: 2, publishMs: 2000, media: 24 },
      { rate: 1.5, publishMs: 1000, media: 12 },
    ])(
      "SPEC-CORE-025 one pass at rate $rate published every $publishMs ms sends exactly [0, $media]",
      async ({ rate, publishMs, media }) => {
        const { mc, state } = stubController({ rate });
        const h = mount(mc);
        await settle();
        playPublishing(state, media, publishMs);
        h.unmount();

        expect(joined()).toEqual([{ start: 0, end: media }]);
        expect(totalSent()).toBe(media);
      },
    );

    it("SPEC-CORE-025 a tick that arrives after skipped clock ticks is played within the allowance", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 6);

      state.throwing = true;
      play(state, 3);
      state.throwing = false;

      play(state, 6);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 15 }]);
      expect(totalSent()).toBe(15);
    });
  });

  describe("jumps", () => {
    it("SPEC-CORE-025 a forward step equal to the allowance is played", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 10);
      state.currentTime += TICK_S + 1;
      tick();
      play(state, 2);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 13.25 }]);
    });

    it("SPEC-CORE-025 a forward step beyond the allowance closes the stretch and counts nothing skipped", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 10);
      state.currentTime += TICK_S + 1.25;
      tick();
      play(state, 2);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 10 }]);
    });

    it("SPEC-CORE-025 a long forward seek starts a new stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      state.currentTime = 100;
      tick();
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([
        { start: 0, end: 12 },
        { start: 100, end: 112 },
      ]);
      expect(totalSent()).toBe(24);
    });

    it("SPEC-CORE-025 a backward seek of more than 1 s starts a new stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      state.currentTime = 3;
      tick();
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([
        { start: 0, end: 12 },
        { start: 3, end: 15 },
      ]);
      expect(totalSent()).toBe(24);
    });

    it("SPEC-CORE-025 a backward wobble of exactly 1 s neither counts nor closes the stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 6);
      state.currentTime = 5;
      tick();
      play(state, 7);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 12 }]);
      expect(totalSent()).toBe(12);
    });

    it("SPEC-CORE-025 a backward step of 1.25 s closes the stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 10);
      state.currentTime = 8.75;
      tick();
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([
        { start: 0, end: 10 },
        { start: 8.75, end: 20.75 },
      ]);
    });

    it("SPEC-CORE-025 after a pause, resuming more than 1 s from the end starts a new stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 10);
      state.paused = true;
      wait(2000);
      state.currentTime = 50;
      wait(2000);
      state.paused = false;
      wait(MEDIA_CLOCK_IDLE_MS);
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([
        { start: 0, end: 10 },
        { start: 50, end: 62 },
      ]);
    });

    it("SPEC-CORE-025 after a pause, resuming exactly 1 s past the end continues the stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 10);
      state.paused = true;
      wait(2000);
      state.currentTime = 11;
      wait(2000);
      state.paused = false;
      wait(MEDIA_CLOCK_IDLE_MS);
      play(state, 2);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 13 }]);
    });

    it("SPEC-CORE-025 after a pause, resuming 1.25 s past the end starts a new stretch", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 10);
      state.paused = true;
      wait(2000);
      state.currentTime = 11.25;
      wait(2000);
      state.paused = false;
      wait(MEDIA_CLOCK_IDLE_MS);
      play(state, 2);
      h.unmount();

      expect(joined()).toEqual([{ start: 0, end: 10 }]);
    });
  });

  describe("profile", () => {
    it("SPEC-CORE-025 nothing is captured or stored without a profile, and capture starts once one is set", async () => {
      withoutProfile();
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      pagehide();
      expect(sends()).toHaveLength(0);
      expect(localStorage.length).toBe(0);

      withProfile();
      h.rerender({ mc, fileId: "f1" });
      tick();
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([{ start: 12, end: 24 }]);
      expect(localStorage.length).toBe(0);
    });

    it("SPEC-CORE-025 clearing the profile discards the open counted stretch at the first tick", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);

      withoutProfile();
      h.rerender({ mc, fileId: "f1" });
      tick();
      withProfile();
      h.rerender({ mc, fileId: "f1" });
      tick();
      play(state, 3);
      state.currentTime = 100;
      tick();
      play(state, 10);
      h.unmount();

      expect(joined()).toEqual([{ start: 100, end: 110 }]);
    });

    it("SPEC-CORE-025 a send moment without a profile discards pending ranges", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      state.currentTime = 100;
      tick();

      withoutProfile();
      h.rerender({ mc, fileId: "f1" });
      pagehide();
      expect(sends()).toHaveLength(0);

      withProfile();
      h.rerender({ mc, fileId: "f1" });
      play(state, 12);
      h.unmount();

      expect(joined()).toEqual([{ start: 100, end: 112 }]);
    });
  });

  describe("send moments", () => {
    it("SPEC-CORE-025 a periodic send fires at 15 s and cuts the stretch with no gap or overlap", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 14.25);
      expect(sends()).toHaveLength(0);

      state.currentTime += TICK_S;
      tick();
      const first = sends();
      expect(first).toHaveLength(1);
      expect(first[0].ranges).toHaveLength(1);
      const cut = first[0].ranges[0];
      expect(cut.start).toBe(0);
      expect([14.25, 14.5]).toContain(cut.end);

      play(state, 20 - state.currentTime);
      h.unmount();

      const all = sends();
      expect(all).toHaveLength(2);
      expect(all[1].ranges).toEqual([{ start: cut.end, end: 20 }]);
    });

    it("SPEC-CORE-025 the periodic timer runs while paused and a moment with nothing sendable sends nothing", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      state.paused = true;
      wait(3000);

      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);

      wait(45_000);
      h.unmount();
      expect(sends()).toHaveLength(1);
    });

    it("SPEC-CORE-025 notifyEnded is a send moment", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      act(() => h.result.current.notifyEnded());

      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it("SPEC-CORE-025 visibilitychange to hidden is a send moment, to visible is not", async () => {
      const { mc, state } = stubController();
      mount(mc);
      await settle();
      play(state, 12);

      setVisibility("visible");
      expect(sends()).toHaveLength(0);

      setVisibility("hidden");
      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it("SPEC-CORE-025 pagehide is a send moment", async () => {
      const { mc, state } = stubController();
      mount(mc);
      await settle();
      play(state, 12);
      pagehide();

      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it("SPEC-CORE-025 a change of file tears down: ranges go to the file they were captured for", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);

      state.currentTime = 200;
      h.rerender({ mc, fileId: "f2" });
      expect(sendsFor("f1")).toHaveLength(1);
      expect(sendsFor("f1")[0].ranges).toEqual([{ start: 0, end: 12 }]);

      await settle();
      play(state, 12);
      h.unmount();

      expect(sendsFor("f1")).toHaveLength(1);
      expect(joined(sendsFor("f2"))).toEqual([{ start: 200, end: 212 }]);
    });

    it("SPEC-CORE-025 a change of controller tears down and sends", async () => {
      const first = stubController();
      const h = mount(first.mc);
      await settle();
      play(first.state, 12);

      const second = stubController();
      h.rerender({ mc: second.mc, fileId: "f1" });

      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it("SPEC-CORE-025 sending reads nothing from the controller: it works while the controller throws", async () => {
      const { mc, state } = stubController();
      mount(mc);
      await settle();
      play(state, 12);
      state.throwing = true;
      pagehide();

      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it("SPEC-CORE-025 sending does not depend on the player being interrupted", async () => {
      const { mc, state } = stubController();
      mount(mc);
      await settle();
      play(state, 12);
      state.interrupted = true;
      pagehide();

      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it("SPEC-CORE-025 an open stretch below 10 s is held back at a send moment, then sent whole", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 6);
      pagehide();
      expect(sends()).toHaveLength(0);

      play(state, 6);
      h.unmount();

      expect(sends()).toHaveLength(1);
      expect(sends()[0].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it("SPEC-CORE-025 a counted stretch stays counted after a cut, and no zero-length range is sent", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      pagehide();
      pagehide();
      expect(sends()).toHaveLength(1);

      play(state, 2);
      pagehide();
      expect(sends()).toHaveLength(2);
      expect(sends()[1].ranges).toEqual([{ start: 12, end: 14 }]);

      // Closing a stretch with nothing played since its cut sends nothing.
      state.currentTime = 100;
      tick();
      play(state, 3);
      h.unmount();

      expect(sends()).toHaveLength(2);
      for (const r of sends().flatMap((s) => s.ranges)) {
        expect(r.end).toBeGreaterThan(r.start);
      }
    });

    it("SPEC-CORE-025 nothing is sent after teardown, however long time runs", async () => {
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      h.unmount();
      expect(sends()).toHaveLength(1);

      wait(60_000);
      pagehide();
      expect(sends()).toHaveLength(1);
    });
  });

  describe("send failures", () => {
    it.each([
      ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
      ["a 503", () => Promise.resolve(respond(503))],
      ["a 500", () => Promise.resolve(respond(500))],
    ])(
      "SPEC-CORE-025 after %s the ranges go with the next send, once",
      async (_label, fail) => {
        fetchMock.mockImplementationOnce(fail);
        const { mc, state } = stubController();
        mount(mc);
        await settle();
        play(state, 12);
        pagehide();
        await flush();

        pagehide();
        await flush();
        pagehide();

        const all = sends();
        expect(all).toHaveLength(2);
        expect(all[0].ranges).toEqual([{ start: 0, end: 12 }]);
        expect(all[1].ranges).toEqual([{ start: 0, end: 12 }]);
      },
    );

    it.each([400, 404, 422])(
      "SPEC-CORE-025 a %s discards the ranges and they are not retried",
      async (status) => {
        fetchMock.mockImplementationOnce(async () => respond(status));
        const { mc, state } = stubController();
        const h = mount(mc);
        await settle();
        play(state, 12);
        pagehide();
        await flush();

        play(state, 12);
        h.unmount();

        const all = sends();
        expect(all.length).toBeGreaterThanOrEqual(2);
        expect(all[0].ranges).toEqual([{ start: 0, end: 12 }]);
        expect(joined(all.slice(1))).toEqual([{ start: 12, end: 24 }]);
        expect(totalSent(all.slice(1))).toBe(12);
      },
    );

    it("SPEC-CORE-025 a range in flight is in no other request until it fails back to pending", async () => {
      let failFirst!: (r: Response) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            failFirst = resolve;
          }),
      );
      const { mc, state } = stubController();
      mount(mc);
      await settle();
      play(state, 12);
      pagehide();
      expect(sends()).toHaveLength(1);

      pagehide();
      expect(sends()).toHaveLength(1);

      play(state, 2);
      pagehide();
      expect(sends()).toHaveLength(2);
      expect(sends()[1].ranges).toEqual([{ start: 12, end: 14 }]);

      await act(async () => {
        failFirst(respond(503));
      });
      await flush();
      pagehide();

      expect(sends()).toHaveLength(3);
      expect(sends()[2].ranges).toEqual([{ start: 0, end: 12 }]);
    });

    it.each([
      ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
      ["a 503", () => Promise.resolve(respond(503))],
    ])(
      "SPEC-CORE-025 %s on the teardown send discards the ranges",
      async (_label, fail) => {
        fetchMock.mockImplementationOnce(fail);
        const { mc, state } = stubController();
        const h = mount(mc);
        await settle();
        play(state, 12);

        state.currentTime = 200;
        h.rerender({ mc, fileId: "f2" });
        await flush();

        await settle();
        play(state, 12);
        h.unmount();

        expect(sendsFor("f1")).toHaveLength(1);
        expect(joined(sendsFor("f2"))).toEqual([{ start: 200, end: 212 }]);
      },
    );

    it("SPEC-CORE-025 a failure that lands after teardown discards the ranges", async () => {
      let failFirst!: (e: Error) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((_resolve, reject) => {
            failFirst = reject;
          }),
      );
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      pagehide();
      expect(sendsFor("f1")).toHaveLength(1);

      state.currentTime = 200;
      h.rerender({ mc, fileId: "f2" });
      await act(async () => {
        failFirst(new TypeError("Failed to fetch"));
      });
      await flush();

      await settle();
      play(state, 12);
      pagehide();
      h.unmount();

      expect(sendsFor("f1")).toHaveLength(1);
      expect(joined(sendsFor("f2"))).toEqual([{ start: 200, end: 212 }]);
    });

    it("SPEC-CORE-025 more than 256 pending ranges: the oldest are dropped and a request holds at most 256", async () => {
      fetchMock.mockImplementation(async () => respond(503));
      const { mc, state } = stubController({ rate: 4, duration: 100_000 });
      const h = mount(mc);
      await settle();

      const STRETCHES = 300;
      for (let k = 0; k < STRETCHES; k++) {
        if (k > 0) {
          state.currentTime = k * 100;
          tick();
        }
        play(state, 10);
        await flush();
      }

      fetchMock.mockImplementation(async () => respond(204));
      pagehide();
      h.unmount();

      expect(sends().length).toBeGreaterThan(0);
      for (const s of sends()) {
        expect(s.ranges.length).toBeLessThanOrEqual(256);
      }
      const last = sends()[sends().length - 1];
      expect(last.ranges).toHaveLength(256);
      const lastEnd = (STRETCHES - 1) * 100 + 10;
      expect(last.ranges.some((r) => r.end === lastEnd)).toBe(true);
      // Only the newest survive: each stretch yields at least one range, so
      // the 44 oldest stretches cannot be among the newest 256.
      const oldestKept = Math.min(...last.ranges.map((r) => r.start));
      expect(oldestKept).toBeGreaterThanOrEqual((STRETCHES - 256) * 100);
    });
  });

  describe("effect on the rest of the hook", () => {
    it("SPEC-CORE-025 a throw from fetch inside a send does not stop saves or playback", async () => {
      fetchMock.mockImplementation(() => {
        throw new TypeError("fetch exploded");
      });
      const { mc, state } = stubController();
      const h = mount(mc);
      await settle();
      play(state, 12);
      expect(() => pagehide()).not.toThrow();
      expect(sends()).toHaveLength(1);

      mockSaveWatchProgress.mockClear();
      play(state, 20);
      expect(mockSaveWatchProgress).toHaveBeenCalled();
      expect(() => h.unmount()).not.toThrow();
    });

    it("SPEC-CORE-025 capture and sending cause no re-render of the host", async () => {
      const { mc, state } = stubController();
      let renders = 0;
      renderHook(() => {
        renders += 1;
        return usePlaybackProgress({ mc, fileId: "f1" });
      });
      await settle();
      const settled = renders;

      play(state, 20);
      pagehide();
      await flush();
      play(state, 12);

      expect(sends().length).toBeGreaterThanOrEqual(2);
      expect(renders).toBe(settled);
    });
  });
});
