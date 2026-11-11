/**
 * SPEC-CORE-080: the real video and reading faces and the real See all page, measured with
 * the real stylesheet. jsdom lays nothing out, so gaps, column counts and offsets are only
 * answerable here.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { ID, SEE_ALL_FIRST_PAGE, SEE_ALL_TOTAL, bylineOf, titleOf } from "./videoCardSpacing.data";

const FIXTURE = pathToFileURL(PAGE).href;
const PX = 0.5;

let run = 0;

interface Cell {
  left: number;
  right: number;
  top: number;
  bottom: number;
  skeleton: boolean;
  text: string;
}

interface Grid {
  width: number;
  tracks: number;
  bottom: number;
  top: number;
  mark: string | null;
  cells: Cell[];
}

interface Section {
  title: string;
  top: number;
  bottom: number;
  headerToNext: number | null;
  nextHasRetry: boolean;
  grids: Grid[];
}

interface Measured {
  host: { top: number; bottom: number };
  sections: Section[];
  grids: Grid[];
  retryTop: number | null;
}

/** `max(2, floor((W + 16) / (320 + 16)))`, the spec's I2 rule written out. */
const videoColumns = (width: number) => Math.max(2, Math.floor((width + 16) / 336));
const rowsFor = (columns: number) => (columns <= 2 ? 2 : 1);

async function open(page: Page, viewport: number, query: Record<string, string | number>): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: viewport, height: 800 });
  const qs = new URLSearchParams({ run: String(++run), ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) });
  await page.goto(`${FIXTURE}?${qs}#${ID}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect.poll(async () => errors.length > 0 || (await page.locator("body[data-harness=ready]").count()) > 0).toBe(true);
  expect(errors).toEqual([]);
}

function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const host = document.getElementById("video-card-spacing-host")!;
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    };
    const isSkeleton = (el: Element) => el.matches(".animate-pulse") || el.querySelector(".animate-pulse") !== null;
    const gridsIn = (root: Element): Grid[] =>
      [...root.querySelectorAll("*")]
        .filter((el) => getComputedStyle(el).display === "grid" && el.querySelector(":scope > li") !== null)
        .map((el) => {
          const r = box(el);
          return {
            width: el.getBoundingClientRect().width,
            tracks: getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
            top: r.top,
            bottom: r.bottom,
            mark: (el as HTMLElement).dataset.vcsMark ?? null,
            cells: [...el.querySelectorAll(":scope > li")].map((li) => ({
              ...box(li),
              skeleton: isSkeleton(li),
              text: li.textContent ?? "",
            })),
          };
        });
    const sections = [...host.querySelectorAll("section")]
      .filter((s) => s.querySelector("section") === null)
      .map((s) => {
        const heading = s.querySelector("h1, h2, h3, h4, h5, h6");
        const [header, next] = [s.children[0], s.children[1]];
        return {
          title: heading?.textContent?.trim() ?? "",
          ...box(s),
          headerToNext: header && next ? box(next).top - box(header).bottom : null,
          nextHasRetry: [...(next?.querySelectorAll("button") ?? [])].some((b) => /retry/i.test(b.textContent ?? "")) ||
            (next instanceof HTMLButtonElement && /retry/i.test(next.textContent ?? "")),
          grids: gridsIn(s),
        };
      });
    const retry = [...host.querySelectorAll("button")].find((b) => /retry/i.test(b.textContent ?? ""));
    return {
      host: box(host),
      sections,
      grids: gridsIn(host),
      retryTop: retry ? box(retry).top : null,
    };
  });
}

/** Horizontal distances between neighbours in a row, and vertical ones within a column. */
function gapsOf(grid: Grid): { columnGaps: number[]; rowGaps: number[] } {
  const byKey = (key: (c: Cell) => number) => {
    const groups = new Map<number, Cell[]>();
    for (const c of grid.cells) {
      const k = Math.round(key(c));
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    return [...groups.values()];
  };
  const columnGaps = byKey((c) => c.top).flatMap((row) => {
    const sorted = [...row].sort((a, b) => a.left - b.left);
    return sorted.slice(1).map((c, i) => c.left - sorted[i].right);
  });
  const rowGaps = byKey((c) => c.left).flatMap((column) => {
    const sorted = [...column].sort((a, b) => a.top - b.top);
    return sorted.slice(1).map((c, i) => c.top - sorted[i].bottom);
  });
  return { columnGaps, rowGaps };
}

function distinct(values: number[]): number {
  return new Set(values.map((v) => Math.round(v))).size;
}

/** I1 and I2 for one video grid; returns its column count. */
function expectVideoGrid(grid: Grid, label: string): number {
  const columns = videoColumns(grid.width);
  expect(grid.tracks, `${label}: columns for a ${grid.width}px grid`).toBe(columns);
  expect(distinct(grid.cells.map((c) => c.left)), `${label}: distinct cell columns`).toBe(
    Math.min(columns, grid.cells.length),
  );
  const { columnGaps, rowGaps } = gapsOf(grid);
  for (const g of columnGaps) expect(Math.abs(g - 16), `${label}: column gap ${g}`).toBeLessThanOrEqual(PX);
  for (const g of rowGaps) expect(Math.abs(g - 32), `${label}: row gap ${g}`).toBeLessThanOrEqual(PX);
  return columns;
}

function expectShelfStack(sections: Section[], label: string): void {
  expect(sections.length, `${label}: shelves drawn`).toBeGreaterThan(1);
  sections.slice(1).forEach((s, i) => {
    const gap = s.top - sections[i].bottom;
    expect(Math.abs(gap - 40), `${label}: ${sections[i].title || "skeleton"} → ${s.title || "skeleton"} is ${gap}px`).toBeLessThanOrEqual(PX);
  });
  for (const s of sections) {
    expect(s.headerToNext, `${label}: ${s.title || "skeleton"} has a header row and a grid`).not.toBeNull();
    expect(Math.abs(s.headerToNext! - 16), `${label}: ${s.title || "skeleton"} header to grid ${s.headerToNext}px`).toBeLessThanOrEqual(PX);
  }
}

async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.__vcsLaterRequests.length)).toBeGreaterThan(0);
}

export interface SpacingWidths {
  viewport: number;
  /** Host widths for the video Discover face; each names the column count the spec gives it. */
  discover: { host: number; columns: number }[];
  /** The See all page's column count with the host left at the viewport's width. */
  seeAllColumns: number;
  /** A host narrower than the viewport, where the See all page's own width decides. */
  seeAllNarrow?: { host: number; columns: number };
}

export function videoCardSpacingCases(w: SpacingWidths): void {
  const at = `at ${w.viewport}px`;

  for (const { host, columns } of w.discover) {
    test(`SPEC-CORE-080 I1 I2 I8 Discover's video shelves take ${columns} columns of their own width in a ${host}px host, 16px and 32px apart, ${at}`, async ({
      page,
    }) => {
      await open(page, w.viewport, { face: "video-discover", w: host });
      const m = await measure(page);

      const loaded = m.sections.filter((s) => s.title === "Continue" || s.title === "Subscriptions");
      expect(loaded.map((s) => s.title)).toEqual(["Continue", "Subscriptions"]);
      for (const s of loaded) {
        expect(s.grids, `${s.title} has one grid`).toHaveLength(1);
        const grid = s.grids[0];
        expect(videoColumns(grid.width), `${s.title}: the ${grid.width}px grid is in the band under test`).toBe(columns);
        expectVideoGrid(grid, s.title);
        expect(grid.cells.filter((c) => !c.skeleton), `${s.title}: cards drawn`).toHaveLength(columns * rowsFor(columns));
      }
    });
  }

  test(`SPEC-CORE-080 I4 a video card's title sits 12px under the thumbnail at 16/22 medium in two lines, its byline 4px under at 14/20, ${at}`, async ({
    page,
  }) => {
    await open(page, w.viewport, { face: "video-discover", w: w.discover[0].host });
    const id = "s0";
    const m = await page.evaluate(
      ({ title, byline }) => {
        const innermost = (root: Element, text: string) =>
          [...root.querySelectorAll("*")].filter((el) => el.textContent === text).pop() ?? null;
        const titleEl = innermost(document.body, title);
        if (!titleEl) throw new Error("no card drew the title");
        const li = titleEl.closest("li")!;
        const bylineEl = innermost(li, byline);
        if (!bylineEl) throw new Error("the card drew no byline");
        const t = titleEl.getBoundingClientRect();
        const liBox = li.getBoundingClientRect();
        const above = [...li.querySelectorAll("*")]
          .filter((el) => !el.contains(titleEl))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height > 0 && r.width >= liBox.width - 1 && r.bottom <= t.top + 0.5);
        if (above.length === 0) throw new Error("nothing full-width sits above the title");
        const ts = getComputedStyle(titleEl);
        const bs = getComputedStyle(bylineEl);
        const b = bylineEl.getBoundingClientRect();
        return {
          thumbToTitle: t.top - Math.max(...above.map((r) => r.bottom)),
          titleSize: parseFloat(ts.fontSize),
          titleLine: parseFloat(ts.lineHeight),
          titleWeight: ts.fontWeight,
          titleClamp: ts.getPropertyValue("-webkit-line-clamp"),
          titleHeight: t.height,
          titleToByline: b.top - t.bottom,
          bylineSize: parseFloat(bs.fontSize),
          bylineLine: parseFloat(bs.lineHeight),
          bylineHeight: b.height,
        };
      },
      { title: titleOf(id), byline: bylineOf(id) },
    );

    expect(Math.abs(m.thumbToTitle - 12)).toBeLessThanOrEqual(PX);
    expect([m.titleSize, m.titleLine, m.titleWeight, m.titleClamp]).toEqual([16, 22, "500", "2"]);
    expect(Math.abs(m.titleHeight - 44), "the long title fills its two clamped lines").toBeLessThanOrEqual(PX);
    expect(Math.abs(m.titleToByline - 4)).toBeLessThanOrEqual(PX);
    expect([m.bylineSize, m.bylineLine]).toEqual([14, 20]);
    expect(m.bylineHeight).toBeLessThanOrEqual(20 + PX);
  });

  test(`SPEC-CORE-080 I5 I6 Discover's video shelves and its trailing skeleton are 40px apart, 16px under their headers, and a loading shelf's skeleton matches the loaded grid, ${at}`, async ({
    page,
  }) => {
    await open(page, w.viewport, { face: "video-discover", w: w.discover[0].host });
    const m = await measure(page);

    expect(m.sections.map((s) => s.title)).toEqual(["Continue", "Subscriptions", "Recently added", ""]);
    expectShelfStack(m.sections, "video Discover");

    const loadedGrid = m.sections[0].grids[0];
    const loadedColumns = expectVideoGrid(loadedGrid, "Continue");
    for (const s of m.sections.slice(2)) {
      expect(s.grids, `${s.title || "trailing skeleton"} has one grid`).toHaveLength(1);
      const grid = s.grids[0];
      expect(grid.cells.every((c) => c.skeleton), `${s.title || "trailing skeleton"} is all skeleton`).toBe(true);
      expect(Math.abs(grid.width - loadedGrid.width)).toBeLessThanOrEqual(PX);
      expect(expectVideoGrid(grid, s.title || "trailing skeleton")).toBe(loadedColumns);
      expect(grid.cells).toHaveLength(loadedColumns * rowsFor(loadedColumns));
    }

    const bar = await page.evaluate(() => {
      const section = [...document.querySelectorAll("#video-card-spacing-host section")].find(
        (s) => s.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() === "Recently added",
      )!;
      const li = section.querySelector("li")!;
      const leaves = [...li.querySelectorAll("*")]
        .filter((el) => el.children.length === 0)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .sort((a, b) => a.top - b.top);
      if (leaves.length < 2) throw new Error(`a skeleton card has ${leaves.length} drawn parts`);
      return { gap: leaves[1].top - leaves[0].bottom, height: leaves[1].height };
    });
    expect(Math.abs(bar.gap - 12), `skeleton title bar ${bar.gap}px under its thumbnail`).toBeLessThanOrEqual(PX);
    expect(Math.abs(bar.height - 22), `skeleton title bar ${bar.height}px tall`).toBeLessThanOrEqual(PX);
  });

  for (const app of ["video", "reading"] as const) {
    const face = `${app}-library`;

    test(`SPEC-CORE-080 I5 the ${app} Library's grouped shelves are 40px apart and 16px under their headers, and nothing but the sentinel follows the last one, ${at}`, async ({
      page,
    }) => {
      await open(page, w.viewport, { face, later: "none" });
      await expect.poll(async () => (await measure(page)).sections.filter((s) => s.title).length).toBe(3);
      const m = await measure(page);

      const shelves = m.sections.filter((s) => s.title);
      expectShelfStack(shelves, `${app} Library`);
      if (app === "video") {
        for (const s of shelves) expectVideoGrid(s.grids[0], s.title);
      }
      const trailing = m.host.bottom - shelves[shelves.length - 1].bottom;
      expect(trailing, `${trailing}px after the last shelf`).toBeGreaterThanOrEqual(-PX);
      expect(trailing, `${trailing}px after the last shelf`).toBeLessThanOrEqual(1 + PX);
    });

    for (const later of ["hold", "fail"] as const) {
      const what = later === "hold" ? "load-more skeleton shelf" : "Retry";
      test(`SPEC-CORE-080 I5 the ${app} Library's ${what} starts 40 to 41px below the last shelf, ${at}`, async ({ page }) => {
        await open(page, w.viewport, { face, later });
        await expect.poll(async () => (await measure(page)).sections.filter((s) => s.title).length).toBe(12);
        await scrollToEnd(page);

        if (later === "hold") {
          await expect.poll(async () => (await measure(page)).sections.filter((s) => !s.title).length).toBe(1);
        } else {
          await expect.poll(async () => (await measure(page)).retryTop).not.toBeNull();
        }
        const m = await measure(page);
        const shelves = m.sections.filter((s) => s.title);
        const last = shelves[shelves.length - 1];
        const next = later === "hold" ? m.sections.find((s) => !s.title)!.top : m.retryTop!;
        expect(next - last.bottom, `${what} at ${next - last.bottom}px`).toBeGreaterThanOrEqual(40 - PX);
        expect(next - last.bottom, `${what} at ${next - last.bottom}px`).toBeLessThanOrEqual(41 + PX);
        if (later === "hold") {
          const skeleton = m.sections.find((s) => !s.title)!;
          expect(Math.abs(skeleton.headerToNext! - 16)).toBeLessThanOrEqual(PX);
        }
      });
    }
  }

  test(`SPEC-CORE-080 I5 the reading Discover shelves are 40px apart and 16px under their headers, a failed shelf's Retry too, ${at}`, async ({
    page,
  }) => {
    await open(page, w.viewport, { face: "reading-discover" });
    const m = await measure(page);
    expect(m.sections.map((s) => s.nextHasRetry)).toEqual([false, false, true]);
    expectShelfStack(m.sections, "reading Discover");
  });

  test(`SPEC-CORE-080 I2 I6 See all draws two skeleton rows of its own column count before the first page, ${at}`, async ({
    page,
  }) => {
    await open(page, w.viewport, { face: "see-all", first: "hold" });
    await expect.poll(async () => (await measure(page)).grids.length).toBe(1);
    const skeleton = (await measure(page)).grids[0];
    expect(skeleton.cells.every((c) => c.skeleton)).toBe(true);
    const columns = expectVideoGrid(skeleton, "first-load skeleton");
    expect(columns).toBe(w.seeAllColumns);
    expect(skeleton.cells).toHaveLength(2 * columns);
    expect(distinct(skeleton.cells.map((c) => c.top))).toBe(2);
  });

  test(`SPEC-CORE-080 I1 I2 See all lays its cards out in ${w.seeAllColumns} columns of its own width, 16px and 32px apart, ${at}`, async ({
    page,
  }) => {
    await open(page, w.viewport, { face: "see-all", later: "hold" });
    await expect.poll(async () => (await measure(page)).grids[0]?.cells.length ?? 0).toBe(SEE_ALL_FIRST_PAGE);
    const grid = (await measure(page)).grids[0];
    expect(expectVideoGrid(grid, "See all")).toBe(w.seeAllColumns);
  });

  if (w.seeAllNarrow) {
    const { host, columns } = w.seeAllNarrow;
    test(`SPEC-CORE-080 I2 See all in a ${host}px host takes ${columns} columns from its own width, not the viewport's, ${at}`, async ({
      page,
    }) => {
      await open(page, w.viewport, { face: "see-all", later: "hold", w: host });
      await expect.poll(async () => (await measure(page)).grids[0]?.cells.length ?? 0).toBe(SEE_ALL_FIRST_PAGE);
      const grid = (await measure(page)).grids[0];
      expect(grid.width).toBeLessThanOrEqual(host);
      expect(expectVideoGrid(grid, "narrow See all")).toBe(columns);
    });
  }

  test(`SPEC-CORE-080 I6 See all's appended skeleton is one row of the loaded grid's columns, 32 to 33px below it, ${at}`, async ({
    page,
  }) => {
    await open(page, w.viewport, { face: "see-all", later: "hold" });
    await expect.poll(async () => (await measure(page)).grids[0]?.cells.length ?? 0).toBe(SEE_ALL_FIRST_PAGE);
    await scrollToEnd(page);
    await expect.poll(async () => (await measure(page)).grids.length).toBe(2);

    const [loaded, skeleton] = (await measure(page)).grids;
    expect(loaded.cells.some((c) => c.skeleton)).toBe(false);
    expect(skeleton.cells.every((c) => c.skeleton)).toBe(true);
    const columns = expectVideoGrid(loaded, "loaded");
    expect(expectVideoGrid(skeleton, "appended skeleton")).toBe(columns);
    expect(skeleton.cells).toHaveLength(columns);
    expect(distinct(skeleton.cells.map((c) => c.top))).toBe(1);
    const gap = skeleton.top - loaded.bottom;
    expect(gap, `appended skeleton ${gap}px below the grid`).toBeGreaterThanOrEqual(32 - PX);
    expect(gap, `appended skeleton ${gap}px below the grid`).toBeLessThanOrEqual(33 + PX);
  });

  test(`SPEC-CORE-080 I6 See all's later-page Retry starts 32 to 33px below the grid, ${at}`, async ({ page }) => {
    await open(page, w.viewport, { face: "see-all", later: "fail" });
    await expect.poll(async () => (await measure(page)).grids[0]?.cells.length ?? 0).toBe(SEE_ALL_FIRST_PAGE);
    await scrollToEnd(page);
    await expect.poll(async () => (await measure(page)).retryTop).not.toBeNull();

    const m = await measure(page);
    expect(m.grids).toHaveLength(1);
    const gap = m.retryTop! - m.grids[0].bottom;
    expect(gap, `Retry ${gap}px below the grid`).toBeGreaterThanOrEqual(32 - PX);
    expect(gap, `Retry ${gap}px below the grid`).toBeLessThanOrEqual(33 + PX);
  });

  test(`SPEC-CORE-080 I7 See all appends the next page to the same grid element with no card repeated or missing, ${at}`, async ({
    page,
  }) => {
    await open(page, w.viewport, { face: "see-all", later: "ok" });
    await expect.poll(async () => (await measure(page)).grids[0]?.cells.length ?? 0).toBe(SEE_ALL_FIRST_PAGE);
    await page.evaluate(() => {
      const grid = [...document.querySelectorAll("#video-card-spacing-host *")].find(
        (el) => getComputedStyle(el).display === "grid" && el.querySelector(":scope > li") !== null,
      ) as HTMLElement;
      grid.dataset.vcsMark = "first";
    });
    await scrollToEnd(page);
    await expect.poll(async () => (await measure(page)).grids[0]?.cells.length ?? 0).toBe(SEE_ALL_TOTAL);

    const m = await measure(page);
    expect(m.grids).toHaveLength(1);
    expect(m.grids[0].mark).toBe("first");
    const ids = m.grids[0].cells.map((c) => /Clip (p\d+-\d+):/.exec(c.text)?.[1] ?? "");
    const expected = [
      ...Array.from({ length: SEE_ALL_FIRST_PAGE }, (_, i) => `p1-${i}`),
      ...Array.from({ length: SEE_ALL_TOTAL - SEE_ALL_FIRST_PAGE }, (_, i) => `p2-${i}`),
    ];
    expect(ids).toEqual(expected);
    expectVideoGrid(m.grids[0], "after the second page");
  });
}
