/**
 * A document file's summaries and filled viewer on a phone (390×844): the
 * real file page with its bottom sheet.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import enMessages from "../src/messages-core/en.json";
import { SHEET_SNAP_HALF_FALLBACK } from "../src/lib/sheetSnap";

const FIXTURE = pathToFileURL(PAGE).href;
const PDF_ID = "pdf000000001";
const WIDE_TAB = "Detailed summary";
const PHONE = { width: 390, height: 844 };

let navigation = 0;

async function open(
  page: Page,
  arrangement: "inspector-pdf" | "inspector-archive",
  options: { docside?: boolean; silent?: boolean } = {},
) {
  const { docside = true, silent = false } = options;
  await page.setViewportSize(PHONE);
  const params = new URLSearchParams({ run: String(++navigation) });
  if (docside) params.set("docside", "1");
  if (silent) params.set("docside-silent", "1");
  await page.goto(`${FIXTURE}?${params}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  if (arrangement === "inspector-pdf") {
    await expect(page.locator("section[data-pdf-page]").first()).toBeVisible();
  } else {
    await expect(page.getByText("letter-1.txt").first()).toBeVisible();
  }
}

const peek = (page: Page) => page.getByTestId("mobile-inspector-peek");
const sheet = (page: Page) => page.getByTestId("mobile-inspector-sheet");

async function raiseSheet(page: Page) {
  await peek(page).getByRole("button", { name: enMessages.inspector.expandSheet }).click();
  await expect(sheet(page)).toBeVisible();
}

const sheetTabs = (page: Page) =>
  sheet(page)
    .getByRole("tab")
    .evaluateAll((tabs) => tabs.map((t) => (t.textContent ?? "").trim()));

const sheetSelected = (page: Page) =>
  sheet(page)
    .locator('[role="tab"][aria-selected="true"]')
    .evaluateAll((tabs) => tabs.map((t) => (t.textContent ?? "").trim())[0] ?? null);

const docSide = (page: Page, call: string, arg?: unknown) =>
  page.evaluate(
    ({ call, arg }) => {
      const handle = (
        window as unknown as { __docSide?: Record<string, Record<string, (a?: unknown) => unknown>> }
      ).__docSide?.["fixture-doc-summary"];
      if (!handle) throw new Error("the document-side entry is not mounted");
      return handle[call](arg) as unknown;
    },
    { call, arg },
  );

const snapFraction = (page: Page) =>
  sheet(page).evaluate((drawer) => {
    const published = Number.parseFloat(
      (drawer as HTMLElement).style.getPropertyValue("--snap-point-height"),
    );
    return 1 - published / window.innerHeight;
  });

for (const arrangement of ["inspector-pdf", "inspector-archive"] as const) {
  test(`SPEC-CORE-131 I1 (${arrangement}, phone): the viewer ends above the sheet's peek and the canvas does not scroll`, async ({
    page,
  }) => {
    await open(page, arrangement, { docside: false });
    await expect
      .poll(() =>
        page.evaluate((kind) => {
          const main = document.querySelector(".media-detail-host")!.closest("main")!;
          const r = main.getBoundingClientRect();
          const contentBottom =
            r.top +
            main.clientTop +
            main.clientHeight -
            Number.parseFloat(getComputedStyle(main).paddingBottom) -
            (kind === "inspector-archive" ? 16 : 0);
          const viewerBottom = (
            document.querySelector("[data-player-slot]") ??
            document.querySelector(".media-detail-player > :first-child")
          )!.getBoundingClientRect().bottom;
          const peekTop = document
            .querySelector('[data-testid="mobile-inspector-peek"]')!
            .getBoundingClientRect().top;
          return {
            gapWithin1px: Math.abs(contentBottom - viewerBottom) <= 1,
            abovePeek: viewerBottom <= peekTop + 1,
            overflow: main.scrollHeight - main.clientHeight,
          };
        }, arrangement),
      )
      .toEqual({ gapWithin1px: true, abovePeek: true, overflow: 0 });
  });
}

test("SPEC-CORE-132 I2 / SPEC-CORE-133 I5 (phone): the tab is in the sheet, nothing of it is in main, and selecting it does not change the sheet's width", async ({
  page,
}) => {
  await open(page, "inspector-pdf");
  await raiseSheet(page);
  await expect.poll(() => sheetTabs(page)).toContain(WIDE_TAB);
  const before = await sheet(page).evaluate((el) => el.getBoundingClientRect().width);

  await sheet(page).getByRole("tab", { name: WIDE_TAB, exact: true }).click();
  await expect.poll(() => sheetSelected(page)).toBe(WIDE_TAB);

  expect(await sheet(page).evaluate((el) => el.getBoundingClientRect().width)).toBe(before);
  expect(await page.locator("main [data-testid^='fixture-doc-side-']").count()).toBe(0);
});

test("SPEC-CORE-132 I8 (phone): a jump in place lowers the sheet and shows the cited page", async ({
  page,
}) => {
  await open(page, "inspector-pdf");
  await raiseSheet(page);
  await expect.poll(() => sheetTabs(page)).toContain(WIDE_TAB);
  await sheet(page).getByRole("tab", { name: WIDE_TAB, exact: true }).click();

  expect(await docSide(page, "openInViewer", { fileId: PDF_ID, page: 3 })).toBe(true);

  await expect(sheet(page)).toHaveCount(0);
  await expect(peek(page)).toBeVisible();
  await expect(page.locator('section[data-pdf-page="3"]')).toBeInViewport();
});

test("SPEC-CORE-133 I11 (phone): starting generation lists and selects the tab and leaves the sheet at its half snap", async ({
  page,
}) => {
  await open(page, "inspector-pdf", { silent: true });
  await raiseSheet(page);
  expect(await sheetTabs(page)).not.toContain(WIDE_TAB);

  await docSide(page, "startGenerating");

  await expect.poll(() => sheetSelected(page)).toBe(WIDE_TAB);
  await expect.poll(() => snapFraction(page)).toBeCloseTo(SHEET_SNAP_HALF_FALLBACK, 2);
});
