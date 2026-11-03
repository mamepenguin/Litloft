/**
 * SPEC-CORE-030 I13 — where the upload drawer sits while something else
 * owns the bottom of the screen, measured in Chromium.
 *
 * The drawer's own class list is held to `UploadProgress.tsx`, because this
 * page is hand-written and jsdom lays nothing out.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { SHEET_PEEK_PX } from "../src/lib/sheetSnap";

const FIXTURE_PATH = resolve(__dirname, "fixtures", "upload-drawer.html");
const FIXTURE = pathToFileURL(FIXTURE_PATH).href;

const SPEC: {
  peekHeightPx: number;
  miniPlayerHeightPx: number;
  miniPlayerGapPx: number;
  drawerBottomPx: number;
  peekStrip: string;
  miniPlayer: string;
  drawer: string;
  drawerCard: string;
  sheetSurface: string;
} = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const COMPONENT = readFileSync(
  resolve(__dirname, "../src/components/UploadProgress.tsx"),
  "utf8",
);

interface Arrangement {
  player: boolean;
  sheet: "none" | "peek" | "half" | "full";
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface Measurement {
  drawer: Box | null;
  player: Box | null;
  bar: Box | null;
  sheet: Box | null;
  viewport: { width: number; height: number };
}

declare global {
  interface Window {
    arrange: (arrangement: Arrangement) => void;
  }
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function arrange(
  page: Page,
  width: number,
  height: number,
  arrangement: Arrangement,
): Promise<Measurement> {
  await page.setViewportSize({ width, height });
  await page.goto(FIXTURE);
  await page.evaluate((a) => window.arrange(a), arrangement);
  await expect(page.locator("#page[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => {
    const box = (selector: string): Box | null => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || element.hidden) return null;
      const { top, bottom, left, right, width, height } =
        element.getBoundingClientRect();
      return { top, bottom, left, right, width, height };
    };
    return {
      drawer: box("#upload-drawer"),
      player: box("#mini-player"),
      bar: box("#peek-strip"),
      sheet: box("#sheet"),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

/** Where the drawer shares the bottom of the screen with something else. */
const SHARED = [
  { width: 1440, height: 900, player: true, sheet: "none" },
  { width: 390, height: 844, player: true, sheet: "peek" },
  { width: 390, height: 844, player: false, sheet: "peek" },
] as const satisfies ReadonlyArray<{ width: number; height: number } & Arrangement>;
expect(SHARED).toHaveLength(3);
expect(SHARED.filter((c) => c.width === 1440)).toHaveLength(1);
expect(SHARED.filter((c) => c.player)).toHaveLength(2);
expect(SHARED.filter((c) => c.sheet === "peek")).toHaveLength(2);

/** Where the inspector is open, so its own bar is not the bottom of the page. */
const OPEN_SHEET = [
  { width: 390, height: 844, player: true, sheet: "half" },
  { width: 390, height: 844, player: true, sheet: "full" },
] as const satisfies ReadonlyArray<{ width: number; height: number } & Arrangement>;
expect(OPEN_SHEET).toHaveLength(2);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FIXTURE);
});

test.describe("SPEC-CORE-030 I13 — the drawer keeps clear of the player and the bar", () => {
  for (const arrangement of SHARED) {
    test(`${arrangement.width}x${arrangement.height}, player ${arrangement.player ? "shown" : "hidden"}, sheet ${arrangement.sheet}`, async ({
      page,
    }) => {
      const m = await arrange(
        page,
        arrangement.width,
        arrangement.height,
        arrangement,
      );

      expect(m.viewport).toEqual({
        width: arrangement.width,
        height: arrangement.height,
      });
      expect(m.drawer).not.toBeNull();
      const drawer = m.drawer!;
      expect(drawer.height).toBeGreaterThan(0);
      expect(drawer.top).toBeGreaterThanOrEqual(0);
      expect(drawer.bottom).toBeLessThanOrEqual(arrangement.height + 1);

      if (arrangement.player) {
        expect(m.player).not.toBeNull();
        expect(m.player!.height).toBeCloseTo(SPEC.miniPlayerHeightPx, 0);
        expect(overlaps(drawer, m.player!)).toBe(false);
        expect(drawer.bottom).toBeLessThanOrEqual(m.player!.top + 1);
      } else {
        expect(m.player).toBeNull();
      }

      if (arrangement.sheet === "peek") {
        expect(m.bar).not.toBeNull();
        expect(m.bar!.height).toBeCloseTo(SPEC.peekHeightPx, 0);
        expect(overlaps(drawer, m.bar!)).toBe(false);
        expect(drawer.bottom).toBeLessThanOrEqual(m.bar!.top + 1);
      } else {
        expect(m.bar).toBeNull();
      }

      expect(m.sheet).toBeNull();
    });
  }
});

test.describe("SPEC-CORE-030 I13 — the drawer is not drawn under an open inspector", () => {
  for (const arrangement of OPEN_SHEET) {
    test(`390x844 with the sheet at ${arrangement.sheet}`, async ({ page }) => {
      const m = await arrange(
        page,
        arrangement.width,
        arrangement.height,
        arrangement,
      );

      expect(m.sheet).not.toBeNull();
      expect(m.sheet!.height).toBeGreaterThan(0);
      expect(m.drawer).toBeNull();
    });
  }
});

test("SPEC-CORE-030 I13 — the fixture draws the drawer where the component puts it", () => {
  const POSITIONING =
    /^(fixed|absolute|sticky|relative|inset-.+|top-.+|bottom-.+|left-.+|right-.+|z-.+)$/;
  const positioningOf = (classList: string): string[] =>
    classList.split(/\s+/).filter((token) => POSITIONING.test(token));

  const root = /className="((?:fixed|absolute)[^"]*)"/.exec(COMPONENT);
  expect(root, "UploadProgress no longer declares a fixed root").not.toBeNull();

  expect(positioningOf(SPEC.drawer)).toEqual(
    expect.arrayContaining(positioningOf(root![1])),
  );
  expect(SPEC.peekHeightPx).toBe(SHEET_PEEK_PX);
});
