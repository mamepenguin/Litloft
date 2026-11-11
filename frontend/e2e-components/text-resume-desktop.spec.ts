/**
 * SPEC-CORE-050's scroll restore is layout behaviour: jsdom lays nothing out,
 * so the fraction, the two-screen gate and the restore's own scroll are
 * measured here against the real components in a browser. The scroll hosts
 * are the two the app gives a text document: the full page's `<main>` and the
 * right pane's scroll area.
 *
 * e2e-components rather than e2e-layout (the spec's wording): only this suite
 * bundles the real TextPreview / MarkdownFileViewer.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

type Layout = "full" | "pane";
type Doc = "text" | "markdown";

interface Case {
  layout: Layout;
  doc?: Doc;
  stored?: string;
  short?: boolean;
  highlight?: boolean;
  hash?: boolean;
}

function openUrl(spec: Case): string {
  const params = new URLSearchParams({
    arrangement: "text-resume",
    layout: spec.layout,
    doc: spec.doc ?? "text",
    stored: spec.stored ?? "empty",
    run: String(++navigation),
  });
  if (spec.short) params.set("short", "1");
  if (spec.highlight) params.set("highlight", "1");
  return `${FIXTURE}?${params}${spec.hash ? "#target" : ""}`;
}

const host = (page: Page) => page.locator("[data-scroll-host]");

function doneText(spec: Case): string {
  if (spec.doc === "markdown") {
    return spec.short ? "One paragraph." : "Paragraph 80 of";
  }
  return spec.short ? "line number 45" : "line number 260";
}

async function open(page: Page, spec: Case): Promise<void> {
  await page.goto(openUrl(spec));
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "text-resume",
  );
  await expect(host(page)).toContainText(doneText(spec));
}

const scrollTop = (page: Page) => host(page).evaluate((el) => el.scrollTop);

const range = (page: Page) =>
  host(page).evaluate((el) => el.scrollHeight - el.clientHeight);

async function restoredTop(page: Page, position: number): Promise<number> {
  return Math.round((position / 1000) * (await range(page)));
}

async function writes(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __progressWrites?: unknown[] }).__progressWrites ??
      [],
  );
}

/** Long enough for a pending progress read to have been requested. */
async function waitForPendingRead(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __resolveProgress?: unknown })
            .__resolveProgress === "function",
      ),
    )
    .toBe(true);
}

async function resolveRead(
  page: Page,
  position: number,
  duration: number,
): Promise<void> {
  await page.evaluate(
    ([p, d]) => {
      (
        window as unknown as {
          __resolveProgress?: (position: number, duration: number) => void;
        }
      ).__resolveProgress!(p, d);
    },
    [position, duration],
  );
}

/** Lets the stored read land and the restore (or its refusal) commit. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
}

/** Longer than the 1 s trailing save delay, so a write would have arrived. */
async function pastDebounce(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
}

async function readerScrollsTo(page: Page, top: number): Promise<void> {
  await host(page).evaluate((el, value) => {
    el.scrollTop = value;
  }, top);
}

for (const layout of ["full", "pane"] as const) {
  test.describe(`SPEC-CORE-050 ${layout} page`, () => {
    test("restores a stored 50 and a stored 899", async ({ page }) => {
      await open(page, { layout, stored: "50" });
      await expect.poll(() => scrollTop(page)).toBe(await restoredTop(page, 50));

      await open(page, { layout, stored: "899" });
      await expect.poll(() => scrollTop(page)).toBe(await restoredTop(page, 899));
    });

    test("does not restore a stored 49, and the reader's scroll is recorded", async ({
      page,
    }) => {
      await open(page, { layout, stored: "49" });
      await settle(page);
      expect(await scrollTop(page)).toBe(0);

      const total = await range(page);
      await readerScrollsTo(page, 500);
      await expect
        .poll(async () => writes(page))
        .toEqual([
          {
            fileId: "textresume01",
            position: Math.round((500 / total) * 1000),
            duration: 1000,
          },
        ]);
    });

    test("opens at the top for a stored 900, and the reader's scroll is recorded", async ({
      page,
    }) => {
      await open(page, { layout, stored: "900" });
      await settle(page);
      expect(await scrollTop(page)).toBe(0);

      const total = await range(page);
      await readerScrollsTo(page, 600);
      await expect
        .poll(async () => writes(page))
        .toEqual([
          {
            fileId: "textresume01",
            position: Math.round((600 / total) * 1000),
            duration: 1000,
          },
        ]);
    });

    test("a document under two screens neither restores nor records", async ({
      page,
    }) => {
      await open(page, { layout, stored: "500", short: true });
      await settle(page);
      expect(await scrollTop(page)).toBe(0);

      await readerScrollsTo(page, 100);
      await pastDebounce(page);
      expect(await writes(page)).toEqual([]);
    });

    test("a long document records a reader's scroll once, after the debounce", async ({
      page,
    }) => {
      await open(page, { layout });
      const total = await range(page);
      await readerScrollsTo(page, 1200);
      await expect
        .poll(async () => writes(page))
        .toEqual([
          {
            fileId: "textresume01",
            position: Math.round((1200 / total) * 1000),
            duration: 1000,
          },
        ]);
    });

    test("a document that grows after the restore is not corrected", async ({
      page,
    }) => {
      await open(page, { layout, doc: "markdown", stored: "500" });
      const target = await restoredTop(page, 500);
      await expect.poll(() => scrollTop(page)).toBe(target);

      await page.evaluate(() => {
        const body = document.querySelector(".markdown-body")!;
        const grown = document.createElement("div");
        grown.style.height = "1600px";
        body.appendChild(grown);
      });
      await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));

      expect(await scrollTop(page)).toBe(target);
      expect(await writes(page)).toEqual([]);
    });

    test("a highlight is the explicit target, so the stored position is not applied", async ({
      page,
    }) => {
      await open(page, { layout, stored: "500", highlight: true });
      await settle(page);
      expect(await scrollTop(page)).toBe(0);
    });

    test("a hash is the explicit target, so the stored position is not applied", async ({
      page,
    }) => {
      await open(page, { layout, stored: "500", hash: true });
      await settle(page);
      expect(await scrollTop(page)).toBe(0);
    });

    test("a pending stored read leaves the text at the top, then restores", async ({
      page,
    }) => {
      await open(page, { layout, stored: "pending" });
      await waitForPendingRead(page);
      expect(await scrollTop(page)).toBe(0);

      const target = await restoredTop(page, 500);
      await resolveRead(page, 500, 1000);
      await expect.poll(() => scrollTop(page)).toBe(target);
    });

    test("the reader's scroll while the read is pending abandons the restore and is recorded", async ({
      page,
    }) => {
      await open(page, { layout, stored: "pending" });
      await waitForPendingRead(page);
      const total = await range(page);
      await readerScrollsTo(page, 400);

      // Scroll events are dispatched in a frame of their own, so the app has
      // not seen the reader move until that frame has run.
      await settle(page);
      await resolveRead(page, 800, 1000);
      await settle(page);
      expect(await scrollTop(page)).toBe(400);
      await expect
        .poll(async () => writes(page))
        .toEqual([
          {
            fileId: "textresume01",
            position: Math.round((400 / total) * 1000),
            duration: 1000,
          },
        ]);
    });

    test("a failed stored read opens at the top", async ({ page }) => {
      await open(page, { layout, stored: "fail" });
      await settle(page);
      expect(await scrollTop(page)).toBe(0);
    });

    test("an empty stored record opens at the top", async ({ page }) => {
      await open(page, { layout, stored: "empty" });
      await settle(page);
      expect(await scrollTop(page)).toBe(0);
    });

    test("a Markdown document restores too", async ({ page }) => {
      await open(page, { layout, doc: "markdown", stored: "500" });
      await expect.poll(() => scrollTop(page)).toBe(await restoredTop(page, 500));
    });
  });
}
