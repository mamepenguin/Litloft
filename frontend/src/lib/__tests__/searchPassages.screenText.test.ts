import { describe, expect, it } from "vitest";

import { passageHref, passageLocator } from "../searchPassages";
import type { SearchPassage } from "../searchMerge";

const screenText: SearchPassage = {
  kind: "screen_text",
  start: 12.9,
  end: 20.0,
  page: null,
  section: null,
  section_title: null,
  chunk_index: 3,
  text: "warehouse on screen",
  score: 0.8,
  keyword: false,
  highlight_terms: [],
  frame_url: "/api/addons/intelligence/files/f1/frame?t=12",
};

describe("SPEC-CORE-048 C2/I23 a screen_text passage", () => {
  it("locates by its start time only, not by an end time", () => {
    expect(passageLocator(screenText)).toEqual({
      kind: "timeStartOnly",
      start: 12.9,
    });
  });

  it("links to the video at the floored start second", () => {
    expect(passageHref("f1", screenText)).toBe("/files/f1?t=12");
  });
});
