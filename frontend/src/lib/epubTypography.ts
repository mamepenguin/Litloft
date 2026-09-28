import { readStored, writeStored } from "./safeStorage";

export const TYPOGRAPHY_KEY = "epub-reader:typography";

export const FONT_PERCENT_MIN = 80;
export const FONT_PERCENT_MAX = 200;
export const FONT_PERCENT_STEP = 5;
export const LINE_HEIGHTS = ["original", "1.6", "1.9"] as const;
export const MARGINS = ["narrow", "normal", "wide"] as const;
export const FONT_FAMILIES = ["original", "serif", "sans"] as const;

export interface Typography {
  fontPercent: number;
  lineHeight: (typeof LINE_HEIGHTS)[number];
  margin: (typeof MARGINS)[number];
  fontFamily: (typeof FONT_FAMILIES)[number];
}

export const TYPOGRAPHY_DEFAULTS: Typography = {
  fontPercent: 100,
  lineHeight: "original",
  margin: "normal",
  fontFamily: "original",
};

export function isDefaultTypography(t: Typography): boolean {
  return (
    t.fontPercent === TYPOGRAPHY_DEFAULTS.fontPercent &&
    t.lineHeight === TYPOGRAPHY_DEFAULTS.lineHeight &&
    t.margin === TYPOGRAPHY_DEFAULTS.margin &&
    t.fontFamily === TYPOGRAPHY_DEFAULTS.fontFamily
  );
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

function isFontPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= FONT_PERCENT_MIN &&
    value <= FONT_PERCENT_MAX &&
    value % FONT_PERCENT_STEP === 0
  );
}

/** Sizes once stored as an index (`fontSize`) into this table. */
const LEGACY_FONT_PERCENTS = [80, 90, 100, 115, 130, 160, 200];

function readFontPercent(v: Record<string, unknown>): number {
  if ("fontPercent" in v) return isFontPercent(v.fontPercent) ? v.fontPercent : TYPOGRAPHY_DEFAULTS.fontPercent;
  const index = v.fontSize;
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < LEGACY_FONT_PERCENTS.length
    ? LEGACY_FONT_PERCENTS[index]
    : TYPOGRAPHY_DEFAULTS.fontPercent;
}

export function parseTypography(value: unknown): Typography {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    fontPercent: readFontPercent(v),
    lineHeight: oneOf(LINE_HEIGHTS, v.lineHeight, TYPOGRAPHY_DEFAULTS.lineHeight),
    margin: oneOf(MARGINS, v.margin, TYPOGRAPHY_DEFAULTS.margin),
    fontFamily: oneOf(FONT_FAMILIES, v.fontFamily, TYPOGRAPHY_DEFAULTS.fontFamily),
  };
}

export function readStoredTypography(): Typography {
  const raw = readStored(TYPOGRAPHY_KEY);
  if (raw === null) return TYPOGRAPHY_DEFAULTS;
  try {
    return parseTypography(JSON.parse(raw));
  } catch {
    return TYPOGRAPHY_DEFAULTS;
  }
}

export function writeStoredTypography(value: Typography): void {
  writeStored(TYPOGRAPHY_KEY, JSON.stringify(value));
}
