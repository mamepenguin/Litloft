/**
 * A zoomed view is `transform: translate(x, y) scale(scale)` with the origin
 * at the frame's top-left corner, so a frame point `p` shows the picture point
 * `(p - translate) / scale`.
 */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** In frame coordinates at fit. */
export interface Rect extends Size {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export const FIT: View = { scale: 1, x: 0, y: 0 };
export const MAX_SCALE = 4;

/** Below this a zoom reads as fit, and a leftover 1% would disable paging. */
const FIT_EPSILON = 0.02;

export function isZoomed(view: View): boolean {
  return view.scale > 1 + FIT_EPSILON;
}

export function zoomAbout(view: View, factor: number, origin: Point): View {
  const scale = Math.min(MAX_SCALE, view.scale * factor);
  const px = (origin.x - view.x) / view.scale;
  const py = (origin.y - view.y) / view.scale;
  return { scale, x: origin.x - px * scale, y: origin.y - py * scale };
}

function clampAxis(
  translate: number,
  scale: number,
  frameLength: number,
  start: number,
  length: number,
): number {
  const scaled = length * scale;
  if (scaled <= frameLength) return (frameLength - scaled) / 2 - start * scale;
  const max = 0 - start * scale;
  const min = frameLength - (start + length) * scale;
  return Math.min(max, Math.max(min, translate));
}

export function clampView(view: View, frame: Size, content: Rect): View {
  return {
    scale: view.scale,
    x: clampAxis(view.x, view.scale, frame.width, content.x, content.width),
    y: clampAxis(view.y, view.scale, frame.height, content.y, content.height),
  };
}

/** Where a gesture comes to rest when the fingers lift. */
export function settleView(view: View, frame: Size, content: Rect): View {
  if (!isZoomed(view)) return FIT;
  return clampView(view, frame, content);
}
