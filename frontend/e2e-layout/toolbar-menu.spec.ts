/**
 * Where the shared toolbar surface lands, measured in Chromium: a sheet
 * spanning the screen below `sm`, a panel anchored to its trigger above.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "toolbar-menu.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

const SPEC: Record<string, string | number> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const GAP_PX = SPEC.gapPx as number;

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface Measurement {
  viewport: { width: number; height: number };
  trigger: Box;
  menu: Box;
  menuPosition: string;
  menuTransformOrigin: string;
}

declare global {
  interface Window {
    buildBar: (spec: {
      direction: "up" | "down";
      align: "left" | "right";
      rows: number;
    }) => void;
    measureMenu: () => Measurement;
  }
}

/**
 * Two widths above `sm`, because a rule can hold at one width above a
 * breakpoint and not at another. 768 is where the folder toolbar's `md`
 * group appears.
 */
const WIDTHS = [
  { width: 500, form: "sheet" },
  { width: 700, form: "anchored" },
  { width: 768, form: "anchored" },
] as const;

test("measures one width in the sheet form and two in the anchored one", () => {
  expect(WIDTHS).toHaveLength(3);
  expect(WIDTHS.filter((w) => w.form === "sheet").map((w) => w.width)).toEqual([
    500,
  ]);
  expect(
    WIDTHS.filter((w) => w.form === "anchored").map((w) => w.width),
  ).toEqual([700, 768]);
  for (const { width, form } of WIDTHS) {
    expect(width >= 640, `${width} vs sm`).toBe(form === "anchored");
  }
});

async function open(
  page: import("@playwright/test").Page,
  width: number,
  spec: { direction: "up" | "down"; align: "left" | "right"; rows: number },
): Promise<Measurement> {
  await page.setViewportSize({ width, height: 500 });
  await page.goto(FIXTURE);
  await page.evaluate((s) => window.buildBar(s), spec);
  // The entry animation starts scaled down, and a box read during it
  // reports a scaled number.
  await page.waitForTimeout(300);
  return page.evaluate(() => window.measureMenu());
}

for (const { width, form } of WIDTHS) {
  test(`takes the ${form} form at ${width}px`, async ({ page }) => {
    const m = await open(page, width, {
      direction: "down",
      align: "right",
      rows: 6,
    });

    // The property the hook reads to decide whether it decides anything.
    expect(m.menuPosition).toBe(form === "sheet" ? "fixed" : "absolute");

    if (form === "sheet") {
      expect(m.menu.left).toBeCloseTo(8, 0);
      expect(m.viewport.width - m.menu.right).toBeCloseTo(8, 0);
    } else {
      expect(m.menu.right).toBeCloseTo(m.trigger.right, 0);
      expect(m.menu.width).toBeLessThan(m.viewport.width);
    }
  });
}

test.describe("the anchored form's two directions", () => {
  // The bar sits on the foot of the viewport, where the downward form has
  // nowhere to go.
  for (const { width } of WIDTHS.filter((w) => w.form === "anchored")) {
    test(`hangs off the bottom at ${width}px and comes back when flipped`, async ({
      page,
    }) => {
      const down = await open(page, width, {
        direction: "down",
        align: "right",
        rows: 6,
      });
      const up = await open(page, width, {
        direction: "up",
        align: "right",
        rows: 6,
      });

      expect(down.menu.bottom).toBeGreaterThan(down.viewport.height);

      // Which of two same-property utilities wins is decided by the order
      // Tailwind emits them in, not by anything in the class list.
      expect(up.menu.top).toBeGreaterThanOrEqual(0);
      expect(up.menu.bottom).toBeLessThanOrEqual(up.viewport.height);

      // Same size both ways, which is what lets a `ResizeObserver` on the
      // panel drive the flip without oscillating.
      expect(up.menu.height).toBeCloseTo(down.menu.height, 0);
      expect(up.menu.width).toBeCloseTo(down.menu.width, 0);

      expect(down.menu.top - down.trigger.bottom).toBeCloseTo(GAP_PX, 1);
      expect(up.trigger.top - up.menu.bottom).toBeCloseTo(GAP_PX, 1);
    });
  }
});

test("grows out of the corner it is pinned to, on both axes", async ({
  page,
}) => {
  // The entry animation scales from the origin, so the origin is what
  // makes the panel look attached to its trigger.
  const down = await open(page, 700, {
    direction: "down",
    align: "right",
    rows: 6,
  });
  const up = await open(page, 700, {
    direction: "up",
    align: "right",
    rows: 6,
  });

  const [downX, downY] = down.menuTransformOrigin.split(" ").map(parseFloat);
  const [upX, upY] = up.menuTransformOrigin.split(" ").map(parseFloat);

  expect(downX).toBeCloseTo(down.menu.width, 0);
  expect(upX).toBeCloseTo(up.menu.width, 0);

  expect(downY).toBeCloseTo(0, 0);
  expect(upY).toBeCloseTo(up.menu.height, 0);
});

test("hangs from the edge the caller asks for", async ({ page }) => {
  const right = await open(page, 700, {
    direction: "down",
    align: "right",
    rows: 6,
  });
  const left = await open(page, 700, {
    direction: "down",
    align: "left",
    rows: 6,
  });

  expect(right.menu.right).toBeCloseTo(right.trigger.right, 0);
  expect(left.menu.left).toBeCloseTo(left.trigger.left, 0);
  // A pair of `toBeCloseTo`s against a trigger narrower than the menu
  // would otherwise let them be the same box.
  expect(left.menu.left).not.toBeCloseTo(right.menu.left, 0);
});
