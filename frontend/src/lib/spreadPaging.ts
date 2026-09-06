/**
 * Where you are in a folder of pages, and what turning one does.
 *
 * Both full-screen viewers page through images this way, and both had
 * their own copy of these rules before this module existed.
 *
 * The unit is a **face**: what is on the screen at once. A face holds
 * half of a wide page, two tall pages, or one page — one axis with the
 * splitting at one end and the pairing at the other, rather than two
 * features that happen to both be called "spread". A turn moves to the
 * next face, and how far the index moves is the face's business.
 *
 * Kept as pure functions with the state passed in, rather than as a hook
 * that owns it: one viewer holds this state in a hook of its own and the
 * other is handed it as props and only renders it, and a viewer that
 * needs to *ask* about the position should not have to own it.
 */

export type ReadingDirection = "ltr" | "rtl";

/**
 * `unknown` is an answer, not a gap. An archive entry has no stored
 * dimensions, so its orientation arrives when the image loads; pairing a
 * page whose shape has not been reported yet is how a spread ends up one
 * page out of step.
 */
export type Orientation = "portrait" | "landscape" | "unknown";

export interface SpreadState {
  index: number;
  count: number;
  /** The reader's one toggle: read as spreads, or one page at a time. */
  spreadMode: boolean;
  readingDirection: ReadingDirection;
  showRightHalf: boolean;
  orientationAt: (index: number) => Orientation;
  /** False when the frame is too narrow to hold two pages side by side. */
  canPair: boolean;
}

/** What is on screen at once. */
export interface SpreadFace {
  /**
   * `half` — one side of a wide page, turned A then B.
   * `pair`  — two tall pages side by side.
   * `single` — one page, which is every face when the mode is off.
   */
  kind: "half" | "pair" | "single";
  /** The page the position is named by: the binding-side one of a pair. */
  index: number;
  /** What to draw, in reading order. One entry, or two. */
  indices: number[];
  showRightHalf: boolean;
}

/** Where a turn lands. */
export interface SpreadPosition {
  index: number;
  showRightHalf: boolean;
}

/**
 * The first page of the face `index` belongs to.
 *
 * A scanned book opens on a cover, alone, and pairs from there: 1-2,
 * 3-4. So a face starts on an odd page, and an even page is the second
 * of the pair before it. Without this an index arrived at from a page
 * list would re-pair the whole book from wherever it landed.
 */
export function faceStart(index: number): number {
  if (index <= 0) return 0;
  return index % 2 === 1 ? index : index - 1;
}

function pairs(s: SpreadState, start: number): boolean {
  if (!s.spreadMode || !s.canPair) return false;
  // The cover is always alone.
  if (start === 0) return false;
  if (start + 1 >= s.count) return false;
  // Both pages must be known to be tall. A wide page belongs to a face
  // of its own, where it is split instead.
  return (
    s.orientationAt(start) === "portrait" &&
    s.orientationAt(start + 1) === "portrait"
  );
}

/**
 * The face any index is part of.
 *
 * Written for an arbitrary index rather than only the current one,
 * because turning back has to ask what the *previous* face is before it
 * can land on the start of it.
 */
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

/** The face the current index is part of. */
export function faceAt(s: SpreadState): SpreadFace {
  return faceAtIndex(s, s.index);
}

/** A spread is only *active* on a wide page with the mode on. */
export function isSpreadActive(s: SpreadState): boolean {
  return s.spreadMode && s.orientationAt(s.index) === "landscape";
}

/**
 * Which half you are on, in reading order rather than in screen order.
 * Right-to-left reading starts on the right half.
 */
export function isOnFirstHalf(s: SpreadState): boolean {
  return s.readingDirection === "ltr" ? !s.showRightHalf : s.showRightHalf;
}

/** `A` / `B` beside the page number, or nothing when there is no split. */
export function halfLabel(s: SpreadState): "A" | "B" | null {
  if (!isSpreadActive(s)) return null;
  return isOnFirstHalf(s) ? "A" : "B";
}

/**
 * How the position reads to a person: `7` or `7–8`, one-based.
 *
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

/**
 * The position one turn forward, or `null` at the end.
 *
 * Within a split page the turn moves the half. Otherwise it moves past
 * the whole face — two pages when two are showing, which is the only
 * place the index moves by more than one.
 */
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
 * The position one turn back, or `null` at the start.
 *
 * Landing on the previous face lands on its *last* half, which is why
 * this one consults `spreadMode` and not the active spread: whether the
 * page being arrived at has two halves is not something the page being
 * left can answer.
 *
 * Nothing corrects the guess afterwards, and nothing needs to. Every
 * consumer reads `showRightHalf` under an `isSpreadActive` gate, so on a
 * page that turns out to be tall the value is never read, and the next
 * turn overwrites it. A reader who took this for self-healing and read
 * the half outside that gate would inherit a stale one.
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
