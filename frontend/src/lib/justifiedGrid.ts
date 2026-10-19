import type { FileItem } from "@/types";

/**
 * Ratio stops. A 10:1 panorama laid out at the row height would be
 * three screens wide on its own and push everything after it onto the
 * next row; a 1:10 strip would be a hairline. Both are cropped by
 * `object-fit: cover` instead, which is the same trade the thumbnail
 * already makes.
 */
export const JG_MIN_RATIO = 0.5;
export const JG_MAX_RATIO = 3;

/**
 * Square rather than 16:9: a justified row is mostly portrait
 * photographs, and a single 16:9 cell among them is the widest thing on
 * the row — the one placement a reader would read as meaningful. A
 * square is the least conspicuous guess.
 */
export const JG_FALLBACK_RATIO = 1;

/**
 * A cell's height comes from its ratio, so a ratio outside the stops is
 * not a wide cell that `object-fit: cover` crops but a band.
 */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return JG_FALLBACK_RATIO;
  return Math.min(JG_MAX_RATIO, Math.max(JG_MIN_RATIO, ratio));
}

export function justifiedRatio(file: {
  image_width: number | null;
  image_height: number | null;
}): number {
  const { image_width: w, image_height: h } = file;
  // `== null` rather than `=== null`: a row that predates the columns
  // arrives from the API without the keys at all, and `undefined / 3`
  // is `NaN`, which CSS drops silently — a cell laid out at whatever
  // `flex-basis: calc(NaN * ...)` falls back to.
  if (w == null || h == null || w <= 0 || h <= 0) return JG_FALLBACK_RATIO;
  return clampRatio(w / h);
}

export function hasKnownRatio(file: FileItem): boolean {
  return (
    file.file_type === "image" &&
    file.image_width != null &&
    file.image_height != null &&
    file.image_width > 0 &&
    file.image_height > 0
  );
}
