/**
 * SPEC-CORE-051 I9, I11: the find outline layer over the painted picture,
 * measured in Chromium. Each outline's rectangle is checked against the
 * contain-fitted rectangle of the picture inside its `img` element, for a
 * landscape picture, a portrait picture held by `max-h-[70vh]`, and a picture
 * whose EXIF orientation turns it, and again after a viewport resize.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "ocr-line-boxes.html"),
).href;
const SHEET = resolve(__dirname, "fixtures", "globals.built.css");

const WIDE = { width: 900, height: 800 };
const NARROW = { width: 500, height: 600 };

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Measurement {
  case: string;
  natural: { width: number; height: number };
  element: Rect;
  painted: Rect | null;
  layer: Rect;
  polygons: Array<Rect & { kind: string; className: string }>;
  quads: number[][];
}

declare global {
  interface Window {
    measureOcrBoxes: () => Measurement[];
    ocrQuads: Record<string, number[][]>;
  }
}

async function open(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(FIXTURE);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => window.measureOcrBoxes());
}

function expectedQuad(quad: number[], painted: Rect) {
  const xs = quad.filter((_, index) => index % 2 === 0);
  const ys = quad.filter((_, index) => index % 2 === 1);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left: painted.left + left * painted.width,
    top: painted.top + top * painted.height,
    width: (right - left) * painted.width,
    height: (bottom - top) * painted.height,
  };
}

function expectNear(actual: Rect, expected: Rect) {
  expect(actual.left).toBeCloseTo(expected.left, 1);
  expect(actual.top).toBeCloseTo(expected.top, 1);
  expect(actual.width).toBeCloseTo(expected.width, 1);
  expect(actual.height).toBeCloseTo(expected.height, 1);
}

function expectOutlinesOnPaintedPicture(m: Measurement) {
  expect(m.painted).not.toBeNull();
  const painted = m.painted!;
  expect(painted.width).toBeGreaterThan(0);
  expect(painted.height).toBeGreaterThan(0);

  expectNear(m.layer, painted);
  expect(m.polygons).toHaveLength(m.quads.length);

  m.polygons.forEach((polygon, index) => {
    expectNear(polygon, expectedQuad(m.quads[index], painted));
  });

  const kinds = m.polygons.map((polygon) => polygon.kind);
  expect(kinds.slice(0, -1).every((kind) => kind === "mark")).toBe(true);
  expect(kinds[kinds.length - 1]).toBe("current");
  expect(m.polygons.at(-1)!.className?.split(" ")).toContain(
    "find-box-current",
  );
  expect(m.polygons[0].className?.split(" ")).toContain("find-box");
}

function byCase(measurements: Measurement[], name: string): Measurement {
  const found = measurements.find((m) => m.case === name);
  if (!found) throw new Error(`no ${name} case`);
  return found;
}

test.describe("SPEC-CORE-051 I9, I11 outlines cover the painted picture", () => {
  test("the picture page's sheet styles the mark and the current outline", () => {
    const css = readFileSync(SHEET, "utf8");

    expect(/\.find-box(\s*[,{])/.test(css)).toBe(true);
    expect(/\.find-box-current(\s*[,{])/.test(css)).toBe(true);
  });

  test("a landscape picture's outlines sit at their quads of the painted picture", async ({
    page,
  }) => {
    const m = byCase(await open(page, WIDE), "landscape");

    expectOutlinesOnPaintedPicture(m);
    expect(m.natural.width / m.natural.height).toBeCloseTo(4 / 3, 2);
  });

  test("a portrait picture held by the 70vh bound centres its outlines on the scaled picture", async ({
    page,
  }) => {
    const m = byCase(await open(page, WIDE), "portrait");

    expectOutlinesOnPaintedPicture(m);
    expect(m.painted!.height).toBeCloseTo(WIDE.height * 0.7, 1);
    expect(m.painted!.height).toBeLessThan(m.natural.height);
    expect(m.natural.height).toBeGreaterThan(m.painted!.height);
  });

  test("a picture rotated by EXIF paints and outlines in the oriented rectangle", async ({
    page,
  }) => {
    const m = byCase(await open(page, WIDE), "rotated");

    expectOutlinesOnPaintedPicture(m);
    expect(m.natural.width).toBeLessThan(m.natural.height);
    expect(m.painted!.height).toBeGreaterThan(m.painted!.width);
  });

  test("the outlines follow the picture again after a viewport resize", async ({
    page,
  }) => {
    const before = byCase(await open(page, WIDE), "portrait");
    expect(before.painted!.height).toBeCloseTo(WIDE.height * 0.7, 1);

    await page.setViewportSize(NARROW);
    await page.waitForFunction(() => {
      const portrait = window
        .measureOcrBoxes()
        .find((m) => m.case === "portrait");
      return (
        !!portrait?.painted &&
        Math.abs(portrait.layer.height - window.innerHeight * 0.7) < 1
      );
    });

    const after = page.evaluate(() => window.measureOcrBoxes());
    for (const m of await after) expectOutlinesOnPaintedPicture(m);

    const portrait = byCase(await after, "portrait");
    expect(portrait.painted!.height).toBeCloseTo(NARROW.height * 0.7, 1);
    expect(portrait.painted!.height).toBeLessThan(before.painted!.height);
  });
});
