/**
 * What is drawn on top of a player pinned for pseudo-fullscreen on a phone
 * file page, with the app's own stylesheet.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "pseudo-fullscreen.html"),
).href;

type Sheet = "peek" | "full";

interface FrameHits {
  rect: { top: number; left: number; width: number; height: number };
  viewport: { width: number; height: number };
  playerZ: string;
  hits: Record<string, string>;
}

declare global {
  interface Window {
    buildPinnablePage: (spec: { sheet: Sheet; pinned: boolean; marked: boolean }) => void;
    hitTheFrame: () => FrameHits;
    hitOverThePlayer: () => { overlap: boolean; hit: string };
  }
}

const SHEETS: Sheet[] = ["peek", "full"];

/** What covers the unmarked frame's bottom edge. */
const COVERS_THE_BOTTOM: Record<Sheet, string> = {
  peek: "strip",
  full: "sheet-surface",
};

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

async function build(
  page: import("@playwright/test").Page,
  spec: { sheet: Sheet; pinned: boolean; marked: boolean },
) {
  await page.goto(FIXTURE);
  await page.evaluate((s) => window.buildPinnablePage(s), spec);
}

for (const sheet of SHEETS) {
  test(`a marked pinned frame is on top everywhere, with the sheet at ${sheet}`, async ({
    page,
  }) => {
    await build(page, { sheet, pinned: true, marked: true });
    const m = await page.evaluate(() => window.hitTheFrame());

    expect(m.rect).toMatchObject({ top: 0, left: 0 });
    expect(m.rect.width).toBe(m.viewport.width);
    expect(m.rect.height).toBe(m.viewport.height);
    expect(m.hits).toEqual({
      topLeft: "frame",
      topRight: "frame",
      bottomLeft: "frame",
      bottomRight: "frame",
      centre: "frame",
      bottomMiddle: "frame",
      underMenuButton: "frame",
      underToast: "toast",
    });
    expect(m.playerZ).toBe("60");
  });

  test(`an unmarked pinned frame is covered, with the sheet at ${sheet}`, async ({
    page,
  }) => {
    // The page reproduces the defect: without the mark the player stays at
    // its sticky level.
    await build(page, { sheet, pinned: true, marked: false });
    const m = await page.evaluate(() => window.hitTheFrame());

    expect(m.playerZ).toBe("10");
    expect(m.hits.topLeft).toBe("header");
    expect(m.hits.underMenuButton).toBe("menu-button");
    expect(m.hits.bottomMiddle).toBe(COVERS_THE_BOTTOM[sheet]);
  });

  test(`an inline player stays under the ${sheet === "peek" ? "strip" : "sheet"}`, async ({
    page,
  }) => {
    await build(page, { sheet, pinned: false, marked: false });
    if (sheet === "peek") {
      // The strip only reaches the player once the page is scrolled to put
      // the player's bottom behind it; pin the player low instead.
      await page.evaluate(() => {
        const canvas = document.getElementById("canvas")!;
        canvas.style.paddingTop = `${window.innerHeight - 120}px`;
      });
    }
    const m = await page.evaluate(() => ({
      playerZ: getComputedStyle(document.getElementById("player")!).zIndex,
      over: window.hitOverThePlayer(),
    }));

    expect(m.playerZ).toBe("10");
    expect(m.over).toEqual({
      overlap: true,
      hit: sheet === "peek" ? "strip" : "sheet-surface",
    });
  });
}
