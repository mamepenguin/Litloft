/**
 * The workbench under the player, measured in a real browser: the panel
 * height, the player cap, the columns, and the three-line description.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
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
  panels?: "one" | "two";
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

/** Window sizes from the spec's table, with the inspector beside the canvas. */
const WINDOWS = [
  { name: "iPad 11-inch landscape", width: 1210, height: 764 },
];

/** One window per term of the value-on cap, each with the inspector beside the canvas. */
const CAP_WINDOWS: { name: string; width: number; height: number; regime: Regime }[] = [
  { name: "iPad 11-inch landscape", width: 1210, height: 764, regime: "floor" },
  { name: "iPad 13-inch More Space landscape", width: 1590, height: 1122, regime: "share" },
  { name: "a short 1440x560 window", width: 1440, height: 560, regime: "half" },
];

async function openBeside(
  page: Page,
  size: { width: number; height: number },
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

/** Width of the row under the player, which spans the canvas's content box. */
async function canvasWidth(page: Page): Promise<number> {
  return panelGroup(page).evaluate(
    (group) => group.parentElement!.getBoundingClientRect().width,
  );
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, CANONICAL, { stored: ["transcript"], inspectorOpen: false, focus: "true" });
  await expect(page.getByTestId("inspector-pane")).toHaveCount(0);
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);

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

  await expect(enlarge(page)).toBeVisible();
  await enlarge(page).click();

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
