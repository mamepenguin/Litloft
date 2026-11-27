/**
 * A queue page at desktop widths: the real queue pane, collection rows, page
 * row and right pane. jsdom cannot produce any of these boxes, so every case
 * measures what Chromium lays out.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

let navigation = 0;

async function open(
  page: Page,
  arrangement: string,
  viewport: { width: number; height: number },
  { tree = false }: { tree?: boolean } = {},
): Promise<void> {
  await page.setViewportSize(viewport);
  if (tree) {
    await page.addInitScript(() =>
      localStorage.setItem("tree:enabled:fixture", "true"),
    );
  }
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
}

const box = (l: Locator): Promise<Box> =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });

const queuePane = (page: Page) =>
  page.locator('aside[aria-label="Queue"]');

const fileRow = (page: Page) =>
  page.locator('[data-testid="file-detail-chrome"]').filter({ visible: true });

/** Nothing visible in the row overlaps anything else, nested parts included. */
async function expectNoOverlap(page: Page): Promise<void> {
  const parts = await fileRow(page)
    .locator("button, a[href], span")
    .filter({ visible: true })
    .evaluateAll((elements) => {
      const row = elements[0]?.closest('[data-testid="file-detail-chrome"]');
      return elements
        .map((el) => {
          const own = el.getBoundingClientRect();
          const rect = {
            left: own.left,
            right: own.right,
            top: own.top,
            bottom: own.bottom,
          };
          // A part inside a clipping box is measured by what it can paint.
          for (
            let parent = el.parentElement;
            parent && parent !== row;
            parent = parent.parentElement
          ) {
            const style = getComputedStyle(parent);
            if (
              !/(hidden|clip|auto|scroll)/.test(style.overflowX) &&
              !/(hidden|clip|auto|scroll)/.test(style.overflowY)
            ) {
              continue;
            }
            const box = parent.getBoundingClientRect();
            rect.left = Math.max(rect.left, box.left);
            rect.right = Math.min(rect.right, box.right);
            rect.top = Math.max(rect.top, box.top);
            rect.bottom = Math.min(rect.bottom, box.bottom);
          }
          return {
            ...rect,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
          };
        })
        .filter((r) => r.width > 0 && r.height > 0);
    });

  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i];
      const b = parts[j];
      const nested =
        (a.left >= b.left - 0.5 &&
          a.right <= b.right + 0.5 &&
          a.top >= b.top - 0.5 &&
          a.bottom <= b.bottom + 0.5) ||
        (b.left >= a.left - 0.5 &&
          b.right <= a.right + 0.5 &&
          b.top >= a.top - 0.5 &&
          b.bottom <= a.bottom + 0.5);
      const overlap =
        a.left < b.right - 0.5 &&
        b.left < a.right - 0.5 &&
        a.top < b.bottom - 0.5 &&
        b.top < a.bottom - 0.5;
      expect(overlap && !nested, `parts ${i} and ${j} overlap`).toBe(false);
    }
  }
}

const countLines = (l: Locator): Promise<number> =>
  l.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set<number>();
    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.height > 0) tops.add(Math.round(r.top));
    }
    return tops.size;
  });

test("SPEC-CORE-190 D1 / I8 (1440×900): the queue pane is 280px, every collection row's move up, move down and remove are visible without hover, and the tree is not shown", async ({
  page,
}) => {
  await open(
    page,
    "queue-page-video",
    { width: 1440, height: 900 },
    { tree: true },
  );
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();

  const pane = queuePane(page);
  await expect(pane).toBeVisible();
  expect((await box(pane)).width).toBe(280);

  const rows = pane.locator("li");
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    await expect(row.getByRole("button", { name: "Move up" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Move down" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Remove" })).toBeVisible();
  }

  await expect(page.locator('aside[aria-label="Folder tree"]')).toHaveCount(0);
});

test("SPEC-CORE-190 D3 (1024×768): the queue pane yields and previous / next stay in the page row", async ({
  page,
}) => {
  await open(
    page,
    "queue-page-video",
    { width: 1024, height: 768 },
    { tree: true },
  );
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();

  await expect(queuePane(page)).toHaveCSS("width", "0px");
  await expect(
    fileRow(page).getByTestId("file-nav-prev"),
  ).toBeVisible();
  await expect(
    fileRow(page).getByTestId("file-nav-next"),
  ).toBeVisible();
});

test("SPEC-CORE-190 step 12 / D3 (1024×768, tree setting off after Play): the started queue shows its pane, yields, and the button brings it back without writing the setting", async ({
  page,
}) => {
  await open(page, "queue-page-play", { width: 1024, height: 768 });

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();

  const pane = queuePane(page);
  await expect(pane).toHaveCSS("width", "0px");
  expect(
    await page.evaluate(() => localStorage.getItem("tree:enabled:fixture")),
  ).toBeNull();

  await page.getByRole("button", { name: "Show the queue" }).click();
  await expect(pane).toHaveCSS("width", "280px");
  expect(
    await page.evaluate(() => localStorage.getItem("tree:enabled:fixture")),
  ).toBeNull();
});

test("SPEC-CORE-064 I4 as revised (280px, mouse): the queue pane has no horizontal scroll and keeps every row reachable by vertical scroll", async ({
  page,
}) => {
  await open(
    page,
    "queue-page-many",
    { width: 1440, height: 900 },
    { tree: true },
  );
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();

  const pane = queuePane(page);
  expect((await box(pane)).width).toBe(280);
  const paneOverflow = await pane.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(paneOverflow.scrollWidth).toBeLessThanOrEqual(
    paneOverflow.clientWidth + 1,
  );

  const list = pane.locator("ul");
  const overflow = await list.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);

  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const listBox = await box(list);
  const last = await box(pane.locator("li").last());
  expect(last.top).toBeGreaterThanOrEqual(listBox.top - 0.5);
  expect(last.bottom).toBeLessThanOrEqual(listBox.bottom + 0.5);
});

test("SPEC-CORE-094 I8 / SPEC-CORE-190 I3 (320px, a 200-character name): the queue page's row does not wrap and nothing in it overlaps", async ({
  page,
}) => {
  await open(page, "queue-page-long", { width: 320, height: 800 }, { tree: true });
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  const withQueue = (await box(page.locator("header"))).height;

  await open(page, "header-row-long", { width: 320, height: 800 });
  const withoutQueue = (await box(page.locator("header"))).height;

  expect(withQueue).toBe(withoutQueue);

  await open(page, "queue-page-long", { width: 320, height: 800 }, { tree: true });
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  const leaf = fileRow(page)
    .getByText(`${"a".repeat(196)}.mp4`, { exact: true })
    .filter({ visible: true });
  await expect(leaf).toHaveCount(1);
  expect(await countLines(leaf)).toBe(1);
  await expectNoOverlap(page);
});

test("SPEC-CORE-098 I8 / SPEC-CORE-190 I3 (768px, a video with find): the queue page's row does not wrap and nothing in it overlaps", async ({
  page,
}) => {
  await open(
    page,
    "queue-page-video-find",
    { width: 768, height: 800 },
    { tree: true },
  );
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  const withQueue = (await box(page.locator("header"))).height;

  await open(page, "header-row-video", { width: 768, height: 800 });
  const withoutQueue = (await box(page.locator("header"))).height;
  expect(withQueue).toBe(withoutQueue);

  await open(
    page,
    "queue-page-video-find",
    { width: 768, height: 800 },
    { tree: true },
  );
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  await expect(page.getByTestId("find-bar")).toBeVisible();
  await expect(fileRow(page).getByTestId("file-nav-next")).toBeVisible();
  await expectNoOverlap(page);
});

for (const width of [1440, 768]) {
  test(`SPEC-CORE-094 I8 / SPEC-CORE-190 I3 (a Markdown file at ${width}px): the queue page's row does not wrap and nothing in it overlaps`, async ({
    page,
  }) => {
    await open(
      page,
      "queue-page-note",
      { width, height: 800 },
      { tree: true },
    );
    await expect(page.getByTestId("file-detail-shell")).toBeVisible();
    const withQueue = (await box(page.locator("header"))).height;

    await open(page, "header-row-note", { width, height: 800 });
    const withoutQueue = (await box(page.locator("header"))).height;
    expect(withQueue).toBe(withoutQueue);

    await open(
      page,
      "queue-page-note",
      { width, height: 800 },
      { tree: true },
    );
    await expect(page.getByTestId("file-detail-shell")).toBeVisible();
    await expect(
      fileRow(page).getByTestId("file-nav-prev"),
    ).toBeVisible();
    await expect(
      fileRow(page).getByTestId("file-nav-next"),
    ).toBeVisible();
    await expectNoOverlap(page);
  });
}
