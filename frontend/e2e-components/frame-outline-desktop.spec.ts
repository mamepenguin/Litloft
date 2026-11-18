import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  LOFT_OUTLINE_CASES,
  NATIVE_OUTLINE_CASES,
  type FrameOutlineCase,
} from "./frame-outline.data";

const FIXTURE = pathToFileURL(PAGE).href;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawnPolygon extends Box {
  current: boolean;
}

function paintedRect(picture: Box, size: { width: number; height: number }): Box {
  const scale = Math.min(picture.width / size.width, picture.height / size.height);
  const width = size.width * scale;
  const height = size.height * scale;
  return {
    x: picture.x + (picture.width - width) / 2,
    y: picture.y + (picture.height - height) / 2,
    width,
    height,
  };
}

function expectedBox(picture: Box, c: FrameOutlineCase, quad: number[]): Box {
  const painted = paintedRect(picture, c.video);
  const xs = [quad[0], quad[2], quad[4], quad[6]].map((f) => painted.x + f * painted.width);
  const ys = [quad[1], quad[3], quad[5], quad[7]].map((f) => painted.y + f * painted.height);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function expectBox(actual: Box, expected: Box, label: string): void {
  expect(Math.abs(actual.x - expected.x), `${label} x`).toBeLessThanOrEqual(1.5);
  expect(Math.abs(actual.y - expected.y), `${label} y`).toBeLessThanOrEqual(1.5);
  expect(Math.abs(actual.width - expected.width), `${label} width`).toBeLessThanOrEqual(1.5);
  expect(Math.abs(actual.height - expected.height), `${label} height`).toBeLessThanOrEqual(1.5);
}

async function open(page: Page, arrangement: string): Promise<void> {
  await page.goto(`${FIXTURE}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);
}

/**
 * jsdom is not in this run, and a video served by no server never reports a
 * size, so the element's readings are stood in for and its own metadata event
 * is delivered.
 */
async function driveNative(
  page: Page,
  size: { width: number; height: number },
  time = 15,
): Promise<void> {
  await page.locator("video").waitFor();
  await page.evaluate(
    ({ width, height, at }) => {
      const video = document.querySelector("video")!;
      const define = (key: string, value: unknown) =>
        Object.defineProperty(video, key, { configurable: true, get: () => value });
      define("videoWidth", width);
      define("videoHeight", height);
      define("duration", 600);
      define("currentTime", at);
      define("ended", false);
      video.dispatchEvent(new Event("loadedmetadata"));
      video.dispatchEvent(new Event("timeupdate"));
    },
    { width: size.width, height: size.height, at: time },
  );
}

async function drawn(page: Page): Promise<DrawnPolygon[]> {
  return page.evaluate(() => {
    const svg = document.querySelector("[data-frame-outline] svg") as SVGSVGElement | null;
    if (!svg) return [];
    const ctm = svg.getScreenCTM();
    if (!ctm) return [];
    return Array.from(svg.querySelectorAll("polygon")).map((node) => {
      const points = (node as SVGPolygonElement).points;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < points.numberOfItems; i += 1) {
        const point = points.getItem(i);
        xs.push(point.x * ctm.a + ctm.e);
        ys.push(point.y * ctm.d + ctm.f);
      }
      return {
        current: node.classList.contains("find-box-current"),
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    });
  });
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function checkQuads(drawnPolygons: DrawnPolygon[], picture: Box, c: FrameOutlineCase): void {
  expect(drawnPolygons).toHaveLength(c.quads.length);
  for (const entry of c.quads) {
    const found = drawnPolygons.find((polygon) => polygon.current === entry.current);
    expect(found, `no ${entry.current ? "current" : "mark"} outline`).toBeTruthy();
    expectBox(found!, expectedBox(picture, c, entry.quad), entry.current ? "current" : "mark");
  }
}

test.describe("SPEC-CORE-135 I7 I8 the outlines sit at their fractions of the contain-fitted picture", () => {
  for (const c of NATIVE_OUTLINE_CASES) {
    test(`a native video: ${c.name}`, async ({ page }) => {
      await open(page, "frame-outline-native");
      await driveNative(page, c.video);
      await expect(page.locator("[data-frame-outline] polygon")).toHaveCount(c.quads.length);

      checkQuads(await drawn(page), await boxOf(page, "video"), c);
    });
  }

  for (const c of LOFT_OUTLINE_CASES) {
    test(`a .loft layer: ${c.name}`, async ({ page }) => {
      await open(page, `frame-outline-loft-${c.id}`);
      await expect(page.locator("[data-frame-outline] polygon")).toHaveCount(c.quads.length);

      checkQuads(await drawn(page), await boxOf(page, "#picture-host"), c);
    });
  }

  test("the layer sits under the Litloft controls and takes no pointer events", async ({ page }) => {
    await open(page, "frame-outline-native");
    await driveNative(page, { width: 1280, height: 720 });
    await expect(page.locator("[data-frame-outline] polygon")).toHaveCount(2);

    const frame = await boxOf(page, '[data-testid="player-frame"]');
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);

    const play = page.getByRole("button", { name: "Play" });
    await expect(play).toBeVisible();
    const button = await boxOf(page, 'button[aria-label="Play"]');
    const hit = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element?.closest('button[aria-label="Play"]')?.getAttribute("aria-label") ?? null;
      },
      { x: button.x + button.width / 2, y: button.y + button.height / 2 },
    );
    expect(hit).toBe("Play");

    const pointerEvents = await page
      .locator("[data-frame-outline]")
      .evaluate((element) => getComputedStyle(element).pointerEvents);
    expect(pointerEvents).toBe("none");
  });
});
