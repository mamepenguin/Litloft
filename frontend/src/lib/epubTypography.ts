import { readStored, writeStored } from "./safeStorage";

export const TYPOGRAPHY_KEY = "epub-reader:typography";

export const FONT_SIZE_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.6, 2] as const;
export const LINE_HEIGHTS = ["original", "1.6", "1.9"] as const;
export const MARGINS = ["narrow", "normal", "wide"] as const;
export const FONT_FAMILIES = ["original", "serif", "sans"] as const;

export interface Typography {
  /** An index into FONT_SIZE_STEPS. */
  fontSize: number;
  lineHeight: (typeof LINE_HEIGHTS)[number];
  margin: (typeof MARGINS)[number];
  fontFamily: (typeof FONT_FAMILIES)[number];
}

export const TYPOGRAPHY_DEFAULTS: Typography = {
  fontSize: 2,
  lineHeight: "original",
  margin: "normal",
  fontFamily: "original",
};

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

export function parseTypography(value: unknown): Typography {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const size = v.fontSize;
  return {
    fontSize:
      typeof size === "number" && Number.isInteger(size) && size >= 0 && size < FONT_SIZE_STEPS.length
        ? size
        : TYPOGRAPHY_DEFAULTS.fontSize,
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
