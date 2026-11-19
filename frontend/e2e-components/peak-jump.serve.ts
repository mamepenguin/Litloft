/**
 * Opens the `peak-jump` arrangement from a routed origin (the profile lives in
 * a cookie, which Chromium does not keep for `file://`), with a band of two
 * spots: 1000 s (level 3) first, then 500 s (level 2).
 */

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

import { OUT_DIR } from "./build-bundle";

const ORIGIN = "http://fixture.test";
const SEGMENTS = [
  { index: 100, played_seconds: 10 },
  { index: 200, played_seconds: 15 },
];

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

export const JUMP = 'button[aria-label="Jump to most watched"]';

export async function openPeakJump(page: Page, width: number, time = 0): Promise<void> {
  await page.context().addCookies([{ name: "lit_viewer", value: "kaori", url: ORIGIN }]);
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname.endsWith("/played-segments")) {
        await route.fulfill({ json: { segment_seconds: 5, segments: SEGMENTS } });
      } else if (url.pathname.endsWith("/played-ranges")) {
        await route.fulfill({ status: 204 });
      } else if (url.pathname.endsWith("/progress") && route.request().method() === "GET") {
        await route.fulfill({ json: { position: 0, duration: 0 } });
      } else {
        await route.fulfill({ json: {} });
      }
      return;
    }
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = normalize(join(OUT_DIR, rel));
    if (!file.startsWith(OUT_DIR)) {
      await route.fulfill({ status: 404 });
      return;
    }
    try {
      await route.fulfill({
        body: readFileSync(file),
        contentType: TYPES[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });

  await page.goto(`${ORIGIN}/index.html?arrangement=peak-jump&w=${width}&t=${time}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "peak-jump");
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function box(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
}

/** The label's box and text, or null while none is on screen. */
export function labelBox(page: Page): Promise<(Box & { text: string }) | null> {
  return page.evaluate(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>("body *")).find(
      (n) => n.children.length === 0 && /^Most watched \d+ \/ \d+$/.test(n.textContent ?? ""),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: el.textContent ?? "" };
  });
}
