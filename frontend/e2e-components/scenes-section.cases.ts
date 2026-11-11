import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  SCENES_LONG_LABEL,
  SCENES_LONG_TEXT,
  SCENES_SHORT_LABEL,
} from "./fixtures/scenesSectionData";

const FIXTURE = pathToFileURL(PAGE).href;
const HOST = "#scenes-host";
const SECTION = `${HOST} > div`;
/** `24rem`, the inspector's width, at the default font size. */
const MAX_SECTION_WIDTH = 384;
const TOLERANCE = 1;

type Pointer = "mouse" | "touch";

export interface ScenesCase {
  hostWidth: number;
  pointer: Pointer;
  /** The 9:46:37 file whose 500 frames end at 4:09:30. */
  long?: boolean;
}

async function open(
  page: Page,
  { hostWidth, pointer, long = false }: ScenesCase,
): Promise<void> {
  const arrangement = `${long ? "scenes-long" : "scenes"}-${hostWidth}`;
  await page.goto(`${FIXTURE}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  expect(
    await page.evaluate(
      (expected) => matchMedia(`(pointer: ${expected})`).matches,
      pointer === "touch" ? "coarse" : "fine",
    ),
  ).toBe(true);

  const header = page.locator(`${HOST} button[aria-expanded]`);
  if (pointer === "touch") await header.tap();
  else await header.click();

  await expect(page.locator(`${HOST} button[aria-label^="Play from"]`)).toHaveCount(
    9,
  );
  await expect(
    page.getByRole("button", { name: "Regenerate scenes" }),
  ).toBeVisible();
}

async function sectionHeight(page: Page): Promise<number> {
  const box = await page.locator(SECTION).boundingBox();
  expect(box).not.toBeNull();
  return box!.height;
}

async function sectionWidth(page: Page): Promise<number> {
  const box = await page.locator(SECTION).boundingBox();
  expect(box).not.toBeNull();
  return box!.width;
}

/** Every element in the section that has more content than its box. */
async function overflowing(page: Page): Promise<string[]> {
  return page.locator(SECTION).evaluate((root) => {
    const nodes: HTMLElement[] = [root as HTMLElement];
    nodes.push(...Array.from(root.querySelectorAll<HTMLElement>("*")));
    return nodes
      .filter((node) => {
        const { overflowX, overflowY } = getComputedStyle(node);
        return (
          overflowX === "auto" ||
          overflowX === "scroll" ||
          overflowY === "auto" ||
          overflowY === "scroll"
        );
      })
      .filter(
        (node) =>
          node.scrollWidth > node.clientWidth ||
          node.scrollHeight > node.clientHeight,
      )
      .map((node) => `${node.tagName.toLowerCase()}.${node.className}`);
  });
}

interface CardReading {
  label: string;
  text: string;
  /** Lines the label shows before the clamp cuts it. */
  labelLines: number;
  /** True when the label's text needs more lines than the clamp shows. */
  labelClipped: boolean;
}

/** The card under the grid, read as the browser laid it out. */
async function card(page: Page): Promise<CardReading> {
  return page.locator(SECTION).evaluate((root) => {
    const button = root.querySelector<HTMLElement>("button.rounded-xl");
    if (!button) throw new Error("no scene card is drawn");
    const [label, text] = Array.from(
      button.querySelectorAll<HTMLElement>(".line-clamp-2"),
    );
    const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
    return {
      label: label.textContent ?? "",
      text: text?.textContent ?? "",
      labelLines: Math.round(label.clientHeight / lineHeight),
      labelClipped: label.scrollHeight > label.clientHeight,
    };
  });
}

/**
 * Moves the point being looked at to `fraction` of the ruler's width. A mouse
 * hovers; a finger taps, which is the only browse a touch environment has.
 */
async function browse(
  page: Page,
  { pointer }: ScenesCase,
  fraction: number,
): Promise<void> {
  const box = await page
    .getByRole("slider", { name: "Frame timeline" })
    .boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * fraction;
  const y = box!.y + box!.height / 2;
  if (pointer === "touch") await page.touchscreen.tap(x, y);
  else await page.mouse.move(x, y);
  // A tap seeks as well, and the playback marker and the card are read from
  // the shared clock's next sample rather than from the event.
  await page.clock.runFor(1_000);
}

/**
 * Takes the mouse off the section. A mouse browse point survives a playback
 * jump while the pointer is inside, so a window move under the pointer is only
 * a window move once browsing has ended; a finger has no hover, and its point
 * ends with the jump itself.
 */
async function stopBrowsing(page: Page, { pointer }: ScenesCase): Promise<void> {
  if (pointer === "touch") return;
  const host = await page.locator(HOST).boundingBox();
  expect(host).not.toBeNull();
  await page.mouse.move(host!.x + host!.width / 2, host!.y + host!.height + 40);
}

export function scenesSectionCases(cases: ScenesCase[]): void {
  test.describe("SPEC-ADDON-089 I5 — the Scenes section never scrolls and keeps its height", () => {
    for (const scenesCase of cases) {
      const { hostWidth, pointer } = scenesCase;
      test(`${hostWidth}px host, ${pointer}`, async ({ page }) => {
        // Fake timers, so the clock sample that moves the window happens when
        // this case says it does.
        await page.clock.install();
        await open(page, scenesCase);

        expect(await sectionWidth(page)).toBeGreaterThan(
          MAX_SECTION_WIDTH - TOLERANCE,
        );
        expect(await sectionWidth(page)).toBeLessThanOrEqual(
          MAX_SECTION_WIDTH + TOLERANCE,
        );
        expect(await overflowing(page)).toEqual([]);

        // Frame 0 holds the scene with no `visible_text`.
        const opened = await sectionHeight(page);
        const first = await card(page);
        expect(first.label).toBe(SCENES_SHORT_LABEL);
        expect(first.text).toBe("");

        // Frame 5: still the same nine tiles, another scene in the card.
        await browse(page, scenesCase, 0.09);
        const browsed = await sectionHeight(page);
        const second = await card(page);
        expect(second.label).toBe(SCENES_LONG_LABEL);
        expect(second.text).toBe(SCENES_LONG_TEXT);
        expect(second.labelLines).toBe(2);
        expect(second.labelClipped).toBe(true);

        // Back to frame 0, still on the same nine tiles.
        await browse(page, scenesCase, 0.005);
        const again = await sectionHeight(page);
        expect((await card(page)).label).toBe(SCENES_SHORT_LABEL);

        await stopBrowsing(page, scenesCase);

        // Frame 18 moves the grid from frames 0–8 to frames 15–23.
        await page.evaluate(() => {
          window.__scenesPlayback.time = 216;
        });
        await page.clock.runFor(1_000);
        const tiles = page.locator(`${HOST} button[aria-label^="Play from"]`);
        await expect(tiles.first()).toHaveAttribute("aria-label", "Play from 3:00");
        // The window's pictures arrive after the section's settle delay.
        await page.clock.runFor(500);
        await expect(tiles.locator("img")).toHaveCount(9);
        const moved = await sectionHeight(page);

        expect(await overflowing(page)).toEqual([]);

        for (const height of [browsed, again, moved]) {
          expect(height).toBeCloseTo(opened, 0);
        }
      });
    }
  });
}

interface LabelBox {
  text: string;
  left: number;
  right: number;
}

interface LabelReading {
  rulerLeft: number;
  rulerRight: number;
  labels: LabelBox[];
}

/** The label row's spans as the browser drew them, against the ruler's box. */
async function timeLabelBoxes(page: Page): Promise<LabelReading> {
  return page.locator(SECTION).evaluate((root) => {
    const slider = root.querySelector<HTMLElement>('[role="slider"]');
    if (!slider) throw new Error("no ruler is drawn");
    const row = slider.nextElementSibling as HTMLElement | null;
    if (!row) throw new Error("no label row is drawn");
    const ruler = slider.getBoundingClientRect();
    return {
      rulerLeft: ruler.left,
      rulerRight: ruler.right,
      labels: Array.from(row.querySelectorAll<HTMLElement>("span")).map(
        (label) => {
          const box = label.getBoundingClientRect();
          return {
            text: label.textContent ?? "",
            left: box.left,
            right: box.right,
          };
        },
      ),
    };
  });
}

export function scenesTimeLabelCases(cases: ScenesCase[]): void {
  test.describe("I11 — the drawn time labels leave 4 px between boxes", () => {
    for (const scenesCase of cases) {
      const { hostWidth, pointer } = scenesCase;
      test(`${hostWidth}px host, ${pointer}`, async ({ page }) => {
        await page.clock.install();
        await open(page, scenesCase);

        const reading = await timeLabelBoxes(page);
        expect(reading.labels.map((label) => label.text)).toEqual(
          expect.arrayContaining(["0:00", "2:00:00", "9:46:37"]),
        );

        for (const label of reading.labels) {
          expect(label.left).toBeGreaterThanOrEqual(reading.rulerLeft - 0.5);
          expect(label.right).toBeLessThanOrEqual(reading.rulerRight + 0.5);
        }
        for (let i = 1; i < reading.labels.length; i += 1) {
          expect(
            reading.labels[i].left - reading.labels[i - 1].right,
          ).toBeGreaterThanOrEqual(4);
        }
      });
    }
  });
}
