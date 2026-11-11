/**
 * SPEC-CORE-064 and SPEC-CORE-065 measured in Chromium: with a mouse there
 * is no horizontal scrolling left in the components the rule reaches, and
 * with a coarse pointer every strip still scrolls the way it did.
 *
 * Two environments, chosen exactly as the rule names them: a mouse answers
 * `(hover: hover) and (pointer: fine)` and a touch context answers
 * `(pointer: coarse)` with no hover. The widths below are the container the
 * component sits in, not the window: the rule is never about a breakpoint.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "no-horizontal-scroll.html"),
).href;
const POLICY_FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "addon-policy.html"),
).href;

const SPEC: Record<string, string> = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures", "no-horizontal-scroll.html"), "utf-8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const TOLERANCE = 1;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface ScrollBox extends Box {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  overflowX: string;
  overflowY: string;
  flexWrap: string;
}

interface CollectionReading {
  list: ScrollBox;
  scrolledTo: number;
  tracks: Box[];
}

interface TabReading {
  strip: ScrollBox;
  tabs: (Box & { selected: boolean; tabIndex: number; focused: boolean })[];
}

interface BreadcrumbReading {
  nav: ScrollBox;
  labels: (Box & {
    text: string;
    scrollWidth: number;
    clientWidth: number;
    title: string | null;
  })[];
}

declare global {
  interface Window {
    buildCollectionPanel: (spec: { width: number; tracks: number }) => void;
    measureCollection: (scrollTop?: number) => CollectionReading;
    buildPageTabs: (spec: { width: number; tabs: number }) => void;
    buildInspectorTabs: (spec: { width: number; tabs: number }) => void;
    measureTabs: () => TabReading;
    buildBreadcrumb: (spec: {
      width: number;
      segments: string[];
      leafNode?: boolean;
    }) => void;
    measureBreadcrumb: () => BreadcrumbReading;
    buildPolicyTable: (spec: {
      width: number;
      drives: number;
      featuresPerDrive: number;
      columns: number;
    }) => void;
    measurePolicyTable: (scrollTop?: number) => {
      frameWidth: number;
      capPx: number;
      wrapperHeight: number;
      tableHeight: number;
      scrollsVertically: boolean;
      scrollsHorizontally: boolean;
      scrolledTo: number;
      headTop: number;
      firstRowTop: number;
      headPosition: string;
      headBackground: string;
    };
    buildSearchResults: (spec: {
      width: number;
      typeChip: boolean;
      operator: boolean;
    }) => void;
    measureSearchResults: () => {
      documentWidth: number;
      documentScrollWidth: number;
      frame: Box & { scrollWidth: number; clientWidth: number };
      page: Box;
      field: Box;
      chips: Box;
      bar: Box;
      switch: Box;
      scene: Box;
      count: Box;
      more: Box;
    };
  }
}

const within = (inner: Box, outer: Box) =>
  inner.left >= outer.left - TOLERANCE &&
  inner.right <= outer.right + TOLERANCE &&
  inner.top >= outer.top - TOLERANCE &&
  inner.bottom <= outer.bottom + TOLERANCE;

const COLLECTION_TRACKS = 18;

const STRIP_TABS = 12;

const BREADCRUMB_SEGMENTS = [
  "A folder with a long name",
  "A subfolder with a longer name",
  "One more nested folder with a long name",
  "The deepest folder that names the current place",
];

async function collection(page: Page, width: number) {
  await page.goto(FIXTURE);
  await page.evaluate((spec) => window.buildCollectionPanel(spec), {
    width,
    tracks: COLLECTION_TRACKS,
  });
  return page.evaluate(() => window.measureCollection(0));
}

async function tabs(
  page: Page,
  kind: "page" | "inspector",
  width: number,
) {
  await page.goto(FIXTURE);
  await page.evaluate(
    ([build, spec]) =>
      (window as unknown as Record<string, (s: unknown) => void>)[build](spec),
    [kind === "page" ? "buildPageTabs" : "buildInspectorTabs", {
      width,
      tabs: STRIP_TABS,
    }] as const,
  );
  return page.evaluate(() => window.measureTabs());
}

async function breadcrumb(
  page: Page,
  width: number,
  { leafNode = false }: { leafNode?: boolean } = {},
) {
  await page.goto(FIXTURE);
  await page.evaluate((spec) => window.buildBreadcrumb(spec), {
    width,
    segments: BREADCRUMB_SEGMENTS,
    leafNode,
  });
  return page.evaluate(() => window.measureBreadcrumb());
}

/**
 * Every element on the page that scrolls sideways although it has more
 * content than box. The exempt content is named here as the rule names it;
 * the fixture has none, so a hit is a defect.
 */
async function horizontalScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const EXEMPT =
      ".markdown-body pre, .markdown-body .markdown-table-scroll, .markdown-body .code-block, .mermaid-diagram";
    return Array.from(document.querySelectorAll("body *"))
      .filter(
        (node) =>
          !node.closest(EXEMPT) && !node.closest("[data-hscroll-exempt]"),
      )
      .filter((node) => {
        const overflow = getComputedStyle(node).overflowX;
        return (
          (overflow === "auto" || overflow === "scroll") &&
          node.scrollWidth > node.clientWidth + 1
        );
      })
      .map((node) => `${node.tagName.toLowerCase()}.${String(node.className)}`);
  });
}

const tabStops = (reading: TabReading) =>
  reading.tabs.filter((tab) => tab.tabIndex === 0);

const selectedIndex = (reading: TabReading) =>
  reading.tabs.findIndex((tab) => tab.selected);

test.describe("mouse environment", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("SPEC-CORE-064 I1 — the context really reports hover and a fine pointer", async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    const media = await page.evaluate(() => ({
      mouse: matchMedia("(hover: hover) and (pointer: fine)").matches,
      coarse: matchMedia("(pointer: coarse)").matches,
    }));
    expect(media.mouse).toBe(true);
    expect(media.coarse).toBe(false);
  });

  test.describe("SPEC-CORE-064 I1 — nothing scrolls sideways under a mouse", () => {
    const CASES = [
      {
        name: "the collection panel's track strip",
        open: (page: Page) => collection(page, 900),
      },
      {
        name: "the page tab strip",
        open: (page: Page) => tabs(page, "page", 560),
      },
      {
        name: "the inspector tab strip",
        open: (page: Page) => tabs(page, "inspector", 560),
      },
      {
        name: "the breadcrumb",
        open: (page: Page) => breadcrumb(page, 460, { leafNode: true }),
      },
    ];

    for (const { name, open } of CASES) {
      test(name, async ({ page }) => {
        await open(page);
        expect(await horizontalScrollers(page)).toEqual([]);
      });
    }
  });

  test.describe("SPEC-CORE-065 I4 — no drawn item is clipped by its wrapper", () => {
    test("the collection panel scrolls vertically and every track stays reachable", async ({
      page,
    }) => {
      const start = await collection(page, 900);

      for (const track of start.tracks) {
        expect(track.left).toBeGreaterThanOrEqual(start.list.left - TOLERANCE);
        expect(track.right).toBeLessThanOrEqual(start.list.right + TOLERANCE);
      }
      expect(start.list.overflowY === "auto" || start.list.overflowY === "scroll").toBe(
        true,
      );
      expect(start.list.scrollHeight).toBeGreaterThan(
        start.list.clientHeight + TOLERANCE,
      );

      // About two rows of tracks, so the box is a window onto the queue
      // rather than the whole queue.
      const trackHeight = start.tracks[0]!.height;
      expect(start.list.height).toBeGreaterThan(trackHeight * 1.5);
      expect(start.list.height).toBeLessThan(trackHeight * 2.5);

      const end = await page.evaluate(() => window.measureCollection(1_000_000));
      const last = end.tracks[end.tracks.length - 1]!;
      expect(end.scrolledTo).toBeGreaterThan(0);
      expect(last.top).toBeGreaterThanOrEqual(end.list.top - TOLERANCE);
      expect(last.bottom).toBeLessThanOrEqual(end.list.bottom + TOLERANCE);
    });
  });

  test.describe("SPEC-CORE-065 I5 — every tab is visible, and the inspector strip keeps one tab stop", () => {
    const STRIPS = ["page", "inspector"] as const;

    for (const kind of STRIPS) {
      test(`${kind} tabs`, async ({ page }) => {
        const before = await tabs(page, kind, 560);

        expect(before.strip.scrollWidth).toBeLessThanOrEqual(
          before.strip.clientWidth + TOLERANCE,
        );
        for (const tab of before.tabs) expect(within(tab, before.strip)).toBe(true);
        expect(selectedIndex(before)).toBe(0);
        if (kind === "page") return;

        expect(tabStops(before)).toHaveLength(1);
        await page.locator("[data-tab]").first().focus();
        await expect(page.locator("[data-tab]").first()).toBeFocused();
        await page.keyboard.press("ArrowRight");

        const after = await page.evaluate(() => window.measureTabs());
        expect(selectedIndex(after)).toBe(1);
        expect(after.tabs[1]!.focused).toBe(true);
        expect(tabStops(after)).toHaveLength(1);
      });
    }
  });

  test.describe("SPEC-CORE-065 I6 — the breadcrumb keeps its last segment whole", () => {
    test("every segment stays in the DOM and the last is fully visible", async ({
      page,
    }) => {
      const m = await breadcrumb(page, 460);

      expect(m.labels).toHaveLength(BREADCRUMB_SEGMENTS.length);
      expect(m.labels.map((label) => label.text)).toEqual(BREADCRUMB_SEGMENTS);

      const last = m.labels[m.labels.length - 1]!;
      expect(last.left).toBeGreaterThanOrEqual(m.nav.left - TOLERANCE);
      expect(last.right).toBeLessThanOrEqual(m.nav.right + TOLERANCE);

      for (const label of m.labels) {
        if (label.scrollWidth > label.clientWidth + TOLERANCE) {
          expect(label.title).not.toBeNull();
        }
      }
    });
  });

  test("SPEC-CORE-065 I7 — the add-on policy table fits and its headings stay sticky", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 667 });
    await page.goto(POLICY_FIXTURE);
    await page.evaluate((spec) => window.buildPolicyTable(spec), {
      width: 375,
      drives: 4,
      featuresPerDrive: 2,
      columns: 4,
    });
    const m = await page.evaluate(() => window.measurePolicyTable(10_000));

    expect(m.scrollsHorizontally).toBe(false);
    expect(m.scrollsVertically).toBe(true);
    expect(m.scrolledTo).toBeGreaterThan(0);
    expect(m.headPosition).toBe("sticky");
    expect(m.headTop).toBe(0);
    expect(m.headBackground).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("SPEC-CORE-066 I10 — the search results page fits 375 px without sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(FIXTURE);
    await page.evaluate((spec) => window.buildSearchResults(spec), {
      width: 375,
      typeChip: true,
      operator: true,
    });
    const m = await page.evaluate(() => window.measureSearchResults());

    expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
    expect(m.frame.scrollWidth).toBeLessThanOrEqual(m.frame.clientWidth);
    expect(within(m.chips, m.page)).toBe(true);
    expect(within(m.field, m.page)).toBe(true);
    expect(within(m.bar, m.frame)).toBe(true);

    const overlaps = (a: Box, b: Box) => a.top < b.bottom && b.top < a.bottom;
    for (const control of [m.switch, m.scene, m.count, m.more]) {
      expect(within(control, m.bar)).toBe(true);
    }
    for (const control of [m.switch, m.scene, m.more]) {
      expect(overlaps(control, m.count)).toBe(true);
    }

    expect(await horizontalScrollers(page)).toEqual([]);
  });

  test("SPEC-CORE-064 I1 — the fixture declares the class lists it measures", () => {
    expect(Object.keys(SPEC).sort()).toEqual(
      [
        "breadcrumb",
        "breadcrumbAncestor",
        "breadcrumbLabel",
        "breadcrumbLeaf",
        "breadcrumbLink",
        "breadcrumbSegment",
        "collectionCard",
        "collectionCount",
        "collectionHead",
        "collectionOuter",
        "collectionTitle",
        "inspectorStrip",
        "inspectorTab",
        "inspectorTabIdle",
        "inspectorTabSelected",
        "pageTab",
        "pageTabIdle",
        "pageTabSelected",
        "pageTabs",
        "track",
        "trackBody",
        "trackList",
        "trackThumb",
        "trackTitle",
      ].sort(),
    );
  });
});

test.describe("touch environment", () => {
  // `hasTouch` alone is what makes Chromium answer `(hover: none)` and
  // `(pointer: coarse)`; `isMobile` would also take over the layout viewport.
  test.use({ viewport: { width: 393, height: 851 }, hasTouch: true });

  test("SPEC-CORE-065 I3 — the context really reports a coarse pointer", async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    const media = await page.evaluate(() => ({
      coarse: matchMedia("(pointer: coarse)").matches,
      hover: matchMedia("(hover: none)").matches,
      mouse: matchMedia("(hover: hover) and (pointer: fine)").matches,
    }));
    expect(media.coarse).toBe(true);
    expect(media.hover).toBe(true);
    expect(media.mouse).toBe(false);
  });

  test.describe("SPEC-CORE-065 I3 — the strips still scroll sideways", () => {
    const CASES = [
      {
        name: "the collection panel's track strip",
        open: (page: Page) => collection(page, 393),
        strip: (reading: CollectionReading) => reading.list,
      },
      {
        name: "the page tab strip",
        open: (page: Page) => tabs(page, "page", 393),
        strip: (reading: TabReading) => reading.strip,
      },
      {
        name: "the inspector tab strip",
        open: (page: Page) => tabs(page, "inspector", 393),
        strip: (reading: TabReading) => reading.strip,
      },
      {
        name: "the breadcrumb",
        open: (page: Page) => breadcrumb(page, 393, { leafNode: true }),
        strip: (reading: BreadcrumbReading) => reading.nav,
      },
    ];

    for (const { name, open, strip } of CASES) {
      test(name, async ({ page }) => {
        const reading = await open(page);
        const box = strip(reading as never);

        expect(box.overflowX === "auto" || box.overflowX === "scroll").toBe(
          true,
        );
        expect(box.scrollWidth).toBeGreaterThan(box.clientWidth + TOLERANCE);
      });
    }
  });
});
