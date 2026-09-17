import { describe, it, expect } from "vitest";

import { cuesAt, parseVtt } from "../vtt";

const sample = `WEBVTT

NOTE a comment that is not a cue

1
00:00:01.000 --> 00:00:03.500 align:start
<b>Hello</b> &amp; welcome

00:04.250 --> 00:06.000
Two
lines

00:05.000 --> 00:07,000
Overlapping

00:08.000 --> 00:08.000
Empty span

00:09.000 --> 00:10.000
`;

describe("parseVtt", () => {
  it("reads timings in both spellings, and the text without markup", () => {
    expect(parseVtt(sample)).toEqual([
      { start: 1, end: 3.5, text: "Hello & welcome" },
      { start: 4.25, end: 6, text: "Two\nlines" },
      { start: 5, end: 7, text: "Overlapping" },
    ]);
  });

  it("reads Windows line endings and hours", () => {
    expect(parseVtt("WEBVTT\r\n\r\n01:02:03.000 --> 01:02:04.000\r\nLate\r\n")).toEqual([
      { start: 3723, end: 3724, text: "Late" },
    ]);
  });

  it("finds nothing in something that is not WebVTT", () => {
    expect(parseVtt("")).toEqual([]);
    expect(parseVtt("<html>404</html>")).toEqual([]);
  });
});

describe("cuesAt", () => {
  const cues = parseVtt(sample);

  it("shows a cue from its start up to, not including, its end", () => {
    expect(cuesAt(cues, 0.9)).toEqual([]);
    expect(cuesAt(cues, 1).map((cue) => cue.text)).toEqual(["Hello & welcome"]);
    expect(cuesAt(cues, 3.5)).toEqual([]);
  });

  it("shows every cue that overlaps, in order", () => {
    expect(cuesAt(cues, 5.5).map((cue) => cue.text)).toEqual(["Two\nlines", "Overlapping"]);
  });
});
