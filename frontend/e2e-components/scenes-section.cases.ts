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
import {
  BOUNDED_STEP,
  settled,
  type ListReading,
} from "./scenes-scroll-list.cases";

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

const TILE = 'button[aria-label^="Play from"]';
const SHARED = "[data-inspector-scroller]";
const PLACEHOLDER = '[data-testid="scenes-visual-placeholder"]';

let navigation = 0;

async function recordFrameRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __frameRequests: number[] };
    store.__frameRequests = [];
    const remember = (node: Node) => {
      if (!(node instanceof HTMLImageElement)) return;
      const match = /[?&]t=(\d+)/.exec(node.getAttribute("src") ?? "");
      if (match) store.__frameRequests.push(Number(match[1]));
    };
    // `document`, not `documentElement`: this runs before the parser has made one.
    new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach(remember);
    }).observe(document, { childList: true, subtree: true });
  });
}

async function frameRequests(page: Page): Promise<number[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __frameRequests: number[] }).__frameRequests.slice(),
  );
}

function bandOf(reading: ListReading, step: number): { left: number; right: number } {
  const firstRow = reading.visibleRows[0];
  const lastRow = reading.visibleRows[reading.visibleRows.length - 1];
  const from = (reading.rowFirstFrame[firstRow] * step) / reading.rulerMax;
  const nextRow = reading.rowFirstFrame[lastRow + 1];
  const to = nextRow === undefined ? 1 : (nextRow * step) / reading.rulerMax;
  return { left: from * 100, right: to * 100 };
}

function expectBandCoversVisible(
  reading: ListReading,
  step: number,
  at: string,
): void {
  expect(reading.band, `${at}: no band is drawn`).not.toBeNull();
  const expected = bandOf(reading, step);
  expect(reading.band!.left, `${at}: band start`).toBeCloseTo(expected.left, 0);
  expect(reading.band!.right, `${at}: band end`).toBeCloseTo(expected.right, 0);
}

function unrequestedRows(
  reading: ListReading,
  step: number,
  requested: number[],
): number[] {
  return reading.visibleRows.filter(
    (row) => !requested.includes(reading.rowFirstFrame[row] * step),
  );
}

async function openFlow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#scenes-flow`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "scenes-flow",
  );
  await expect(page.locator(TILE).first()).toBeVisible();
}

async function openPending(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#scenes-bounded-pending`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "scenes-bounded-pending",
  );
  await expect(page.locator(TILE).first()).toBeVisible();
  await expect(page.locator(PLACEHOLDER)).toBeVisible();
}

async function placeholderHeights(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(
    (duration) =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        const start = performance.now();
        const tick = () => {
          const placeholder = document.querySelector<HTMLElement>(
            '[data-testid="scenes-visual-placeholder"]',
          );
          if (placeholder) {
            seen.push(
              Math.round(placeholder.getBoundingClientRect().height * 100) / 100,
            );
          }
          if (performance.now() - start < duration) requestAnimationFrame(tick);
          else resolve(seen);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

export function scenesPlacementCases(): void {
  test("SPEC-ADDON-152 I8, SPEC-ADDON-153 I6 — growing a bounded host without a scroll shows the new rows in the band and asks for their pictures", async ({
    page,
  }) => {
    await recordFrameRequests(page);
    await page.goto(`${FIXTURE}?run=${++navigation}#scenes-bounded-1024`);
    await expect(page.locator(TILE).first()).toBeVisible();
    const before = await settled(page, BOUNDED_STEP);
    expect(before.visibleRows.length).toBeGreaterThan(1);

    await page.evaluate(() => {
      document.getElementById("scenes-host")!.style.height = "1400px";
    });
    const after = await settled(page, BOUNDED_STEP);
    await page.waitForTimeout(300);

    expect(after.visibleRows.length).toBeGreaterThan(before.visibleRows.length);
    expect(after.list!.scrollTop, "the resize scrolled the list").toBe(
      before.list!.scrollTop,
    );
    expectBandCoversVisible(after, BOUNDED_STEP, "after the bounded host grew");

    const requested = await frameRequests(page);
    const newlyVisible = after.visibleRows.filter(
      (row) => !before.visibleRows.includes(row),
    );
    expect(newlyVisible.length).toBeGreaterThan(0);
    expect(unrequestedRows(after, BOUNDED_STEP, requested)).toEqual([]);
  });

  test("SPEC-ADDON-153 I6, SPEC-ADDON-152 I8 — growing the flow scroller without a scroll shows the new rows in the band and asks for their pictures", async ({
    page,
  }) => {
    await recordFrameRequests(page);
    await openFlow(page);
    const before = await settled(page, BOUNDED_STEP);
    expect(before.form).toBe("flow");
    expect(before.visibleRows.length).toBeGreaterThan(0);

    await page.evaluate(
      ([selector]) => {
        (document.querySelector(selector) as HTMLElement).style.height = "700px";
      },
      [SHARED] as const,
    );
    const after = await settled(page, BOUNDED_STEP);
    await page.waitForTimeout(300);

    expect(after.visibleRows.length).toBeGreaterThan(before.visibleRows.length);
    expect(after.host.scrollTop, "the resize scrolled the section").toBe(
      before.host.scrollTop,
    );
    expectBandCoversVisible(after, BOUNDED_STEP, "after the flow scroller grew");

    const requested = await frameRequests(page);
    const newlyVisible = after.visibleRows.filter(
      (row) => !before.visibleRows.includes(row),
    );
    expect(newlyVisible.length).toBeGreaterThan(0);
    expect(unrequestedRows(after, BOUNDED_STEP, requested)).toEqual([]);
  });

  test("SPEC-ADDON-152 I5 — the placeholder never changes form while the Visual Index answer is outstanding", async ({
    page,
  }) => {
    await openPending(page);

    for (const height of [320, 360, 400, 440, 480, 520]) {
      await page.evaluate((value) => {
        document.getElementById("scenes-host")!.style.height = `${value}px`;
      }, height);
      await page.waitForTimeout(200);
      const heights = await placeholderHeights(page, 600);
      expect(heights.length, `host ${height}px: no frame drew it`).toBeGreaterThan(
        20,
      );
      expect(
        Array.from(new Set(heights)),
        `host ${height}px: the placeholder changes form`,
      ).toHaveLength(1);
    }
  });

  test("SPEC-ADDON-152 I10 — in flow form the pinned card's box reaches the scroller's bottom edge", async ({
    page,
  }) => {
    await openFlow(page);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
    await expect(page.locator(`${SHARED} button.rounded-xl`).first()).toBeVisible();

    await page.evaluate(([selector]) => {
      const scroller = document.querySelector<HTMLElement>(selector)!;
      scroller.scrollTop = Math.floor(
        (scroller.scrollHeight - scroller.clientHeight) / 2,
      );
    }, [SHARED] as const);
    await page.waitForTimeout(200);

    const reading = await page.evaluate(
      ([selector]) => {
        const scroller = document.querySelector<HTMLElement>(selector)!;
        const button = Array.from(
          scroller.querySelectorAll<HTMLElement>("button.rounded-xl"),
        ).find((el) => el.getBoundingClientRect().height > 0);
        if (!button) throw new Error("no scene card is drawn");
        const cardBox = button.parentElement as HTMLElement;
        return {
          paddingBottom: Number.parseFloat(
            getComputedStyle(scroller).paddingBottom,
          ),
          cardBoxBottom: cardBox.getBoundingClientRect().bottom,
          scrollerBottom:
            scroller.getBoundingClientRect().top +
            scroller.clientTop +
            scroller.clientHeight,
          scrolled: scroller.scrollTop,
        };
      },
      [SHARED] as const,
    );

    expect(reading.paddingBottom, "the scroller has no bottom strip").toBe(16);
    expect(reading.scrolled, "the scroller did not move").toBeGreaterThan(0);
    expect(
      Math.abs(reading.cardBoxBottom - reading.scrollerBottom),
      "the card's box ends above the scroller's bottom",
    ).toBeLessThanOrEqual(1);
  });

}
