/**
 * The line numbers are generated content. jsdom implements neither counters
 * nor layout, so whether a number joins a selection, and where a wrapped line
 * resumes, are only answerable in a browser.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const SOURCE = [
  "fn main() {",
  '    let message = "a line long enough that it has to wrap at this width, which is what puts a second visual row under the first";',
  '    println!("{}", message);',
  "}",
  "",
].join("\n");

async function open(page: import("@playwright/test").Page) {
  await page.goto(`${FIXTURE}#code-viewer`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "code-viewer",
  );
  await expect(page.locator(".code-line").first()).toBeVisible();
}

test("a number is drawn for every line", async ({ page }) => {
  await open(page);
  await expect(page.locator(".code-line")).toHaveCount(4);

  // Chromium reports `content` on a counter as the unresolved
  // `counter(code-line)`, so the number itself is not readable here. What is
  // readable is that each line carries a drawn box for it.
  const drawn = await page.locator(".code-line").evaluateAll((nodes) =>
    nodes.map((n) => {
      const before = getComputedStyle(n, "::before");
      return { content: before.content, width: parseFloat(before.width) };
    }),
  );
  expect(drawn).toHaveLength(4);
  for (const { content, width } of drawn) {
    expect(content).not.toBe("none");
    expect(width).toBeGreaterThan(0);
  }
});

test("selecting the block yields the file, and no line numbers", async ({
  page,
}) => {
  await open(page);

  const selected = await page.evaluate(() => {
    const pre = document.querySelector("pre.code-view")!;
    const range = document.createRange();
    range.selectNodeContents(pre);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });

  // Chromium's serializer drops a trailing newline; every other character,
  // and no digit from the gutter, is there.
  expect(selected).toBe(SOURCE.replace(/\n$/, ""));
});

test("the text a citation search walks is the file, and no line numbers", async ({
  page,
}) => {
  await open(page);

  const walked = await page.evaluate(() => {
    const pre = document.querySelector("pre.code-view")!;
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    let out = "";
    while (walker.nextNode()) out += walker.currentNode.nodeValue ?? "";
    return out;
  });

  expect(walked).toBe(SOURCE);
});

test("a wrapped line resumes under the code, not under its number", async ({
  page,
}) => {
  await open(page);

  const geometry = await page.evaluate(() => {
    const long = document.querySelectorAll(".code-line")[1];
    const range = document.createRange();
    range.selectNodeContents(long);

    // `getClientRects` returns a rect per box, not per visual row: a line
    // made of several token spans yields several rects on one row. Rows are
    // the distinct tops.
    const byRow = new Map<number, number>();
    for (const rect of range.getClientRects()) {
      const top = Math.round(rect.top);
      byRow.set(top, Math.min(byRow.get(top) ?? Infinity, rect.left));
    }
    const rowLefts = [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, left]) => left);

    const firstRow = [...range.getClientRects()][0];
    // An inline box's own rect does not grow to cover a child pulled out of
    // it by a negative margin, so the number's position is read by hit
    // testing the gutter beside the first row instead.
    const inGutter = document.elementFromPoint(
      rowLefts[0] - 6,
      firstRow.top + firstRow.height / 2,
    );

    return {
      rowLefts,
      gutterHit: inGutter?.className ?? null,
      lineIsGutterHit: inGutter === long,
    };
  });

  // It has to actually wrap, or the rest of this measures nothing.
  expect(geometry.rowLefts.length).toBeGreaterThan(1);
  for (const left of geometry.rowLefts) {
    expect(left).toBeCloseTo(geometry.rowLefts[0], 1);
  }
  // The number is drawn beside the code, in the padding the block reserves.
  expect(geometry.lineIsGutterHit).toBe(true);
});
