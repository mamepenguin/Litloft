// SPEC-CORE-140: what the seek bar band draws, and when it reads and adds.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import { installPointerEvent } from "@/test/pointerEvent";
import {
  band,
  bandOnHover,
  deferred,
  fetchMock,
  flush,
  hoverSeekRow,
  leaveSeekRow,
  pagehide,
  pieces,
  piecesInSeconds,
  play,
  rangeSends,
  renderPage,
  respond,
  restoreMatchMedia,
  routeFetch,
  segmentReads,
  segmentsResponse,
  settle,
  stubController,
  tick,
} from "./watchedBandHarness";

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

const mockUseProfile = vi.mocked(useProfile);
let nickname: string | null = "kaori";

beforeEach(() => {
  installPointerEvent();
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  routeFetch();
  vi.mocked(getWatchProgress).mockResolvedValue({ position: 0, duration: 0 });
  vi.mocked(saveWatchProgress).mockResolvedValue(undefined);
  localStorage.clear();
  nickname = "kaori";
  mockUseProfile.mockImplementation(() => ({
    nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreMatchMedia();
});

function L(start: number, end: number, level: number) {
  return { start, end, level };
}

describe("SPEC-CORE-140 band pieces (I2)", () => {
  it("SPEC-CORE-140 draws the worked example: one piece per run of one level", async () => {
    routeFetch({
      segments: async () => segmentsResponse({ segments: { 0: 5, 1: 5, 2: 2, 5: 12.5, 19: 4 } }),
    });
    const { mc } = stubController({ duration: 100 });
    renderPage({ mc, fileId: "f1" });
    await settle();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 15, 1), L(25, 30, 3), L(95, 100, 1)]);
  });

  it.each([
    ["half rounds up: 7.5 of 5 is level 2", { 0: 7.5 }, [L(0, 5, 2)]],
    ["below half of a segment is still level 1", { 0: 1 }, [L(0, 5, 1)]],
    ["more than three plays clamps to level 3", { 0: 50 }, [L(0, 5, 3)]],
    ["a level change splits the piece", { 0: 5, 1: 10 }, [L(0, 5, 1), L(5, 10, 2)]],
    ["a gap splits the piece", { 0: 5, 2: 5 }, [L(0, 5, 1), L(10, 15, 1)]],
  ])("SPEC-CORE-140 %s", async (_label, segments, expected) => {
    routeFetch({ segments: async () => segmentsResponse({ segments }) });
    const { mc } = stubController({ duration: 100 });
    renderPage({ mc, fileId: "f1" });
    await settle();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual(expected);
  });

  it("SPEC-CORE-140 the last segment's level is over its clipped length, and a segment at or past D is not drawn", async () => {
    // D = 97: segment 19 is [95, 97), 2 s long; 4 s played is level 2.
    routeFetch({
      segments: async () => segmentsResponse({ segments: { 0: 5, 19: 4, 20: 5, 30: 5 } }),
    });
    const { mc } = stubController({ duration: 97 });
    renderPage({ mc, fileId: "f1" });
    await settle();

    hoverSeekRow();
    expect(piecesInSeconds(97)).toEqual([L(0, 5, 1), L(95, 97, 2)]);
  });

  it("SPEC-CORE-140 uses the response's segment_seconds for both span and level", async () => {
    routeFetch({
      segments: async () =>
        segmentsResponse({ segment_seconds: 10, segments: { 1: 15, 3: 10 } }),
    });
    const { mc } = stubController({ duration: 100 });
    renderPage({ mc, fileId: "f1" });
    await settle();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(10, 20, 2), L(30, 40, 1)]);
  });

  it("SPEC-CORE-140 a non-positive duration draws no band, and a positive one does", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5 } }) });
    const { mc, state } = stubController({ duration: 0 });
    renderPage({ mc, fileId: "f1" });
    await settle();

    hoverSeekRow();
    expect(band()).toBeNull();
    leaveSeekRow();

    state.duration = 100;
    tick(2);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 5, 1)]);
  });

  it("SPEC-CORE-140 a disabled seek bar (ad break) draws no band, and it returns after", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5 } }) });
    const { mc, state } = stubController({ interrupted: true });
    renderPage({ mc, fileId: "f1" });
    await settle();

    hoverSeekRow();
    expect(band()).toBeNull();
    leaveSeekRow();

    state.interrupted = false;
    tick(2);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 5, 1)]);
  });
});

describe("SPEC-CORE-140 when the band is read (I4)", () => {
  it("SPEC-CORE-140 without a nickname nothing is read; a nickname set after mount triggers one read", async () => {
    nickname = null;
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5 } }) });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();

    expect(segmentReads()).toEqual([]);
    hoverSeekRow();
    expect(pieces()).toEqual([]);
    leaveSeekRow();

    nickname = "kaori";
    page.update({});
    await settle();

    expect(segmentReads()).toEqual(["f1"]);
    expect(bandOnHover()).toHaveLength(1);
  });

  it("SPEC-CORE-140 a controller nobody draws controls for is never read for, until controls subscribe", async () => {
    const { mc, state } = stubController();
    const page = renderPage({ mc, fileId: "f1", controls: false });
    await settle();
    play(state, 20);
    pagehide();
    await flush();

    expect(rangeSends()).toContain("f1");
    expect(segmentReads()).toEqual([]);

    page.update({ controls: true });
    await settle();
    expect(segmentReads()).toEqual(["f1"]);
  });

  it("SPEC-CORE-140 controls subscribing before the registration read once, when it arrives", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5 } }) });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1", host: false });
    await settle();
    expect(segmentReads()).toEqual([]);

    page.update({ host: true });
    await settle();
    expect(segmentReads()).toEqual(["f1"]);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 5, 1)]);
  });

  it("SPEC-CORE-140 resubscribing keeps the totals and reads nothing again", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5 } }) });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();
    expect(segmentReads()).toEqual(["f1"]);

    for (let i = 0; i < 3; i++) {
      page.update({ controls: false });
      await settle();
      page.update({ controls: true });
      await settle();
    }

    expect(segmentReads()).toEqual(["f1"]);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 5, 1)]);
  });

  it("SPEC-CORE-140 a send that lands while nothing is subscribed is still added", async () => {
    const { mc, state } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();

    page.update({ controls: false });
    play(state, 12);
    pagehide();
    await flush();
    expect(rangeSends()).toEqual(["f1"]);

    page.update({ controls: true });
    await settle();
    expect(segmentReads()).toEqual(["f1"]);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 15, 1)]);
  });

  it("SPEC-CORE-140 a change of file reads the new file and draws only its totals", async () => {
    routeFetch({
      segments: async (fileId) =>
        segmentsResponse({ segments: fileId === "f1" ? { 0: 5 } : { 10: 5 } }),
    });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();
    expect(bandOnHover()).toEqual([expect.objectContaining({ start: 0 })]);

    page.update({ fileId: "f2" });
    await settle();

    expect(segmentReads()).toEqual(["f1", "f2"]);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(50, 55, 1)]);
  });

  it("SPEC-CORE-140 a late answer for the previous file is never drawn", async () => {
    const late = deferred();
    routeFetch({
      segments: (fileId) =>
        fileId === "f1" ? late.promise : Promise.resolve(segmentsResponse({ segments: { 10: 5 } })),
    });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();

    page.update({ fileId: "f2" });
    await settle();
    await act(async () => {
      late.resolve(segmentsResponse({ segments: { 0: 5, 1: 5 } }));
    });
    await flush();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(50, 55, 1)]);
  });

  it("SPEC-CORE-140 a change of nickname clears the totals and reads again", async () => {
    routeFetch({
      segments: async (_fileId, n) => segmentsResponse({ segments: n === 0 ? { 0: 5 } : { 10: 5 } }),
    });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();
    expect(bandOnHover()).toHaveLength(1);

    nickname = "taro";
    page.update({});
    await settle();

    expect(segmentReads()).toEqual(["f1", "f1"]);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(50, 55, 1)]);
  });

  it("SPEC-CORE-140 a late answer for the previous nickname is never drawn", async () => {
    const late = deferred();
    routeFetch({
      segments: (_fileId, n) =>
        n === 0 ? late.promise : Promise.resolve(segmentsResponse({ segments: { 10: 5 } })),
    });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();

    nickname = "taro";
    page.update({});
    await settle();
    await act(async () => {
      late.resolve(segmentsResponse({ segments: { 0: 5 } }));
    });
    await flush();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(50, 55, 1)]);
  });

  it("SPEC-CORE-140 clearing the nickname clears the band", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5 } }) });
    const { mc } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();
    expect(bandOnHover()).toHaveLength(1);

    nickname = null;
    page.update({});
    await settle();

    hoverSeekRow();
    expect(pieces()).toEqual([]);
  });
});

describe("SPEC-CORE-140 failed reads", () => {
  it.each([
    ["a 500", () => Promise.resolve(respond(500))],
    ["a 404", () => Promise.resolve(respond(404))],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])(
    "SPEC-CORE-140 after %s there is no stored band, it is not retried, and later sends still show",
    async (_label, fail) => {
      routeFetch({ segments: fail });
      const { mc, state } = stubController();
      renderPage({ mc, fileId: "f1" });
      await settle();

      hoverSeekRow();
      expect(pieces()).toEqual([]);
      leaveSeekRow();

      play(state, 12);
      pagehide();
      await flush();
      tick(20);
      await flush();

      expect(segmentReads()).toEqual(["f1"]);
      hoverSeekRow();
      expect(piecesInSeconds(100)).toEqual([L(0, 15, 1)]);
    },
  );
});

describe("SPEC-CORE-140 sends added to the band (I3)", () => {
  it("SPEC-CORE-140 a 2xx send adds the ranges it carried, split by segment, without another GET", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 10: 5 } }) });
    const { mc, state } = stubController();
    renderPage({ mc, fileId: "f1" });
    await settle();
    expect(bandOnHover()).toHaveLength(1);

    play(state, 12);
    pagehide();
    await flush();

    expect(rangeSends()).toEqual(["f1"]);
    expect(segmentReads()).toEqual(["f1"]);
    hoverSeekRow();
    // [0, 12) adds 5, 5 and 2 to segments 0, 1 and 2: all level 1.
    expect(piecesInSeconds(100)).toEqual([L(0, 15, 1), L(50, 55, 1)]);
  });

  it("SPEC-CORE-140 an added range raises the level of a segment already played", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5, 1: 5 } }) });
    const { mc, state } = stubController();
    renderPage({ mc, fileId: "f1" });
    await settle();

    play(state, 12);
    pagehide();
    await flush();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 10, 2), L(10, 15, 1)]);
  });

  it("SPEC-CORE-140 a send answering while the GET is in flight is added after the answer, neither replacing the other", async () => {
    const read = deferred();
    routeFetch({ segments: () => read.promise });
    const { mc, state } = stubController();
    renderPage({ mc, fileId: "f1" });
    await settle();

    play(state, 12);
    pagehide();
    await flush();
    expect(rangeSends()).toEqual(["f1"]);

    await act(async () => {
      read.resolve(segmentsResponse({ segments: { 0: 5, 10: 5 } }));
    });
    await flush();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 5, 2), L(5, 15, 1), L(50, 55, 1)]);
  });

  it("SPEC-CORE-140 a batch retried after a failure is added once, when the retry answers 2xx", async () => {
    routeFetch({ ranges: async (_f, n) => respond(n === 0 ? 503 : 204) });
    const { mc, state } = stubController();
    renderPage({ mc, fileId: "f1" });
    await settle();

    play(state, 12);
    pagehide();
    await flush();
    hoverSeekRow();
    expect(pieces()).toEqual([]);
    leaveSeekRow();

    pagehide();
    await flush();

    expect(rangeSends()).toEqual(["f1", "f1"]);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 15, 1)]);
  });

  it.each([400, 404, 422])(
    "SPEC-CORE-140 a send discarded with %s adds nothing, and the next 2xx send adds only its own ranges",
    async (status) => {
      routeFetch({ ranges: async (_f, n) => respond(n === 0 ? status : 204) });
      const { mc, state } = stubController();
      renderPage({ mc, fileId: "f1" });
      await settle();

      play(state, 12);
      pagehide();
      await flush();
      hoverSeekRow();
      expect(pieces()).toEqual([]);
      leaveSeekRow();

      play(state, 13);
      pagehide();
      await flush();

      hoverSeekRow();
      // [12, 25): 3 s of segment 2, then segments 3 and 4.
      expect(piecesInSeconds(100)).toEqual([L(10, 25, 1)]);
    },
  );

  it("SPEC-CORE-140 a send for the previous file that answers 2xx after a file change adds nothing", async () => {
    const teardown = deferred();
    routeFetch({
      segments: async () => segmentsResponse({ segments: {} }),
      ranges: (fileId) => (fileId === "f1" ? teardown.promise : Promise.resolve(respond(204))),
    });
    const { mc, state } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();
    play(state, 12);

    page.update({ fileId: "f2" });
    await settle();
    expect(rangeSends()).toEqual(["f1"]);

    await act(async () => {
      teardown.resolve(respond(204));
    });
    await flush();

    hoverSeekRow();
    expect(pieces()).toEqual([]);
    leaveSeekRow();

    state.currentTime = 50;
    tick();
    play(state, 12);
    pagehide();
    await flush();
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(50, 65, 1)]);
  });

  it("SPEC-CORE-140 a send started under the previous nickname that answers later adds nothing", async () => {
    const inflight = deferred();
    routeFetch({
      segments: async (_f, n) => segmentsResponse({ segments: n === 0 ? {} : { 10: 5 } }),
      ranges: (_f, n) => (n === 0 ? inflight.promise : Promise.resolve(respond(204))),
    });
    const { mc, state } = stubController();
    const page = renderPage({ mc, fileId: "f1" });
    await settle();
    play(state, 12);
    pagehide();
    expect(rangeSends()).toEqual(["f1"]);

    nickname = "taro";
    page.update({});
    await settle();
    await act(async () => {
      inflight.resolve(respond(204));
    });
    await flush();

    expect(segmentReads()).toEqual(["f1", "f1"]);
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(50, 55, 1)]);
  });
});

describe("SPEC-CORE-140 the host player (I10)", () => {
  it("SPEC-CORE-140 a band read and band updates do not re-render the host", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 10: 5 } }) });
    const { mc, state } = stubController();
    let renders = 0;
    renderPage({ mc, fileId: "f1", onHostRender: () => (renders += 1) });
    tick();
    await flush();
    const settled = renders;

    await settle();
    play(state, 12);
    pagehide();
    await flush();

    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 15, 1), L(50, 55, 1)]);
    expect(renders).toBe(settled);
  });

  it("SPEC-CORE-140 a failed band read leaves progress saves and range sends working", async () => {
    routeFetch({ segments: () => Promise.reject(new TypeError("Failed to fetch")) });
    const { mc, state } = stubController();
    renderPage({ mc, fileId: "f1" });
    await settle();

    vi.mocked(saveWatchProgress).mockClear();
    play(state, 20);
    pagehide();
    await flush();

    expect(saveWatchProgress).toHaveBeenCalled();
    expect(rangeSends().length).toBeGreaterThan(0);
    expect(new Set(rangeSends())).toEqual(new Set(["f1"]));
    hoverSeekRow();
    expect(piecesInSeconds(100)).toEqual([L(0, 20, 1)]);
  });
});
