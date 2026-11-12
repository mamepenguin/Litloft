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
}

async function open(page: Page, hash: string, options: OpenOptions = {}) {
  const { stored, panels = "one", description, inspectorOpen } = options;
  await page.addInitScript(
    ({ stored, inspectorOpen }) => {
      if (stored !== undefined) {
        localStorage.setItem("workbench-panels", JSON.stringify(stored));
      }
      if (inspectorOpen !== undefined) {
        localStorage.setItem("inspector-open:fixture", String(inspectorOpen));
      }
    },
    { stored, inspectorOpen },
  );
  const query = new URLSearchParams({ run: String(++navigation), panels });
  if (description) query.set("description", description);
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
