/**
 * The workbench under the player, measured in a real browser: the panel
 * height, the player cap, the columns, and the three-line description.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { COMPACT_MAX_WIDTH } from "../src/components/player/MediaControls/layout";
import { CANVAS_PADDING_REM } from "../src/lib/layoutSizes";

const FIXTURE = pathToFileURL(PAGE).href;
const CANONICAL = "#inspector-video";
const COLLECTION = "#inspector-video-collection";
const REM = 16;
const PANEL_FLOOR = 18 * REM;
const COLUMNS_FROM = 41 * REM;

const LONG_DESCRIPTION = Array.from(
  { length: 24 },
  (_, i) => `Sentence ${i + 1} of a description that runs well past three lines.`,
).join(" ");

const MEDIUM_DESCRIPTION =
  "A description that fits in two lines on a desktop window but needs more " +
  "than three once the window is as narrow as a phone held upright, so the " +
  "button appears only after the resize.";

let navigation = 0;

interface OpenOptions {
  stored?: unknown;
  panels?: "one" | "two" | "four";
  description?: string;
  inspectorOpen?: boolean;
  /** The raw `workbench-player-focus` value; left alone when undefined. */
  focus?: string;
  actions?: boolean;
}

async function open(page: Page, hash: string, options: OpenOptions = {}) {
  const { stored, panels = "one", description, inspectorOpen, focus, actions } =
    options;
  await page.addInitScript(
    ({ stored, inspectorOpen, focus }) => {
      if (stored !== undefined) {
        localStorage.setItem("workbench-panels", JSON.stringify(stored));
      }
      if (inspectorOpen !== undefined) {
        localStorage.setItem("inspector-open:fixture", String(inspectorOpen));
      }
      if (focus !== undefined) {
        localStorage.setItem("workbench-player-focus", focus);
      }
    },
    { stored, inspectorOpen, focus },
  );
  const query = new URLSearchParams({ run: String(++navigation), panels });
  if (description) query.set("description", description);
  if (actions) query.set("actions", "1");
  await page.goto(`${FIXTURE}?${query}${hash}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    hash.slice(1),
  );
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

async function box(page: Page, selector: string, index = 0): Promise<Box> {
  return page
    .locator(selector)
    .nth(index)
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
    });
}

const panelGroup = (page: Page) => page.getByRole("group", { name: "Panels" });

const card = (page: Page, label: string) =>
  page.locator("section").filter({ has: page.locator("h2", { hasText: label }) });

async function cardBox(page: Page, label: string): Promise<Box> {
  const handle = card(page, label).first();
  await expect(handle).toBeVisible();
  return handle.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  });
}

/** The nearest ancestor of the card that scrolls on the y axis, or the document. */
async function scrollContainer(page: Page, label: string) {
  return card(page, label)
    .first()
    .evaluate((element) => {
      let node = element.parentElement;
      while (node && node !== document.body) {
        const overflow = getComputedStyle(node).overflowY;
        if (
          (overflow === "auto" || overflow === "scroll") &&
          node.querySelector("video")
        ) {
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

/** True when something inside the card scrolls its own content on the y axis. */
async function bodyScrollsInside(page: Page, label: string): Promise<boolean> {
  return card(page, label)
    .first()
    .evaluate((element) =>
      [element, ...Array.from(element.querySelectorAll("*"))].some((node) => {
        const overflow = getComputedStyle(node).overflowY;
        return (
          (overflow === "auto" || overflow === "scroll") &&
          node.scrollHeight > node.clientHeight + 1
        );
      }),
    );
}

async function videoHeight(page: Page): Promise<number> {
  await expect(page.locator("video").first()).toBeVisible();
  return (await box(page, "video")).height;
}

async function transcriptLoaded(page: Page) {
  await expect(page.getByTestId("fixture-transcript").first()).toBeVisible();
}

/* ------------------------------------------------------------------ *
 * The canonical page
 * ------------------------------------------------------------------ */

test("SPEC-CORE-085 I5 a panel on the canonical page reaches the bottom of the visible area, scrolls inside, and caps the player at half", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, CANONICAL, { stored: ["transcript"] });
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);

  const panel = await cardBox(page, "Transcript");
  const container = await scrollContainer(page, "Transcript");
  expect(panel.height).toBeGreaterThanOrEqual(PANEL_FLOOR - 1);
  expect(panel.bottom).toBeLessThanOrEqual(container.visibleBottom + 1);
  expect(panel.bottom).toBeGreaterThanOrEqual(
    container.visibleBottom - CANVAS_PADDING_REM * REM - 1,
  );
  expect(container.scrolls).toBe(false);
  expect(await bodyScrollsInside(page, "Transcript")).toBe(true);

  const frame = await videoHeight(page);
  expect(frame).toBeLessThanOrEqual(container.visibleHeight / 2 + 1);
});

test("SPEC-CORE-085 I5 a panel keeps 18rem when the window has less room under the row, and the page scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 560 });
  await open(page, CANONICAL, { stored: ["transcript"] });
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);

  const panel = await cardBox(page, "Transcript");
  const container = await scrollContainer(page, "Transcript");
  expect(panel.height).toBeGreaterThanOrEqual(PANEL_FLOOR - 1);
  expect(panel.height).toBeLessThanOrEqual(PANEL_FLOOR + 1);
  expect(container.scrolls).toBe(true);
});

test("SPEC-CORE-085 I2 with no panel on, nothing is under the row and the player is larger than with one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, CANONICAL, { stored: ["transcript"] });
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);
  const capped = await videoHeight(page);

  await page.getByRole("button", { name: "Close Transcript" }).click();

  await expect(card(page, "Transcript")).toHaveCount(0);
  await expect.poll(() => videoHeight(page)).toBeGreaterThan(capped + 1);
  await expect(panelGroup(page)).toBeVisible();
});

test("SPEC-CORE-085 I2 two panels sit side by side as equal columns on a workbench at least 41rem wide", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, CANONICAL, {
    panels: "two",
    stored: ["transcript", "outline"],
  });
  await expect(panelGroup(page)).toBeVisible();

  const first = await cardBox(page, "Transcript");
  const second = await cardBox(page, "Outline");
  expect(first.width + second.width).toBeGreaterThanOrEqual(COLUMNS_FROM);
  expect(Math.abs(first.top - second.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
  expect(first.right).toBeLessThanOrEqual(second.left);
});

test("SPEC-CORE-085 I2 I5 two panels stack and share the height on a workbench under 41rem, and the row does not scroll sideways", async ({
  page,
}) => {
  // Wide enough for the inspector beside the canvas, narrow enough that the
  // canvas beside it is under 41rem.
  await page.setViewportSize({ width: 1000, height: 900 });
  await open(page, CANONICAL, {
    panels: "two",
    stored: ["transcript", "outline"],
    inspectorOpen: true,
  });
  await expect(page.getByTestId("inspector-pane")).toBeVisible();
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "beside",
  );
  await expect(panelGroup(page)).toBeVisible();

  const first = await cardBox(page, "Transcript");
  const second = await cardBox(page, "Outline");
  expect(first.width).toBeLessThan(COLUMNS_FROM);
  expect(second.top).toBeGreaterThanOrEqual(first.bottom - 1);
  expect(Math.abs(first.height - second.height)).toBeLessThanOrEqual(2);

  const row = await panelGroup(page).evaluate((group) => {
    const host = group.parentElement!;
    return { scroll: host.scrollWidth, client: host.clientWidth };
  });
  expect(row.scroll).toBeLessThanOrEqual(row.client + 1);
});

/* ------------------------------------------------------------------ *
 * Enlarge panels: the player's share of the canonical page
 * ------------------------------------------------------------------ */

const FOCUS_KEY = "workbench-player-focus";
const FOCUSED_SHARE = 0.3;
const DEFAULT_SHARE = 0.5;
/** The height of a 16:9 frame 480px wide, below which the player's controls go compact. */
const FOCUSED_FLOOR = 270;

const enlarge = (page: Page) => page.getByRole("button", { name: "Enlarge panels" });

/** The frame height the value on asks for: 30% of the visible height, at least 270px, at most 50%. */
function focusedCap(visibleHeight: number): number {
  return Math.min(
    Math.max(visibleHeight * FOCUSED_SHARE, FOCUSED_FLOOR),
    visibleHeight * DEFAULT_SHARE,
  );
}

type Regime = "floor" | "share" | "half";

/** Which term of `focusedCap` decides the height, with 2px kept clear of each boundary. */
function regimeOf(visibleHeight: number): Regime | "ambiguous" {
  const share = visibleHeight * FOCUSED_SHARE;
  const half = visibleHeight * DEFAULT_SHARE;
  if (half <= FOCUSED_FLOOR - 2) return "half";
  if (share >= FOCUSED_FLOOR + 2) return "share";
  if (share <= FOCUSED_FLOOR - 2 && half >= FOCUSED_FLOOR + 2) return "floor";
  return "ambiguous";
}

/**
 * Windows with the inspector beside the canvas and under 17rem of room beside
 * the value-on frame, so the row stays under it.
 */
const WINDOWS = [
  { name: "a 1100x764 window", width: 1100, height: 764 },
];

/** One window per term of the value-on cap, each with the inspector beside the canvas. */
const CAP_WINDOWS: {
  name: string;
  width: number;
  height: number;
  regime: Regime;
  rowBeside?: true;
}[] = [
  { name: "a 1100x764 window", width: 1100, height: 764, regime: "floor" },
  // No window holds the value-off frame at 50% and the share-term frame
  // with under 17rem beside it, so this one is in the beside state.
  {
    name: "iPad 13-inch More Space landscape",
    width: 1590,
    height: 1122,
    regime: "share",
    rowBeside: true,
  },
  { name: "a short 1000x560 window", width: 1000, height: 560, regime: "half" },
];

async function openBeside(
  page: Page,
  size: { width: number; height: number; rowBeside?: true },
  options: OpenOptions = {},
) {
  await page.setViewportSize(size);
  await open(page, CANONICAL, {
    stored: ["transcript"],
    inspectorOpen: true,
    ...options,
  });
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "beside",
  );
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);
  if (!size.rowBeside) expect(await sideSpace(page)).toBeLessThan(BESIDE_FROM - 8);
}

async function expectShare(page: Page, share: number) {
  await expect
    .poll(async () => {
      const container = await scrollContainer(page, "Transcript");
      return Math.abs((await videoHeight(page)) - container.visibleHeight * share);
    })
    .toBeLessThanOrEqual(2);
}

/** The frame is at the value-on cap, within 2px. */
async function expectFocusedCap(page: Page) {
  await expect
    .poll(async () => {
      const container = await scrollContainer(page, "Transcript");
      return Math.abs(
        (await videoHeight(page)) - focusedCap(container.visibleHeight),
      );
    })
    .toBeLessThanOrEqual(2);
}

/** Tags the `<video>` node so a remount shows up as a missing tag. */
async function tagVideo(page: Page) {
  await page.locator("video").first().evaluate((video) => {
    (video as HTMLVideoElement & { __fixtureTag?: string }).__fixtureTag = "kept";
  });
}

async function videoTag(page: Page): Promise<string | undefined> {
  return page
    .locator("video")
    .first()
    .evaluate(
      (video) => (video as HTMLVideoElement & { __fixtureTag?: string }).__fixtureTag,
    );
}

/** Width of the workbench root, which spans the canvas's content box. */
async function canvasWidth(page: Page): Promise<number> {
  return page.locator(WORKBENCH).evaluate((root) => root.getBoundingClientRect().width);
}

const WORKBENCH = ".media-detail-workbench";
/** The side space beside the value-on frame at which the row moves beside it. */
const BESIDE_FROM = 17 * REM;
const COMPACT_WIDTH = COMPACT_MAX_WIDTH;

/** The value-on frame's width for a canvas content width and a visible height. */
function besideFrameWidth(canvas: number, visibleHeight: number): number {
  const at = (share: number) => (visibleHeight * share * 16) / 9;
  return Math.max(
    Math.min(canvas, at(FOCUSED_SHARE)),
    Math.min(canvas, COMPACT_WIDTH, at(DEFAULT_SHARE)),
  );
}

/** C - W - 1rem, from the workbench root's width and the visible height. */
async function sideSpace(page: Page): Promise<number> {
  const canvas = await page
    .locator(WORKBENCH)
    .evaluate((root) => (root as HTMLElement).clientWidth);
  const { visibleHeight } = await scrollContainer(page, "Transcript");
  return canvas - besideFrameWidth(canvas, visibleHeight) - REM;
}

for (const size of CAP_WINDOWS) {
  test(`SPEC-CORE-104 I2 with the value on the frame is the larger of 30% and 270px, never above 50%; otherwise 50% (${size.name}, ${size.regime})`, async ({
    page,
  }) => {
    // Init scripts accumulate across opens, so the "true" value comes last.
    for (const [focus, pressed] of [
      [undefined, "false"],
      ["false", "false"],
      ["TRUE", "false"],
      ["true", "true"],
    ] as const) {
      await openBeside(page, size, { focus });
      await expect(enlarge(page)).toHaveAttribute("aria-pressed", pressed);
      if (pressed === "false") await expectShare(page, DEFAULT_SHARE);
    }

    const { visibleHeight } = await scrollContainer(page, "Transcript");
    expect(regimeOf(visibleHeight)).toBe(size.regime);
    const expected = focusedCap(visibleHeight);
    expect((expected * 16) / 9).toBeLessThanOrEqual((await canvasWidth(page)) + 1);
    await expectFocusedCap(page);
  });
}

for (const size of CAP_WINDOWS.filter((window) => window.regime !== "half")) {
  test(`SPEC-CORE-104 I3 with the value on and Find closed the panel ends in the visible area, the page does not scroll, and the panel is taller than with it off (${size.name}, ${size.regime})`, async ({
    page,
  }) => {
    await openBeside(page, size, { focus: "false" });
    await expectShare(page, DEFAULT_SHARE);
    const off = await cardBox(page, "Transcript");

    await openBeside(page, size, { focus: "true" });
    await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
    await expectFocusedCap(page);
    const on = await cardBox(page, "Transcript");
    const container = await scrollContainer(page, "Transcript");
    const frame = await videoHeight(page);
    const row = await panelGroup(page).evaluate(
      (group) => group.parentElement!.getBoundingClientRect().bottom,
    );

    expect(frame).toBeLessThan(container.visibleHeight * DEFAULT_SHARE - 2);
    expect(container.visibleBottom - row).toBeGreaterThanOrEqual(PANEL_FLOOR - 1);

    expect(on.bottom).toBeLessThanOrEqual(container.visibleBottom + 1);
    expect(container.scrolls).toBe(false);
    expect(on.height).toBeGreaterThan(off.height + 1);
  });
}

test("SPEC-CORE-104 I2 I3 with the inspector closed the value moves the cap the same way", async ({
  page,
}) => {
  await page.setViewportSize({ width: 770, height: 900 });
  await open(page, CANONICAL, { stored: ["transcript"], inspectorOpen: false, focus: "true" });
  await expect(page.getByTestId("inspector-pane")).toHaveCount(0);
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);
  expect(await sideSpace(page)).toBeLessThan(BESIDE_FROM - 8);

  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
  await expectFocusedCap(page);
  const container = await scrollContainer(page, "Transcript");
  expect(await videoHeight(page)).toBeLessThan(container.visibleHeight * DEFAULT_SHARE - 2);
  const panel = await cardBox(page, "Transcript");
  expect(panel.bottom).toBeLessThanOrEqual(container.visibleBottom + 1);
  expect(container.scrolls).toBe(false);
});

test("SPEC-CORE-104 I4 I5 a press switches the cap and the stored value without remounting the paused player or moving it", async ({
  page,
}) => {
  await openBeside(page, WINDOWS[0]);
  await expectShare(page, DEFAULT_SHARE);
  const panelsBefore = await page.evaluate(() => localStorage.getItem("workbench-panels"));
  await tagVideo(page);
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement) => {
    video.pause();
    video.currentTime = 1.25;
    await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
  });

  await expect(enlarge(page)).toBeVisible();
  await enlarge(page).click();

  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
  await expectFocusedCap(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), FOCUS_KEY)).toBe("true");
  expect(await videoTag(page)).toBe("kept");
  const after = await page.locator("video").first().evaluate((video: HTMLVideoElement) => ({
    paused: video.paused,
    time: video.currentTime,
  }));
  expect(after.paused).toBe(true);
  expect(Math.abs(after.time - 1.25)).toBeLessThan(0.01);
  expect(await page.evaluate(() => localStorage.getItem("workbench-panels"))).toBe(
    panelsBefore,
  );

  await enlarge(page).click();

  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "false");
  await expectShare(page, DEFAULT_SHARE);
  expect(await page.evaluate((key) => localStorage.getItem(key), FOCUS_KEY)).toBe("false");
  expect(await videoTag(page)).toBe("kept");
});

test("SPEC-CORE-104 I4 a press does not stop a playing player", async ({ page }) => {
  await openBeside(page, WINDOWS[0]);
  await tagVideo(page);
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    video.loop = true;
    await video.play();
  });
  expect(
    await page.locator("video").first().evaluate((video: HTMLVideoElement) => video.paused),
  ).toBe(false);

  await expect(enlarge(page)).toBeVisible();
  await enlarge(page).click();
  await expectFocusedCap(page);

  expect(await videoTag(page)).toBe("kept");
  expect(
    await page.locator("video").first().evaluate((video: HTMLVideoElement) => video.paused),
  ).toBe(false);
});

test("SPEC-CORE-104 the pressed value is kept across a reload", async ({ page }) => {
  await openBeside(page, WINDOWS[0]);
  await expect(enlarge(page)).toBeVisible();
  await enlarge(page).click();
  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);

  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
  await expectFocusedCap(page);
});

test("SPEC-CORE-104 I5 another window of the same browser applies a press, aria-pressed and the cap both", async ({
  page,
}) => {
  await openBeside(page, WINDOWS[0]);
  const other = await page.context().newPage();
  await openBeside(other, WINDOWS[0]);
  await expect(enlarge(other)).toHaveAttribute("aria-pressed", "false");

  await page.bringToFront();
  await expect(enlarge(page)).toBeVisible();
  await enlarge(page).click();
  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");

  await expect(enlarge(other)).toHaveAttribute("aria-pressed", "true");
  await expectFocusedCap(other);
});

test("SPEC-CORE-104 I6 closing the panel removes the button and the cap without writing the value; turning it on again applies it", async ({
  page,
}) => {
  await openBeside(page, WINDOWS[0], { focus: "true" });
  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
  await expectFocusedCap(page);
  const capped = await videoHeight(page);

  await page.getByRole("button", { name: "Close Transcript" }).click();

  await expect(card(page, "Transcript")).toHaveCount(0);
  await expect(enlarge(page)).toHaveCount(0);
  await expect.poll(() => videoHeight(page)).toBeGreaterThan(capped + 1);
  expect(await page.evaluate((key) => localStorage.getItem(key), FOCUS_KEY)).toBe("true");

  await panelGroup(page).getByRole("button", { name: "Transcript" }).click();
  await transcriptLoaded(page);

  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
  await expectFocusedCap(page);
});

test("SPEC-CORE-104 I6 opening Find leaves the value alone", async ({ page }) => {
  await openBeside(page, WINDOWS[0], { focus: "true" });
  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("ControlOrMeta+f");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe("INPUT");

  expect(await page.evaluate((key) => localStorage.getItem(key), FOCUS_KEY)).toBe("true");
  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
});

test("SPEC-CORE-104 I8 with no preview action the button is a 2rem circle at the row's right edge", async ({
  page,
}) => {
  await openBeside(page, WINDOWS[0]);
  await expect(enlarge(page)).toBeVisible();

  const button = await enlarge(page).evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { right: r.right, width: r.width, height: r.height };
  });
  const row = await panelGroup(page).evaluate((group) => {
    const r = group.parentElement!.getBoundingClientRect();
    return { right: r.right };
  });
  expect(Math.abs(button.width - 2 * REM)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(button.height - 2 * REM)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(button.right - row.right)).toBeLessThanOrEqual(1);
});

test("SPEC-CORE-104 I8 with a preview action the button ends 0.5rem left of it, on the same line", async ({
  page,
}) => {
  await openBeside(page, WINDOWS[0], { actions: true });
  const action = page.getByTestId("fixture-preview-action");
  await expect(action).toBeVisible();
  await expect(enlarge(page)).toBeVisible();

  const button = await enlarge(page).evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  });
  const first = await action.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, bottom: r.bottom };
  });
  const row = await panelGroup(page).evaluate((group) => {
    const r = group.parentElement!.getBoundingClientRect();
    return { right: r.right };
  });
  expect(Math.abs(button.width - 2 * REM)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(button.height - 2 * REM)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(first.left - button.right - 0.5 * REM)).toBeLessThanOrEqual(1);
  expect(
    Math.abs((first.top + first.bottom) / 2 - (button.top + button.bottom) / 2),
  ).toBeLessThanOrEqual(1);
  expect(button.right).toBeLessThan(row.right);
});

const UNAFFECTED = [
  {
    name: "the collection surface",
    size: { width: 1280, height: 800 },
    hash: COLLECTION,
    inspectorOpen: undefined,
  },
  {
    name: "stacked with the inspector open",
    size: { width: 800, height: 900 },
    hash: CANONICAL,
    inspectorOpen: true,
  },
  {
    name: "the phone",
    size: { width: 390, height: 844 },
    hash: CANONICAL,
    inspectorOpen: undefined,
  },
];

for (const form of UNAFFECTED) {
  test(`SPEC-CORE-104 I1 I7 ${form.name} draws no button and lays the player out the same with the value on as with it absent`, async ({
    page,
  }) => {
    await page.setViewportSize(form.size);
    await open(page, form.hash, {
      stored: ["transcript"],
      inspectorOpen: form.inspectorOpen,
    });
    await videoHeight(page);
    if (form.name === "stacked with the inspector open") {
      await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
        "data-inspector-fit",
        "stacked",
      );
      await expect(page.getByTestId("inspector-pane")).toBeVisible();
    }
    if (form.name === "the phone") {
      await expect(page.getByTestId("mobile-inspector-peek")).toBeVisible();
    }
    if (form.name === "the collection surface") {
      await transcriptLoaded(page);
    }
    const absent = await box(page, "video");

    await open(page, form.hash, {
      stored: ["transcript"],
      inspectorOpen: form.inspectorOpen,
      focus: "true",
    });
    await videoHeight(page);
    await expect.poll(() => box(page, "video")).toEqual(absent);
    await expect(enlarge(page)).toHaveCount(0);

    await openBeside(page, WINDOWS[0], { focus: "true" });
    await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
  });
}

/* ------------------------------------------------------------------ *
 * The collection surface
 * ------------------------------------------------------------------ */

test("SPEC-CORE-090 I5 the collection surface gives its panels 60% of the visible height, never caps the player, and orders the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, COLLECTION, { stored: [] });
  await expect(panelGroup(page)).toBeVisible();
  const uncapped = await videoHeight(page);

  await page.getByRole("button", { name: "Transcript" }).click();
  await transcriptLoaded(page);

  const panel = await cardBox(page, "Transcript");
  const container = await scrollContainer(page, "Transcript");
  const expected = Math.max(container.visibleHeight * 0.6, PANEL_FLOOR);
  expect(Math.abs(panel.height - expected)).toBeLessThanOrEqual(2);
  expect(await bodyScrollsInside(page, "Transcript")).toBe(true);
  expect(Math.abs((await videoHeight(page)) - uncapped)).toBeLessThanOrEqual(1);

  const player = await box(page, "video");
  const row = await box(page, '[role="group"][aria-label="Panels"]');
  const title = await box(page, "h1");
  expect(row.top).toBeGreaterThanOrEqual(player.bottom - 1);
  expect(panel.top).toBeGreaterThanOrEqual(row.bottom - 1);
  expect(title.top).toBeGreaterThanOrEqual(panel.bottom - 1);
});

test("SPEC-CORE-090 two stacked panels on the collection surface share its 60% equally", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await open(page, COLLECTION, {
    panels: "two",
    stored: ["transcript", "outline"],
  });
  await expect(panelGroup(page)).toBeVisible();

  const first = await cardBox(page, "Transcript");
  const second = await cardBox(page, "Outline");
  const container = await scrollContainer(page, "Transcript");
  const expected = Math.max(container.visibleHeight * 0.6, PANEL_FLOOR);
  expect(second.top).toBeGreaterThanOrEqual(first.bottom - 1);
  expect(Math.abs(first.height - second.height)).toBeLessThanOrEqual(2);
  expect(
    Math.abs(second.bottom - first.top - expected),
  ).toBeLessThanOrEqual(4);
});

/* ------------------------------------------------------------------ *
 * The description
 * ------------------------------------------------------------------ */

/**
 * The lines the description occupies on screen: the text's top to the
 * nearest clipping ancestor's bottom, so a clamp on any wrapper counts.
 */
async function descriptionLines(page: Page, text: string): Promise<number> {
  return page
    .getByText(text.slice(0, 40), { exact: false })
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const line =
        style.lineHeight === "normal"
          ? parseFloat(style.fontSize) * 1.2
          : parseFloat(style.lineHeight);
      const own = element.getBoundingClientRect();
      let bottom = own.bottom;
      for (
        let node: Element | null = element;
        node && node !== document.body;
        node = node.parentElement
      ) {
        if (getComputedStyle(node).overflowY !== "visible") {
          bottom = Math.min(bottom, node.getBoundingClientRect().bottom);
          break;
        }
      }
      return (bottom - own.top) / line;
    });
}

test("SPEC-CORE-088 I7 the description in Info is three lines with Show more until expanded, and a remount collapses it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, CANONICAL, { description: LONG_DESCRIPTION });
  const info = page.locator("#inspector-panel-info");
  await expect(info).toBeVisible();

  expect(await descriptionLines(page, LONG_DESCRIPTION)).toBeLessThanOrEqual(3.05);
  const more = info.getByRole("button", { name: "Show more" });
  await expect(more).toBeVisible();

  await more.click();
  expect(await descriptionLines(page, LONG_DESCRIPTION)).toBeGreaterThan(3.5);
  await expect(info.getByRole("button", { name: "Show less" })).toBeVisible();

  await info.getByRole("button", { name: "Show less" }).click();
  expect(await descriptionLines(page, LONG_DESCRIPTION)).toBeLessThanOrEqual(3.05);

  await info.getByRole("button", { name: "Show more" }).click();
  await page.getByTestId("inspector-toggle").click();
  await expect(page.getByTestId("inspector-pane")).toHaveCount(0);
  await page.getByTestId("inspector-toggle").click();
  await expect(
    page.locator("#inspector-panel-info").getByRole("button", { name: "Show more" }),
  ).toBeVisible();
});

test("SPEC-CORE-088 I7 a description that fits draws no Show more", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, CANONICAL, { description: LONG_DESCRIPTION });
  await expect(
    page.locator("#inspector-panel-info").getByRole("button", { name: "Show more" }),
  ).toBeVisible();

  await open(page, CANONICAL, { description: "Recorded on location." });
  const info = page.locator("#inspector-panel-info");
  await expect(info.getByText("Recorded on location.")).toBeVisible();
  await expect(info.getByRole("button", { name: /Show (more|less)/ })).toHaveCount(0);
});

test("SPEC-CORE-088 I7 Show more appears when a resize makes the description need a fourth line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, COLLECTION, { description: MEDIUM_DESCRIPTION });
  await expect(page.getByText(MEDIUM_DESCRIPTION.slice(0, 40))).toBeVisible();
  await expect(panelGroup(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);

  await page.setViewportSize({ width: 360, height: 800 });

  await expect(page.getByRole("button", { name: "Show more" })).toBeVisible();
  expect(await descriptionLines(page, MEDIUM_DESCRIPTION)).toBeLessThanOrEqual(3.05);
});

/* ------------------------------------------------------------------ *
 * Enlarge panels: the row beside the player
 * ------------------------------------------------------------------ */

const PANEL_GAP = 0.75 * REM;
const ROW_GAP = REM;
const HOST_BOTTOM_PADDING = REM;

/** One window per term of W, each with the inspector beside and at least 17rem beside the frame. */
const BESIDE_WINDOWS: { name: string; width: number; height: number; regime: Regime }[] = [
  { name: "1376x878", width: 1376, height: 878, regime: "floor" },
  { name: "iPad 13-inch More Space landscape", width: 1590, height: 1122, regime: "share" },
  { name: "a short 1440x560 window", width: 1440, height: 560, regime: "half" },
];

const POINTERS = [
  { name: "fine", hasTouch: false },
  { name: "coarse", hasTouch: true },
] as const;

const workbench = (page: Page) => page.locator(WORKBENCH);
const frameOf = (page: Page) => page.getByTestId("player-frame").first();

/** Opens the canonical page with the inspector beside and checks the window gives the row room beside the frame. */
async function openWide(
  page: Page,
  size: { width: number; height: number; regime?: Regime },
  options: OpenOptions = {},
) {
  await page.setViewportSize(size);
  await open(page, CANONICAL, {
    stored: ["transcript"],
    inspectorOpen: true,
    focus: "true",
    ...options,
  });
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "beside",
  );
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);
  if (size.regime) {
    const { visibleHeight } = await scrollContainer(page, "Transcript");
    expect(regimeOf(visibleHeight)).toBe(size.regime);
  }
  expect(await sideSpace(page)).toBeGreaterThanOrEqual(BESIDE_FROM);
}

async function expectPointer(page: Page, coarse: boolean) {
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
}

interface RowLayout {
  root: Box;
  frame: Box;
  row: Box;
  toggles: Box[];
  trailing: Box[];
  content: Box[];
}

/** The boxes the beside invariants speak of, read in one pass. */
async function rowLayout(page: Page): Promise<RowLayout> {
  return page.evaluate((selector) => {
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      };
    };
    const root = document.querySelector(selector)!;
    const frame = document.querySelector("[data-testid='player-frame']")!;
    const group = document.querySelector("[role='group'][aria-label='Panels']")!;
    const row = group.parentElement!;
    const toggles = Array.from(group.querySelectorAll("button")).map(rect);
    const trailing = Array.from(row.querySelectorAll("button"))
      .filter((button) => !group.contains(button))
      .map(rect);
    const content = Array.from(row.querySelectorAll("button")).map(rect);
    return { root: rect(root), frame: rect(frame), row: rect(row), toggles, trailing, content };
  }, WORKBENCH);
}

const near = (a: number, b: number, slack = 1) => Math.abs(a - b) <= slack;

/** I1's checks with the toggles on one line; returns the ones that fail. */
function besideMisses(layout: RowLayout): string[] {
  const { root, frame, row, toggles, trailing } = layout;
  const misses: string[] = [];
  const bottom = (boxes: Box[]) => Math.max(...boxes.map((b) => b.bottom));
  const check = (name: string, ok: boolean) => {
    if (!ok) misses.push(name);
  };
  check("frame left = canvas left", near(frame.left, root.left));
  check("row left = frame right + 1rem", near(row.left, frame.right + ROW_GAP));
  check("row right = canvas right", near(row.right, root.right));
  check("toggles' bottom = frame bottom", near(bottom(toggles), frame.bottom));
  check("trailing group's bottom = frame bottom", near(bottom(trailing), frame.bottom));
  check("first toggle left = row left", near(toggles[0].left, row.left));
  check(
    "trailing group's right = row right",
    near(Math.max(...trailing.map((b) => b.right)), row.right),
  );
  return misses;
}

/** I5's checks: the frame centred in the canvas content and the row 1rem under it. */
function underMisses(layout: RowLayout): string[] {
  const { root, frame, row } = layout;
  const misses: string[] = [];
  if (!near(frame.left - root.left, root.right - frame.right)) misses.push("frame centred");
  if (!near(row.top, frame.bottom + ROW_GAP)) misses.push("row top = frame bottom + 1rem");
  return misses;
}

const rowBeside = (page: Page) =>
  workbench(page).evaluate((root) => root.getAttribute("data-row-beside"));

async function expectBeside(page: Page) {
  await expect.poll(async () => besideMisses(await rowLayout(page))).toEqual([]);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
}

async function expectUnder(page: Page) {
  await expect.poll(async () => underMisses(await rowLayout(page))).toEqual([]);
  expect(await rowBeside(page)).toBeNull();
}

/** Resizes to the window whose workbench root is `canvas` px wide, keeping the height. */
async function resizeCanvasTo(page: Page, canvas: number) {
  const viewport = page.viewportSize()!;
  const now = await workbench(page).evaluate((root) => (root as HTMLElement).clientWidth);
  await page.setViewportSize({ width: viewport.width + canvas - now, height: viewport.height });
  await expect
    .poll(() => workbench(page).evaluate((root) => (root as HTMLElement).clientWidth))
    .toBe(canvas);
}

/** Resizes to the window whose visible height is `height` px, keeping the width. */
async function resizeVisibleHeightTo(page: Page, height: number) {
  const viewport = page.viewportSize()!;
  const { visibleHeight } = await scrollContainer(page, "Transcript");
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height + height - visibleHeight,
  });
  await expect
    .poll(async () => (await scrollContainer(page, "Transcript")).visibleHeight)
    .toBe(height);
}

for (const pointer of POINTERS) {
  test.describe(`${pointer.name} pointer`, () => {
    test.use({ hasTouch: pointer.hasTouch });

    for (const size of BESIDE_WINDOWS) {
      test(`SPEC-CORE-105 I1 the frame is at the canvas's left edge and the row beside it ends on the frame's bottom (${size.name}, ${size.regime}, ${pointer.name} pointer)`, async ({
        page,
      }) => {
        await openWide(page, size, { actions: true });
        await expectPointer(page, pointer.hasTouch);
        await expect(page.getByTestId("fixture-preview-action")).toBeVisible();

        await expectBeside(page);
        const layout = await rowLayout(page);
        expect(new Set(layout.toggles.map((b) => Math.round(b.top))).size).toBe(1);
        // SPEC-CORE-104 I8 in the beside state: the button ends 0.5rem left of the action.
        const button = await enlarge(page).evaluate((e) => e.getBoundingClientRect().right);
        const action = await page
          .getByTestId("fixture-preview-action")
          .evaluate((e) => e.getBoundingClientRect().left);
        expect(Math.abs(action - button - 0.5 * REM)).toBeLessThanOrEqual(1);
      });

      test(`SPEC-CORE-105 I2 the first panel starts 0.75rem under the frame and spans the canvas content (${size.name}, ${size.regime}, ${pointer.name} pointer)`, async ({
        page,
      }) => {
        await openWide(page, size);
        await expectPointer(page, pointer.hasTouch);

        await expect
          .poll(async () => {
            const frame = await box(page, "[data-testid='player-frame']");
            return Math.abs((await cardBox(page, "Transcript")).top - (frame.bottom + PANEL_GAP));
          })
          .toBeLessThanOrEqual(1);
        const panel = await cardBox(page, "Transcript");
        const root = await box(page, WORKBENCH);
        expect(Math.abs(panel.left - root.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(panel.right - root.right)).toBeLessThanOrEqual(1);
        await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
      });

      test(`SPEC-CORE-105 I3 the frame keeps SPEC-CORE-104's cap in the beside state (${size.name}, ${size.regime}, ${pointer.name} pointer)`, async ({
        page,
      }) => {
        await openWide(page, size);
        await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");

        await expectFocusedCap(page);
        const { visibleHeight } = await scrollContainer(page, "Transcript");
        const canvas = await workbench(page).evaluate((root) => (root as HTMLElement).clientWidth);
        const frame = await box(page, "[data-testid='player-frame']");
        expect(Math.abs(frame.width - besideFrameWidth(canvas, visibleHeight))).toBeLessThanOrEqual(1);
        expect(Math.abs(frame.height - focusedCap(visibleHeight))).toBeLessThanOrEqual(2);
      });
    }

    for (const where of ["1376x878", "the threshold"] as const) {
      test(`SPEC-CORE-105 I2 with four toggles and the quote action no row content meets the frame or passes the canvas's right edge (${where}, ${pointer.name} pointer)`, async ({
        page,
      }) => {
        await openWide(page, BESIDE_WINDOWS[0], { panels: "four", actions: true });
        await expectPointer(page, pointer.hasTouch);
        if (where === "the threshold") {
          const { visibleHeight } = await scrollContainer(page, "Transcript");
          await resizeCanvasTo(
            page,
            Math.ceil(besideFrameWidth(10_000, visibleHeight) + REM + BESIDE_FROM),
          );
        }
        await expect(panelGroup(page).getByRole("button")).toHaveCount(4);
        await expect(page.getByTestId("fixture-preview-action")).toBeVisible();
        await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");

        const { frame, root, content } = await rowLayout(page);
        for (const item of content) {
          const meets =
            item.left < frame.right - 1 &&
            item.right > frame.left + 1 &&
            item.top < frame.bottom - 1 &&
            item.bottom > frame.top + 1;
          expect(meets).toBe(false);
          expect(item.right).toBeLessThanOrEqual(root.right + 1);
        }
      });
    }

    test(`SPEC-CORE-105 I1 wrapped toggles keep the first ones in priority order on the bottom line, with the trailing group at its right end on the frame's bottom (${pointer.name} pointer)`, async ({
      page,
    }) => {
      await openWide(page, BESIDE_WINDOWS[0], { panels: "four", actions: true });
      const { visibleHeight } = await scrollContainer(page, "Transcript");
      await resizeCanvasTo(
        page,
        Math.ceil(besideFrameWidth(10_000, visibleHeight) + REM + BESIDE_FROM),
      );
      await expect(panelGroup(page).getByRole("button")).toHaveCount(4);
      await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");

      const { frame, row, toggles, trailing } = await rowLayout(page);
      const onBottom = toggles.map((t) => near(t.bottom, frame.bottom));
      expect(onBottom[0]).toBe(true);
      const count = onBottom.filter(Boolean).length;
      expect(onBottom).toEqual(toggles.map((_, i) => i < count));
      expect(count).toBeLessThan(toggles.length);
      const lineTop = Math.min(...toggles.slice(0, count).map((t) => t.top));
      for (const later of toggles.slice(count)) {
        expect(later.bottom).toBeLessThanOrEqual(lineTop + 1);
      }
      expect(Math.abs(toggles[0].left - row.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.max(...trailing.map((b) => b.bottom)) - frame.bottom)).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.max(...trailing.map((b) => b.right)) - row.right)).toBeLessThanOrEqual(1);
    });
  });
}

for (const size of BESIDE_WINDOWS.filter((window) => window.regime !== "half")) {
  test(`SPEC-CORE-105 I4 with Find closed and room for the panel's floor, the panel ends in the visible area and the page does not scroll (${size.name}, ${size.regime})`, async ({
    page,
  }) => {
    await openWide(page, size);
    await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
    const container = await scrollContainer(page, "Transcript");
    const frame = await box(page, "[data-testid='player-frame']");
    expect(container.visibleBottom - frame.bottom).toBeGreaterThanOrEqual(
      PANEL_GAP + PANEL_FLOOR + HOST_BOTTOM_PADDING,
    );

    const panel = await cardBox(page, "Transcript");
    expect(panel.bottom).toBeLessThanOrEqual(container.visibleBottom + 1);
    expect(container.scrolls).toBe(false);
  });
}

const LEAVING = [
  {
    name: "a press",
    leave: async (page: Page) => {
      await enlarge(page).click();
      await expect(enlarge(page)).toHaveAttribute("aria-pressed", "false");
    },
  },
  {
    name: "closing the last panel",
    leave: async (page: Page) => {
      await page.getByRole("button", { name: "Close Transcript" }).click();
      await expect(card(page, "Transcript")).toHaveCount(0);
    },
  },
  {
    name: "a width-only resize under 17rem of side space",
    leave: async (page: Page) => {
      const { visibleHeight } = await scrollContainer(page, "Transcript");
      await resizeCanvasTo(
        page,
        Math.floor(besideFrameWidth(10_000, visibleHeight) + REM + BESIDE_FROM) - 1,
      );
    },
  },
];

for (const leaving of LEAVING) {
  test(`SPEC-CORE-105 I5 leaving the beside state by ${leaving.name} centres the frame and puts the row 1rem under it`, async ({
    page,
  }) => {
    await openWide(page, BESIDE_WINDOWS[0]);
    await expectBeside(page);

    await leaving.leave(page);

    await expectUnder(page);
  });
}

test("SPEC-CORE-105 I5 I9 the state is not beside with the value other than \"true\", and is with it", async ({
  page,
}) => {
  // Init scripts accumulate across opens, so the "true" value comes last.
  for (const [focus, pressed] of [
    [undefined, "false"],
    ["false", "false"],
    ["TRUE", "false"],
  ] as const) {
    await page.setViewportSize(BESIDE_WINDOWS[0]);
    await open(page, CANONICAL, { stored: ["transcript"], inspectorOpen: true, focus });
    await expect(panelGroup(page)).toBeVisible();
    await transcriptLoaded(page);
    await expect(enlarge(page)).toHaveAttribute("aria-pressed", pressed);
    await expectUnder(page);
  }

  await openWide(page, BESIDE_WINDOWS[0]);
  await expectBeside(page);
});

test("SPEC-CORE-105 I9 a width-only resize in the floor case flips the state between a side space of 17rem and 17rem minus 1px", async ({
  page,
}) => {
  await openWide(page, BESIDE_WINDOWS[0]);
  const { visibleHeight } = await scrollContainer(page, "Transcript");
  expect(besideFrameWidth(10_000, visibleHeight)).toBe(COMPACT_WIDTH);
  const at = COMPACT_WIDTH + REM + BESIDE_FROM;

  await resizeCanvasTo(page, at);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  expect((await scrollContainer(page, "Transcript")).scrolls).toBe(false);

  await resizeCanvasTo(page, at - 1);
  await expect(workbench(page)).not.toHaveAttribute("data-row-beside", /.*/);
  expect((await scrollContainer(page, "Transcript")).scrolls).toBe(false);

  await resizeCanvasTo(page, at);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
});

test("SPEC-CORE-105 I9 a height-only resize that moves the side space 8px or more across 17rem flips the state", async ({
  page,
}) => {
  await openWide(page, BESIDE_WINDOWS[0]);
  // W = 480 (floor), side space 17rem + 8px.
  await resizeCanvasTo(page, COMPACT_WIDTH + REM + BESIDE_FROM + 8);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  const floorHeight = (await scrollContainer(page, "Transcript")).visibleHeight;

  // W = 1000 x 0.3 x 16/9 = 533px: side space 17rem - 45px.
  await resizeVisibleHeightTo(page, 1000);
  expect(await sideSpace(page)).toBeLessThanOrEqual(BESIDE_FROM - 8);
  await expect(workbench(page)).not.toHaveAttribute("data-row-beside", /.*/);

  await resizeVisibleHeightTo(page, floorHeight);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
});

/* The player and the panels across entering and leaving the state. */

async function tagPanel(page: Page) {
  await card(page, "Transcript")
    .first()
    .evaluate((node) => {
      (node as HTMLElement & { __fixtureTag?: string }).__fixtureTag = "kept";
    });
}

async function panelTag(page: Page): Promise<string | undefined> {
  return card(page, "Transcript")
    .first()
    .evaluate((node) => (node as HTMLElement & { __fixtureTag?: string }).__fixtureTag);
}

async function playback(page: Page) {
  return page
    .locator("video")
    .first()
    .evaluate((video: HTMLVideoElement) => ({ paused: video.paused, time: video.currentTime }));
}

test("SPEC-CORE-105 I6 a press, a width-only resize, a height-only resize and a storage event keep the paused player, its position and the panel", async ({
  page,
}) => {
  await openWide(page, BESIDE_WINDOWS[0]);
  await resizeCanvasTo(page, COMPACT_WIDTH + REM + BESIDE_FROM + 8);
  const floorHeight = (await scrollContainer(page, "Transcript")).visibleHeight;
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  await tagVideo(page);
  await tagPanel(page);
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement) => {
    video.pause();
    video.currentTime = 1.25;
    await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
  });

  const other = await page.context().newPage();
  const crossings: [string, () => Promise<void>, boolean][] = [
    ["press off", () => enlarge(page).click(), false],
    ["press on", () => enlarge(page).click(), true],
    ["narrow", () => resizeCanvasTo(page, COMPACT_WIDTH + REM + BESIDE_FROM - 8), false],
    ["widen", () => resizeCanvasTo(page, COMPACT_WIDTH + REM + BESIDE_FROM + 8), true],
    ["taller", () => resizeVisibleHeightTo(page, 1000), false],
    ["shorter", () => resizeVisibleHeightTo(page, floorHeight), true],
    [
      "storage off",
      async () => {
        await other.goto(page.url());
        await other.evaluate((key) => localStorage.setItem(key, "false"), FOCUS_KEY);
      },
      false,
    ],
    [
      "storage on",
      () => other.evaluate((key) => localStorage.setItem(key, "true"), FOCUS_KEY),
      true,
    ],
  ];
  for (const [name, cross, on] of crossings) {
    await cross();
    if (on) await expect(workbench(page), name).toHaveAttribute("data-row-beside", "on");
    else await expect(workbench(page), name).not.toHaveAttribute("data-row-beside", /.*/);
    expect(await videoTag(page), name).toBe("kept");
    expect(await panelTag(page), name).toBe("kept");
    const now = await playback(page);
    expect(now.paused, name).toBe(true);
    expect(Math.abs(now.time - 1.25), name).toBeLessThan(0.01);
  }
});

test("SPEC-CORE-105 I6 closing the last panel and turning it on again keeps the paused player and its position", async ({
  page,
}) => {
  await openWide(page, BESIDE_WINDOWS[0]);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  await tagVideo(page);
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement) => {
    video.pause();
    video.currentTime = 1.25;
    await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
  });

  await page.getByRole("button", { name: "Close Transcript" }).click();
  await expect(workbench(page)).not.toHaveAttribute("data-row-beside", /.*/);
  await panelGroup(page).getByRole("button", { name: "Transcript" }).click();
  await transcriptLoaded(page);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");

  expect(await videoTag(page)).toBe("kept");
  const now = await playback(page);
  expect(now.paused).toBe(true);
  expect(Math.abs(now.time - 1.25)).toBeLessThan(0.01);
});

test("SPEC-CORE-105 I6 entering and leaving by a press does not stop a playing player", async ({
  page,
}) => {
  await openWide(page, BESIDE_WINDOWS[0]);
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  await tagVideo(page);
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    video.loop = true;
    await video.play();
  });

  await enlarge(page).click();
  await expect(workbench(page)).not.toHaveAttribute("data-row-beside", /.*/);
  expect((await playback(page)).paused).toBe(false);
  await enlarge(page).click();
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");

  expect(await videoTag(page)).toBe("kept");
  expect((await playback(page)).paused).toBe(false);
});

/* Full screen. */

declare global {
  interface Window {
    __rowBesideChanges?: (string | null)[];
  }
}

/** The fallback for a platform that refuses system full screen; Chromium only takes it with touch. */
async function refuseSystemFullscreen(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("refused"));
  });
}

/** Presses the frame's own button, as a keyboard shortcut reaches it past the shield. */
async function pressFrameButton(page: Page, label: string) {
  await frameOf(page).evaluate((element, label) => {
    const button = Array.from(element.querySelectorAll("button")).find(
      (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "") === label,
    );
    button!.click();
  }, label);
}

async function enterFullscreen(page: Page) {
  await pressFrameButton(page, "Full screen");
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const pinned = await box(page, "[data-testid='player-frame']");
      return near(pinned.width, viewport.width) && near(pinned.height, viewport.height);
    })
    .toBe(true);
  await expect(frameOf(page)).not.toHaveAttribute("data-fullscreen-moving", /.*/);
}

async function exitFullscreen(page: Page) {
  await pressFrameButton(page, "Exit full screen");
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => (await box(page, "[data-testid='player-frame']")).width)
    .toBeLessThan(viewport.width - 1);
  await expect(frameOf(page)).not.toHaveAttribute("data-fullscreen-moving", /.*/);
}

/** Records every change to the workbench root's `data-row-beside` from now on. */
async function watchRowBeside(page: Page) {
  await workbench(page).evaluate((root) => {
    window.__rowBesideChanges = [];
    new MutationObserver((records) => {
      for (const record of records) {
        window.__rowBesideChanges!.push(
          (record.target as Element).getAttribute("data-row-beside"),
        );
      }
    }).observe(root, { attributes: true, attributeFilter: ["data-row-beside"] });
  });
}

/** The edges of the frame, the row, the root and the panel that moved by more than 1px since `before`. */
async function movedSince(page: Page, before: RowLayout, panelBefore: Box): Promise<string[]> {
  const after = await rowLayout(page);
  const panel = await cardBox(page, "Transcript");
  const edges = ["left", "top", "width", "height"] as const;
  return [
    ...(["frame", "row", "root"] as const).flatMap((key) =>
      edges
        .filter((edge) => !near(after[key][edge], before[key][edge]))
        .map((edge) => `${key}.${edge}`),
    ),
    ...edges.filter((edge) => !near(panel[edge], panelBefore[edge])).map((edge) => `panel.${edge}`),
  ];
}

/** Pseudo full screen never changes the state; system full screen may while it is up. */
const FULLSCREENS = [
  { name: "pseudo full screen", hasTouch: true, refuse: true, stateHeld: true },
  { name: "system full screen", hasTouch: false, refuse: false, stateHeld: false },
] as const;

for (const fullscreen of FULLSCREENS) {
  test.describe(fullscreen.name, () => {
    test.use({ hasTouch: fullscreen.hasTouch });

    test(`SPEC-CORE-105 I7 ${fullscreen.name}${fullscreen.stateHeld ? ", its transitions included, does not change the state," : ""} and leaving it at the same window size restores the state and the geometry`, async ({
      page,
    }) => {
      if (fullscreen.refuse) await refuseSystemFullscreen(page);
      await openWide(page, BESIDE_WINDOWS[0]);
      await expectBeside(page);
      const before = await rowLayout(page);
      const panelBefore = await cardBox(page, "Transcript");
      await watchRowBeside(page);

      await enterFullscreen(page);
      expect(
        await page.evaluate(() => document.fullscreenElement !== null),
      ).toBe(!fullscreen.refuse);
      await exitFullscreen(page);

      await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
      if (fullscreen.stateHeld) {
        expect(await page.evaluate(() => window.__rowBesideChanges)).toEqual([]);
      }
      await expect.poll(() => movedSince(page, before, panelBefore)).toEqual([]);
    });

    test(`SPEC-CORE-105 I7 the ${fullscreen.name} frame is the same size in the beside state as with the row under the frame`, async ({
      page,
    }) => {
      if (fullscreen.refuse) await refuseSystemFullscreen(page);
      await openWide(page, BESIDE_WINDOWS[0], { focus: "false" });
      await expect(enlarge(page)).toHaveAttribute("aria-pressed", "false");
      expect(await rowBeside(page)).toBeNull();
      await enterFullscreen(page);
      const under = await box(page, "[data-testid='player-frame']");
      await exitFullscreen(page);

      await enlarge(page).click();
      await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
      await enterFullscreen(page);
      const beside = await box(page, "[data-testid='player-frame']");
      expect(Math.abs(beside.width - under.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(beside.height - under.height)).toBeLessThanOrEqual(1);
    });
  });
}

test("SPEC-CORE-105 I8 panels sit side by side in the beside state on a workbench at least 41rem wide", async ({
  page,
}) => {
  await openWide(page, BESIDE_WINDOWS[0], { panels: "two", stored: ["transcript", "outline"] });
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  expect(await canvasWidth(page)).toBeGreaterThanOrEqual(COLUMNS_FROM);

  const first = await cardBox(page, "Transcript");
  const second = await cardBox(page, "Outline");
  expect(Math.abs(first.top - second.top)).toBeLessThanOrEqual(1);
  expect(first.right).toBeLessThanOrEqual(second.left);
});

test("SPEC-CORE-105 I8 panels stack in the beside state on a workbench under 41rem", async ({
  page,
}) => {
  // A short window makes W the half term, small enough for the side space on a canvas under 41rem.
  await openWide(
    page,
    { width: 1016, height: 348, regime: "half" },
    { panels: "two", stored: ["transcript", "outline"] },
  );
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  expect(await canvasWidth(page)).toBeLessThan(COLUMNS_FROM);

  const first = await cardBox(page, "Transcript");
  const second = await cardBox(page, "Outline");
  expect(second.top).toBeGreaterThanOrEqual(first.bottom - 1);
});
