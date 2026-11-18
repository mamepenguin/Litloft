export const FRAME = { width: 1280, height: 720 } as const;

type Quad = [number, number, number, number, number, number, number, number];

function rect(x0: number, y0: number, x1: number, y1: number): Quad {
  return [x0, y0, x1, y0, x1, y1, x0, y1];
}

export interface FrameCropCase {
  id: string;
  name: string;
  quad: Quad;
  match: [number, number];
}

export const FRAME_CROP_CASES: FrameCropCase[] = [
  {
    id: "cropfloor001",
    name: "a thin line: a quarter of the frame's width",
    quad: rect(0.1, 0.4, 0.7, 0.46),
    match: [0.05, 0.15],
  },
  {
    id: "croptall0001",
    name: "a tall line: three times its height",
    quad: rect(0.3, 0.4, 0.7, 0.6),
    match: [0, 1],
  },
  {
    id: "cropclamp001",
    name: "a line taller than a third of the frame: the frame's height",
    quad: rect(0.2, 0.3, 0.8, 0.7),
    match: [0.2, 0.4],
  },
  {
    id: "cropedge0001",
    name: "a line in the top-left corner: moved inside the frame",
    quad: rect(0, 0, 0.1, 0.03),
    match: [0, 1],
  },
];
