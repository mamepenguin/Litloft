/**
 * The split layout of the canonical video page, measured in a real browser:
 * the player and the row in a left column, the panels in a right column the
 * height of the canvas, and the button that turns it on.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const CANONICAL = "#inspector-video";
const SIDEBAR = "#inspector-video-sidebar";
const COLLECTION = "#inspector-video-collection";
const REM = 16;
const SPLIT_FROM = 61 * REM;
const SHARE = 0.6;
const SPLIT_KEY = "workbench-split";
const PANELS_KEY = "workbench-panels";
const NAME = "Show panels beside the player";
const HOST = ".media-detail-host";
const WORKBENCH = ".media-detail-workbench";

/** 1440x900 with the inspector beside the canvas: W is over 61rem. */
const WIDE = { width: 1440, height: 900 };

let navigation = 0;

interface OpenOptions {
  stored?: unknown;
  panels?: "one" | "two";
  inspectorOpen?: boolean;
  /** The raw `workbench-split` value; left alone when undefined. */
  split?: string;
  /** The raw `workbench-player-focus` value; left alone when undefined. */
  focus?: string;
  actions?: boolean;
  moduleDelay?: number;
}

async function open(page: Page, hash: string, options: OpenOptions = {}) {
  const { stored, panels = "one", inspectorOpen, split, focus, actions, moduleDelay } =
    options;
  await page.addInitScript(
    ({ stored, inspectorOpen, split, focus }) => {
      if (stored !== undefined) {
        localStorage.setItem("workbench-panels", JSON.stringify(stored));
      }
      if (inspectorOpen !== undefined) {
        localStorage.setItem("inspector-open:fixture", String(inspectorOpen));
      }
      if (split !== undefined) localStorage.setItem("workbench-split", split);
      if (focus !== undefined) localStorage.setItem("workbench-player-focus", focus);
    },
    { stored, inspectorOpen, split, focus },
  );
  const query = new URLSearchParams({ run: String(++navigation), panels });
  if (actions) query.set("actions", "1");
  if (moduleDelay !== undefined) query.set("module-delay", String(moduleDelay));
  await page.goto(`${FIXTURE}?${query}${hash}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", hash.slice(1));
}

const splitButton = (page: Page) => page.getByRole("button", { name: NAME });
const enlarge = (page: Page) => page.getByRole("button", { name: "Enlarge panels" });
const panelGroup = (page: Page) => page.getByRole("group", { name: "Panels" });
const host = (page: Page) => page.locator(HOST).first();
const workbench = (page: Page) => page.locator(WORKBENCH).first();
const card = (page: Page, label: string) =>
  page.locator("section").filter({ has: page.locator("h2", { hasText: label }) });

async function transcriptLoaded(page: Page) {
  await expect(page.getByTestId("fixture-transcript").first()).toBeVisible();
}

async function expectSplit(page: Page) {
  await expect(host(page)).toHaveAttribute("data-workbench-split", "on");
}

async function expectNormal(page: Page) {
  await expect(host(page)).not.toHaveAttribute("data-workbench-split", /.*/);
}

/** The canonical page with the inspector beside the canvas and the transcript shown. */
async function openCanonical(
  page: Page,
  size: { width: number; height: number },
  options: OpenOptions = {},
) {
  await page.setViewportSize(size);
  await open(page, CANONICAL, { stored: ["transcript"], inspectorOpen: true, ...options });
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "beside",
  );
  await expect(panelGroup(page)).toBeVisible();
  await transcriptLoaded(page);
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface SplitLayout {
  /** The scroll container's border-box width less 2rem. */
  w: number;
  rem: number;
  /** The media host's content box. */
  content: Box;
  /** The scroll container's visible bottom less 1rem. */
  hostBottom: number;
  visibleHeight: number;
  scrolls: boolean;
  frame: Box;
  row: Box;
  cards: Box[];
}

/** The boxes the split invariants speak of, read in one pass. */
async function splitLayout(page: Page): Promise<SplitLayout> {
  return page.evaluate((hostSelector) => {
    const rect = (r: DOMRect) => ({
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    });
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const video = document.querySelector("video")!;
    let scroller: HTMLElement | null = video.parentElement;
    while (scroller && scroller !== document.body) {
      const overflow = getComputedStyle(scroller).overflowY;
      if (overflow === "auto" || overflow === "scroll") break;
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === document.body) throw new Error("no scroll container");
    const scrollerRect = scroller.getBoundingClientRect();
    const hostNode = document.querySelector(hostSelector)!;
    const hostRect = hostNode.getBoundingClientRect();
    const style = getComputedStyle(hostNode);
    const inset = (side: "top" | "right" | "bottom" | "left") =>
      parseFloat(style.getPropertyValue(`padding-${side}`)) +
      parseFloat(style.getPropertyValue(`border-${side}-width`));
    const content = {
      top: hostRect.top + inset("top"),
      bottom: hostRect.bottom - inset("bottom"),
      left: hostRect.left + inset("left"),
      right: hostRect.right - inset("right"),
      width: hostRect.width - inset("left") - inset("right"),
      height: hostRect.height - inset("top") - inset("bottom"),
    };
    const group = document.querySelector("[role='group'][aria-label='Panels']")!;
    const cards = Array.from(document.querySelectorAll("section"))
      .filter((section) => {
        const label = section.querySelector("h2")?.textContent?.trim();
        return Boolean(
          label &&
            Array.from(section.querySelectorAll("button")).some(
              (button) => button.getAttribute("aria-label") === `Close ${label}`,
            ),
        );
      })
      .map((section) => rect(section.getBoundingClientRect()));
    return {
      w: scroller.offsetWidth - 2 * rem,
      rem,
      content,
      hostBottom: scrollerRect.top + scroller.clientHeight - rem,
      visibleHeight: scroller.clientHeight,
      scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
      frame: rect(document.querySelector("[data-testid='player-frame']")!.getBoundingClientRect()),
      row: rect(group.parentElement!.getBoundingClientRect()),
      cards,
    };
  }, HOST);
}

const near = (a: number, b: number, slack = 1) => Math.abs(a - b) <= slack;

/** SPEC-CORE-126 I2's checks; returns the ones that fail. */
function splitMisses(layout: SplitLayout): string[] {
  const { w, rem, content, hostBottom, frame, row, cards } = layout;
  const misses: string[] = [];
  const check = (name: string, ok: boolean) => {
    if (!ok) misses.push(name);
  };
  const left = 0.6 * (w - rem);
  check("canvas content width = W", near(content.width, w));
  check("frame left = content left", near(frame.left, content.left));
  check("frame top = content top", near(frame.top, content.top));
  check("frame is 16:9", near((frame.width * 9) / 16, frame.height));
  check("row top = frame bottom + 1rem", near(row.top, frame.bottom + rem));
  check("row left = left column's left", near(row.left, content.left));
  check("row right = left column's right", near(row.right, content.left + left));
  const unlimitedRowBottom = content.top + (left * 9) / 16 + rem + row.height;
  if (unlimitedRowBottom <= hostBottom + 1) {
    check("frame width = left column", near(frame.width, left));
  } else {
    check("row bottom = host content bottom", near(row.bottom, hostBottom));
    check("frame narrower than the left column", frame.width < left - 1);
  }
  check("a panel is shown", cards.length > 0);
  if (cards.length === 0) return misses;
  cards.forEach((card, i) => {
    check(`panel ${i} left = left column right + 1rem`, near(card.left, content.left + left + rem));
    check(`panel ${i} right = content right`, near(card.right, content.right));
  });
  check("first panel top = content top", near(cards[0].top, content.top));
  check("last panel bottom = host content bottom", near(cards[cards.length - 1].bottom, hostBottom));
  for (let i = 1; i < cards.length; i++) {
    check(`panel ${i} is 0.75rem under panel ${i - 1}`, near(cards[i].top, cards[i - 1].bottom + 0.75 * rem));
    check(`panel ${i} height = panel 0 height`, near(cards[i].height, cards[0].height));
  }
  return misses;
}

async function expectSplitGeometry(page: Page) {
  await expectSplit(page);
  await expect.poll(async () => splitMisses(await splitLayout(page))).toEqual([]);
}

async function rectOf(page: Page, selector: string): Promise<Box> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    });
}

async function buttonBox(page: Page, name: string): Promise<Box> {
  return page
    .getByRole("button", { name })
    .evaluate((element) => {
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    });
}

/**
 * Two rendering updates, so a layout decided from the old size (one frame of
 * it is allowed) is not read as the new one.
 */
async function settle(page: Page) {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/** Resizes the window, keeping its height, until W is `target`. */
async function resizeWTo(page: Page, target: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { w } = await splitLayout(page);
    if (w === target) break;
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.width + target - w, height: viewport.height });
    await settle(page);
  }
  await expect.poll(async () => (await splitLayout(page)).w).toBe(target);
  await settle(page);
}

/** Resizes the window, keeping its width, until the visible height is `target`. */
async function resizeVisibleHeightTo(page: Page, target: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { visibleHeight } = await splitLayout(page);
    if (visibleHeight === target) break;
    const viewport = page.viewportSize()!;
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height + target - visibleHeight,
    });
    await settle(page);
  }
  await expect.poll(async () => (await splitLayout(page)).visibleHeight).toBe(target);
  await settle(page);
}

declare global {
  interface Window {
    __splitChanges?: (string | null)[];
    __splitWrites?: string[];
  }
}

/** Records every change to the host's `data-workbench-split` from now on. */
async function watchSplit(page: Page) {
  await host(page).evaluate((node) => {
    window.__splitChanges = [];
    new MutationObserver((records) => {
      for (const record of records) {
        window.__splitChanges!.push(
          (record.target as Element).getAttribute("data-workbench-split"),
        );
      }
    }).observe(node, { attributes: true, attributeFilter: ["data-workbench-split"] });
  });
}

const splitChanges = (page: Page) => page.evaluate(() => window.__splitChanges);

const POINTERS = [
  { name: "fine", hasTouch: false, size: 2 * REM },
  { name: "coarse", hasTouch: true, size: 2.75 * REM },
] as const;

async function expectPointer(page: Page, coarse: boolean) {
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
}

/* ------------------------------------------------------------------ *
 * The button
 * ------------------------------------------------------------------ */

for (const pointer of POINTERS) {
  test.describe(`${pointer.name} pointer`, () => {
    test.use({ hasTouch: pointer.hasTouch });

    test(`SPEC-CORE-127 I1 in the normal layout the button is drawn once, before Enlarge panels and the preview action, each 0.5rem apart (${pointer.name} pointer)`, async ({
      page,
    }) => {
      await openCanonical(page, WIDE, { actions: true });
      await expectPointer(page, pointer.hasTouch);
      expect((await splitLayout(page)).w).toBeGreaterThanOrEqual(SPLIT_FROM);
      await expect(splitButton(page)).toHaveCount(1);
      await expect(splitButton(page)).toHaveAttribute("aria-pressed", "false");
      await expectNormal(page);

      const button = await buttonBox(page, NAME);
      const enlarged = await buttonBox(page, "Enlarge panels");
      const action = await rectOf(page, "[data-testid='fixture-preview-action']");
      expect(near(button.width, pointer.size, 0.5)).toBe(true);
      expect(near(button.height, pointer.size, 0.5)).toBe(true);
      expect(near(enlarged.left - button.right, 0.5 * REM)).toBe(true);
      expect(near(action.left - enlarged.right, 0.5 * REM)).toBe(true);
      expect(
        near((button.top + button.bottom) / 2, (enlarged.top + enlarged.bottom) / 2),
      ).toBe(true);

      const placement = await splitButton(page).evaluate((element) => {
        const group = document.querySelector("[role='group'][aria-label='Panels']")!;
        const actions = document.querySelector("[data-preview-actions]");
        return {
          inRow: group.parentElement!.contains(element),
          inGroup: group.contains(element),
          inActions: actions ? actions.contains(element) : false,
          afterGroup: Boolean(
            group.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        };
      });
      expect(placement).toEqual({ inRow: true, inGroup: false, inActions: false, afterGroup: true });
    });

    test(`SPEC-CORE-127 I1 in the split layout with no preview action the button is the row's last item, at its right edge (${pointer.name} pointer)`, async ({
      page,
    }) => {
      await openCanonical(page, WIDE, { split: "true" });
      await expectPointer(page, pointer.hasTouch);
      await expectSplit(page);
      await expect(splitButton(page)).toHaveCount(1);
      await expect(enlarge(page)).toHaveCount(0);

      const button = await buttonBox(page, NAME);
      const { row } = await splitLayout(page);
      expect(near(button.width, pointer.size, 0.5)).toBe(true);
      expect(near(button.height, pointer.size, 0.5)).toBe(true);
      expect(near(button.right, row.right)).toBe(true);
    });

    test(`SPEC-CORE-127 I1 in the split layout with a preview action the button ends 0.5rem left of it (${pointer.name} pointer)`, async ({
      page,
    }) => {
      await openCanonical(page, WIDE, { split: "true", actions: true });
      await expectSplit(page);
      await expect(enlarge(page)).toHaveCount(0);

      const button = await buttonBox(page, NAME);
      const action = await rectOf(page, "[data-testid='fixture-preview-action']");
      expect(near(action.left - button.right, 0.5 * REM)).toBe(true);
    });
  });
}

const ABSENT = [
  {
    name: "on the collection surface",
    size: { width: 1440, height: 900 },
    hash: COLLECTION,
    inspectorOpen: undefined,
    panelVisible: true,
    stored: ["transcript"],
  },
  {
    name: "in stacked with the inspector open",
    size: { width: 800, height: 900 },
    hash: CANONICAL,
    inspectorOpen: true,
    panelVisible: false,
    stored: ["transcript"],
  },
  {
    name: "on the phone",
    size: { width: 390, height: 844 },
    hash: CANONICAL,
    inspectorOpen: undefined,
    panelVisible: false,
    stored: ["transcript"],
  },
  {
    name: "with no shown panel",
    size: WIDE,
    hash: CANONICAL,
    inspectorOpen: true,
    panelVisible: false,
    stored: [],
  },
  {
    name: "while W is under 61rem (1280x900, inspector open)",
    size: { width: 1280, height: 900 },
    hash: CANONICAL,
    inspectorOpen: true,
    panelVisible: true,
    stored: ["transcript"],
  },
  {
    name: "while W is under 61rem (1440x900, sidebar and inspector open)",
    size: WIDE,
    hash: SIDEBAR,
    inspectorOpen: true,
    panelVisible: true,
    stored: ["transcript"],
  },
];

for (const form of ABSENT) {
  test(`SPEC-CORE-127 I1 SPEC-CORE-126 I4 draws no button and no split layout ${form.name}, where the wide canonical page with a panel does`, async ({
    page,
  }) => {
    await page.setViewportSize(form.size);
    await open(page, form.hash, {
      stored: form.stored,
      inspectorOpen: form.inspectorOpen,
      split: "true",
    });
    await expect(page.locator("video").first()).toBeVisible();
    if (form.panelVisible) await transcriptLoaded(page);
    if (form.hash === CANONICAL && form.size.width >= 1280) {
      expect((await splitLayout(page)).w < SPLIT_FROM || form.stored.length === 0).toBe(true);
    }
    await expect(splitButton(page)).toHaveCount(0);
    await expect(page.locator("[data-workbench-split]")).toHaveCount(0);

    await openCanonical(page, WIDE, { split: "true" });
    await expect(splitButton(page)).toHaveCount(1);
    await expectSplit(page);
  });
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

const GEOMETRY_WINDOWS = [
  {
    name: "1440x900, frame at the left column's width",
    size: WIDE,
    inspectorOpen: true,
    limited: false,
  },
  {
    name: "1440x400, frame limited by the height",
    size: { width: 1440, height: 400 },
    inspectorOpen: true,
    limited: true,
  },
  {
    name: "1920x900 inspector closed, right column over 41rem",
    size: { width: 1920, height: 900 },
    inspectorOpen: false,
    limited: false,
  },
] as const;

for (const pointer of POINTERS) {
  test.describe(`${pointer.name} pointer geometry`, () => {
    test.use({ hasTouch: pointer.hasTouch });

    for (const window of GEOMETRY_WINDOWS) {
      for (const panels of ["one", "two"] as const) {
        test(`SPEC-CORE-126 I2 the split layout's columns, frame, row and panels (${window.name}, ${panels} panel${panels === "two" ? "s" : ""}, ${pointer.name} pointer)`, async ({
          page,
        }) => {
          await page.setViewportSize(window.size);
          await open(page, CANONICAL, {
            panels,
            stored: panels === "two" ? ["transcript", "outline"] : ["transcript"],
            inspectorOpen: window.inspectorOpen,
            split: "true",
          });
          await transcriptLoaded(page);
          await expectPointer(page, pointer.hasTouch);
          if (!window.inspectorOpen) {
            // Two panels in a column this wide would sit side by side outside the split layout.
            expect(0.4 * ((await splitLayout(page)).w - REM)).toBeGreaterThanOrEqual(41 * REM);
          }
          await expectSplitGeometry(page);

          const layout = await splitLayout(page);
          expect(layout.cards).toHaveLength(panels === "two" ? 2 : 1);
          const left = SHARE * (layout.w - REM);
          expect(layout.frame.width < left - 1).toBe(window.limited);
        });
      }
    }
  });
}

test("SPEC-CORE-126 I2 with the inspector closed the right column runs to the canvas's right edge", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await open(page, CANONICAL, { stored: ["transcript"], inspectorOpen: false, split: "true" });
  await transcriptLoaded(page);
  await expectSplitGeometry(page);
});

/* ------------------------------------------------------------------ *
 * No page scroll
 * ------------------------------------------------------------------ */

for (const panels of ["one", "two"] as const) {
  test(`SPEC-CORE-126 I3 at visible heights of 320px and more the page does not scroll and each panel scrolls inside (${panels})`, async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await open(page, CANONICAL, {
      panels,
      stored: panels === "two" ? ["transcript", "outline"] : ["transcript"],
      inspectorOpen: true,
      split: "true",
    });
    await transcriptLoaded(page);
    await expectSplit(page);

    for (const height of [860, 600, 320]) {
      await resizeVisibleHeightTo(page, height);
      await expectSplit(page);
      const layout = await splitLayout(page);
      expect(layout.scrolls, `visible height ${height}`).toBe(false);
      for (const label of panels === "two" ? ["Transcript", "Outline"] : ["Transcript"]) {
        const inside = await card(page, label)
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
        expect(inside, `${label} at visible height ${height}`).toBe(true);
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 * Attributes and the other workbench buttons
 * ------------------------------------------------------------------ */

test("SPEC-CORE-126 I4 in the split layout Enlarge panels is not drawn, the row is not beside, and player focus is off the host; leaving restores them", async ({
  page,
}) => {
  // With the split value off this window is in SPEC-CORE-105's beside state.
  await openCanonical(page, { width: 1590, height: 1122 }, { focus: "true", split: "true" });
  await expectSplit(page);
  await expect(host(page)).toHaveAttribute("data-workbench", "on");
  await expect(host(page)).not.toHaveAttribute("data-player-focus", /.*/);
  await expect(workbench(page)).not.toHaveAttribute("data-row-beside", /.*/);
  await expect(enlarge(page)).toHaveCount(0);

  await splitButton(page).click();
  await expectNormal(page);
  await expect(enlarge(page)).toHaveAttribute("aria-pressed", "true");
  await expect(workbench(page)).toHaveAttribute("data-row-beside", "on");
  expect(await page.evaluate(() => localStorage.getItem("workbench-player-focus"))).toBe(
    "true",
  );
});

/* ------------------------------------------------------------------ *
 * The normal layout is today's
 * ------------------------------------------------------------------ */

async function normalBoxes(page: Page) {
  return {
    video: await rectOf(page, "video"),
    row: await panelGroup(page).evaluate((group) => {
      const r = group.parentElement!.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }),
    panels: await page.evaluate(() =>
      Array.from(document.querySelectorAll("section"))
        .filter((s) => s.querySelector("h2"))
        .map((s) => {
          const r = s.getBoundingClientRect();
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        }),
    ),
  };
}

const NORMAL_CASES = [
  { name: "below 61rem", hash: SIDEBAR, stored: ["transcript"], focus: undefined },
  { name: "below 61rem with Enlarge panels on", hash: SIDEBAR, stored: ["transcript"], focus: "true" },
  { name: "with no shown panel", hash: CANONICAL, stored: [], focus: undefined },
  { name: "with no shown panel and Enlarge panels on", hash: CANONICAL, stored: [], focus: "true" },
] as const;

for (const variant of NORMAL_CASES) {
  test(`SPEC-CORE-126 I5 ${variant.name}, the page with the value "true" is laid out as with it absent, where the wide page with a panel splits`, async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await open(page, variant.hash, {
      stored: variant.stored,
      inspectorOpen: true,
      focus: variant.focus,
    });
    await expect(panelGroup(page)).toBeVisible();
    if (variant.stored.length > 0) await transcriptLoaded(page);
    await settle(page);
    const absent = await normalBoxes(page);

    await open(page, variant.hash, {
      stored: variant.stored,
      inspectorOpen: true,
      focus: variant.focus,
      split: "true",
    });
    await expect(panelGroup(page)).toBeVisible();
    if (variant.stored.length > 0) await transcriptLoaded(page);
    await expectNormal(page);
    await expect.poll(() => normalBoxes(page)).toEqual(absent);

    await openCanonical(page, WIDE, { split: "true", focus: variant.focus });
    await expectSplit(page);
  });
}

/* ------------------------------------------------------------------ *
 * Normal flow
 * ------------------------------------------------------------------ */

test("SPEC-CORE-126 §1 a press splits, a second panel stacks, closing both leaves the value, turning one on splits again, and a press returns", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await open(page, CANONICAL, { panels: "two", stored: ["transcript"], inspectorOpen: true });
  await transcriptLoaded(page);
  await expectNormal(page);
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "false");

  await splitButton(page).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), SPLIT_KEY)).toBe("true");
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "true");
  await expectSplitGeometry(page);

  await panelGroup(page).getByRole("button", { name: "Outline" }).click();
  await expect(card(page, "Outline")).toHaveCount(1);
  await expectSplitGeometry(page);
  expect((await splitLayout(page)).cards).toHaveLength(2);

  await page.getByRole("button", { name: "Close Transcript" }).click();
  await page.getByRole("button", { name: "Close Outline" }).click();
  await expectNormal(page);
  await expect(splitButton(page)).toHaveCount(0);
  await expect(panelGroup(page)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SPLIT_KEY)).toBe("true");

  await panelGroup(page).getByRole("button", { name: "Transcript" }).click();
  await transcriptLoaded(page);
  await expectSplitGeometry(page);

  await splitButton(page).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), SPLIT_KEY)).toBe("false");
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "false");
  await expectNormal(page);
});

test("SPEC-CORE-126 §1 step 6 opening the inspector beside the sidebar leaves the split layout without writing the value, and closing it returns", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await open(page, SIDEBAR, { stored: ["transcript"], inspectorOpen: false, split: "true" });
  await transcriptLoaded(page);
  expect((await splitLayout(page)).w).toBeGreaterThanOrEqual(SPLIT_FROM);
  await expectSplit(page);

  await page.getByTestId("inspector-toggle").click();
  await expect(page.getByTestId("inspector-pane")).toBeVisible();
  await expect.poll(async () => (await splitLayout(page)).w).toBeLessThan(SPLIT_FROM);
  await expectNormal(page);
  await expect(splitButton(page)).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), SPLIT_KEY)).toBe("true");

  await page.getByTestId("inspector-toggle").click();
  await expect.poll(async () => (await splitLayout(page)).w).toBeGreaterThanOrEqual(SPLIT_FROM);
  await expectSplitGeometry(page);
});

/* ------------------------------------------------------------------ *
 * The stored value
 * ------------------------------------------------------------------ */

const STORED = [
  { name: "absent", raw: undefined, on: false },
  { name: '"false"', raw: "false", on: false },
  { name: "empty", raw: "", on: false },
  { name: '"TRUE"', raw: "TRUE", on: false },
  { name: '" true"', raw: " true", on: false },
  { name: '"1"', raw: "1", on: false },
  { name: "the JSON string", raw: '"true"', on: false },
  { name: '"true"', raw: "true", on: true },
] as const;

for (const value of STORED) {
  test(`SPEC-CORE-127 I7 SPEC-CORE-126 §2 a stored value that is ${value.name} is ${value.on ? "on" : "off"}`, async ({
    page,
  }) => {
    await openCanonical(page, WIDE, { split: value.raw });
    await expect(splitButton(page)).toHaveAttribute("aria-pressed", String(value.on));
    if (value.on) await expectSplit(page);
    else await expectNormal(page);
  });
}

test("SPEC-CORE-127 I7 names the button with the same title in both states and draws the Columns2 icon", async ({
  page,
}) => {
  await openCanonical(page, WIDE);
  for (const pressed of ["false", "true"]) {
    const button = splitButton(page);
    await expect(button).toHaveAttribute("aria-pressed", pressed);
    await expect(button).toHaveAttribute("title", NAME);
    expect((await button.textContent())?.trim()).toBe("");
    await expect(button.locator("svg.lucide-columns-2")).toHaveCount(1);
    await button.click();
  }
});

test("SPEC-CORE-127 I7 another window of the same browser applies a press", async ({ page }) => {
  await openCanonical(page, WIDE);
  await expectNormal(page);

  const other = await page.context().newPage();
  await other.goto(page.url());
  await other.evaluate((key) => localStorage.setItem(key, "true"), SPLIT_KEY);
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "true");
  await expectSplit(page);

  await other.evaluate((key) => localStorage.setItem(key, "false"), SPLIT_KEY);
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "false");
  await expectNormal(page);

  await other.evaluate((key) => localStorage.setItem(key, "true"), SPLIT_KEY);
  await expectSplit(page);
  await other.evaluate((key) => localStorage.removeItem(key), SPLIT_KEY);
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "false");
  await expectNormal(page);
});

test("SPEC-CORE-127 I7 a storage event with no key rereads the value", async ({ page }) => {
  await openCanonical(page, WIDE);
  await expectNormal(page);

  await page.evaluate((key) => {
    localStorage.setItem(key, "true");
    window.dispatchEvent(
      new StorageEvent("storage", { key: null, storageArea: localStorage }),
    );
  }, SPLIT_KEY);
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "true");
  await expectSplit(page);
});

test("SPEC-CORE-127 I7 SPEC-CORE-126 §2 with a throwing storage the value reads off and a press flips it in memory, silently", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (this: Storage, k: string) {
      if (k === key) throw new DOMException("denied", "SecurityError");
      return getItem.call(this, k);
    };
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === key) throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, k, v);
    };
  }, SPLIT_KEY);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await openCanonical(page, WIDE);
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "false");
  const before = errors.length;

  await splitButton(page).click();
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "true");
  await expectSplit(page);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await splitButton(page).click();
  await expect(splitButton(page)).toHaveAttribute("aria-pressed", "false");
  await expectNormal(page);
  expect(errors.slice(before)).toEqual([]);
});

/** Counts every write of `workbench-split` made in this document from now on. */
async function watchWrites(page: Page) {
  await page.evaluate((key) => {
    window.__splitWrites = [];
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === key) window.__splitWrites!.push(`set ${v}`);
      return setItem.call(this, k, v);
    };
    Storage.prototype.removeItem = function (this: Storage, k: string) {
      if (k === key) window.__splitWrites!.push("remove");
      return removeItem.call(this, k);
    };
  }, SPLIT_KEY);
}

const splitWrites = (page: Page) => page.evaluate(() => window.__splitWrites);
const storedSplit = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), SPLIT_KEY);

test("SPEC-CORE-127 I7 only a press writes the value: closing panels, a width change, a form change, Find and a reload leave it", async ({
  page,
}) => {
  await openCanonical(page, WIDE);
  await splitButton(page).click();
  await expectSplit(page);
  expect(await storedSplit(page)).toBe("true");
  await watchWrites(page);

  await page.getByRole("button", { name: "Close Transcript" }).click();
  await expectNormal(page);
  await panelGroup(page).getByRole("button", { name: "Transcript" }).click();
  await transcriptLoaded(page);
  await expectSplit(page);

  await resizeWTo(page, SPLIT_FROM - 8);
  await expectNormal(page);
  await resizeWTo(page, SPLIT_FROM + 8);
  await expectSplit(page);

  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "stacked",
  );
  await expectNormal(page);
  await page.setViewportSize(WIDE);
  await expectSplit(page);

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("ControlOrMeta+f");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe("INPUT");

  expect(await splitWrites(page)).toEqual([]);
  expect(await storedSplit(page)).toBe("true");

  await page.reload();
  await transcriptLoaded(page);
  await expectSplit(page);
  expect(await storedSplit(page)).toBe("true");

  await watchWrites(page);
  await splitButton(page).click();
  expect(await splitWrites(page)).toEqual(["set false"]);
});

/* ------------------------------------------------------------------ *
 * What flips the layout and what does not
 * ------------------------------------------------------------------ */

test("SPEC-CORE-126 I9 a width-only resize flips the layout between W = 61rem and 61rem minus 1px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await open(page, CANONICAL, { stored: ["transcript"], inspectorOpen: false, split: "true" });
  await transcriptLoaded(page);

  await resizeWTo(page, SPLIT_FROM);
  await expectSplit(page);
  await resizeWTo(page, SPLIT_FROM - 1);
  await expectNormal(page);
  await expect(splitButton(page)).toHaveCount(0);
  await resizeWTo(page, SPLIT_FROM);
  await expectSplitGeometry(page);
});

test("SPEC-CORE-126 I9 an H-only resize and opening Find never change the layout", async ({
  page,
}) => {
  await openCanonical(page, WIDE, { split: "true" });
  await expectSplit(page);
  await watchSplit(page);

  await resizeVisibleHeightTo(page, 400);
  await resizeVisibleHeightTo(page, 1000);
  await resizeVisibleHeightTo(page, 860);

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("ControlOrMeta+f");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe("INPUT");
  await settle(page);

  expect(await splitChanges(page)).toEqual([]);
  await expectSplit(page);
});

test("SPEC-CORE-126 §3 a storage event for workbench-player-focus or workbench-panels that keeps a panel shown leaves the layout", async ({
  page,
}) => {
  await openCanonical(page, WIDE, { split: "true", panels: "two" });
  await expectSplit(page);
  await watchSplit(page);

  const other = await page.context().newPage();
  await other.goto(page.url());
  await other.evaluate(() => {
    localStorage.setItem("workbench-player-focus", "true");
    localStorage.setItem("workbench-panels", JSON.stringify(["transcript", "outline"]));
  });
  await expect(card(page, "Outline")).toHaveCount(1);
  await settle(page);

  expect(await splitChanges(page)).toEqual([]);
  await expectSplitGeometry(page);
});

/* ------------------------------------------------------------------ *
 * The player and the panels across every input
 * ------------------------------------------------------------------ */

async function tag(page: Page) {
  await page.locator("video").first().evaluate((video) => {
    (video as HTMLVideoElement & { __fixtureTag?: string }).__fixtureTag = "kept";
  });
  await page
    .getByTestId("fixture-transcript")
    .first()
    .evaluate((node) => {
      (node as HTMLElement & { __fixtureTag?: string }).__fixtureTag = "kept";
    });
}

async function tags(page: Page) {
  const read = (node: Element) => (node as Element & { __fixtureTag?: string }).__fixtureTag;
  return {
    video: await page.locator("video").first().evaluate(read),
    panel: await page.getByTestId("fixture-transcript").first().evaluate(read),
  };
}

async function playback(page: Page) {
  return page
    .locator("video")
    .first()
    .evaluate((video: HTMLVideoElement) => ({ paused: video.paused, time: video.currentTime }));
}

async function pauseAt(page: Page, time: number) {
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement, time) => {
    video.pause();
    video.currentTime = time;
    await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
  }, time);
}

test("SPEC-CORE-126 I6 a press, a width change across 61rem, an inspector toggle, an H-only resize and a storage event keep the paused player, its position, the panel and workbench-panels", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await open(page, SIDEBAR, { stored: ["transcript"], inspectorOpen: false });
  await transcriptLoaded(page);
  await tag(page);
  await pauseAt(page, 1.25);
  const panels = await page.evaluate((key) => localStorage.getItem(key), PANELS_KEY);

  const other = await page.context().newPage();
  const crossings: [string, () => Promise<void>, boolean][] = [
    ["press on", () => splitButton(page).click(), true],
    ["press off", () => splitButton(page).click(), false],
    ["press on again", () => splitButton(page).click(), true],
    ["narrow", () => resizeWTo(page, SPLIT_FROM - 8), false],
    ["widen", () => resizeWTo(page, SPLIT_FROM + 8), true],
    [
      "inspector open",
      async () => {
        await page.setViewportSize(WIDE);
        await page.getByTestId("inspector-toggle").click();
        await expect(page.getByTestId("inspector-pane")).toBeVisible();
      },
      false,
    ],
    [
      "inspector closed",
      async () => {
        await page.getByTestId("inspector-toggle").click();
      },
      true,
    ],
    ["shorter", () => resizeVisibleHeightTo(page, 500), true],
    ["taller", () => resizeVisibleHeightTo(page, 860), true],
    [
      "storage off",
      async () => {
        await other.goto(page.url());
        await other.evaluate((key) => localStorage.setItem(key, "false"), SPLIT_KEY);
      },
      false,
    ],
    [
      "storage on",
      () => other.evaluate((key) => localStorage.setItem(key, "true"), SPLIT_KEY),
      true,
    ],
  ];
  for (const [name, cross, on] of crossings) {
    await cross();
    if (on) await expect(host(page), name).toHaveAttribute("data-workbench-split", "on");
    else await expect(host(page), name).not.toHaveAttribute("data-workbench-split", /.*/);
    expect(await tags(page), name).toEqual({ video: "kept", panel: "kept" });
    const now = await playback(page);
    expect(now.paused, name).toBe(true);
    expect(Math.abs(now.time - 1.25), name).toBeLessThan(0.01);
    expect(await page.evaluate((key) => localStorage.getItem(key), PANELS_KEY), name).toBe(
      panels,
    );
  }
});

test("SPEC-CORE-126 I6 a form change into stacked with the inspector open and back keeps the paused player and its position", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await open(page, SIDEBAR, { stored: ["transcript"], inspectorOpen: false, split: "true" });
  await transcriptLoaded(page);
  await expectSplit(page);
  await page.locator("video").first().evaluate((video) => {
    (video as HTMLVideoElement & { __fixtureTag?: string }).__fixtureTag = "kept";
  });
  await pauseAt(page, 1.25);

  await page.setViewportSize({ width: 1040, height: 900 });
  await page.getByTestId("inspector-toggle").click();
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "stacked",
  );
  await expectNormal(page);
  await page.getByTestId("inspector-toggle").click();
  await page.setViewportSize(WIDE);
  await expectSplit(page);

  expect((await tags(page)).video).toBe("kept");
  const now = await playback(page);
  expect(now.paused).toBe(true);
  expect(Math.abs(now.time - 1.25)).toBeLessThan(0.01);
});

test("SPEC-CORE-126 I6 closing the last panel and turning it on again keeps the paused player and its position", async ({
  page,
}) => {
  await openCanonical(page, WIDE, { split: "true" });
  await expectSplit(page);
  await page.locator("video").first().evaluate((video) => {
    (video as HTMLVideoElement & { __fixtureTag?: string }).__fixtureTag = "kept";
  });
  await pauseAt(page, 1.25);

  await page.getByRole("button", { name: "Close Transcript" }).click();
  await expectNormal(page);
  await panelGroup(page).getByRole("button", { name: "Transcript" }).click();
  await transcriptLoaded(page);
  await expectSplit(page);

  expect((await tags(page)).video).toBe("kept");
  const now = await playback(page);
  expect(now.paused).toBe(true);
  expect(Math.abs(now.time - 1.25)).toBeLessThan(0.01);
});

test("SPEC-CORE-126 I6 entering and leaving by a press does not stop a playing player", async ({
  page,
}) => {
  await openCanonical(page, WIDE);
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    video.loop = true;
    await video.play();
  });

  await splitButton(page).click();
  await expectSplit(page);
  expect((await playback(page)).paused).toBe(false);
  await splitButton(page).click();
  await expectNormal(page);
  expect((await playback(page)).paused).toBe(false);
});

/* ------------------------------------------------------------------ *
 * The first painted frame
 * ------------------------------------------------------------------ */

interface Sample {
  panel: boolean;
  right: boolean;
}

declare global {
  interface Window {
    __splitSamples: Sample[];
    __splitSamplesDone: boolean;
  }
}

test("SPEC-CORE-126 I8 opening the page with the value on never paints a panel under the player", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.addInitScript(() => {
    localStorage.setItem("workbench-panels", JSON.stringify(["transcript"]));
    localStorage.setItem("inspector-open:fixture", "true");
    localStorage.setItem("workbench-split", "true");
    const samples: Sample[] = [];
    window.__splitSamples = samples;
    const start = performance.now();
    let seenAt: number | null = null;
    let seenFrames = 0;
    const sample = () => {
      const video = document.querySelector("video");
      const panel = Array.from(document.querySelectorAll("section")).find(
        (section) => section.querySelector("h2")?.textContent?.trim() === "Transcript",
      );
      const shown = Boolean(panel && video && panel.getBoundingClientRect().height > 0);
      samples.push({
        panel: shown,
        right:
          shown &&
          panel!.getBoundingClientRect().left >= video!.getBoundingClientRect().right - 1,
      });
      const now = performance.now();
      if (shown && seenAt === null) seenAt = now;
      if (seenAt !== null) seenFrames++;
      if ((seenAt !== null && seenFrames >= 30 && now - seenAt >= 500) || now - start >= 10_000) {
        window.__splitSamplesDone = true;
      } else {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  const query = new URLSearchParams({
    run: String(++navigation),
    panels: "one",
    "module-delay": "200",
  });
  await page.goto(`${FIXTURE}?${query}${CANONICAL}`);
  await page.waitForFunction(() => window.__splitSamplesDone === true);
  const samples = await page.evaluate(() => window.__splitSamples);

  const withPanel = samples.filter((s) => s.panel);
  expect(withPanel.length).toBeGreaterThan(0);
  expect(withPanel.filter((s) => !s.right)).toEqual([]);
});

/* ------------------------------------------------------------------ *
 * Full screen
 * ------------------------------------------------------------------ */

const frameOf = (page: Page) => page.getByTestId("player-frame").first();

async function refuseSystemFullscreen(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("refused"));
  });
}

async function pressFrameButton(page: Page, label: string) {
  await frameOf(page).evaluate((element, label) => {
    const button = Array.from(element.querySelectorAll("button")).find(
      (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "") === label,
    );
    button!.click();
  }, label);
}

async function frameSettled(page: Page) {
  await settle(page);
  const moving = await frameOf(page).getAttribute("data-fullscreen-moving");
  return { frame: await rectOf(page, "[data-testid='player-frame']"), moving: moving !== null };
}

async function enterFullscreen(page: Page) {
  await pressFrameButton(page, "Full screen");
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const { frame, moving } = await frameSettled(page);
      return !moving && near(frame.width, viewport.width) && near(frame.height, viewport.height);
    })
    .toBe(true);
}

async function exitFullscreen(page: Page) {
  await pressFrameButton(page, "Exit full screen");
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const { frame, moving } = await frameSettled(page);
      return !moving && frame.width < viewport.width - 1;
    })
    .toBe(true);
}

const FULLSCREENS = [
  { name: "pseudo full screen", hasTouch: true, refuse: true, held: true },
  { name: "system full screen", hasTouch: false, refuse: false, held: false },
] as const;

for (const fullscreen of FULLSCREENS) {
  test.describe(fullscreen.name, () => {
    test.use({ hasTouch: fullscreen.hasTouch });

    test(`SPEC-CORE-126 I5 ${fullscreen.name}${fullscreen.held ? " never changes the layout, and" : ""} leaving it at the same window size returns the split layout and its geometry`, async ({
      page,
    }) => {
      if (fullscreen.refuse) await refuseSystemFullscreen(page);
      await openCanonical(page, WIDE, { split: "true" });
      await expectSplitGeometry(page);
      const before = await splitLayout(page);
      await watchSplit(page);

      await enterFullscreen(page);
      expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(
        !fullscreen.refuse,
      );
      await exitFullscreen(page);

      await expectSplit(page);
      if (fullscreen.held) expect(await splitChanges(page)).toEqual([]);
      await expect
        .poll(async () => {
          const after = await splitLayout(page);
          return {
            frame: [after.frame.left, after.frame.top, after.frame.width].map(Math.round),
            row: [after.row.left, after.row.top, after.row.width].map(Math.round),
            cards: after.cards.map((c) => [c.left, c.top, c.width, c.height].map(Math.round)),
          };
        })
        .toEqual({
          frame: [before.frame.left, before.frame.top, before.frame.width].map(Math.round),
          row: [before.row.left, before.row.top, before.row.width].map(Math.round),
          cards: before.cards.map((c) => [c.left, c.top, c.width, c.height].map(Math.round)),
        });
    });

    test(`SPEC-CORE-126 I5 the ${fullscreen.name} frame is the same size with the value on and off`, async ({
      page,
    }) => {
      if (fullscreen.refuse) await refuseSystemFullscreen(page);
      await openCanonical(page, WIDE);
      await expectNormal(page);
      await enterFullscreen(page);
      const off = await rectOf(page, "[data-testid='player-frame']");
      await exitFullscreen(page);

      await splitButton(page).click();
      await expectSplit(page);
      await enterFullscreen(page);
      const on = await rectOf(page, "[data-testid='player-frame']");
      expect(near(on.width, off.width)).toBe(true);
      expect(near(on.height, off.height)).toBe(true);
    });
  });
}
