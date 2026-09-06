import { describe, it, expect } from "vitest";
import {
  collectMatchTimestamps,
  MAX_TIMESTAMP_PILLS,
} from "@/lib/matchTimestamps";
import type { MatchMeta, MatchTimestamp } from "@/types";

const seg = (start: number, end = start + 1) => ({
  time_range: [start, end] as [number, number],
  score: 0.5,
});

describe("collectMatchTimestamps", () => {
  it("caps at three, and says how many did not fit", () => {
    const meta: MatchMeta = {
      transcript: [seg(10), seg(20), seg(30), seg(40), seg(50)],
    };
    const { shown, overflow } = collectMatchTimestamps(meta);
    expect(shown.map((p) => p.seconds)).toEqual([10, 20, 30]);
    expect(overflow).toBe(2);
  });

  it("has nothing to overflow when everything fits", () => {
    const { shown, overflow } = collectMatchTimestamps({
      transcript: [seg(10), seg(20)],
    });
    expect(shown.map((p) => p.seconds)).toEqual([10, 20]);
    expect(overflow).toBe(0);
  });

  /**
   * The case this helper exists for: five segments naming two moments.
   * A transcript hit and a scene hit that land in the same second are two
   * rows in the backend's response and one moment to the reader.
   */
  it("shows a repeated moment once", () => {
    const meta: MatchMeta = {
      transcript: [seg(799), seg(889), seg(889)],
      clip: [seg(799), seg(889)],
    };
    const { shown, overflow } = collectMatchTimestamps(meta);
    expect(shown.map((p) => p.seconds)).toEqual([799, 889]);
    expect(overflow).toBe(0);
    // Which channel wins a tie decides the React key on both surfaces, so
    // it is part of the answer rather than an accident of iteration order.
    expect(shown.map((p) => p.kind)).toEqual(["transcript", "transcript"]);
  });

  /**
   * `formatDuration` floors, so 799.2 and 799.8 both render "13:19".
   * De-duplicating on the raw float would leave two pills reading the
   * same string.
   */
  it("treats sub-second neighbours as the same moment", () => {
    const { shown } = collectMatchTimestamps({
      transcript: [seg(799.2, 800), seg(799.8, 801)],
    });
    expect(shown.map((p) => p.seconds)).toEqual([799.2]);
  });

  it("counts distinct moments for the overflow, not raw segments", () => {
    const { shown, overflow } = collectMatchTimestamps({
      transcript: [seg(10), seg(10), seg(20), seg(20), seg(30), seg(30)],
    });
    expect(shown.map((p) => p.seconds)).toEqual([10, 20, 30]);
    expect(overflow).toBe(0);
  });

  it("orders by time, whichever channel found them", () => {
    const { shown } = collectMatchTimestamps({
      transcript: [seg(300)],
      clip: [seg(5), seg(100)],
    });
    expect(shown.map((p) => p.seconds)).toEqual([5, 100, 300]);
  });

  it("keeps the channel, so two moments a second apart get distinct keys", () => {
    const { shown } = collectMatchTimestamps({
      transcript: [seg(10)],
      clip: [seg(11)],
    });
    expect(shown.map((p) => `${p.kind}-${p.seconds}`)).toEqual([
      "transcript-10",
      "clip-11",
    ]);
  });

  /**
   * `buildMatchMeta` writes `[-1, -1]` when it wants the audio badge to
   * render but has no real timestamp behind it.
   */
  it("drops the placeholder range the badge-only path writes", () => {
    const { shown, overflow } = collectMatchTimestamps({
      transcript: [{ time_range: [-1, -1], score: 0.7 }],
    });
    expect(shown).toEqual([]);
    expect(overflow).toBe(0);
  });

  it("drops a segment that reached the badge without a time range", () => {
    // `time_range` is declared required, and the optional chain is here
    // because a badge-only segment has been seen without one. A fixture
    // is what makes that belief checkable.
    const { shown } = collectMatchTimestamps({
      transcript: [{ score: 0.5 } as unknown as MatchTimestamp],
    });
    expect(shown).toEqual([]);
  });

  it.each([
    ["a string that the types say cannot be there", "10"],
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("drops %s as a start", (_label, start) => {
    // `formatDuration(Infinity)` renders "Infinity:NaN:NaN", and a
    // `?t=` link built from a string is a link to nowhere. Both are
    // rejected here rather than at each call site.
    const { shown, overflow } = collectMatchTimestamps({
      transcript: [{ time_range: [start, 20], score: 0.5 } as unknown as MatchTimestamp],
    });
    expect(shown).toEqual([]);
    expect(overflow).toBe(0);
  });

  it("keeps a hit at the very start of the file", () => {
    // `start > 0` instead of `>= 0` passes every other case here and
    // silently drops the opening seconds of a video, where a transcript
    // segment routinely begins.
    const { shown } = collectMatchTimestamps({
      transcript: [seg(0), seg(30)],
    });
    expect(shown.map((p) => p.seconds)).toEqual([0, 30]);
  });

  it("keeps moments past the hour, which read differently", () => {
    // `formatDuration` switches to H:MM:SS at sixty minutes, so a pill
    // matcher written as /^\d+:\d{2}$/ stops seeing these — which is how
    // a cap or a de-duplication bug on a long recording would hide.
    const { shown, overflow } = collectMatchTimestamps({
      transcript: [seg(3600), seg(3661), seg(7322), seg(9000)],
    });
    expect(shown.map((p) => p.seconds)).toEqual([3600, 3661, 7322]);
    expect(overflow).toBe(1);
  });

  it("is empty for a file with no match metadata at all", () => {
    expect(collectMatchTimestamps(undefined)).toEqual({
      shown: [],
      overflow: 0,
    });
    expect(collectMatchTimestamps({})).toEqual({ shown: [], overflow: 0 });
  });

  it("caps at the number both surfaces are documented to show", () => {
    expect(MAX_TIMESTAMP_PILLS).toBe(3);
  });
});
