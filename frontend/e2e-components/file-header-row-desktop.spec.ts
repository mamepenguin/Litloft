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

/** The inspector toggle wherever the header draws it. */
const headerToggle = (page: Page) =>
  page.locator("header").getByTestId("inspector-toggle").filter({ visible: true });

/** The rightmost visible button or link in the header. */
const lastHeaderControl = (page: Page) =>
  page.locator("header").locator("button, a[href]").filter({ visible: true }).last();

/** Every visible 1×20 box in the header lying between two x positions. */
const dividersIn = (page: Page, from: number, to: number): Promise<Box[]> =>
  page.locator("header *").evaluateAll(
    (els, span) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter(
          (r) =>
            Math.round(r.width) === 1 &&
            Math.round(r.height) === 20 &&
            r.left >= span.from - 0.5 &&
            r.right <= span.to + 0.5,
        )
        .map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height })),
    { from, to },
  );

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

  test(`SPEC-CORE-094 D3 / I2 as revised by SPEC-CORE-098 (${width}px): with an inspector, search, quick note and the avatar sit left of a folder page's x by the profile-to-toggle distance; without one, at that x`, async ({
    page,
  }) => {
    await open(page, "header-row-ordinary", width);
    const ordinary = await ordinaryControlX(page);

    await open(page, "header-row-video", width);
    await expect(trailIn(page.locator("header"))).toHaveCount(1);
    await expect(headerToggle(page)).toHaveCount(1);
    const shift =
      (await box(headerToggle(page))).right -
      (await box(page.locator("header").getByRole("button", { name: "Profile Setup" }))).right;
    expect(shift).toBeGreaterThan(0);
    const onFilePage = await ordinaryControlX(page);
    for (let i = 0; i < ORDINARY_CONTROLS.length; i += 1) {
      expect(Math.abs(ordinary[i] - onFilePage[i] - shift), ORDINARY_CONTROLS[i]).toBeLessThanOrEqual(0.5);
    }

    await open(page, "header-row-missing", width);
    await expect(page.locator("main").getByText("File not found")).toBeVisible();
    await expect(headerToggle(page)).toHaveCount(0);
    const withoutInspector = await ordinaryControlX(page);
    for (let i = 0; i < ORDINARY_CONTROLS.length; i += 1) {
      expect(Math.abs(withoutInspector[i] - ordinary[i]), `error state: ${ORDINARY_CONTROLS[i]}`).toBeLessThanOrEqual(0.5);
    }
  });
}

test("SPEC-CORE-094 D2 as revised by SPEC-CORE-098: left to right — menu and tree buttons, trail, the file's controls, a 1×20 divider, search, quick note, avatar, a 1×20 divider, inspector toggle", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const header = page.locator("header");
  await expect(trailIn(header)).toHaveCount(1);
  await expect(headerToggle(page)).toHaveCount(1);

  const fixed = await box(page.getByTestId("chrome-buttons"));
  const trail = await box(header.getByRole("navigation"));
  const firstCrumb = await box(header.getByRole("navigation").locator("a, button").first());
  const find = await box(header.getByRole("button", { name: enMessages.find.button }));
  const search = await box(header.getByRole("button", { name: "Search" }));
  const quickNote = await box(header.getByRole("button", { name: "Quick note" }));
  const avatar = await box(header.getByRole("button", { name: "Profile Setup" }));
  const toggle = await box(headerToggle(page));

  expect(firstCrumb.left).toBeGreaterThanOrEqual(fixed.right + 12 - 0.5);
  expect(trail.right).toBeLessThanOrEqual(find.left + 0.5);
  expect(find.right).toBeLessThanOrEqual(search.left + 0.5);
  expect(search.right).toBeLessThanOrEqual(quickNote.left + 0.5);
  expect(quickNote.right).toBeLessThanOrEqual(avatar.left + 0.5);
  expect(avatar.right).toBeLessThanOrEqual(toggle.left + 0.5);

  expect(await dividersIn(page, find.right, search.left)).toHaveLength(1);
  expect(await dividersIn(page, avatar.right, toggle.left)).toHaveLength(1);
});

test("SPEC-CORE-094 I3 as revised by SPEC-CORE-098 (wide): quick note, the avatar and the tree button are shown, and the inspector toggle is the header's last control", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const header = page.locator("header");
  await expect(trailIn(header)).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Quick note" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Profile Setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: /tree/i })).toBeVisible();
  await expect(lastHeaderControl(page)).toHaveAttribute("data-testid", "inspector-toggle");
});

test("SPEC-CORE-094 I3 as revised by SPEC-CORE-098 (wide): a rename in progress hides nothing, and the toggle stays the header's last control", async ({ page }) => {
  await open(page, "header-row-note");
  const header = page.locator("header");
  await header.getByRole("button", { name: enMessages.inspector.rename.hint }).click();
  await expect(header.getByRole("textbox")).toBeVisible();

  for (const name of ["Search", "Quick note", "Profile Setup", enMessages.find.button]) {
    await expect(header.getByRole("button", { name })).toBeVisible();
  }
  await expect(lastHeaderControl(page)).toHaveAttribute("data-testid", "inspector-toggle");
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
  test(`SPEC-CORE-094 D2 / I2 (canonical route, ${width}px): with the tree open the trail starts 16px inside the right pane, with it closed 12px past the fixed buttons, and never within 16px of the header's left end`, async ({
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
    const open_ = Math.max((await fixedButtons(page)).right + 12, paneLeft + 16, (await box(header)).left + 16);
    await expect
      .poll(async () => Math.abs((await box(firstCrumb)).left - open_))
      .toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Hide tree" }).click();
    await expect(tree).toHaveCSS("width", "0px");
    const closed = Math.max(
      (await fixedButtons(page)).right + 12,
      (await box(tree)).right + 16,
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
    if (sidebar === "open") {
      // The sidebar keeps an empty row where the buttons sit over it.
      const spacer = await box(page.getByTestId("sidebar-button-row"));
      expect(Math.abs(spacer.top - buttons.top), "spacer top").toBeLessThanOrEqual(0.5);
      expect(Math.abs(spacer.bottom - buttons.bottom), "spacer bottom").toBeLessThanOrEqual(0.5);
    }
  }
});

/* SPEC-CORE-098: the inspector toggle at the header's right end. */

const profileButton = (page: Page) =>
  page.locator("header").getByRole("button", { name: "Profile Setup" });

/** Boxes of every visible button and link in the header. */
const headerControls = (page: Page): Promise<(Box & { toggle: boolean })[]> =>
  page.locator("header").locator("button, a[href], input").evaluateAll((els) =>
    els
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .map(({ el, r }) => ({
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        toggle: el.getAttribute("data-testid") === "inspector-toggle",
      })),
  );

async function expectUnitAtRightEnd(page: Page): Promise<void> {
  await expect(headerToggle(page)).toHaveCount(1);
  const header = await box(page.locator("header"));
  const profile = await box(profileButton(page));
  const toggle = await box(headerToggle(page));
  expect(toggle.left, "toggle past the profile button").toBeGreaterThan(profile.right);
  expect(Math.abs(header.right - toggle.right - 16), "16px from the header's right end").toBeLessThanOrEqual(0.5);
  for (const control of await headerControls(page)) {
    if (control.toggle) continue;
    expect(control.right, "a control right of the toggle").toBeLessThanOrEqual(toggle.left + 0.5);
  }
  expect(await dividersIn(page, profile.right, toggle.left)).toHaveLength(1);
}

async function expectNoUnit(page: Page): Promise<void> {
  const header = page.locator("header");
  await expect(header.getByTestId("inspector-toggle").filter({ visible: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: /inspector/i }).filter({ visible: true })).toHaveCount(0);
  const headerBox = await box(header);
  const profile = await box(profileButton(page));
  expect(await dividersIn(page, profile.right, headerBox.right)).toHaveLength(0);
  expect(Math.abs(headerBox.right - profile.right - 16), "profile 16px from the header's right end").toBeLessThanOrEqual(0.5);
}

for (const width of [1280, 900]) {
  test(`SPEC-CORE-098 I1 (${width}px): the inspector toggle is the header's last control, past the profile button, 16px from the header's right end`, async ({
    page,
  }) => {
    await open(page, "header-row-video", width);
    await expect(trailIn(page.locator("header"))).toHaveCount(1);
    await expectUnitAtRightEnd(page);
  });
}

test("SPEC-CORE-098 I1 (collection route, a note that rides the shell): the toggle is the header's last control", async ({
  page,
}) => {
  await open(page, "header-row-collection-note");
  await expect(
    page.locator("header").getByText("meeting-notes.md", { exact: true }).filter({ visible: true }),
  ).not.toHaveCount(0);
  await expectUnitAtRightEnd(page);
});

test("SPEC-CORE-098 I2: one divider between the profile button and the toggle, 12px from each, looking like the first; the first is still there", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const header = page.locator("header");
  await expect(trailIn(header)).toHaveCount(1);
  await expect(headerToggle(page)).toHaveCount(1);

  const find = await box(header.getByRole("button", { name: enMessages.find.button }));
  const search = await box(header.getByRole("button", { name: "Search" }));
  const profile = await box(profileButton(page));
  const toggle = await box(headerToggle(page));

  const first = await dividersIn(page, find.right, search.left);
  const second = await dividersIn(page, profile.right, toggle.left);
  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(Math.abs(second[0].left - profile.right - 12)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(toggle.left - second[0].right - 12)).toBeLessThanOrEqual(0.5);

  const colours = await header.locator("*").evaluateAll(
    (els, spans) =>
      spans.map((span) => {
        const el = els.find((e) => {
          const r = e.getBoundingClientRect();
          return Math.abs(r.left - span.left) < 0.5 && Math.round(r.width) === 1 && Math.round(r.height) === 20;
        });
        return el ? getComputedStyle(el).backgroundColor : null;
      }),
    [first[0], second[0]],
  );
  expect(colours[0]).not.toBeNull();
  expect(colours[1]).toBe(colours[0]);
});

test("SPEC-CORE-098 I7: no inspector toggle between the file's controls and the first divider, and the row's own order is unchanged", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const header = page.locator("header");
  await expect(trailIn(header)).toHaveCount(1);
  await expect(headerToggle(page)).toHaveCount(1);
  const trail = await box(header.getByRole("navigation"));
  const find = await box(header.getByRole("button", { name: enMessages.find.button }));
  const search = await box(header.getByRole("button", { name: "Search" }));
  const firstDivider = (await dividersIn(page, find.right, search.left))[0];
  expect(firstDivider).toBeDefined();
  expect(trail.right).toBeLessThanOrEqual(find.left + 0.5);
  for (const control of await headerControls(page)) {
    if (!control.toggle) continue;
    expect(control.left, "a toggle left of the first divider").toBeGreaterThan(firstDivider.right);
  }
});

test("SPEC-CORE-098 I10: Tab from the profile button reaches the toggle, and Tab from the toggle leaves the header", async ({
  page,
}) => {
  await open(page, "header-row-video");
  await expect(trailIn(page.locator("header"))).toHaveCount(1);
  await profileButton(page).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("data-testid", "inspector-toggle");
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && document.querySelector("header")!.contains(active);
    }),
  ).toBe(false);
});

const panelIcon = (l: Locator) =>
  l.locator("svg").first().evaluate((svg) =>
    [...svg.classList]
      .filter((c) => /^lucide-panel-/.test(c))
      .sort((a, b) => b.length - a.length)[0] ?? null,
  );

test("SPEC-CORE-098 I4 (beside): the header's last control opens and closes the inspector, by click and by Cmd/Ctrl+\\, with aria-pressed, label and right-panel icon following", async ({
  page,
}) => {
  await open(page, "header-row-video");
  await expect(trailIn(page.locator("header"))).toHaveCount(1);
  const last = lastHeaderControl(page);
  await expect(last).toHaveAttribute("data-testid", "inspector-toggle");

  const before = {
    pressed: await last.getAttribute("aria-pressed"),
    label: await last.getAttribute("aria-label"),
    icon: await panelIcon(last),
  };
  expect(before.icon).toMatch(/^lucide-panel-right/);

  await last.click();
  const toggle = headerToggle(page);
  await expect(toggle).not.toHaveAttribute("aria-pressed", before.pressed ?? "");
  expect(await toggle.getAttribute("aria-label")).not.toBe(before.label);
  const flipped = await panelIcon(toggle);
  expect(flipped).toMatch(/^lucide-panel-right/);
  expect(flipped).not.toBe(before.icon);
  await expect(lastHeaderControl(page)).toHaveAttribute("data-testid", "inspector-toggle");

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(toggle).toHaveAttribute("aria-pressed", before.pressed ?? "");
  expect(await panelIcon(toggle)).toBe(before.icon);
});

test("SPEC-CORE-098 I4 / design (stacked): the stacked inspector's toggle sits at the same right end, with the bottom-panel icons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(`${FIXTURE}?run=${++navigation}#header-row-video`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(trailIn(page.locator("header"))).toHaveCount(1);
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute("data-inspector-fit", "stacked");
  await expectUnitAtRightEnd(page);

  const toggle = headerToggle(page);
  const first = await panelIcon(toggle);
  expect(first).toMatch(/^lucide-panel-bottom/);
  await toggle.click();
  const second = await panelIcon(headerToggle(page));
  expect(second).toMatch(/^lucide-panel-bottom/);
  expect(second).not.toBe(first);
  await expectUnitAtRightEnd(page);
});

test("SPEC-CORE-098 I9: pressing the right-end toggle, then a beside-to-stacked resize, keep the same video element at its position", async ({
  page,
}) => {
  await open(page, "header-row-video");
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute("data-inspector-fit", "beside");
  await page.locator("video").first().evaluate((element) => {
    const video = element as HTMLVideoElement & { __probe?: string };
    video.currentTime = 1.5;
    video.__probe = "same";
    (window as unknown as { __video: HTMLVideoElement }).__video = video;
  });

  const last = lastHeaderControl(page);
  await expect(last).toHaveAttribute("data-testid", "inspector-toggle");
  await last.click();
  await last.click();
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute("data-inspector-fit", "stacked");

  const after = await page.evaluate(() => {
    const video = document.querySelector("video") as HTMLVideoElement & { __probe?: string };
    return {
      same: video === (window as unknown as { __video: HTMLVideoElement }).__video,
      probe: video.__probe,
      time: video.currentTime,
    };
  });
  expect(after.same).toBe(true);
  expect(after.probe).toBe("same");
  expect(after.time).toBeCloseTo(1.5, 1);
});

test("SPEC-CORE-098 I8: at 768px on the canonical route with a 200-character name, the header does not wrap, nothing overlaps, the leaf truncates and the toggle is inside the header", async ({
  page,
}) => {
  await open(page, "header-row-ordinary", 768);
  const ordinaryHeight = (await box(page.locator("header"))).height;

  await open(page, "header-row-two-pane-long", 768);
  const header = page.locator("header");
  const hide = page.getByRole("button", { name: "Hide tree" });
  if (await hide.isVisible()) await hide.click();
  await expect(page.locator('aside[aria-label="Folder tree"]')).toHaveCSS("width", "0px");
  const leaf = header.getByText(`${"a".repeat(196)}.mp4`, { exact: true }).filter({ visible: true });
  await expect(leaf).toHaveCount(1);
  await expect(header.getByRole("button", { name: enMessages.find.button })).toBeVisible();
  await expect(headerToggle(page)).toHaveCount(1);

  const headerBox = await box(header);
  expect(headerBox.height).toBe(ordinaryHeight);

  const leafCut = await leaf.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(leafCut.scroll).toBeGreaterThan(leafCut.client + 1);

  const controls = await headerControls(page);
  const profile = await box(profileButton(page));
  const toggle = await box(headerToggle(page));
  const dividers = await dividersIn(page, headerBox.left, headerBox.right);
  const parts: Box[] = [...controls, ...dividers, await box(leaf)];
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i];
      const b = parts[j];
      const nested =
        (a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5) ||
        (b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5);
      const overlap =
        a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      expect(overlap && !nested, `parts ${i} and ${j} overlap`).toBe(false);
    }
  }

  expect(toggle.left).toBeGreaterThan(profile.right);
  expect(toggle.left).toBeGreaterThanOrEqual(headerBox.left - 0.5);
  expect(toggle.right).toBeLessThanOrEqual(headerBox.right + 0.5);
  expect(toggle.top).toBeGreaterThanOrEqual(headerBox.top - 0.5);
  expect(toggle.bottom).toBeLessThanOrEqual(headerBox.bottom + 0.5);
});

test("SPEC-CORE-098 I6: a file page outside the shell keeps its toggle at the end of its own row, with no divider before it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(`${FIXTURE}?run=${++navigation}#inspector-video`);
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  const toggle = page.getByTestId("inspector-toggle").filter({ visible: true });
  await expect(toggle).toHaveCount(1);
  const t = await box(toggle);
  const rowMates = await page.locator("button, a[href]").evaluateAll(
    (els, tb) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter(
          (r) =>
            r.width > 0 &&
            r.top < tb.bottom &&
            tb.top < r.bottom &&
            r.left >= tb.right - 0.5,
        ).length,
    t,
  );
  expect(rowMates).toBe(0);
});

/* SPEC-CORE-098 I3: where the header holds no toggle and no divider after the profile button. */

const drawn: Record<string, (page: Page) => Locator> = {
  "header-row-ordinary": (page) => page.locator("main").getByText("Folder listing"),
  "header-row-missing": (page) => page.locator("main").getByText("File not found"),
  "header-row-collection": (page) => page.locator("header").getByRole("button", { name: /^Back/ }),
};

for (const [arrangement, label] of [
  ["header-row-ordinary", "a page that is not a file page"],
  ["header-row-missing", "a file page in its error state"],
  ["header-row-collection", "a collection-route video, which does not ride the shell"],
] as const) {
  test(`SPEC-CORE-098 I3 (${label}): no toggle, no divider after the profile button, profile 16px from the right end`, async ({
    page,
  }) => {
    await open(page, arrangement);
    await expect(drawn[arrangement](page)).toBeVisible();
    await expect(profileButton(page)).toBeVisible();
    await expectNoUnit(page);
  });
}

/* SPEC-CORE-098 I5, sampled on every animation frame. */

type Frame = { header: number; anywhere: number; inRow: number; trailingDividers: number };

function recordUnitFrames(page: Page) {
  return page.addInitScript(() => {
    const frames: Frame[] = [];
    (window as unknown as { __unitFrames: Frame[] }).__unitFrames = frames;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const tick = () => {
      const header = document.querySelector("header");
      const toggles = [...document.querySelectorAll('[data-testid="inspector-toggle"]')].filter(shown);
      const inHeader = header ? toggles.filter((t) => header.contains(t)) : [];
      const profile = header
        ? [...header.querySelectorAll("button")].find(
            (b) =>
              shown(b) &&
              [b.getAttribute("aria-label"), b.getAttribute("title"), b.textContent].some((v) =>
                (v ?? "").includes("Profile Setup"),
              ),
          )
        : undefined;
      const profileBox = profile?.getBoundingClientRect();
      const trailing = header && profileBox
        ? [...header.querySelectorAll("*")].filter((el) => {
            const r = el.getBoundingClientRect();
            return Math.round(r.width) === 1 && Math.round(r.height) === 20 && r.left >= profileBox.right - 0.5;
          }).length
        : 0;
      frames.push({
        header: inHeader.length,
        anywhere: toggles.length,
        inRow: profileBox
          ? inHeader.filter((t) => t.getBoundingClientRect().right <= profileBox.left + 0.5).length
          : 0,
        trailingDividers: trailing,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const unitFrames = (page: Page): Promise<Frame[]> =>
  page.evaluate(() => (window as unknown as { __unitFrames: Frame[] }).__unitFrames.slice());

const isNone = (f: Frame) => f.header === 0 && f.anywhere === 0 && f.trailingDividers === 0;
const isUnit = (f: Frame) => f.header === 1 && f.anywhere === 1 && f.inRow === 0 && f.trailingDividers === 1;

function expectEveryFrameWhole(frames: Frame[]): void {
  const bad = frames.findIndex((f) => !isNone(f) && !isUnit(f));
  expect(bad, `frame ${bad}: ${JSON.stringify(frames[bad])}`).toBe(-1);
}

function expectUnitThroughout(frames: Frame[]): void {
  expect(frames.length).toBeGreaterThan(0);
  const bad = frames.findIndex((f) => !isUnit(f));
  expect(bad, `frame ${bad}: ${JSON.stringify(frames[bad])}`).toBe(-1);
}

test("SPEC-CORE-098 I5 / flow 3 (crossing 768px): the toggle and its divider leave together and return together", async ({
  page,
}) => {
  await recordUnitFrames(page);
  await open(page, "header-row-video");
  await expectUnitAtRightEnd(page);
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(page.locator("header").getByTestId("inspector-toggle").filter({ visible: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectUnitAtRightEnd(page);
  expectEveryFrameWhole(await unitFrames(page));
});

test("SPEC-CORE-098 I5 / flow 4 (file → file): the unit stays in every frame", async ({ page }) => {
  await recordUnitFrames(page);
  await open(page, "header-row-swap");
  await expect(trailIn(page.locator("header"))).toHaveCount(1);
  await expectUnitAtRightEnd(page);
  const from = (await unitFrames(page)).length;
  await page.getByRole("button", { name: "to-note" }).click();
  await expect(
    page.locator("header").getByText("meeting-notes.md", { exact: true }).filter({ visible: true }),
  ).not.toHaveCount(0);
  await expectUnitAtRightEnd(page);
  expectUnitThroughout((await unitFrames(page)).slice(from));
});

test("SPEC-CORE-098 I5 / flow 4 (loading → loaded): the unit stays in every frame", async ({ page }) => {
  await recordUnitFrames(page);
  await open(page, "header-row-late");
  await expect(
    page.locator("header").locator('a[href="/drive/fixture"]').filter({ visible: true }),
  ).toHaveCount(1);
  await expectUnitAtRightEnd(page);
  const from = (await unitFrames(page)).length;
  await page.evaluate(() => (window as unknown as { __releaseLate: () => void }).__releaseLate());
  await expect(
    page.locator("header").getByText("late.webm", { exact: true }).filter({ visible: true }),
  ).not.toHaveCount(0);
  await expectUnitAtRightEnd(page);
  expectUnitThroughout((await unitFrames(page)).slice(from));
});

test("SPEC-CORE-098 I5 (beside → stacked): the unit stays in every frame, with the bottom-panel icon after", async ({
  page,
}) => {
  await recordUnitFrames(page);
  await open(page, "header-row-video");
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute("data-inspector-fit", "beside");
  await expectUnitAtRightEnd(page);
  const from = (await unitFrames(page)).length;
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute("data-inspector-fit", "stacked");
  await expectUnitAtRightEnd(page);
  expect(await panelIcon(headerToggle(page))).toMatch(/^lucide-panel-bottom/);
  expectUnitThroughout((await unitFrames(page)).slice(from));
});

test("SPEC-CORE-098 I5 (file → its error state): the toggle and its divider disappear together", async ({
  page,
}) => {
  await recordUnitFrames(page);
  await open(page, "header-row-swap");
  await expect(trailIn(page.locator("header"))).toHaveCount(1);
  await expectUnitAtRightEnd(page);
  await page.getByRole("button", { name: "to-missing" }).click();
  await expect(page.locator("main").getByText("File not found")).toBeVisible();
  await expectNoUnit(page);
  expectEveryFrameWhole(await unitFrames(page));
});

test("SPEC-CORE-098 I5 / flow 5 (leaving the file page): the toggle and its divider disappear, and the header ends at the profile button", async ({
  page,
}) => {
  await recordUnitFrames(page);
  await open(page, "header-row-leave");
  await expect(trailIn(page.locator("header"))).toHaveCount(1);
  await expectUnitAtRightEnd(page);
  await page.getByRole("button", { name: "leave-file-page" }).click();
  await expect(trailIn(page.locator("header"))).toHaveCount(0);
  await expectNoUnit(page);
  expectEveryFrameWhole(await unitFrames(page));
});

test("SPEC-CORE-098 I5 (collection route): a video that does not ride the shell has no unit, a note that does gains it, and note → note keeps it in every frame", async ({
  page,
}) => {
  await recordUnitFrames(page);
  await open(page, "header-row-collection-swap");
  await expect(page.locator("header").getByRole("button", { name: /^Back/ })).toBeVisible();
  await expectNoUnit(page);

  await page.getByRole("button", { name: "to-note" }).click();
  await expect(
    page.locator("header").getByText("meeting-notes.md", { exact: true }).filter({ visible: true }),
  ).not.toHaveCount(0);
  await expectUnitAtRightEnd(page);
  expectEveryFrameWhole(await unitFrames(page));

  const from = (await unitFrames(page)).length;
  await page.getByRole("button", { name: "to-long-note" }).click();
  await expect(
    page.locator("header").getByText(`${"n".repeat(197)}.md`, { exact: true }).filter({ visible: true }),
  ).not.toHaveCount(0);
  await expectUnitAtRightEnd(page);
  expectUnitThroughout((await unitFrames(page)).slice(from));
});

test("SPEC-CORE-098 I5 (collection route, loading → a loaded note): the unit appears whole", async ({ page }) => {
  await recordUnitFrames(page);
  await open(page, "header-row-collection-note");
  await expect(
    page.locator("header").getByText("meeting-notes.md", { exact: true }).filter({ visible: true }),
  ).not.toHaveCount(0);
  await expectUnitAtRightEnd(page);
  expectEveryFrameWhole(await unitFrames(page));
});
