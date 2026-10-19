import { describe, it, expect, beforeEach } from "vitest";
import {
  FONT_PERCENT_MAX,
  FONT_PERCENT_MIN,
  FONT_PERCENT_STEP,
  LINE_HEIGHTS,
  MARGINS,
  FONT_FAMILIES,
  TYPOGRAPHY_DEFAULTS,
  isDefaultTypography,
  TYPOGRAPHY_KEY,
  parseTypography,
  readStoredTypography,
  writeStoredTypography,
} from "../epubTypography";
import * as reader from "../../../public/epub-reader/core.js";

const DEFAULTS = { fontPercent: 100, lineHeight: "original", margin: "normal", fontFamily: "original" };

describe("the typography step table", () => {
  it("is the same in the page and in the reader", () => {
    expect({
      fontPercent: [FONT_PERCENT_MIN, FONT_PERCENT_MAX, FONT_PERCENT_STEP],
      lineHeight: [...LINE_HEIGHTS],
      margin: [...MARGINS],
      fontFamily: [...FONT_FAMILIES],
      defaults: TYPOGRAPHY_DEFAULTS,
    }).toEqual({
      fontPercent: [reader.FONT_PERCENT_MIN, reader.FONT_PERCENT_MAX, reader.FONT_PERCENT_STEP],
      lineHeight: [...reader.LINE_HEIGHTS],
      margin: [...reader.MARGINS],
      fontFamily: [...reader.FONT_FAMILIES],
      defaults: reader.TYPOGRAPHY_DEFAULTS,
    });
  });

  it("leaves the book alone by default", () => {
    expect(TYPOGRAPHY_DEFAULTS).toEqual(DEFAULTS);
    expect([FONT_PERCENT_MIN, FONT_PERCENT_MAX, FONT_PERCENT_STEP]).toEqual([80, 200, 5]);
  });
});

const VALUES: [string, unknown, unknown][] = [
  ["nothing", undefined, DEFAULTS],
  ["null", null, DEFAULTS],
  ["a string", "big", DEFAULTS],
  ["a full valid setting", { fontPercent: 115, lineHeight: "1.9", margin: "wide", fontFamily: "serif" }, { fontPercent: 115, lineHeight: "1.9", margin: "wide", fontFamily: "serif" }],
  ["one bad field among good ones", { fontPercent: 205, lineHeight: "1.6", margin: "narrow", fontFamily: "sans" }, { ...DEFAULTS, lineHeight: "1.6", margin: "narrow", fontFamily: "sans" }],
  ["the largest size", { fontPercent: 200 }, { ...DEFAULTS, fontPercent: 200 }],
  ["one step past the largest size", { fontPercent: 205 }, DEFAULTS],
  ["the smallest size", { fontPercent: 80 }, { ...DEFAULTS, fontPercent: 80 }],
  ["one step below the smallest size", { fontPercent: 75 }, DEFAULTS],
  ["a size off the 5% grid", { fontPercent: 82 }, DEFAULTS],
  ["a fractional size", { fontPercent: 102.5 }, DEFAULTS],
  ["a size as a string", { fontPercent: "115" }, DEFAULTS],
  ["a null size", { fontPercent: null }, DEFAULTS],
  ["an unknown enum", { lineHeight: "3", margin: "huge", fontFamily: "comic" }, DEFAULTS],
  ["extra fields", { fontPercent: 130, evil: "<b>" }, { ...DEFAULTS, fontPercent: 130 }],
];

describe("reading a typography value", () => {
  it.each(VALUES)("in the reader: %s", (_name, value, expected) => {
    expect(reader.readTypography(value)).toEqual(expected);
  });

  it.each(VALUES)("in the page: %s", (_name, value, expected) => {
    expect(parseTypography(value)).toEqual(expected);
  });

  it("in the reader, a legacy size index is not a size", () => {
    expect(reader.readTypography({ fontSize: 4 })).toEqual(DEFAULTS);
  });
});

describe("reading a legacy size index in the page", () => {
  it.each([
    [0, 80],
    [1, 90],
    [2, 100],
    [3, 115],
    [4, 130],
    [5, 160],
    [6, 200],
  ])("index %i is %i%%", (fontSize, fontPercent) => {
    expect(parseTypography({ fontSize, margin: "wide" })).toEqual({ ...DEFAULTS, fontPercent, margin: "wide" });
  });

  it.each([7, -1, 1.5, "4", null])("index %o is the default size", (fontSize) => {
    expect(parseTypography({ fontSize })).toEqual(DEFAULTS);
  });

  it.each([
    ["a valid percent", { fontPercent: 150, fontSize: 4 }, 150],
    ["an invalid percent", { fontPercent: 7, fontSize: 4 }, 100],
    ["a null percent", { fontPercent: null, fontSize: 4 }, 100],
  ])("%s beside it wins", (_name, value, fontPercent) => {
    expect(parseTypography(value)).toEqual({ ...DEFAULTS, fontPercent });
  });
});

describe("the stored typography", () => {
  beforeEach(() => localStorage.clear());

  it("is the defaults when nothing is stored", () => {
    expect(readStoredTypography()).toEqual(DEFAULTS);
  });

  it("comes back as it was written", () => {
    const t = { fontPercent: 130, lineHeight: "1.6", margin: "wide", fontFamily: "sans" } as const;
    writeStoredTypography(t);
    expect(readStoredTypography()).toEqual(t);
  });

  it.each(VALUES)("stored as %s reads field by field", (_name, value, expected) => {
    if (value !== undefined) localStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify(value));
    expect(readStoredTypography()).toEqual(expected);
  });

  it("drops a legacy index once written back", () => {
    localStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify({ fontSize: 4 }));
    writeStoredTypography(readStoredTypography());
    expect(JSON.parse(localStorage.getItem(TYPOGRAPHY_KEY)!)).toEqual({ ...DEFAULTS, fontPercent: 130 });
  });

  it("is the defaults when the stored text is not JSON", () => {
    localStorage.setItem(TYPOGRAPHY_KEY, "{not json");
    expect(readStoredTypography()).toEqual(DEFAULTS);
  });
});

describe("whether a typography is the defaults", () => {
  it.each([
    [{ ...TYPOGRAPHY_DEFAULTS }, true],
    [JSON.parse(JSON.stringify(TYPOGRAPHY_DEFAULTS)), true],
    [{ ...TYPOGRAPHY_DEFAULTS, fontPercent: TYPOGRAPHY_DEFAULTS.fontPercent + 5 }, false],
    [{ ...TYPOGRAPHY_DEFAULTS, lineHeight: "1.9" }, false],
    [{ ...TYPOGRAPHY_DEFAULTS, margin: "wide" }, false],
    [{ ...TYPOGRAPHY_DEFAULTS, fontFamily: "serif" }, false],
  ] as const)("%o → %s", (typography, expected) => {
    expect(isDefaultTypography(typography)).toBe(expected);
  });
});
