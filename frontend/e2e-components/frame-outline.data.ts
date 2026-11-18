type Quad = [number, number, number, number, number, number, number, number];

function rect(x0: number, y0: number, x1: number, y1: number): Quad {
  return [x0, y0, x1, y0, x1, y1, x0, y1];
}

export interface FrameOutlineCase {
  id: string;
  name: string;
  /** The size the player reports or the segment's frame_size says. */
  video: { width: number; height: number };
  quads: { quad: Quad; current: boolean }[];
}

const QUADS = [
  { quad: rect(0.1, 0.2, 0.5, 0.3), current: true },
  { quad: rect(0.6, 0.65, 0.9, 0.75), current: false },
];

export const NATIVE_FRAME = { width: 640, height: 360 } as const;

export const NATIVE_OUTLINE_CASES: FrameOutlineCase[] = [
  {
    id: "letterbox",
    name: "a 16:5 video in a 16:9 box, letterboxed",
    video: { width: 1600, height: 500 },
    quads: QUADS,
  },
  {
    id: "pillarbox",
    name: "a square video in a 16:9 box, pillarboxed",
    video: { width: 500, height: 500 },
    quads: QUADS,
  },
];

export const LOFT_OUTLINE_CASES: FrameOutlineCase[] = [
  {
    id: "letterbox",
    name: "a 16:5 frame_size in a 16:9 box, letterboxed",
    video: { width: 1600, height: 500 },
    quads: QUADS,
  },
  {
    id: "pillarbox",
    name: "a square frame_size in a 16:9 box, pillarboxed",
    video: { width: 500, height: 500 },
    quads: QUADS,
  },
];
