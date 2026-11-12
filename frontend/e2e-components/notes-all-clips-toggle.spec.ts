/**
 * SPEC-ADDON-101 D7: the Include clips toggle in Notes' All notes toolbar.
 * Where the controls sit and whether they fit are boxes, so this is measured
 * in a real browser; jsdom lays nothing out.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const TOGGLE = "クリップを含める";
const SORT = "並び: 更新日";

let run = 0;

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${FIXTURE}?run=${++run}#notes-all-clips-toggle`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "notes-all-clips-toggle",
  );
  await expect(page.getByRole("button", { name: TOGGLE })).toBeVisible();
  // Hidden by `md:hidden` at the desktop width, so attached rather than visible.
  await expect(
    page.locator('#notes-all button[aria-label="タグ: すべてのタグ"]'),
  ).toBeAttached();
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Control extends Box {
  name: string;
}

interface Toolbar {
  ariaPressed: string | null;
  toggleIsLastChild: boolean;
  toolbar: Box;
  scrollWidth: number;
  clientWidth: number;
  toggle: Box;
  sort: Box;
  controls: Control[];
  pageScrollWidth: number;
  pageClientWidth: number;
}

function measure(page: Page): Promise<Toolbar> {
  return page.evaluate((sortName) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    };
    const toggle = document.querySelector<HTMLButtonElement>(
      "#notes-all button[aria-pressed]",
    )!;
    const toolbar = toggle.parentElement as HTMLElement;
    const sort = document.querySelector<HTMLButtonElement>(
      `#notes-all button[aria-label="${sortName}"]`,
    )!;
    const controls = [...toolbar.children]
      .filter((child) => child.getClientRects().length > 0)
      .map((child) => ({
        name:
          child.getAttribute("aria-label") ??
          (child.textContent ?? "").replace(/\s+/g, " ").trim(),
        ...box(child),
      }));

    return {
      ariaPressed: toggle.getAttribute("aria-pressed"),
      toggleIsLastChild: toolbar.lastElementChild === toggle,
      toolbar: box(toolbar),
      scrollWidth: toolbar.scrollWidth,
      clientWidth: toolbar.clientWidth,
      toggle: box(toggle),
      sort: box(sort),
      controls,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth,
    };
  }, SORT);
}

test("SPEC-ADDON-101 D7 at 1280px the toggle is the last control and shares the Sort control's row", async ({
  page,
}) => {
  await open(page, 1280);
  const m = await measure(page);

  expect(m.ariaPressed, "aria-pressed follows the off state").toBe("false");
  expect(m.toggleIsLastChild, "the toggle is the toolbar's last child").toBe(true);

  const lastControl = m.controls[m.controls.length - 1];
  expect(lastControl.name, "the toggle is the last drawn control").toBe(TOGGLE);
  for (const control of m.controls) {
    expect(control.left, `${control.name} does not start right of the toggle`).toBeLessThanOrEqual(
      m.toggle.left + 0.5,
    );
  }

  const overlap = Math.min(m.toggle.bottom, m.sort.bottom) - Math.max(m.toggle.top, m.sort.top);
  expect(overlap, "the toggle is on the Sort control's row").toBeGreaterThan(0);
  expect(m.toggle.left, "the toggle follows Sort").toBeGreaterThanOrEqual(m.sort.right - 0.5);
  expect(m.toggle.right, "the toggle stays in the toolbar").toBeLessThanOrEqual(
    m.toolbar.right + 0.5,
  );
});

test("SPEC-ADDON-101 D7 at 390px nothing in the toolbar overflows the page width", async ({
  page,
}) => {
  await open(page, 390);
  const m = await measure(page);

  expect(m.controls.length, "every control is drawn").toBeGreaterThanOrEqual(5);
  expect(m.pageScrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(
    m.pageClientWidth + 0.5,
  );
  expect(m.scrollWidth, "the toolbar does not scroll sideways").toBeLessThanOrEqual(
    m.clientWidth + 0.5,
  );
  for (const control of m.controls) {
    expect(control.left, `${control.name} starts on the page`).toBeGreaterThanOrEqual(-0.5);
    expect(control.right, `${control.name} ends on the page`).toBeLessThanOrEqual(
      m.pageClientWidth + 0.5,
    );
  }
});
