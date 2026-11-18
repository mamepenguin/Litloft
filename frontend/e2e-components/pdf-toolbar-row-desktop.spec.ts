/**
 * The PDF viewer's toolbar on the real file page. Whether it fits one row
 * depends on every box being laid out, so it is measured in a browser.
 */

import { test, expect, type Page } from "@playwright/test";

import { FIXTURE_URL, serveFixture } from "./fixtureOrigin";

test.beforeEach(({ context }) => serveFixture(context));

const PDF = "pdf000000001";

let navigation = 0;

async function open(
  page: Page,
  { width, height, locale }: { width: number; height: number; locale: "en" | "ja" },
): Promise<void> {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.setItem("workbench-panels", "[]");
      localStorage.setItem("inspector-open:fixture", "true");
      localStorage.setItem("sidebar-open", "true");
      sessionStorage.setItem("__seeded", "1");
    }
  });
  await page.setViewportSize({ width, height });
  const params = new URLSearchParams({
    run: String(++navigation),
    locale,
    query: `file=${PDF}`,
    docside: "1",
  });
  await page.goto(`${FIXTURE_URL}?${params}#focus-drive`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.locator("section[data-pdf-page]").first()).toBeVisible();
}

async function selectTab(page: Page, name: string): Promise<void> {
  const tab = page.locator("aside.inspector-pane").getByRole("tab", { name, exact: true });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

interface ToolbarRow {
  width: number;
  rows: number;
  valueShown: boolean;
}

const measure = (page: Page): Promise<ToolbarRow> =>
  page.getByTestId("pdf-toolbar").evaluate((bar) => {
    const rect = (child: Element) => child.getBoundingClientRect();
    const middles = [...bar.children]
      .filter((child) => rect(child).width > 1)
      .map((child) => rect(child).top + rect(child).height / 2);
    const menu = bar.querySelector<HTMLElement>("button[aria-haspopup='menu']")!;
    const value = menu.querySelector<HTMLElement>("span")!;
    return {
      width: bar.getBoundingClientRect().width,
      rows: Math.round((Math.max(...middles) - Math.min(...middles)) / 32) + 1,
      valueShown: value.getBoundingClientRect().width > 1,
    };
  });

for (const [locale, tabName] of [
  ["en", "Detailed summary"],
  ["ja", "詳細要約"],
] as const) {
  test(`UNSPEC (${locale}, 1280×800, wide inspector tab): the PDF toolbar is one row, the zoom mode drawn as its icon and still named`, async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 800, locale });
    await selectTab(page, tabName);
    await expect.poll(async () => (await measure(page)).width).toBeLessThan(560);

    const row = await measure(page);
    expect(row.rows).toBe(1);
    expect(row.valueShown).toBe(false);
    const name = await page
      .getByTestId("pdf-toolbar")
      .locator("button[aria-haspopup='menu']")
      .getAttribute("aria-label");
    expect(name).toBe(locale === "en" ? "Zoom mode: Fit width" : "表示倍率: 幅に合わせる");
  });

  test(`UNSPEC (${locale}, 1440×900): with room, the PDF toolbar is one row and shows the zoom mode's name`, async ({
    page,
  }) => {
    await open(page, { width: 1440, height: 900, locale });
    const row = await measure(page);
    expect(row.width).toBeGreaterThan(640);
    expect(row.rows).toBe(1);
    expect(row.valueShown).toBe(true);
  });
}

test("UNSPEC: at every toolbar width the zoom mode's name is shown only where the row still fits it, and the bar keeps one height", async ({
  page,
}) => {
  await open(page, { width: 1440, height: 900, locale: "ja" });
  const heights = new Set<number>();
  const shown = new Set<boolean>();
  for (const mode of ["幅に合わせる", "ページ全体", "実寸"]) {
    const bar = page.getByTestId("pdf-toolbar");
    await bar.locator("button[aria-haspopup='menu']").click();
    await page.getByRole("menuitemradio", { name: mode }).click();
    for (let width = 760; width >= 440; width -= 8) {
      const row = await bar.evaluate((el, w) => {
        const frame = el.closest<HTMLElement>("[data-viewer-frame]")!;
        frame.style.width = `${w}px`;
        const value = el.querySelector("button[aria-haspopup='menu'] span")!;
        const middles = [...el.children]
          .map((c) => c.getBoundingClientRect())
          .filter((r) => r.width > 1)
          .map((r) => r.top + r.height / 2);
        const rows = Math.round((Math.max(...middles) - Math.min(...middles)) / 32) + 1;
        return {
          rows,
          valueShown: value.getBoundingClientRect().width > 1,
          height: el.getBoundingClientRect().height,
        };
      }, width);
      if (row.valueShown) expect({ mode, width, rows: row.rows }).toEqual({ mode, width, rows: 1 });
      if (row.rows === 1) {
        heights.add(Math.round(row.height));
        shown.add(row.valueShown);
      }
    }
  }
  // Both forms were seen, and the bar did not change height between them.
  expect([...shown].sort()).toEqual([false, true]);
  expect([...heights]).toHaveLength(1);
});
