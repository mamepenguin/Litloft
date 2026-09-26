import { describe, it, expect, beforeEach } from "vitest";
import {
  FONT_SIZE_STEPS,
  LINE_HEIGHTS,
  MARGINS,
  FONT_FAMILIES,
  TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_KEY,
  parseTypography,
  readStoredTypography,
  writeStoredTypography,
} from "../epubTypography";
import * as reader from "../../../public/epub-reader/core.js";

const DEFAULTS = { fontSize: 2, lineHeight: "original", margin: "normal", fontFamily: "original" };

describe("the typography step table", () => {
  it("is the same in the page and in the reader", () => {
    expect({
      fontSize: [...FONT_SIZE_STEPS],
      lineHeight: [...LINE_HEIGHTS],
      margin: [...MARGINS],
      fontFamily: [...FONT_FAMILIES],
      defaults: TYPOGRAPHY_DEFAULTS,
    }).toEqual({
      fontSize: [...reader.FONT_SIZE_STEPS],
      lineHeight: [...reader.LINE_HEIGHTS],
      margin: [...reader.MARGINS],
      fontFamily: [...reader.FONT_FAMILIES],
      defaults: reader.TYPOGRAPHY_DEFAULTS,
    });
  });

  it("leaves the book alone by default", () => {
    expect(TYPOGRAPHY_DEFAULTS).toEqual(DEFAULTS);
    expect(FONT_SIZE_STEPS[TYPOGRAPHY_DEFAULTS.fontSize]).toBe(1);
  });
});

const VALUES: [string, unknown, unknown][] = [
  ["nothing", undefined, DEFAULTS],
  ["null", null, DEFAULTS],
  ["a string", "big", DEFAULTS],
  ["a full valid setting", { fontSize: 5, lineHeight: "1.9", margin: "wide", fontFamily: "serif" }, { fontSize: 5, lineHeight: "1.9", margin: "wide", fontFamily: "serif" }],
  ["one bad field among good ones", { fontSize: 9, lineHeight: "1.6", margin: "narrow", fontFamily: "sans" }, { ...DEFAULTS, lineHeight: "1.6", margin: "narrow", fontFamily: "sans" }],
  ["the largest size", { fontSize: 6 }, { ...DEFAULTS, fontSize: 6 }],
  ["one past the largest size", { fontSize: 7 }, DEFAULTS],
  ["the smallest size", { fontSize: 0 }, { ...DEFAULTS, fontSize: 0 }],
  ["a fractional size", { fontSize: 1.5 }, DEFAULTS],
  ["a negative size", { fontSize: -1 }, DEFAULTS],
  ["an unknown enum", { lineHeight: "3", margin: "huge", fontFamily: "comic" }, DEFAULTS],
  ["extra fields", { fontSize: 4, evil: "<b>" }, { ...DEFAULTS, fontSize: 4 }],
];

describe("reading a typography value", () => {
  it.each(VALUES)("in the reader: %s", (_name, value, expected) => {
    expect(reader.readTypography(value)).toEqual(expected);
  });

  it.each(VALUES)("in the page: %s", (_name, value, expected) => {
    expect(parseTypography(value)).toEqual(expected);
  });
});

describe("the stored typography", () => {
  beforeEach(() => localStorage.clear());

  it("is the defaults when nothing is stored", () => {
    expect(readStoredTypography()).toEqual(DEFAULTS);
  });

  it("comes back as it was written", () => {
    const t = { fontSize: 4, lineHeight: "1.6", margin: "wide", fontFamily: "sans" } as const;
    writeStoredTypography(t);
    expect(readStoredTypography()).toEqual(t);
  });

  it.each(VALUES)("stored as %s reads field by field", (_name, value, expected) => {
    if (value !== undefined) localStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify(value));
    expect(readStoredTypography()).toEqual(expected);
  });

  it("is the defaults when the stored text is not JSON", () => {
    localStorage.setItem(TYPOGRAPHY_KEY, "{not json");
    expect(readStoredTypography()).toEqual(DEFAULTS);
  });
});
