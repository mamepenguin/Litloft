import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { FRAME, FRAME_CROP_CASES, type FrameCropCase } from "./frame-crop.data";

const FIXTURE = pathToFileURL(PAGE).href;

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** SPEC-CORE-134 step 12, in the large frame's pixels. */
export function cropRegion(c: FrameCropCase, aspect: number): Region {
  const xs = c.quad.filter((_, i) => i % 2 === 0).map((v) => v * FRAME.width);
  const ys = c.quad.filter((_, i) => i % 2 === 1).map((v) => v * FRAME.height);
  const x0 = Math.min(...xs);
  const w = Math.max(...xs) - x0;
  const y0 = Math.min(...ys);
  const h = Math.max(...ys) - y0;
  let height = Math.max(3 * h, FRAME.width / 4 / aspect);
  let width = height * aspect;
  if (height > FRAME.height) {
    height = FRAME.height;
    width = height * aspect;
  }
  if (width > FRAME.width) {
    width = FRAME.width;
    height = width / aspect;
  }
  const cx = x0 + (w * (c.match[0] + c.match[1])) / 2;
  const cy = y0 + h / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return {
    left: clamp(cx - width / 2, 0, FRAME.width - width),
    top: clamp(cy - height / 2, 0, FRAME.height - height),
    width,
    height,
  };
}

async function open(page: Page) {
  await page.goto(`${FIXTURE}#frame-crop`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "frame-crop");
  await page.waitForFunction(() => Boolean((window as unknown as { __frameCropSmall?: string }).__frameCropSmall));
}

/** The box inside the row that has the slot's size, once the small frame is gone. */
async function slotBox(page: Page, id: string, size: { width: number; height: number }) {
  const link = page.locator(`a[href^="/files/${id}?"]`);
  await expect(link).toHaveCount(1);
  await expect
    .poll(() =>
      link.evaluate((el) => {
        const small = (window as unknown as { __frameCropSmall: string }).__frameCropSmall;
        return Array.from(el.querySelectorAll("[src]")).some((n) => n.getAttribute("src") === small);
      }),
    )
    .toBe(false);
  return link.evaluate((el, s) => {
    for (const node of Array.from(el.querySelectorAll("*"))) {
      const r = node.getBoundingClientRect();
      if (Math.abs(r.width - s.width) < 0.5 && Math.abs(r.height - s.height) < 0.5) {
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      }
    }
    return null;
  }, size);
}

async function pixels(page: Page, clip: { x: number; y: number; width: number; height: number }, points: [number, number][]) {
  const png = await page.screenshot({ clip, scale: "css" });
  return page.evaluate(
    async ({ b64, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => Array.from(ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data));
    },
    { b64: png.toString("base64"), points },
  );
}

export function frameCropCases(label: string, slot: { width: number; height: number }) {
  for (const c of FRAME_CROP_CASES) {
    test(`SPEC-CORE-134 I4 step 12 ${label}: ${c.name} is drawn in a ${slot.width}x${slot.height} slot`, async ({ page }) => {
      await open(page);
      const box = await slotBox(page, c.id, slot);
      expect(box, "no element of the slot's size in the cropped row").not.toBeNull();

      const region = cropRegion(c, slot.width / slot.height);
      const points: [number, number][] = [
        [3, 3],
        [slot.width - 4, 3],
        [slot.width / 2, slot.height / 2],
      ];
      const seen = await pixels(page, box!, points);

      points.forEach(([px, py], i) => {
        const sourceX = region.left + ((Math.floor(px) + 0.5) / slot.width) * region.width;
        const sourceY = region.top + ((Math.floor(py) + 0.5) / slot.height) * region.height;
        const red = (255 * sourceX) / (FRAME.width - 1);
        const green = (255 * sourceY) / (FRAME.height - 1);
        expect(Math.abs(seen[i][0] - red), `red at ${px},${py}`).toBeLessThanOrEqual(10);
        expect(Math.abs(seen[i][1] - green), `green at ${px},${py}`).toBeLessThanOrEqual(10);
        expect(Math.abs(seen[i][2] - 128), `blue at ${px},${py}`).toBeLessThanOrEqual(10);
      });
    });
  }
}
