export type ReadingDirection = "ltr" | "rtl";

/**
 * `unknown` is an answer, not a gap: pairing a page whose shape has not
 * been reported yet is how a spread ends up one page out of step.
 */
export type Orientation = "portrait" | "landscape" | "unknown";

export interface SpreadState {
  index: number;
  count: number;
  spreadMode: boolean;
  readingDirection: ReadingDirection;
  showRightHalf: boolean;
  orientationAt: (index: number) => Orientation;
  canPair: boolean;
}

export interface SpreadFace {
  kind: "half" | "pair" | "single";
  /** The page the position is named by: the binding-side one of a pair. */
  index: number;
  /** What to draw, in reading order. */
  indices: number[];
  showRightHalf: boolean;
}

export interface SpreadPosition {
  index: number;
  showRightHalf: boolean;
}

/**
 * A scanned book opens on a cover, alone, and pairs from there: 1-2,
 * 3-4. Without this an index arrived at from a page list would re-pair
 * the whole book from wherever it landed.
 */
export function faceStart(index: number): number {
  if (index <= 0) return 0;
  return index % 2 === 1 ? index : index - 1;
}

function pairs(s: SpreadState, start: number): boolean {
  if (!s.spreadMode || !s.canPair) return false;
  if (start === 0) return false;
  if (start + 1 >= s.count) return false;
  return (
    s.orientationAt(start) === "portrait" &&
    s.orientationAt(start + 1) === "portrait"
  );
}

export function faceAtIndex(s: SpreadState, index: number): SpreadFace {
  if (s.spreadMode && s.orientationAt(index) === "landscape") {
    return {
      kind: "half",
      index,
      indices: [index],
      showRightHalf: s.showRightHalf,
    };
  }
  const start = faceStart(index);
  if (pairs(s, start)) {
    return {
      kind: "pair",
      index: start,
      indices: [start, start + 1],
      showRightHalf: s.showRightHalf,
    };
  }
  return {
    kind: "single",
    index,
    indices: [index],
    showRightHalf: s.showRightHalf,
  };
}

export function faceAt(s: SpreadState): SpreadFace {
  return faceAtIndex(s, s.index);
}

export function isSpreadActive(s: SpreadState): boolean {
  return s.spreadMode && s.orientationAt(s.index) === "landscape";
}

/** In reading order rather than in screen order. */
export function isOnFirstHalf(s: SpreadState): boolean {
  return s.readingDirection === "ltr" ? !s.showRightHalf : s.showRightHalf;
}

export function halfLabel(s: SpreadState): "A" | "B" | null {
  if (!isSpreadActive(s)) return null;
  return isOnFirstHalf(s) ? "A" : "B";
}

/**
 * A pair says both of its pages, because "7 / 190" over two visible
 * pages is a count that disagrees with what is on the screen.
 */
export function faceLabel(s: SpreadState): string {
  const face = faceAt(s);
  if (face.kind === "pair") {
    return `${face.indices[0] + 1}–${face.indices[1] + 1}`;
  }
  return String(face.index + 1);
}

export function canPageBack(s: SpreadState): boolean {
  return pageBack(s) !== null;
}

export function canPageForward(s: SpreadState): boolean {
  return pageForward(s) !== null;
}

export function pageForward(s: SpreadState): SpreadPosition | null {
  if (isSpreadActive(s) && isOnFirstHalf(s)) {
    return { index: s.index, showRightHalf: s.readingDirection === "ltr" };
  }
  const face = faceAt(s);
  const next = face.indices[face.indices.length - 1] + 1;
  if (next >= s.count) return null;
  return { index: next, showRightHalf: s.readingDirection === "rtl" };
}

/**
 * Landing on the previous face lands on its *last* half, which is why
 * this one consults `spreadMode` and not the active spread: whether the
 * page being arrived at has two halves is not something the page being
 * left can answer.
 *
 * Nothing corrects the guess afterwards. Every consumer reads
 * `showRightHalf` under an `isSpreadActive` gate; a reader who read the
 * half outside that gate would inherit a stale one.
 */
export function pageBack(s: SpreadState): SpreadPosition | null {
  if (isSpreadActive(s) && !isOnFirstHalf(s)) {
    return { index: s.index, showRightHalf: s.readingDirection === "rtl" };
  }
  const face = faceAt(s);
  const before = face.indices[0] - 1;
  if (before < 0) return null;
  // Land on the *start* of the face that holds `before`, so a turn back
  // from page 3 arrives at the 1-2 face rather than inside it. A wide
  // page is its own face and keeps its own index.
  return {
    index: faceAtIndex(s, before).index,
    showRightHalf: s.spreadMode && s.readingDirection === "ltr",
  };
}
