/**
 * The focus layout's header reveal on a touch screen (SPEC-CORE-129 §4, §8,
 * D7, D11), at an iPad's landscape size with touch emulated. The device
 * itself is the human's check.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const VIDEO = "video0000001";

test.use({ hasTouch: true, viewport: { width: 1180, height: 820 } });

let navigation = 0;

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("workbench-panels", "[]"));
  const params = new URLSearchParams({ run: String(++navigation), query: `file=${VIDEO}` });
  await page.goto(`${FIXTURE}?${params}#focus-drive`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.locator("video")).toHaveCount(1);
  expect(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches)).toBe(true);
}

type Box = { left: number; top: number; width: number; height: number };

const box = (l: Locator): Promise<Box> =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

const header = (page: Page) => page.locator("header");
const handle = (page: Page) => page.getByRole("button", { name: "Show header" });
const menuButton = (page: Page) =>
  page.getByTestId("chrome-buttons").getByRole("button", { name: "Menu" });

const headerInert = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const h = document.querySelector("header") as HTMLElement;
    return h.inert || !!h.closest("[inert]");
  });

async function enter(page: Page): Promise<void> {
  const button = header(page).getByRole("button", { name: "Focus mode (T)" });
  await expect(button).toHaveCount(1);
  await button.tap();
  await expect.poll(() => headerInert(page)).toBe(true);
}

async function insetTo(page: Page, top: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: { top } } as never);
}

for (const inset of [0, 24]) {
  test(`SPEC-CORE-129 §4 / D7 / D11 (safe-area inset ${inset}px): the handle is an 88×44 hit area at the top centre with a 36×5 bar 4px below its top, the hit area's top at the safe area's top`, async ({
    page,
  }) => {
    await open(page);
    if (inset) await insetTo(page, inset);
    await enter(page);
    await expect(handle(page)).toBeVisible();
    const hit = await box(handle(page));
    expect(Math.round(hit.width)).toBe(88);
    expect(Math.round(hit.height)).toBe(44);
    expect(Math.round(hit.top)).toBe(inset);
    expect(Math.abs(hit.left + hit.width / 2 - 590)).toBeLessThanOrEqual(0.5);
    const bars = await handle(page)
      .locator("*")
      .evaluateAll((els) =>
        els
          .map((el) => el.getBoundingClientRect())
          .filter((r) => Math.round(r.width) === 36 && Math.round(r.height) === 5)
          .map((r) => ({ cx: r.left + r.width / 2, top: r.top })),
      );
    expect(bars).toHaveLength(1);
    expect(Math.abs(bars[0].cx - 590)).toBeLessThanOrEqual(0.5);
    expect(Math.round(bars[0].top)).toBe(inset + 4);
    await expect(handle(page).locator("svg")).toHaveCount(0);
  });
}

test("SPEC-CORE-129 §4 / I10: a tap on the handle reveals the header and removes the handle; a tap outside hides it and reaches no page element", async ({
  page,
}) => {
  await open(page);
  await enter(page);
  await handle(page).tap();
  await expect.poll(() => headerInert(page)).toBe(false);
  await expect(handle(page)).toHaveCount(0);
  expect(Math.round((await box(header(page))).top)).toBe(0);

  await page.evaluate(() => {
    const w = window as unknown as { __pageEvents: string[] };
    w.__pageEvents = [];
    const content = document.querySelector('[data-testid="page-content"]')!;
    for (const type of ["pointerdown", "pointerup", "click", "touchstart"]) {
      content.addEventListener(type, () => w.__pageEvents.push(type), true);
    }
  });
  await page.touchscreen.tap(590, 500);
  await expect.poll(() => headerInert(page)).toBe(true);
  await expect(handle(page)).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __pageEvents: string[] }).__pageEvents),
  ).toEqual([]);
});

test("SPEC-CORE-129 §4 / §6: with the overlay sidebar open, a tap outside closes the sidebar and the header stays revealed", async ({
  page,
}) => {
  await open(page);
  await enter(page);
  await handle(page).tap();
  await expect.poll(() => headerInert(page)).toBe(false);
  await menuButton(page).tap();
  await expect(menuButton(page)).toHaveAttribute("aria-pressed", "true");
  await page.touchscreen.tap(900, 500);
  await expect(menuButton(page)).toHaveAttribute("aria-pressed", "false");
  expect(await headerInert(page)).toBe(false);
});

test("SPEC-CORE-129 §4: a tap outside moves keyboard focus inside the header to <body>", async ({
  page,
}) => {
  await open(page);
  await enter(page);
  await handle(page).tap();
  await expect.poll(() => headerInert(page)).toBe(false);
  await header(page).getByRole("button", { name: "Quick note" }).focus();
  await page.touchscreen.tap(590, 500);
  await expect.poll(() => headerInert(page)).toBe(true);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("SPEC-CORE-129 §8 / I10: while the page is covered the handle is not drawn; when the cover closes it returns, hidden", async ({
  page,
}) => {
  await open(page);
  await enter(page);
  await expect(handle(page)).toBeVisible();
  await page.evaluate(() => window.__fixtureOpenDialog!("confirm"));
  await expect(handle(page)).toHaveCount(0);
  await page.evaluate(() => window.__fixtureOpenDialog!(null));
  await expect(handle(page)).toBeVisible();
  expect(await headerInert(page)).toBe(true);
});

test("SPEC-CORE-128 I5 / SPEC-CORE-129 §8 (touch, crossing 768px): narrower has no handle and the ordinary header; widening again is hidden with the handle back", async ({
  page,
}) => {
  await open(page);
  await enter(page);
  await expect(handle(page)).toBeVisible();
  await page.setViewportSize({ width: 700, height: 1000 });
  await expect(handle(page)).toHaveCount(0);
  await expect.poll(() => headerInert(page)).toBe(false);
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect.poll(() => headerInert(page)).toBe(true);
  await expect(handle(page)).toBeVisible();
});
