import { rasterPixelRatio, type PageBox } from "@/lib/pdfZoomMode";

export type FaceKind = "single" | "pair" | "half";

/** A4 portrait, for a page whose size has not arrived yet. */
const UNKNOWN_ASPECT = 1 / Math.SQRT2;

function aspect(box: PageBox | undefined): number {
  return box && box.width > 0 && box.height > 0
    ? box.width / box.height
    : UNKNOWN_ASPECT;
}

/**
 * The CSS width of each page in a face that fits the frame whole. A half is
 * one wide page drawn up to twice the frame's width, of which the frame shows
 * one side; a pair is two pages at one shared height.
 */
export function faceWidths(
  kind: FaceKind,
  boxes: (PageBox | undefined)[],
  frame: { width: number; height: number },
): number[] {
  if (frame.width <= 0 || frame.height <= 0) return boxes.map(() => 0);
  if (kind === "pair") {
    const [a, b] = boxes.map(aspect);
    const height = Math.min(frame.height, frame.width / (a + b));
    return [a * height, b * height];
  }
  const room = kind === "half" ? frame.width * 2 : frame.width;
  return [Math.min(room, frame.height * aspect(boxes[0]))];
}

/**
 * Each page's CSS width in a face, and the one pixel ratio the face is drawn
 * at: sized for the whole face, so a pair shares one budget rather than
 * taking two.
 */
export function faceRaster(
  kind: FaceKind,
  boxes: (PageBox | undefined)[],
  frame: { width: number; height: number },
  devicePixelRatio: number,
): { widths: number[]; ratio: number } {
  const widths = faceWidths(kind, boxes, frame);
  const faceWidth = widths.reduce((a, b) => a + b, 0);
  const faceHeight = Math.max(
    ...widths.map((width, slot) => {
      const box = boxes[slot];
      return box ? width * (box.height / box.width) : width;
    }),
    0,
  );
  return {
    widths,
    ratio: rasterPixelRatio({
      cssWidth: faceWidth,
      cssHeight: faceHeight,
      devicePixelRatio,
    }),
  };
}
