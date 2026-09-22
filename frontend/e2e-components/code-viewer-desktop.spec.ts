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
    const gutterElement = document.elementFromPoint(
      rowLefts[0] - 6,
      firstRow.top + firstRow.height / 2,
    );

    return {
      rowLefts,
      gutterHit: gutterElement?.className ?? null,
      lineIsGutterHit: gutterElement === long,
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

test("a three-digit number keeps its line one row tall", async ({ page }) => {
  await page.goto(`${FIXTURE}#code-viewer-many`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "code-viewer-many",
  );
  await expect(page.locator(".code-line")).toHaveCount(150);

  const measured = await page.evaluate(() => {
    const lines = [...document.querySelectorAll(".code-line")];
    const topOf = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()][0]?.top ?? null;
    };
    const stepsOver = (from: number, to: number) => {
      const steps: number[] = [];
      for (let i = from + 1; i <= to; i++) {
        const a = topOf(lines[i - 1]);
        const b = topOf(lines[i]);
        if (a !== null && b !== null) steps.push(Math.round(b - a));
      }
      return [...new Set(steps)].sort((x, y) => x - y);
    };
    const before = getComputedStyle(lines[0], "::before");
    return {
      oneDigit: stepsOver(0, 8),
      threeDigits: stepsOver(120, 148),
      beforeHeight: parseFloat(before.height),
      lineHeight: parseFloat(getComputedStyle(lines[0]).lineHeight),
    };
  });

  // A number that does not fit wraps inside its own box, and the line it
  // belongs to becomes two rows tall. Both ends of the file are one row.
  expect(measured.threeDigits).toEqual(measured.oneDigit);
  expect(measured.beforeHeight).toBeCloseTo(measured.lineHeight, 0);
});

/** The gutter strip beside a line, in page coordinates. */
async function gutterStrip(
  page: import("@playwright/test").Page,
  index: number,
) {
  await page
    .locator(".code-line")
    .nth(index)
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  return page.evaluate((i) => {
    const line = document.querySelectorAll(".code-line")[i];
    const range = document.createRange();
    range.selectNodeContents(line);
    const row = [...range.getClientRects()][0];
    const gutter = parseFloat(
      getComputedStyle(line, "::before").width,
    );
    return {
      x: Math.round(row.left - gutter),
      y: Math.round(row.top),
      width: Math.ceil(gutter),
      height: Math.ceil(row.height),
    };
  }, index);
}

test("neighbouring lines draw different numbers in the gutter", async ({ page }) => {
  await page.goto(`${FIXTURE}#code-viewer-many`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "code-viewer-many",
  );
  await expect(page.locator(".code-line")).toHaveCount(150);

  // Ink, because the counter's value is not readable: Chromium reports
  // `content` as the unresolved `counter(code-line)`. This holds that a
  // number is drawn and that it changes down the file. It cannot hold that
  // the number is the right one — comparing pixels says "different", never
  // "correct".
  // Sequential, not parallel: each one scrolls its line into view first.
  const strips: Buffer[] = [];
  for (const i of [0, 1, 99]) {
    strips.push(await page.screenshot({ clip: await gutterStrip(page, i) }));
  }

  expect(strips[0].equals(strips[1])).toBe(false);
  expect(strips[0].equals(strips[2])).toBe(false);
  expect(strips[1].equals(strips[2])).toBe(false);
});

test("the gutter is sized for the largest number the viewer can draw", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}#code-viewer-many`);
  await expect(page.locator(".code-line")).toHaveCount(150);

  const fits = await page.evaluate(() => {
    const limit = (window as unknown as Record<string, number>)
      .__maxDecoratedLines;
    const line = document.querySelector(".code-line")!;
    const before = getComputedStyle(line, "::before");
    const probe = document.createElement("span");
    probe.style.font = getComputedStyle(line).font;
    probe.style.whiteSpace = "pre";
    // The widest number this viewer can ever draw, from the limit itself
    // rather than from a figure written in the test.
    probe.textContent = "8".repeat(String(limit).length);
    document.body.appendChild(probe);
    const widest = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      limit,
      digits: String(limit).length,
      column: parseFloat(before.width) - parseFloat(before.paddingRight),
      widest,
    };
  });

  expect(fits.limit).toBeGreaterThan(0);
  expect(fits.column).toBeGreaterThanOrEqual(fits.widest);
});

test("the number is inset from the block's edge, as the text is", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}#code-viewer-many`);
  await expect(page.locator(".code-line")).toHaveCount(150);

  const inset = await page.evaluate(() => {
    const pre = document.querySelector("pre.code-view")!;
    const line = document.querySelectorAll(".code-line")[99];
    const range = document.createRange();
    range.selectNodeContents(line);
    const row = [...range.getClientRects()][0];
    const gutter = parseFloat(getComputedStyle(line, "::before").width);
    const style = getComputedStyle(pre);
    return {
      numberLeft: row.left - gutter,
      blockLeft: pre.getBoundingClientRect().left,
      right: parseFloat(style.paddingRight),
    };
  });

  // The same inset the text gets on the other three sides, not merely some
  // inset: a range here would pass a gutter flush against the card.
  expect(inset.numberLeft - inset.blockLeft).toBeCloseTo(inset.right, 1);
});

test("a citation crossing a line boundary is marked on both lines", async ({
  page,
}) => {
  await open(page);

  const marked = await page.evaluate(() => {
    const marks = [
      ...document.querySelectorAll("mark.ask-citation-highlight"),
    ];
    return {
      count: marks.length,
      text: marks.map((m) => m.textContent).join(""),
      lines: new Set(marks.map((m) => m.closest(".code-line"))).size,
      anyOutsideALine: marks.some((m) => m.closest(".code-line") === null),
    };
  });

  expect(marked.count).toBeGreaterThan(1);
  expect(marked.lines).toBe(2);
  expect(marked.anyOutsideALine).toBe(false);
  expect(marked.text.replace(/\s+/g, " ")).toBe("message); }");
});
