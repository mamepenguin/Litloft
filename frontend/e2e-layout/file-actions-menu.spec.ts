/**
 * Where the `⋮` menu and its error toast actually land, measured in
 * Chromium. This file writes the class lists itself; it does not run the
 * component's direction decision.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "file-actions-menu.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

const SPEC: Record<string, string | number> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

interface Measurement {
  viewport: { width: number; height: number };
  trigger: Box;
  column: Box | null;
  menu: Box | null;
  toast: Box | null;
}

declare global {
  interface Window {
    buildStrip: (spec: { direction: "up" | "down"; items: number }) => void;
    buildColumn: (spec: {
      direction: "up" | "down";
      align: "left" | "right";
      toastAlign?: "left" | "right";
      items?: number;
      error?: string;
      left: number;
      width: number;
    }) => void;
    measureAnchor: () => Measurement;
  }
}

/**
 * The resting strip is `fixed bottom-0`, so its distance from the bottom of
 * the screen is zero at every viewport height. One item is the shortest
 * menu anything could render, where "there is no room below" is a claim
 * about the strip rather than about a large menu.
 */
const PHONES = [
  { width: 375, height: 667, label: "iPhone SE viewport" },
  { width: 393, height: 852, label: "iPhone 15 Pro viewport" },
];
const ITEM_COUNTS = [1, 7, 14];

const registeredStripCases: string[] = [];

const stripCaseId = (phone: (typeof PHONES)[number], items: number) =>
  `${phone.width}x${phone.height} @ ${items}`;

/**
 * Registers and records in one call, so the two cannot be separated.
 */
function stripCase(
  phone: (typeof PHONES)[number],
  items: number,
  title: string,
  body: (args: { page: Page }) => Promise<void>,
) {
  test(title, body);
  registeredStripCases.push(stripCaseId(phone, items));
}

test("registers exactly the screens and menus this file measures", () => {
  expect(registeredStripCases).toEqual(
    PHONES.flatMap((phone) => ITEM_COUNTS.map((n) => stripCaseId(phone, n))),
  );
  expect(PHONES.map((p) => `${p.width}x${p.height}`)).toEqual([
    "375x667",
    "393x852",
  ]);
  expect(ITEM_COUNTS).toEqual([1, 7, 14]);
});

const GAP_PX = SPEC.gapPx as number;

test.describe("the file menu on the Bottom Sheet's resting strip", () => {
  test.use({ hasTouch: true });

  for (const phone of PHONES) {
    for (const items of ITEM_COUNTS) {
      stripCase(
        phone,
        items,
        `hangs off the bottom of a ${phone.label} at ${items} items, and comes back when flipped`,
        async ({ page }) => {
        await page.setViewportSize({ width: phone.width, height: phone.height });
        await page.goto(FIXTURE);

        await page.evaluate(
          (n) => window.buildStrip({ direction: "down", items: n }),
          items,
        );
        const down = await page.evaluate(() => window.measureAnchor());

        await page.evaluate(
          (n) => window.buildStrip({ direction: "up", items: n }),
          items,
        );
        const up = await page.evaluate(() => window.measureAnchor());

        // What is left below the trigger moves with the strip's border,
        // so it is bounded by the menu's height rather than stated.
        expect(down.trigger.height).toBe(44);
        expect(phone.height - down.trigger.bottom).toBeLessThan(
          down.menu!.height,
        );

        expect(phone.height - down.menu!.top).toBeLessThan(GAP_PX);
        expect(down.menu!.bottom).toBeGreaterThan(phone.height);

        expect(up.menu!.top).toBeGreaterThanOrEqual(0);
        expect(up.menu!.bottom).toBeLessThanOrEqual(phone.height);

        // Same size both ways, which is what lets a `ResizeObserver` on
        // the menu drive the flip without oscillating.
        expect(up.menu!.height).toBe(down.menu!.height);
        expect(up.menu!.width).toBe(down.menu!.width);

        expect(down.menu!.top - down.trigger.bottom).toBeCloseTo(GAP_PX, 1);
        expect(up.trigger.top - up.menu!.bottom).toBeCloseTo(GAP_PX, 1);
        },
      );
    }
  }
});

test.describe("the error toast against its column's left edge", () => {
  // The trigger is at the column's left edge — the shape `alignLeft`
  // exists for.
  const COLUMN = { left: 40, width: 240 };
  /**
   * The toast's own `px-3` makes it wider than its trigger; the text only
   * sets the amount of the overhang.
   */
  const MESSAGE = "Failed to delete";

  test("crosses the edge when it keeps right-0 and the menu flips without it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(FIXTURE);
    await page.evaluate(
      (c) =>
        window.buildColumn({
          direction: "down",
          align: "left",
          toastAlign: "right",
          items: 7,
          error: c.message,
          left: c.left,
          width: c.width,
        }),
      { ...COLUMN, message: MESSAGE },
    );

    const m = await page.evaluate(() => window.measureAnchor());
    expect(m.column!.left).toBeCloseTo(COLUMN.left, 0);

    expect(m.menu!.left).toBeGreaterThanOrEqual(m.column!.left);

    expect(m.toast!.left).toBeLessThan(m.column!.left);
  });

  test("stays inside it when it follows the menu", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(FIXTURE);
    await page.evaluate(
      (c) =>
        window.buildColumn({
          direction: "down",
          align: "left",
          items: 7,
          error: c.message,
          left: c.left,
          width: c.width,
        }),
      { ...COLUMN, message: MESSAGE },
    );

    const m = await page.evaluate(() => window.measureAnchor());

    // Both edges: a toast wider than the column would satisfy the
    // left-hand bound and still be unreadable.
    expect(m.toast!.left).toBeGreaterThanOrEqual(m.column!.left);
    expect(m.toast!.right).toBeLessThanOrEqual(m.column!.right);
    expect(m.toast!.width).toBeGreaterThan(m.trigger.width);
  });
});
