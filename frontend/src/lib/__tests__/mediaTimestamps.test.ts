import { describe, it, expect } from "vitest";

import { parseMediaTimestamps } from "../mediaTimestamps";

/**
 * Convenience readers. The parser returns a mixed run/match list, and
 * asserting on the whole shape every time buries what each test is
 * about.
 */
function marks(text: string, duration: number | null = null) {
  return parseMediaTimestamps(text, duration).filter(
    (segment) => segment.kind === "timestamp",
  );
}

function seconds(text: string, duration: number | null = null) {
  return marks(text, duration).map((m) => m.seconds);
}

/** The text as a reader would see it, runs and matches concatenated. */
function rendered(text: string, duration: number | null = null) {
  return parseMediaTimestamps(text, duration)
    .map((segment) => segment.text)
    .join("");
}

describe("parseMediaTimestamps", () => {
  describe("accepted formats", () => {
    it.each([
      ["0:00", 0],
      ["1:23", 83],
      ["12:05", 725],
      ["99:59", 5999],
      ["1:02:03", 3723],
      ["10:02:03", 36123],
    ])("parses %s", (text, expected) => {
      expect(seconds(text)).toEqual([expected]);
    });

    it("keeps the matched text exactly as written", () => {
      expect(marks("see 01:07")[0].text).toBe("01:07");
    });
  });

  describe("rejected shapes", () => {
    it("rejects single-digit minutes when hours are present", () => {
      // `1:2:03` is not a form `formatDuration` can emit, so reading it
      // would mean accepting something the app never writes.
      expect(seconds("1:2:03")).toEqual([]);
    });

    it.each(["1:60", "0:99", "1:02:60"])(
      "rejects %s for out-of-range seconds",
      (text) => {
        expect(seconds(text)).toEqual([]);
      },
    );

    it("rejects out-of-range minutes when hours are present", () => {
      expect(seconds("1:60:00")).toEqual([]);
    });

    it.each(["16:9", "3:2", "1:1"])("rejects %s (one-digit seconds)", (text) => {
      expect(seconds(text)).toEqual([]);
    });

    it("finds nothing in a dotted-quad-with-port shape", () => {
      expect(seconds("192:168:0:1")).toEqual([]);
    });

    it("rejects a match butted against a digit", () => {
      // Both directions, and both must reject the shorter candidate the
      // rescan finds inside the number as well: `191:23` must not fall
      // back to `91:23`, nor `1:234` to `1:23`.
      expect(seconds("191:23")).toEqual([]);
      expect(seconds("1:234")).toEqual([]);
    });

    it("does not treat a letter as a digit", () => {
      // Only digits and colons continue a number. A word running into a
      // timestamp leaves a readable timestamp.
      expect(seconds("第2部1:23")).toEqual([83]);
    });
  });

  describe("greedy alternation", () => {
    it("reads 1:02:03 as one match, not 1:02 plus junk", () => {
      const found = marks("1:02:03");
      expect(found).toHaveLength(1);
      expect(found[0].text).toBe("1:02:03");
      expect(found[0].seconds).toBe(3723);
    });
  });

  describe("duration bound", () => {
    it("rejects a timestamp past the file's length", () => {
      // The wall-clock false positive this bound exists to kill.
      expect(seconds("配信は 21:00 開始", 600)).toEqual([]);
    });

    it("accepts a timestamp equal to the length", () => {
      expect(seconds("10:00", 600)).toEqual([600]);
    });

    it("does not apply the bound when the duration is unknown", () => {
      // Not knowing the range is not grounds for claiming something is
      // outside it.
      expect(seconds("21:00", null)).toEqual([1260]);
    });

    it.each([0, -1, NaN, Infinity])(
      "does not apply the bound for a non-positive or non-finite duration (%s)",
      (duration) => {
        expect(seconds("21:00", duration)).toEqual([1260]);
      },
    );
  });

  describe("surrounding text", () => {
    it("returns one plain run when there is no timestamp", () => {
      const segments = parseMediaTimestamps("no times here", null);
      expect(segments).toEqual([{ kind: "text", text: "no times here" }]);
    });

    it("returns nothing for empty text", () => {
      expect(parseMediaTimestamps("", null)).toEqual([]);
    });

    it("preserves the text verbatim, newlines included", () => {
      const source = "0:00 冒頭\n1:23 本題\n\n詳しくは 12:05 から。";
      expect(rendered(source)).toBe(source);
      expect(seconds(source)).toEqual([0, 83, 725]);
    });

    it("splits runs around a match", () => {
      expect(parseMediaTimestamps("see 1:23 now", null)).toEqual([
        { kind: "text", text: "see " },
        { kind: "timestamp", text: "1:23", seconds: 83 },
        { kind: "text", text: " now" },
      ]);
    });

    it("emits no empty runs when a match starts or ends the text", () => {
      expect(parseMediaTimestamps("1:23", null)).toEqual([
        { kind: "timestamp", text: "1:23", seconds: 83 },
      ]);
    });

    it("keeps rejected candidates as ordinary text", () => {
      expect(rendered("ratio 16:9 wins")).toBe("ratio 16:9 wins");
      expect(parseMediaTimestamps("ratio 16:9 wins", null)).toHaveLength(1);
    });
  });
});
