import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  SCENES_FRAMES,
  SCENES_LONG_FRAMES,
  SCENES_LONG_LABEL,
  SCENES_LONG_TEXT,
  SCENES_SHORT_LABEL,
} from "./fixtures/scenesSectionData";

const FIXTURE = pathToFileURL(PAGE).href;
const HOST = "#scenes-host";
const SECTION = `${HOST} > div`;
const TOLERANCE = 1;
/** The narrowest tile the spec allows, 7rem at the default font size. */
const MIN_TILE_WIDTH = 112;

type Pointer = "mouse" | "touch";

export interface ScenesCase {
  /** The fixture route's id. */
  route: string;
  hostWidth: number;
  hostHeight: number;
  pointer: Pointer;
  /** Columns the spec's measurement table gives this host. */
  columns: number;
  /** The 9:46:37 file whose 500 frames end at 4:09:30. */
  long?: boolean;
}

async function open(page: Page, scenesCase: ScenesCase): Promise<void> {
  const { route, pointer } = scenesCase;
  await page.goto(`${FIXTURE}#${route}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", route);
  expect(
    await page.evaluate(
      (expected) => matchMedia(`(pointer: ${expected})`).matches,
      pointer === "touch" ? "coarse" : "fine",
    ),
  ).toBe(true);

  const header = page.locator(`${HOST} button[aria-expanded]`);
  if (pointer === "touch") await header.tap();
  else await header.click();

  await expect(
    page.locator(`${HOST} button[aria-label^="Play from"]`).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Regenerate|Create) scenes$/ }),
  ).toBeVisible();
}

/** The section's border box against its host's content box. */
async function fill(page: Page): Promise<{ section: number; host: number }> {
  return page.locator(SECTION).evaluate((section) => ({
    section: section.getBoundingClientRect().width,
    host: (section.parentElement as HTMLElement).clientWidth,
  }));
}

/** Columns as the browser laid them out: one distinct left edge per column. */
async function drawnColumns(page: Page): Promise<number> {
  return page.locator(SECTION).evaluate(
    (section) =>
      new Set(
        Array.from(
          section.querySelectorAll<HTMLElement>('button[aria-label^="Play from"]'),
        ).map((tile) => Math.round(tile.getBoundingClientRect().left)),
      ).size,
  );
}

async function drawnTileWidths(page: Page): Promise<number[]> {
  return page.locator(SECTION).evaluate((section) =>
    Array.from(
      section.querySelectorAll<HTMLElement>('button[aria-label^="Play from"]'),
    ).map((tile) => tile.getBoundingClientRect().width),
  );
}

/** The list's own scroll box, as the browser laid it out. */
async function listReading(page: Page): Promise<{
  overflowY: string;
  gutter: string;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  hostScrollTop: number;
  sectionScrollWidth: number;
  sectionClientWidth: number;
}> {
  return page.locator(SECTION).evaluate((section) => {
    const list = section.querySelector<HTMLElement>("[data-scene-list]")!;
    const host = section.parentElement as HTMLElement;
    return {
      overflowY: getComputedStyle(list).overflowY,
      gutter: getComputedStyle(list).scrollbarGutter,
      clientWidth: list.clientWidth,
      scrollWidth: list.scrollWidth,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      hostScrollTop: host.scrollTop,
      sectionScrollWidth: section.scrollWidth,
      sectionClientWidth: section.clientWidth,
    };
  });
}

/** Ticks drawn on the ruler's single path. */
async function tickCount(page: Page): Promise<number> {
  return page.locator(`${SECTION} [role="slider"] path`).evaluate(
    (path) => ((path.getAttribute("d") ?? "").match(/M/g) ?? []).length,
  );
}

interface CardReading {
  label: string;
  text: string;
  height: number;
  /** Lines the label shows before the clamp cuts it. */
  labelLines: number;
  /** True when the label's text needs more lines than the clamp shows. */
  labelClipped: boolean;
}

/** The scene card under the list, read as the browser laid it out. */
async function card(page: Page): Promise<CardReading> {
  return page.locator(SECTION).evaluate((root) => {
    const button = root.querySelector<HTMLElement>("button.rounded-xl");
    if (!button) throw new Error("no scene card is drawn");
    const [label, text] = Array.from(
      button.querySelectorAll<HTMLElement>(".line-clamp-2"),
    );
    if (!label) {
      return {
        label: button.textContent ?? "",
        text: "",
        height: button.getBoundingClientRect().height,
        labelLines: 1,
        labelClipped: false,
      };
    }
    const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
    return {
      label: label.textContent ?? "",
      text: text?.textContent ?? "",
      height: button.getBoundingClientRect().height,
      labelLines: Math.round(label.clientHeight / lineHeight),
      labelClipped: label.scrollHeight > label.clientHeight,
    };
  });
}

/**
 * Moves the ruler point to `fraction` of the ruler's width. A mouse presses;
 * a finger taps. Neither seeks.
 */
async function pointAt(
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
  else await page.mouse.click(x, y);
  await page.waitForTimeout(100);
}

export function scenesSectionCases(cases: ScenesCase[]): void {
  test.describe("SPEC-ADDON-152 I1 — every frame in one list", () => {
    for (const scenesCase of cases) {
      const { hostWidth, hostHeight, pointer, columns, long = false } = scenesCase;
      test(`${hostWidth}×${hostHeight} host, ${pointer}, ${columns} columns`, async ({
        page,
      }) => {
        await open(page, scenesCase);

        const frames = long ? SCENES_LONG_FRAMES : SCENES_FRAMES;
        const tiles = page.locator(`${HOST} button[aria-label^="Play from"]`);
        await expect(tiles).toHaveCount(frames);

        const width = await fill(page);
        expect(width.section).toBeCloseTo(width.host, 0);
        expect(await drawnColumns(page)).toBe(columns);
        if (columns > 3) {
          for (const tileWidth of await drawnTileWidths(page)) {
            expect(tileWidth).toBeGreaterThanOrEqual(
              MIN_TILE_WIDTH - TOLERANCE,
            );
          }
        }

        const reading = await listReading(page);
        expect(reading.overflowY).toMatch(/auto|scroll/);
        expect(reading.gutter).toContain("stable");
        expect(reading.scrollWidth).toBeLessThanOrEqual(
          reading.clientWidth + 1,
        );
        expect(reading.sectionScrollWidth).toBeLessThanOrEqual(
          reading.sectionClientWidth + 1,
        );
        expect(reading.hostScrollTop, "the host starts unscrolled").toBe(0);
        expect(reading.clientHeight).toBeGreaterThan(0);

        expect(await tickCount(page)).toBe(frames);
      });
    }
  });
}

export interface ScenesCardCase extends ScenesCase {
  oneLine: boolean;
}

export function scenesCardCases(cases: ScenesCardCase[]): void {
  test.describe("SPEC-ADDON-152 I5 — the card's form and the ruler's point", () => {
    for (const scenesCase of cases) {
      const { hostWidth, hostHeight, pointer, oneLine } = scenesCase;
      test(`${hostWidth}×${hostHeight} host, ${pointer}, ${oneLine ? "one line" : "full"}`, async ({
        page,
      }) => {
        await open(page, scenesCase);

        const opened = await card(page);
        expect(opened.label).toContain(SCENES_SHORT_LABEL);
        expect(opened.text).toBe("");
        if (oneLine) {
          expect(opened.height).toBeLessThan((7.6 * 16) / 2);
        } else {
          expect(opened.labelLines).toBe(1);
          expect(opened.height).toBeGreaterThanOrEqual(7.6 * 16 - 0.5);
        }

        await pointAt(page, scenesCase, 0.09);
        const browsed = await card(page);
        expect(browsed.label).toContain(SCENES_LONG_LABEL.slice(0, 24));
        if (oneLine) {
          expect(browsed.text).toBe("");
          expect(browsed.height).toBeLessThan((7.6 * 16) / 2);
        } else {
          expect(browsed.text).toBe(SCENES_LONG_TEXT);
          expect(browsed.labelLines).toBe(2);
          expect(browsed.labelClipped).toBe(true);
        }

        await pointAt(page, scenesCase, 0.005);
        expect((await card(page)).label).toContain(SCENES_SHORT_LABEL);
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
      const { hostWidth, hostHeight, pointer } = scenesCase;
      test(`${hostWidth}×${hostHeight} host, ${pointer}`, async ({ page }) => {
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
