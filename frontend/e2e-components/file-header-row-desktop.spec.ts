/**
 * SPEC-CORE-094 at 768px and wider, measured on the real `AppShell` with the
 * real file page in it.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import enMessages from "../src/messages-core/en.json";

const FIXTURE = pathToFileURL(PAGE).href;

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

let navigation = 0;

async function open(page: Page, arrangement: string, width = 1280): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
}

const box = (l: Locator): Promise<Box> =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  });

const ORDINARY_CONTROLS = ["Search", "Quick note", "Profile Setup"] as const;

async function ordinaryControlX(page: Page): Promise<number[]> {
  const xs: number[] = [];
  for (const name of ORDINARY_CONTROLS) {
    xs.push((await box(page.locator("header").getByRole("button", { name }))).left);
  }
  return xs;
}

const trailIn = (scope: Locator) =>
  scope.locator('a[href="/drive/fixture/Videos/Clips"]').filter({ visible: true });

for (const width of [1280, 900]) {
  test(`SPEC-CORE-094 D1 / I1 (${width}px): the trail is in the app header, at the ordinary header's height, with no row below it`, async ({
    page,
  }) => {
    await open(page, "header-row-ordinary", width);
    const ordinary = await box(page.locator("header"));

    await open(page, "header-row-video", width);
    const header = page.locator("header");
    await expect(trailIn(header)).toHaveCount(1);
    await expect(header.getByText("holiday.webm", { exact: true }).filter({ visible: true })).toHaveCount(1);
    expect((await box(header)).height).toBe(ordinary.height);

    await expect(trailIn(page.locator("main"))).toHaveCount(0);
    await expect(page.locator("main").getByRole("button", { name: /inspector/i })).toBeHidden();
  });

  test(`SPEC-CORE-094 D3 / I2 (${width}px): search, quick note and the avatar sit where a folder page puts them`, async ({
    page,
  }) => {
    await open(page, "header-row-ordinary", width);
    const ordinary = await ordinaryControlX(page);

    await open(page, "header-row-video", width);
    await expect(trailIn(page.locator("header"))).toHaveCount(1);
    const onFilePage = await ordinaryControlX(page);
    for (let i = 0; i < ORDINARY_CONTROLS.length; i += 1) {
      expect(Math.abs(onFilePage[i] - ordinary[i]), ORDINARY_CONTROLS[i]).toBeLessThanOrEqual(0.5);
    }
  });
}

test("SPEC-CORE-094 D2: left to right — menu and tree buttons, trail, the file's controls, inspector toggle, a 1×20 divider, then search, quick note, avatar", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const header = page.locator("header");
  await expect(trailIn(header)).toHaveCount(1);

  const fixed = await box(page.getByTestId("chrome-buttons"));
  const trail = await box(header.getByRole("navigation"));
  const firstCrumb = await box(header.getByRole("navigation").locator("a, button").first());
  const find = await box(header.getByRole("button", { name: enMessages.find.button }));
  const toggle = await box(header.getByRole("button", { name: /inspector/i }));
  const search = await box(header.getByRole("button", { name: "Search" }));
  const quickNote = await box(header.getByRole("button", { name: "Quick note" }));
  const avatar = await box(header.getByRole("button", { name: "Profile Setup" }));

  // The trail starts at least 12px past the fixed buttons; it may start
  // further right, at the content box's edge.
  expect(firstCrumb.left).toBeGreaterThanOrEqual(fixed.right + 12 - 0.5);
  expect(trail.right).toBeLessThanOrEqual(find.left + 0.5);
  expect(find.right).toBeLessThanOrEqual(toggle.left + 0.5);
  expect(toggle.right).toBeLessThanOrEqual(search.left + 0.5);
  expect(search.right).toBeLessThanOrEqual(quickNote.left + 0.5);
  expect(quickNote.right).toBeLessThanOrEqual(avatar.left + 0.5);

  const dividers = await header.locator("*").evaluateAll(
    (els, span) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter(
          (r) =>
            Math.round(r.width) === 1 &&
            Math.round(r.height) === 20 &&
            r.left >= span.from - 0.5 &&
            r.right <= span.to + 0.5,
        ).length,
    { from: toggle.right, to: search.left },
  );
  expect(dividers).toBe(1);
});

test("SPEC-CORE-094 I3 (wide): quick note, the avatar, the tree button and the inspector toggle are all shown", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const header = page.locator("header");
  await expect(trailIn(header)).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Quick note" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Profile Setup" })).toBeVisible();
  await expect(header.getByRole("button", { name: /inspector/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /tree/i })).toBeVisible();
});

test("SPEC-CORE-094 I3 (wide): a rename in progress hides nothing", async ({ page }) => {
  await open(page, "header-row-note");
  const header = page.locator("header");
  await header.getByRole("button", { name: enMessages.inspector.rename.hint }).click();
  await expect(header.getByRole("textbox")).toBeVisible();

  for (const name of ["Search", "Quick note", "Profile Setup", enMessages.find.button]) {
    await expect(header.getByRole("button", { name })).toBeVisible();
  }
  await expect(header.getByRole("button", { name: /inspector/i })).toBeVisible();
  await expect(header.locator("svg.lucide-pencil").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /tree/i })).toBeVisible();
});

test("SPEC-CORE-094 D9 (wide): find in page uses the FileSearch glyph, not the global search's magnifier", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const find = page.locator("header").getByRole("button", { name: enMessages.find.button });
  await expect(find).toBeVisible();
  await expect(find.locator("svg.lucide-file-search")).toHaveCount(1);
  await expect(find.locator("svg.lucide-search")).toHaveCount(0);
});

test("SPEC-CORE-094 non-functional (wide): the content below the header starts at the header's bottom edge", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const header = page.locator("header");
  await expect(trailIn(header)).toHaveCount(1);
  const headerBox = await box(header);
  const player = await box(page.locator("video").first());
  expect(player.top - headerBox.bottom).toBeLessThan(48);
});

test("SPEC-CORE-094 I1 / failure case (wide, loading): the skeleton's drive crumb is in the header, at the loaded row's height, with the content where the loaded page puts it", async ({
  page,
}) => {
  await open(page, "header-row-video");
  await expect(trailIn(page.locator("header"))).toHaveCount(1);
  const loadedHeader = await box(page.locator("header"));
  const loadedContent = await box(page.locator("[data-testid='page-content'] > *").first());

  await open(page, "header-row-pending");
  await expect(
    page.locator("header").locator('a[href="/drive/fixture"]').filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.locator("main").locator('a[href="/drive/fixture"]').filter({ visible: true }),
  ).toHaveCount(0);
  expect((await box(page.locator("header"))).height).toBe(loadedHeader.height);
  const content = await box(page.locator("[data-testid='page-content'] > *").first());
  expect(content.top).toBe(loadedContent.top);
});

const fixedButtons = (page: Page) => box(page.getByTestId("chrome-buttons"));

for (const width of [1280, 900]) {
  test(`SPEC-CORE-094 D2 / I2 (canonical route, ${width}px): with the tree open the trail starts at the right pane's left edge, with it closed 12px past the fixed buttons, and never within 16px of the header's left end`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("tree:enabled:fixture", "true"));
    await open(page, "header-row-two-pane", width);
    const header = page.locator("header");
    const tree = page.locator('aside[aria-label="Folder tree"]');
    await expect(trailIn(header)).toHaveCount(1);

    // The canonical page yields the tree on a direct load; the tree button
    // brings it back.
    const show = page.getByRole("button", { name: "Show tree" });
    if (await show.isVisible()) await show.click();
    await expect(tree).toHaveCSS("width", "280px");
    const firstCrumb = header.getByRole("navigation").locator("a, button").first();
    // The pane to the right of the tree starts where the tree ends.
    const paneLeft = (await box(tree)).right;
    const open_ = Math.max((await fixedButtons(page)).right + 12, paneLeft, (await box(header)).left + 16);
    await expect
      .poll(async () => Math.abs((await box(firstCrumb)).left - open_))
      .toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Hide tree" }).click();
    await expect(tree).toHaveCSS("width", "0px");
    const closed = Math.max(
      (await fixedButtons(page)).right + 12,
      (await box(tree)).right,
      (await box(header)).left + 16,
    );
    await expect
      .poll(async () => Math.abs((await box(firstCrumb)).left - closed))
      .toBeLessThanOrEqual(1);
  });
}

test("SPEC-CORE-094 D2 / I2 (collection route): the back control starts at the centred column's padded edge", async ({
  page,
}) => {
  await open(page, "header-row-collection");
  const header = page.locator("header");
  const back = header.getByRole("button", { name: /^Back/ });
  await expect(back).toBeVisible();

  const column = await page.locator("video").first().evaluate((video) => {
    for (let node: Element | null = video; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.maxWidth === "1024px" || s.maxWidth === "1152px") {
        return node.getBoundingClientRect().left + parseFloat(s.paddingLeft);
      }
    }
    return null;
  });
  expect(column, "no max-w-5xl / max-w-6xl column around the player").not.toBeNull();
  const expected = Math.max((await fixedButtons(page)).right + 12, column!);
  expect(Math.abs((await box(back)).left - expected)).toBeLessThanOrEqual(1);
});

test("SPEC-CORE-094 D2 (canonical route, inline sidebar): the trail keeps 16px from the sidebar's edge, and the fixed buttons share the row's centre line with it", async ({
  page,
}) => {
  await open(page, "header-row-two-pane", 1440);
  const header = page.locator("header");
  const firstCrumb = header.getByRole("navigation").locator("a, button").first();
  const centre = (b: Box) => b.top + b.height / 2;

  for (const sidebar of ["open", "closed"] as const) {
    if (sidebar === "closed") {
      await page.getByTestId("chrome-buttons").getByRole("button").first().click();
      await expect
        .poll(async () => (await box(header)).left)
        .toBe(0);
    }
    const frame = await box(header);
    const crumb = await box(firstCrumb);
    const buttons = await fixedButtons(page);
    expect(crumb.left - frame.left, `${sidebar}: trail inset`).toBeGreaterThanOrEqual(16);
    expect(crumb.left, `${sidebar}: trail past the buttons`).toBeGreaterThanOrEqual(buttons.right + 12 - 1);
    expect(Math.abs(centre(buttons) - centre(frame)), `${sidebar}: buttons on the header's centre`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(centre(crumb) - centre(buttons)), `${sidebar}: trail on the buttons' centre`).toBeLessThanOrEqual(0.5);
  }
});
