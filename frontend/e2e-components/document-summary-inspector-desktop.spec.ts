/**
 * A document file's summaries in the inspector, and the filled document
 * viewers, on the real `AppShell` around the real file page. Widths, frames
 * and the viewer's bottom edge only exist with every box laid out.
 */

import { test, expect, type Page } from "@playwright/test";

import { FIXTURE_URL, serveFixture } from "./fixtureOrigin";

test.beforeEach(({ context }) => serveFixture(context));

const PDF = "pdf000000001";
const ARCHIVE = "zip000000001";
const VIDEO = "video0000001";

const WIDE_TAB = "Detailed summary";
const PLAIN_TAB = "Scenes";
const NARROW = 384;

type Kind = "pdf" | "archive";

interface OpenOptions {
  file?: string;
  width?: number;
  height?: number;
  locale?: "en" | "ja";
  silent?: boolean;
  docside?: boolean;
}

let navigation = 0;

async function open(page: Page, options: OpenOptions = {}): Promise<void> {
  const {
    file = PDF,
    width = 1440,
    height = 900,
    locale = "en",
    silent = false,
    docside = true,
  } = options;
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.setItem("workbench-panels", "[]");
      localStorage.setItem("inspector-open:fixture", "true");
      localStorage.setItem("sidebar-open", "true");
      sessionStorage.setItem("__seeded", "1");
    }
    const frames: {
      fit: string | null;
      selected: string | null;
      pane: number | null;
      row: number | null;
    }[] = [];
    (window as unknown as { __frames: typeof frames }).__frames = frames;
    const tick = () => {
      const row = document.querySelector<HTMLElement>('[data-testid="inspector-fit-host"]');
      const pane = document.querySelector<HTMLElement>("aside.inspector-pane");
      const selected = pane?.querySelector('[role="tab"][aria-selected="true"]');
      frames.push({
        fit: row ? (row.dataset.inspectorFit ?? null) : null,
        selected: selected ? (selected.textContent ?? "").trim() : null,
        pane: pane ? pane.getBoundingClientRect().width : null,
        row: row ? row.getBoundingClientRect().width : null,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.setViewportSize({ width, height });
  const params = new URLSearchParams({
    run: String(++navigation),
    locale,
    query: `file=${file}`,
  });
  if (docside) params.set("docside", "1");
  if (silent) params.set("docside-silent", "1");
  await page.goto(`${FIXTURE_URL}?${params}#focus-drive`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
}

async function ready(page: Page, kind: Kind | "video" = "pdf"): Promise<void> {
  if (kind === "pdf") await expect(page.locator("section[data-pdf-page]").first()).toBeVisible();
  if (kind === "archive") await expect(page.getByText("letter-1.txt").first()).toBeVisible();
  if (kind === "video") await expect(page.locator("video")).toHaveCount(1);
}

const inspector = (page: Page) => page.locator("aside.inspector-pane");
const tab = (page: Page, name: string) =>
  inspector(page).getByRole("tab", { name, exact: true });
const tabNames = (page: Page) =>
  inspector(page)
    .getByRole("tab")
    .evaluateAll((tabs) => tabs.map((t) => (t.textContent ?? "").trim()));
const selectedTab = (page: Page) =>
  inspector(page)
    .locator('[role="tab"][aria-selected="true"]')
    .evaluateAll((tabs) => tabs.map((t) => (t.textContent ?? "").trim())[0] ?? null);
const inspectorToggle = (page: Page) =>
  page.locator("header").getByTestId("inspector-toggle").filter({ visible: true });

/** The wide tab, made listed by its first report and then selected by the reader. */
async function selectWideTab(page: Page): Promise<void> {
  await expect.poll(() => tabNames(page)).toContain(WIDE_TAB);
  await tab(page, WIDE_TAB).click();
  await expect.poll(() => selectedTab(page)).toBe(WIDE_TAB);
}

interface Row {
  fit: string | null;
  row: number;
  pane: number | null;
  canvas: number;
  paneTransition: { property: string; duration: string } | null;
}

const measureRow = (page: Page): Promise<Row> =>
  page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[data-testid="inspector-fit-host"]')!;
    const pane = document.querySelector<HTMLElement>("aside.inspector-pane");
    const main = document.querySelector(".media-detail-host")!.closest("main")!;
    const style = pane ? getComputedStyle(pane) : null;
    return {
      fit: row.dataset.inspectorFit ?? null,
      row: row.getBoundingClientRect().width,
      pane: pane ? pane.getBoundingClientRect().width : null,
      canvas: main.getBoundingClientRect().width,
      paneTransition: style
        ? { property: style.transitionProperty, duration: style.transitionDuration }
        : null,
    };
  });

const wideWidth = (row: number) => Math.max(Math.round(0.4 * row), 512);

/** A pane width settles in the commit that selects; poll only for the measuring to catch up. */
async function expectPane(page: Page, expected: "wide" | "narrow"): Promise<Row> {
  let last: Row | null = null;
  await expect
    .poll(async () => {
      last = await measureRow(page);
      const want = expected === "wide" ? wideWidth(last.row) : NARROW;
      return last.pane === null ? null : Math.abs(last.pane - want) <= 1;
    })
    .toBe(true);
  const m = last!;
  expect(Math.abs(m.canvas + m.pane! - m.row)).toBeLessThanOrEqual(1);
  return m;
}

/** Every frame recorded since `from` in the beside form pairs the selection with its width. */
async function expectNoMismatchedFrame(page: Page, from: number): Promise<void> {
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          __frames: {
            fit: string | null;
            selected: string | null;
            pane: number | null;
            row: number | null;
          }[];
        }
      ).__frames,
  );
  const bad = frames.slice(from).filter((f) => {
    if (f.fit !== "beside" || f.pane === null || f.row === null) return false;
    const want = f.selected === WIDE_TAB ? Math.max(Math.round(0.4 * f.row), 512) : NARROW;
    return Math.abs(f.pane - want) > 1;
  });
  expect(bad).toEqual([]);
}

const frameCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frames: unknown[] }).__frames.length);

function expectNoWidthTransition(row: Row) {
  const t = row.paneTransition!;
  const properties = t.property.split(",").map((p) => p.trim());
  const durations = t.duration.split(",").map((d) => Number.parseFloat(d));
  properties.forEach((property, index) => {
    const duration = durations[index % durations.length];
    if (duration > 0) {
      expect(["width", "all", "min-width", "max-width", "flex-basis"]).not.toContain(property);
    }
  });
}

const docSide = (page: Page, id: string, call: string, arg?: unknown) =>
  page.evaluate(
    ({ id, call, arg }) => {
      const handle = (window as unknown as { __docSide?: Record<string, Record<string, (a?: unknown) => unknown>> })
        .__docSide?.[id];
      if (!handle) throw new Error(`the document-side entry ${id} is not mounted`);
      return handle[call](arg) as unknown;
    },
    { id, call, arg },
  );

const pressT = async (page: Page) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press("t");
};

// ---------------------------------------------------------------------------
// SPEC-CORE-131: the filled viewers
// ---------------------------------------------------------------------------

interface Fill {
  gap: number;
  overflow: number;
}

const measureFill = (page: Page, kind: Kind): Promise<Fill> =>
  page.evaluate((kind) => {
    const main = document.querySelector(".media-detail-host")!.closest("main")!;
    const r = main.getBoundingClientRect();
    const style = getComputedStyle(main);
    const contentBottom =
      r.top +
      main.clientTop +
      main.clientHeight -
      Number.parseFloat(style.paddingBottom) -
      (kind === "archive" ? 16 : 0);
    const viewer = document.querySelector(".media-detail-player > :first-child")!;
    return {
      gap: contentBottom - viewer.getBoundingClientRect().bottom,
      overflow: main.scrollHeight - main.clientHeight,
    };
  }, kind);

async function expectFilled(page: Page, kind: Kind): Promise<void> {
  await expect
    .poll(async () => {
      const m = await measureFill(page, kind);
      return { gapWithin1px: Math.abs(m.gap) <= 1, overflow: m.overflow };
    })
    .toEqual({ gapWithin1px: true, overflow: 0 });
}

for (const kind of ["pdf", "archive"] as const) {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    test(`SPEC-CORE-131 I1 (${kind}, ${size.width}×${size.height}): the viewer ends at the canvas's content bottom beside the inspector, with find open, and in focus mode`, async ({
      page,
    }) => {
      await open(page, { file: kind === "pdf" ? PDF : ARCHIVE, ...size, docside: false });
      await ready(page, kind);
      expect((await measureRow(page)).fit).toBe("beside");
      await expectFilled(page, kind);

      // Find opens after the viewer has mounted.
      await page.getByTestId("find-button").click();
      await expect(page.getByTestId("find-bar")).toBeVisible();
      await expectFilled(page, kind);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("find-bar")).toHaveCount(0);

      await pressT(page);
      await expect(page.locator("header")).toHaveAttribute("inert", "");
      await expectFilled(page, kind);
    });
  }

  test(`SPEC-CORE-131 I1 (${kind}, overlay at 900×700): the viewer ends at the canvas's content bottom`, async ({
    page,
  }) => {
    await open(page, { file: kind === "pdf" ? PDF : ARCHIVE, width: 900, height: 700, docside: false });
    await ready(page, kind);
    await expectFilled(page, kind);
    expect((await measureRow(page)).fit).toBe("overlay");
  });
}
// ---------------------------------------------------------------------------
// SPEC-CORE-132 / 133: the tab and the wide pane
// ---------------------------------------------------------------------------

test("SPEC-CORE-132 I3: the strip reads Info, Find, Pages, then the document-side tabs by priority", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await expect.poll(() => tabNames(page)).toContain(WIDE_TAB);
  await page.getByTestId("find-button").click();
  await expect.poll(() => selectedTab(page)).toBe("Find");

  const names = await tabNames(page);
  const at = (name: string) => names.indexOf(name);
  expect(at("Info")).toBe(0);
  expect(at("Find")).toBeGreaterThan(0);
  expect(at("Pages")).toBeGreaterThan(at("Find"));
  expect(at(WIDE_TAB)).toBeGreaterThan(at("Pages"));
  expect(at(PLAIN_TAB)).toBe(at(WIDE_TAB) + 1);
});

test("SPEC-CORE-132 §1.3: the tab is labelled 「詳細要約」 in Japanese", async ({ page }) => {
  await open(page, { locale: "ja" });
  await ready(page);
  await expect.poll(() => tabNames(page)).toContain("詳細要約");
});

test("SPEC-CORE-133 I4 (1440×900, sidebar): the wide tab makes the pane 512px and the PDF 688px in its first frame; any other tab gives 384px; no width transition", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  const start = await frameCount(page);

  await selectWideTab(page);
  const wide = await expectPane(page, "wide");
  expect(Math.round(wide.pane!)).toBe(512);
  expect(Math.round(wide.canvas)).toBe(688);
  expectNoWidthTransition(wide);

  await tab(page, PLAIN_TAB).click();
  await expectPane(page, "narrow");
  await tab(page, "Info").click();
  await expectPane(page, "narrow");
  await tab(page, WIDE_TAB).click();
  await expectPane(page, "wide");

  await expectNoMismatchedFrame(page, start);
});

test("SPEC-CORE-133 I4 (1280×800): the wide pane is 512px", async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  await ready(page);
  await selectWideTab(page);
  const wide = await expectPane(page, "wide");
  expect(Math.round(wide.pane!)).toBe(512);
});

test("SPEC-CORE-133 I6: entering focus mode at 1440 recomputes the wide pane to 576px, leaving returns to 512px", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  await expectPane(page, "wide");
  const start = await frameCount(page);

  await pressT(page);
  await expect(page.locator("header")).toHaveAttribute("inert", "");
  const focused = await expectPane(page, "wide");
  expect(Math.round(focused.pane!)).toBe(576);
  expect(await selectedTab(page)).toBe(WIDE_TAB);

  await pressT(page);
  const back = await expectPane(page, "wide");
  expect(Math.round(back.pane!)).toBe(512);
  await expectNoMismatchedFrame(page, start);
});

test("SPEC-CORE-133 I6: find opening selects Find at 384px; closing restores the wide tab, wide", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  await expectPane(page, "wide");
  const start = await frameCount(page);

  await page.getByTestId("find-button").click();
  await expect(page.getByTestId("find-bar")).toBeVisible();
  expect(await selectedTab(page)).toBe("Find");
  await expectPane(page, "narrow");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("find-bar")).toHaveCount(0);
  await expect.poll(() => selectedTab(page)).toBe(WIDE_TAB);
  await expectPane(page, "wide");
  await expectNoMismatchedFrame(page, start);
});

test("SPEC-CORE-133 I6: closing the inspector drops the pane; opening it again is Info at 384px", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  await expectPane(page, "wide");

  await inspectorToggle(page).click();
  await expect(inspector(page)).toHaveCount(0);
  await inspectorToggle(page).click();
  await expect(inspector(page)).toHaveCount(1);
  expect(await selectedTab(page)).toBe("Info");
  await expectPane(page, "narrow");
});

test("SPEC-CORE-133 I5 / I6: beside → overlay keeps the tab at 384px; overlay → beside is wide again", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  await expectPane(page, "wide");

  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(async () => (await measureRow(page)).fit).toBe("overlay");
  await expect(inspector(page)).toHaveCount(1);
  expect(await selectedTab(page)).toBe(WIDE_TAB);
  const overlay = await measureRow(page);
  expect(Math.round(overlay.pane!)).toBe(NARROW);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await measureRow(page)).fit).toBe("beside");
  expect(await selectedTab(page)).toBe(WIDE_TAB);
  await expectPane(page, "wide");
});

test("SPEC-CORE-133 I6: the wide tab disappearing while selected leaves the pane at 384px", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  await expectPane(page, "wide");

  await docSide(page, "fixture-doc-summary", "report", false);
  await expect.poll(() => tabNames(page)).not.toContain(WIDE_TAB);
  expect(await selectedTab(page)).not.toBe(WIDE_TAB);
  await expectPane(page, "narrow");
});

test("SPEC-CORE-133 I6: moving to another file gives Info at 384px", async ({ page }) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  await expectPane(page, "wide");

  await page.evaluate((id) => window.__fixtureNavigate!("/drive/fixture", `file=${id}`), ARCHIVE);
  await ready(page, "archive");
  await expect.poll(() => selectedTab(page)).toBe("Info");
  await expectPane(page, "narrow");
});

test("SPEC-CORE-133 I5: a player file's pane never widens, and has no document-side tab", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  await expectPane(page, "wide");

  await page.evaluate((id) => window.__fixtureNavigate!("/drive/fixture", `file=${id}`), VIDEO);
  await ready(page, "video");
  expect(await tabNames(page)).not.toContain(WIDE_TAB);
  const row = await measureRow(page);
  expect(row.pane).not.toBeNull();
  expect(Math.round(row.pane!)).toBe(NARROW);
});

test("SPEC-CORE-132 I8 / I7: a jump in place moves the same PDF page area to the cited page and keeps the tab, the width and the URL", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await page.evaluate(() => {
    let node: HTMLElement | null = document.querySelector("section[data-pdf-page]");
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
      node = node.parentElement;
    }
    (window as unknown as { __pageArea: HTMLElement | null }).__pageArea = node;
  });
  const sameArea = () =>
    page.evaluate(() => {
      const kept = (window as unknown as { __pageArea: HTMLElement | null }).__pageArea;
      return Boolean(kept && kept.isConnected && kept.querySelector("section[data-pdf-page]"));
    });

  await selectWideTab(page);
  await expectPane(page, "wide");
  expect(await sameArea()).toBe(true);
  await tab(page, "Info").click();
  await expectPane(page, "narrow");
  await tab(page, WIDE_TAB).click();
  await expectPane(page, "wide");
  expect(await sameArea()).toBe(true);

  const before = await page.evaluate(() => ({
    path: window.__fixturePathname ?? null,
    query: window.__fixtureSearchParams?.toString() ?? null,
  }));
  const answer = await docSide(page, "fixture-doc-summary", "openInViewer", { fileId: PDF, page: 3 });
  expect(answer).toBe(true);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const area = (window as unknown as { __pageArea: HTMLElement }).__pageArea;
        const top = area.getBoundingClientRect().top;
        const third = area.querySelector('section[data-pdf-page="3"]');
        const second = area.querySelector('section[data-pdf-page="2"]');
        if (!third) return "no page 3";
        const t = third.getBoundingClientRect();
        const secondBottom = second ? second.getBoundingClientRect().bottom : -Infinity;
        return t.top >= top - 1 && secondBottom <= top + 1 ? "at top" : `top ${t.top - top}`;
      }),
    )
    .toBe("at top");
  expect(await selectedTab(page)).toBe(WIDE_TAB);
  await expectPane(page, "wide");
  expect(await sameArea()).toBe(true);
  expect(
    await page.evaluate(() => ({
      path: window.__fixturePathname ?? null,
      query: window.__fixtureSearchParams?.toString() ?? null,
    })),
  ).toEqual(before);
  expect(await page.evaluate(() => window.__fixturePushes ?? [])).toEqual([]);
});

test("SPEC-CORE-132 §1.6: a jump to another file is answered false and moves nothing", async ({ page }) => {
  await open(page);
  await ready(page);
  await selectWideTab(page);
  expect(await docSide(page, "fixture-doc-summary", "openInViewer", { fileId: VIDEO, page: 2 })).toBe(false);
  expect(await selectedTab(page)).toBe(WIDE_TAB);
});

test("SPEC-CORE-133 I11: starting generation from an unlisted entry lists and selects its tab, wide, in beside", async ({
  page,
}) => {
  await open(page, { silent: true });
  await ready(page);
  expect(await tabNames(page)).not.toContain(WIDE_TAB);

  // select() before the entry is listed does nothing.
  await docSide(page, "fixture-doc-summary", "select");
  expect(await tabNames(page)).not.toContain(WIDE_TAB);
  expect(await selectedTab(page)).toBe("Info");
  await expectPane(page, "narrow");

  const start = await frameCount(page);
  await docSide(page, "fixture-doc-summary", "startGenerating");
  await expect.poll(() => selectedTab(page)).toBe(WIDE_TAB);
  await expect(inspector(page).getByTestId("fixture-doc-side-generating")).toBeVisible();
  await expectPane(page, "wide");
  await expectNoMismatchedFrame(page, start);
});

test("SPEC-CORE-132 I10: the entry is active only while its tab is selected", async ({ page }) => {
  await open(page);
  await ready(page);
  await expect.poll(() => tabNames(page)).toContain(WIDE_TAB);
  expect(await docSide(page, "fixture-doc-summary", "active")).toBe(false);
  await tab(page, WIDE_TAB).click();
  await expect.poll(() => docSide(page, "fixture-doc-summary", "active")).toBe(true);
  await tab(page, "Info").click();
  await expect.poll(() => docSide(page, "fixture-doc-summary", "active")).toBe(false);
});
