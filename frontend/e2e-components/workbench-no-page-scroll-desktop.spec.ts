/**
 * The canonical page's workbench on a short window: the page does not scroll,
 * with a panel shown and with no panel shown, and the player's budget is the
 * visible height less the toggle row. Layout is measured in a real browser.
 *
 * Heights are the visible height H of the scroll container (`--rail-avail`),
 * not the window height: the page chrome above it is CHROME_PX.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const CANONICAL = "#inspector-video";
/** Wide enough that the 16:9 frame is limited by the height, not the width. */
const WIDE = 2400;
const CHROME_PX = 48;
const REM = 16;
const HOST = ".media-detail-host";
const REGION = ".media-detail-workbench-grid";
const PANEL_FLOOR = 18 * REM;
/** The row's margin above it and the host's bottom padding, both 1rem. */
const ROW_BLOCK_EXTRA = 2 * REM;

let navigation = 0;

interface OpenOptions {
  /** The visible height H the page is opened at. */
  visible: number;
}

async function open(page: Page, { visible }: OpenOptions) {
  await page.setViewportSize({ width: WIDE, height: visible + CHROME_PX });
  await page.addInitScript(() => {
    localStorage.setItem("workbench-panels", JSON.stringify(["transcript"]));
  });
  await page.goto(`${FIXTURE}?run=${++navigation}&panels=one${CANONICAL}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "inspector-video");
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);
  await expect
    .poll(async () => Math.abs((await visibleArea(page)).visibleHeight - visible))
    .toBeLessThanOrEqual(1);
}

const panelGroup = (page: Page) => page.getByRole("group", { name: "Panels" });

const transcriptCard = (page: Page) =>
  page.locator("section").filter({ has: page.locator("h2", { hasText: "Transcript" }) }).first();

async function transcriptLoaded(page: Page) {
  await expect(page.getByTestId("fixture-transcript").first()).toBeVisible();
}

/** The visible area of the nearest y-scrolling ancestor of the video, or the document. */
async function visibleArea(page: Page) {
  return page.locator("video").first().evaluate((video) => {
    let node = video.parentElement;
    while (node && node !== document.body) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        const r = node.getBoundingClientRect();
        return {
          visibleTop: r.top,
          visibleBottom: r.top + node.clientHeight,
          visibleHeight: node.clientHeight,
          scrolls: node.scrollHeight > node.clientHeight + 1,
        };
      }
      node = node.parentElement;
    }
    const root = document.scrollingElement!;
    return {
      visibleTop: 0,
      visibleBottom: window.innerHeight,
      visibleHeight: window.innerHeight,
      scrolls: root.scrollHeight > root.clientHeight + 1,
    };
  });
}

async function rectOf(locator: ReturnType<Page["locator"]>) {
  return locator.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  });
}

/** The frame: the player's video element, which fills the 16:9 frame. */
const frameRect = (page: Page) => rectOf(page.locator("video").first());

/** The toggle row: the element that holds the Panels group. */
const rowRect = (page: Page) => rectOf(panelGroup(page).locator("xpath=.."));

async function hostCustomProperty(page: Page, name: string): Promise<number> {
  return page.locator(HOST).evaluate(
    (host, property) => parseFloat(getComputedStyle(host).getPropertyValue(property)),
    name,
  );
}

/**
 * `--player-avail` is the visible height less the frame's offset and the row
 * block (the row plus its 2rem). The offset is read from the frame's top,
 * which the fixture renders with no wrapper above it.
 */
async function expectBudgetFormula(page: Page) {
  const area = await visibleArea(page);
  const frame = await frameRect(page);
  const row = await rowRect(page);
  const expected =
    area.visibleHeight - (frame.top - area.visibleTop) - (row.height + ROW_BLOCK_EXTRA);
  expect(
    Math.abs((await hostCustomProperty(page, "--player-avail")) - expected),
  ).toBeLessThanOrEqual(1);
}

async function videoTag(page: Page): Promise<string | undefined> {
  return page.locator("video").first().evaluate(
    (video) => (video as HTMLVideoElement & { __fixtureTag?: string }).__fixtureTag,
  );
}

async function tagVideo(page: Page) {
  await page.locator("video").first().evaluate((video) => {
    (video as HTMLVideoElement & { __fixtureTag?: string }).__fixtureTag = "kept";
  });
}

async function bodyScrollsInside(page: Page): Promise<boolean> {
  return transcriptCard(page).evaluate((element) =>
    [element, ...Array.from(element.querySelectorAll("*"))].some((node) => {
      const overflow = getComputedStyle(node).overflowY;
      return (
        (overflow === "auto" || overflow === "scroll") &&
        node.scrollHeight > node.clientHeight + 1
      );
    }),
  );
}

async function closeTranscript(page: Page) {
  await page.getByRole("button", { name: "Close Transcript" }).click();
  await expect(transcriptCard(page)).toHaveCount(0);
}

async function openTranscript(page: Page) {
  await panelGroup(page).getByRole("button", { name: "Transcript" }).click();
  await expect(transcriptCard(page)).toBeVisible();
}

/* ------------------------------------------------------------------ *
 * A panel shown
 * ------------------------------------------------------------------ */

for (const visible of [320, 400, 560, 700]) {
  test(`SPEC-CORE-106 I1 with a panel shown at H=${visible}px the page does not scroll and the panel is within the visible area`, async ({
    page,
  }) => {
    await open(page, { visible });

    const area = await visibleArea(page);
    const panel = await rectOf(transcriptCard(page));
    expect(area.scrolls).toBe(false);
    expect(panel.bottom).toBeLessThanOrEqual(area.visibleBottom + 1);
  });
}

test("SPEC-CORE-106 I1 with a panel shown on a short window the panel body scrolls inside itself and the page does not", async ({
  page,
}) => {
  await open(page, { visible: 560 });

  expect(await bodyScrollsInside(page)).toBe(true);
  expect((await visibleArea(page)).scrolls).toBe(false);
});

test("SPEC-CORE-106 I5 with a panel shown the panel region ends within the host and has no minimum height", async ({
  page,
}) => {
  await open(page, { visible: 320 });

  const region = await rectOf(page.locator(REGION));
  const host = await rectOf(page.locator(HOST));
  expect(region.bottom).toBeLessThanOrEqual(host.bottom + 1);
  expect(region.height).toBeLessThan(PANEL_FLOOR);
});

test("SPEC-CORE-106 I5 with a panel shown the panel region grows with the window", async ({
  page,
}) => {
  await open(page, { visible: 400 });
  const small = await rectOf(page.locator(REGION));

  await page.setViewportSize({ width: WIDE, height: 700 + CHROME_PX });
  await expect
    .poll(async () => (await rectOf(page.locator(REGION))).height)
    .toBeGreaterThan(small.height + 1);
});

/* ------------------------------------------------------------------ *
 * No panel shown, the toggle row drawn
 * ------------------------------------------------------------------ */

for (const visible of [320, 400, 560, 700, 840]) {
  test(`SPEC-CORE-106 I2 with no panel shown at H=${visible}px the page does not scroll and the toggle row is within the visible area`, async ({
    page,
  }) => {
    await open(page, { visible });
    await closeTranscript(page);

    const area = await visibleArea(page);
    const row = await rowRect(page);
    expect(area.scrolls).toBe(false);
    expect(row.bottom).toBeLessThanOrEqual(area.visibleBottom + 1);
  });

  test(`SPEC-CORE-106 I3 with no panel shown at H=${visible}px the frame ends 1rem above the row and the budget excludes the row`, async ({
    page,
  }) => {
    await open(page, { visible });
    await closeTranscript(page);

    const frame = await frameRect(page);
    const row = await rowRect(page);
    expect(Math.abs(row.top - frame.bottom - REM)).toBeLessThanOrEqual(1);
    await expectBudgetFormula(page);
  });
}

/* ------------------------------------------------------------------ *
 * Transitions and changes of the window
 * ------------------------------------------------------------------ */

test("SPEC-CORE-106 I6 closing the last panel and opening one again keeps the video, and each state fits the page", async ({
  page,
}) => {
  await open(page, { visible: 560 });
  await tagVideo(page);

  await closeTranscript(page);
  let area = await visibleArea(page);
  let row = await rowRect(page);
  expect(area.scrolls).toBe(false);
  expect(row.bottom).toBeLessThanOrEqual(area.visibleBottom + 1);

  await openTranscript(page);
  await transcriptLoaded(page);
  area = await visibleArea(page);
  expect(area.scrolls).toBe(false);
  expect(await videoTag(page)).toBe("kept");
});

test("SPEC-CORE-106 I7 when H shrinks with no panel shown, the frame shrinks and the row stays visible", async ({
  page,
}) => {
  await open(page, { visible: 900 });
  await closeTranscript(page);
  const tall = await frameRect(page);

  await page.setViewportSize({ width: WIDE, height: 560 + CHROME_PX });
  await expect
    .poll(async () => {
      const area = await visibleArea(page);
      const row = await rowRect(page);
      return area.scrolls === false && row.bottom <= area.visibleBottom + 1;
    })
    .toBe(true);
  const short = await frameRect(page);
  expect(short.height).toBeLessThan(tall.height);
  await expectBudgetFormula(page);
});

test("SPEC-CORE-106 I7 when H grows again with no panel shown, the frame grows back to the budget", async ({
  page,
}) => {
  await open(page, { visible: 560 });
  await closeTranscript(page);
  const short = await frameRect(page);

  await page.setViewportSize({ width: WIDE, height: 900 + CHROME_PX });
  await expect
    .poll(async () => (await frameRect(page)).height)
    .toBeGreaterThan(short.height + 1);
  await expectBudgetFormula(page);
});
