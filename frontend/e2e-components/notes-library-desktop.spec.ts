/**
 * SPEC-ADDON-132 I16: the Notes Library's layout at each width. Where the
 * rail, list and pane sit are boxes, so this is measured in a real browser;
 * jsdom lays nothing out.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ROOT = '[data-testid="notes-library"]';

let run = 0;

async function open(page: Page, width: number, layout: string): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${FIXTURE}?run=${++run}#notes-library`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "notes-library");
  await expect(page.locator(ROOT)).toHaveAttribute("data-layout", layout);
  await expect(page.getByText("ノート 1", { exact: true }).first()).toBeVisible();
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

interface Measured {
  rail: Box | null;
  menu: Box | null;
  list: Box;
  pane: Box | null;
  pageScrollWidth: number;
  innerWidth: number;
}

function measure(page: Page): Promise<Measured> {
  return page.evaluate((root) => {
    const box = (element: Element | null) => {
      if (element === null || element.getClientRects().length === 0) return null;
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    };
    const library = document.querySelector(root)!;
    const body = library.lastElementChild!;
    const aside = library.querySelector(":scope > aside");
    const menu = aside === null ? library.firstElementChild : null;
    return {
      rail: box(aside),
      menu: box(menu),
      list: box(body.children[0])!,
      pane: box(body.children[1] ?? null),
      pageScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  }, ROOT);
}

const CASES = [
  { width: 1440, layout: "three" },
  { width: 1280, layout: "three" },
  { width: 1279, layout: "menu" },
  { width: 1200, layout: "menu" },
  { width: 1100, layout: "menu" },
  { width: 1024, layout: "menu" },
  { width: 390, layout: "list" },
] as const;

for (const { width, layout } of CASES) {
  test(`SPEC-ADDON-132 I16 at ${width}px the layout is ${layout}`, async ({ page }) => {
    await open(page, width, layout);
    const m = await measure(page);

    expect(m.pageScrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(
      m.innerWidth,
    );

    if (layout === "three") {
      expect(m.rail, "the rail is drawn").not.toBeNull();
      expect(m.rail!.width, "the rail is 220px").toBeCloseTo(220, 0);
      expect(m.list.width, "the list is at least 340px").toBeGreaterThanOrEqual(340);
      expect(m.list.width, "the list is at most 380px").toBeLessThanOrEqual(380);
      expect(m.pane, "the pane is drawn").not.toBeNull();
      expect(m.rail!.right, "the rail is left of the list").toBeLessThanOrEqual(m.list.left + 0.5);
      expect(m.list.right, "the list is left of the pane").toBeLessThanOrEqual(m.pane!.left + 0.5);
      expect(m.pane!.width, "the pane takes the rest").toBeGreaterThan(0);
    } else if (layout === "menu") {
      expect(m.rail, "there is no side rail").toBeNull();
      expect(m.menu, "the rail is a menu").not.toBeNull();
      expect(m.menu!.bottom, "the menu is above the list").toBeLessThanOrEqual(m.list.top + 0.5);
      expect(m.pane, "the pane is drawn").not.toBeNull();
      expect(m.list.right, "the list is left of the pane").toBeLessThanOrEqual(m.pane!.left + 0.5);
      const overlap = Math.min(m.list.bottom, m.pane!.bottom) - Math.max(m.list.top, m.pane!.top);
      expect(overlap, "list and pane share a row").toBeGreaterThan(0);
    } else {
      expect(m.rail, "there is no side rail").toBeNull();
      expect(m.pane, "the pane is not drawn").toBeNull();
      expect(m.list.left, "the list starts on the page").toBeGreaterThanOrEqual(-0.5);
      expect(m.list.right, "the list ends on the page").toBeLessThanOrEqual(m.innerWidth + 0.5);
    }
  });
}
