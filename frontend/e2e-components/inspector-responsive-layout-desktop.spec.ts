/**
 * The responsive inspector, in a real browser. The file page is the real
 * `FileDetailContent` with the real player and inspector, on its own and
 * inside the real `TwoPaneLayout`; jsdom lays nothing out, so every invariant
 * here is about geometry only a browser can produce.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const VIDEO = "#inspector-video";
const PDF = "#inspector-pdf";
const TWO_PANE = "#inspector-video-two-pane";

const PLAYER_FILE = { width: 1180, height: 820 };

let navigation = 0;

async function open(page: Page, hash: string) {
  await page.goto(`${FIXTURE}?run=${++navigation}${hash}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    hash.slice(1),
  );
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
}

async function openTwoPane(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() =>
    localStorage.setItem("tree:enabled:fixture", "true"),
  );
  await open(page, TWO_PANE);
  await expect(page.getByTestId("inspector-pane")).toBeVisible();
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

function box(page: Page, selector: string): Promise<Box | null> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const r = element.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      };
    })
    .catch(() => null);
}

async function rowBox(page: Page): Promise<Box> {
  const row = await box(page, '[data-testid="inspector-fit-host"]');
  expect(row).not.toBeNull();
  return row!;
}

/**
 * Records the form the row carries on every frame, before the page is
 * mounted. A form that exists for a single frame is what "no stacked frame"
 * is about, and a final-state check cannot see one.
 */
function recordFitFrames(page: Page) {
  return page.addInitScript(() => {
    const frames: {
      fit: string | null;
      rowWidth: number | null;
      pane: number | null;
    }[] = [];
    (window as unknown as { __fitFrames: typeof frames }).__fitFrames = frames;
    const tick = () => {
      const row = document.querySelector<HTMLElement>(
        '[data-testid="inspector-fit-host"]',
      );
      const aside = document.querySelector<HTMLElement>(
        'aside[aria-label="Folder tree"]',
      );
      frames.push({
        fit: row ? (row.dataset.inspectorFit ?? null) : "none",
        rowWidth: row ? row.clientWidth : null,
        pane: aside ? aside.offsetWidth : null,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const fitFrames = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __fitFrames: { fit: string | null }[] })
        .__fitFrames,
  );

/** The form each frame carried, in order, with repeats collapsed. */
async function fitRun(page: Page): Promise<(string | null)[]> {
  const frames = await fitFrames(page);
  return frames
    .map((frame) => frame.fit)
    .filter((value, index, all) => all[index - 1] !== value);
}

const inspectorToggle = (page: Page) => page.getByTestId("inspector-toggle");

const layoutToggle = (page: Page) =>
  page.locator(
    '[aria-label="Move transcript below the player"], [aria-label="Move transcript beside the player"]',
  );

/**
 * The sheet's snap is a transition, so its box is still moving when the
 * drawer becomes visible; measuring mid-travel compares two different frames.
 */
async function settleBox(page: Page, selector: string) {
  await expect
    .poll(
      async () => {
        const before = await box(page, selector);
        await page.waitForTimeout(80);
        const after = await box(page, selector);
        return Math.abs(before!.top - after!.top) < 0.5;
      },
      { intervals: [100] },
    )
    .toBe(true);
}

async function descriptionInCanvas(page: Page): Promise<boolean> {
  return page.locator("main").evaluate((main) =>
    main.textContent!.includes("Recorded on location."),
  );
}

async function descriptionInInfo(page: Page): Promise<boolean> {
  return page.locator("#inspector-panel-info").evaluate((info) =>
    info.textContent!.includes("Recorded on location."),
  );
}

async function expectHeaderInInfo(page: Page) {
  const info = page.locator("#inspector-panel-info");
  await expect(info.locator("h1")).toHaveText("Fixture clip");
  await expect(info.getByTestId("file-action-row")).toBeVisible();
  await expect(info.locator('span[title="design"]')).toBeVisible();
}

async function expectStripFirst(page: Page) {
  const shell = page.getByTestId("inspector-shell");
  const firstChild = await shell.evaluate(
    (element) => element.firstElementChild?.getAttribute("data-testid") ?? null,
  );
  expect(firstChild).toBe("inspector-tabs");
  const strip = await box(page, '[data-testid="inspector-tabs"]');
  const shellBox = await box(page, '[data-testid="inspector-shell"]');
  expect(strip!.top).toBeCloseTo(shellBox!.top, 0);
}

/* ------------------------------------------------------------------ *
 * I1 — the strip is the inspector's first row and the header is Info's
 * first block, on every surface.
 * ------------------------------------------------------------------ */

test("the pane at 1180×820: the strip is the first row and the header is at the top of Info", async ({
  page,
}) => {
  await page.setViewportSize(PLAYER_FILE);
  await open(page, VIDEO);
  await expect(page.getByTestId("inspector-pane")).toBeVisible();

  await expectStripFirst(page);
  await expectHeaderInInfo(page);

  const strip = await box(page, '[data-testid="inspector-tabs"]');
  const title = await box(page, "#inspector-panel-info h1");
  expect(title!.top).toBeGreaterThanOrEqual(strip!.bottom);

  await page.getByRole("tab", { name: "Transcript" }).click();
  await expect(page.locator("#inspector-panel-info")).toBeHidden();
  await expect(page.locator("#inspector-panel-info h1")).toBeHidden();
  await expect(
    page.locator("#inspector-panel-info [data-testid='file-action-row']"),
  ).toBeHidden();
  await expect(
    page.locator("#inspector-panel-info span[title='design']"),
  ).toBeHidden();

  await page.getByRole("tab", { name: "Info" }).click();
  await expectHeaderInInfo(page);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 744, height: 1133 },
] as const) {
  test(`the sheet at ${viewport.width}×${viewport.height}: the resting strip is the name and the actions`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await open(page, VIDEO);

    const strip = page.getByTestId("mobile-inspector-peek");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Fixture clip");
    await expect(strip.getByTestId("file-action-row")).toBeVisible();

    const stripBox = (await box(page, '[data-testid="mobile-inspector-peek"]'))!;
    expect(stripBox.bottom).toBeCloseTo(viewport.height, 0);
    await expect(page.getByTestId("inspector-pane")).toHaveCount(0);
  });

  test(`the sheet at ${viewport.width}×${viewport.height}: the strip is the first row under the grabber, the header is in Info`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await open(page, VIDEO);

    await inspectorToggle(page).click();
    await expect(page.getByTestId("mobile-inspector-sheet")).toBeVisible();
    await settleBox(page, '[data-testid="mobile-inspector-sheet"]');

    const grabber = (await box(page, "[data-vaul-handle]"))!;
    const stripBox = (await box(page, '[data-testid="inspector-tabs"]'))!;
    expect(stripBox.top).toBeCloseTo(grabber.bottom, 0);

    await expectStripFirst(page);
    await expectHeaderInInfo(page);

    const stickyTop = await page
      .getByTestId("inspector-shell")
      .evaluate((shell) =>
        getComputedStyle(shell).getPropertyValue("--inspector-sticky-top"),
      );
    const stripHeight = (await box(page, '[data-testid="inspector-tabs"]'))!;
    expect(stickyTop.trim()).toBe(`${stripHeight.height}px`);
  });
}

/* ------------------------------------------------------------------ *
 * I3 — the stacked layout keeps the inspector off the player, the
 * controls on screen, the frame at most half the row and the inspector at
 * least 40% of it.
 * ------------------------------------------------------------------ */

const STACKED_VIEWPORTS = [
  { width: 820, height: 1180 },
  { width: 900, height: 700 },
  { width: 1133, height: 650 },
] as const;

async function expectStacked(page: Page) {
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "stacked",
  );
  const row = await rowBox(page);
  const pane = (await box(page, '[data-testid="inspector-pane"]'))!;
  const frame = (await box(page, '[data-testid="player-frame"]'))!;
  const canvas = (await box(page, "main"))!;
  const controls = (await box(
    page,
    '[data-testid="control-bar"], [data-testid="compact-controls-root"]',
  ))!;
  const viewport = page.viewportSize()!;

  // A collapsed player is what an unmeasurable cap produces; a zero-height
  // frame satisfies every "does not overlap" check trivially.
  expect(frame.height).toBeGreaterThan(0);
  expect(frame.width).toBeGreaterThan(0);

  expect(pane.top).toBeGreaterThanOrEqual(canvas.bottom - 1);
  expect(frame.bottom).toBeLessThanOrEqual(pane.top + 1);

  expect(frame.height).toBeLessThanOrEqual(row.height / 2 + 1);
  expect(pane.height).toBeGreaterThanOrEqual(row.height * 0.4 - 1);

  expect(controls.top).toBeGreaterThanOrEqual(0);
  expect(controls.bottom).toBeLessThanOrEqual(viewport.height);
  expect(controls.bottom).toBeLessThanOrEqual(frame.bottom + 1);

  await expect(layoutToggle(page)).toHaveCount(0);
  expect(await descriptionInCanvas(page)).toBe(false);
  expect(await descriptionInInfo(page)).toBe(true);
  await expect(inspectorToggle(page).locator("svg")).toHaveClass(
    /lucide-panel-bottom-close/,
  );
}

for (const viewport of STACKED_VIEWPORTS) {
  test(`the stacked layout at ${viewport.width}×${viewport.height} with the tree reopened`, async ({
    page,
  }) => {
    await openTwoPane(page, viewport);
    await page.getByRole("button", { name: "Show tree" }).click();
    await expect(page.locator('aside[aria-label="Folder tree"]')).toHaveCSS(
      "width",
      "280px",
    );

    await expectStacked(page);
    // Nothing stored: the inspector is open because the file has a player.
    expect(
      await page.evaluate(() => localStorage.getItem("inspector-open:fixture")),
    ).toBeNull();
  });

  test(`the stacked layout at ${viewport.width}×${viewport.height} keeps the controls on screen with find open`, async ({
    page,
  }) => {
    await openTwoPane(page, viewport);
    await page.getByRole("button", { name: "Show tree" }).click();
    await expect(page.locator('aside[aria-label="Folder tree"]')).toHaveCSS(
      "width",
      "280px",
    );

    await page.getByTestId("find-button").click();
    await expect(page.getByTestId("find-bar")).toBeVisible();

    await expectStacked(page);

    const findBar = (await box(page, '[data-testid="find-bar"]'))!;
    const frame = (await box(page, '[data-testid="player-frame"]'))!;
    expect(findBar.bottom).toBeLessThanOrEqual(frame.top + 1);
    expect(findBar.top).toBeGreaterThanOrEqual(0);
  });
}

/* ------------------------------------------------------------------ *
 * I7 — a row that fits without the pane goes to beside with no stacked
 * frame drawn; a row that does not goes straight to stacked.
 * ------------------------------------------------------------------ */

for (const viewport of [
  { width: 1180, height: 820 },
  { width: 1100, height: 800 },
] as const) {
  test(`a ${viewport.width}×${viewport.height} row fits beside the pane: no stacked frame is painted`, async ({
    page,
  }) => {
    await recordFitFrames(page);
    await openTwoPane(page, viewport);

    await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
      "data-inspector-fit",
      "beside",
    );
    const run = await fitRun(page);
    expect(run[0]).toBe("none");
    expect(run).not.toContain("stacked");
    expect(run).not.toContain("overlay");
    expect(run).toContain("beside");

    const widths = await page.evaluate(() =>
      (
        window as unknown as {
          __fitFrames: { rowWidth: number | null; pane: number | null }[];
        }
      ).__fitFrames
        .filter((frame) => frame.rowWidth !== null)
        .map((frame) => frame.pane),
    );
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) expect(width).toBe(0);
  });
}

test("a 900×700 row does not fit beside the pane: the first measured form is stacked", async ({
  page,
}) => {
  await recordFitFrames(page);
  await openTwoPane(page, { width: 900, height: 700 });

  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "stacked",
  );
  const run = await fitRun(page);
  expect(run[0]).toBe("none");
  expect(run).toEqual(["none", "stacked"]);
  await expect(page.locator('aside[aria-label="Folder tree"]')).toHaveCSS(
    "width",
    "0px",
  );
});

test("a direct load yields the tree, and the tree button shows it without writing the setting", async ({
  page,
}) => {
  await openTwoPane(page, PLAYER_FILE);
  const pane = page.locator('aside[aria-label="Folder tree"]');
  await expect(pane).toHaveCSS("width", "0px");
  const stored = await page.evaluate(() =>
    localStorage.getItem("tree:enabled:fixture"),
  );

  await page.getByRole("button", { name: "Show tree" }).click();

  await expect(pane).toHaveCSS("width", "280px");
  expect(
    await page.evaluate(() => localStorage.getItem("tree:enabled:fixture")),
  ).toBe(stored);
});

/* ------------------------------------------------------------------ *
 * I2 — the player survives the form change: the same element, still at
 * its playback position.
 * ------------------------------------------------------------------ */

test("the player element and its position survive a resize from beside to stacked", async ({
  page,
}) => {
  await page.setViewportSize(PLAYER_FILE);
  await open(page, VIDEO);
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "beside",
  );

  await page.locator("video").evaluate((element) => {
    const video = element as HTMLVideoElement & { __probe?: string };
    video.currentTime = 1.5;
    video.__probe = "same";
    (window as unknown as { __video: HTMLVideoElement }).__video = video;
    const pane = document.querySelector('[data-testid="inspector-pane"]')!;
    (window as unknown as { __pane: Element }).__pane = pane;
  });
  await page.waitForFunction(() => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    return video !== null && Math.abs(video.currentTime - 1.5) < 0.2;
  });

  await page.setViewportSize({ width: 820, height: 820 });
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "stacked",
  );

  const after = await page.evaluate(() => {
    const video = document.querySelector("video") as HTMLVideoElement & {
      __probe?: string;
    };
    const w = window as unknown as {
      __video: HTMLVideoElement;
      __pane: Element;
    };
    return {
      sameVideo: video === w.__video,
      probe: video.__probe,
      currentTime: video.currentTime,
      samePane:
        document.querySelector('[data-testid="inspector-pane"]') === w.__pane,
    };
  });

  expect(after.sameVideo).toBe(true);
  expect(after.probe).toBe("same");
  expect(after.currentTime).toBeCloseTo(1.5, 1);
  expect(after.samePane).toBe(true);
});

test("find with the inspector closed in a stacked row restores the canvas scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() =>
    localStorage.setItem("inspector-open:fixture", "false"),
  );
  await open(page, VIDEO);
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "stacked",
  );

  await page
    .getByRole("button", { name: "Move transcript below the player" })
    .click();
  await expect(
    page.locator('.media-detail-below [data-testid="fixture-transcript"]'),
  ).toBeVisible();

  const canvas = page.locator("main");
  await canvas.evaluate((element) => {
    element.scrollTop = 300;
  });
  await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBe(
    300,
  );

  await page.getByTestId("find-button").click();
  await expect(page.getByTestId("find-bar")).toBeVisible();
  await page.getByRole("textbox", { name: "Search term" }).fill("transcript");
  await expect(page.getByTestId("inspector-pane")).toBeVisible();

  await page.getByRole("button", { name: "Close find" }).click();

  await expect(page.getByTestId("inspector-pane")).toHaveCount(0);
  await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBe(
    300,
  );
});

/* ------------------------------------------------------------------ *
 * I6 — a file without a player never stacks; in a narrow row its
 * inspector is the overlay it has always been.
 * ------------------------------------------------------------------ */

test("a PDF at 900×700 gets the overlay, not the stacked layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() =>
    localStorage.setItem("inspector-open:fixture", "true"),
  );
  await open(page, PDF);
  await expect(page.locator("text=Quarterly report")).toBeVisible();

  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "overlay",
  );

  const row = await rowBox(page);
  const pane = (await box(page, '[data-testid="inspector-pane"]'))!;
  const canvas = (await box(page, "main"))!;

  const position = await page
    .getByTestId("inspector-pane")
    .evaluate((pane) => getComputedStyle(pane).position);
  expect(position).toBe("absolute");
  expect(canvas.width).toBeCloseTo(row.width, 0);
  expect(pane.right).toBeCloseTo(row.right, 0);
  expect(pane.left).toBeLessThan(canvas.right);
  expect(pane.top).toBeCloseTo(row.top, 0);
  await expect(inspectorToggle(page).locator("svg")).toHaveClass(
    /lucide-panel-right-close/,
  );
});
