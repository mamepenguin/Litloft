/**
 * Focus mode (SPEC-CORE-128) and its header reveal (SPEC-CORE-129) with a fine
 * pointer, on the real `AppShell` around the real file pages. Geometry, frames
 * and the reveal can only be measured with every box laid out.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const VIDEO = "video0000001";
const PDF = "pdf000000001";
const MISSING = "focusmiss001";
const PENDING = "focuspend001";

const PROTECTED_KEYS = [
  "sidebar-open",
  "tree:enabled:fixture",
  "inspector-open:fixture",
  "workbench-panels",
  "workbench-player-focus",
  "workbench-split",
];

type Box = { left: number; top: number; width: number; height: number };

interface OpenOptions {
  arrangement?: "focus-drive" | "focus-files";
  path?: string;
  query?: string;
  width?: number;
  height?: number;
  locale?: "en" | "ja";
  storage?: Record<string, string>;
}

let navigation = 0;

async function open(page: Page, options: OpenOptions = {}): Promise<void> {
  const {
    arrangement = "focus-drive",
    path,
    query = `file=${VIDEO}`,
    width = 1280,
    height = 800,
    locale = "en",
    storage = { "workbench-panels": "[]" },
  } = options;
  await page.addInitScript(
    ({ seed, keys }) => {
      if (!sessionStorage.getItem("__seeded")) {
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
        sessionStorage.setItem("__seeded", "1");
      }
      const writes: string[] = [];
      (window as unknown as { __writes: string[] }).__writes = writes;
      const set = Storage.prototype.setItem;
      const remove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (this === localStorage && keys.includes(key)) writes.push(`${key}=${value}`);
        return set.call(this, key, value);
      };
      Storage.prototype.removeItem = function (key: string) {
        if (this === localStorage && keys.includes(key)) writes.push(`${key} removed`);
        return remove.call(this, key);
      };
    },
    { seed: storage, keys: PROTECTED_KEYS },
  );
  await page.setViewportSize({ width, height });
  const params = new URLSearchParams({ run: String(++navigation), locale, query });
  if (path) params.set("path", path);
  await page.goto(`${FIXTURE}?${params}#${arrangement}`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
}

const writes = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __writes: string[] }).__writes.slice());

const box = (l: Locator): Promise<Box> =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

const header = (page: Page) => page.locator("header");
const chromeButtons = (page: Page) => page.getByTestId("chrome-buttons");
const pageContent = (page: Page) => page.getByTestId("page-content");
const tree = (page: Page) => page.locator("aside:not(.inspector-pane):not([class*='z-40'])");
const inspector = (page: Page) => page.locator("aside.inspector-pane");
const inspectorToggle = (page: Page) =>
  header(page).getByTestId("inspector-toggle").filter({ visible: true });
const focusButton = (page: Page) =>
  header(page).getByRole("button", { name: /^(Focus mode|Leave focus mode) \(T\)$/ });
const treeButton = (page: Page) =>
  chromeButtons(page).getByRole("button", { name: /^(Show|Hide) tree$/ });
const menuButton = (page: Page) => chromeButtons(page).getByRole("button", { name: "Menu" });
/** The same control by position: the hidden header is `inert`, so a role query misses it. */
const menuControl = (page: Page) => chromeButtons(page).locator("button").first();
const visibleModal = (page: Page) => page.locator('[aria-modal="true"]').filter({ visible: true });

async function ready(page: Page, kind: "video" | "pdf" | "missing" | "pending" = "video") {
  if (kind === "video") await expect(page.locator("video")).toHaveCount(1);
  if (kind === "pdf") await expect(page.locator("canvas").first()).toBeVisible();
  if (kind === "missing") await expect(page.locator("main").getByText("File not found")).toBeVisible();
  await expect(header(page)).toBeVisible();
}

const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

/** Puts keyboard focus on `<body>` first, so `T` is not taken by an editing element. */
async function pressT(page: Page): Promise<void> {
  await blur(page);
  await page.keyboard.press("t");
}

const navigate = (page: Page, query: string) =>
  page.evaluate((q) => window.__fixtureNavigate!("/drive/fixture", q), query);

interface Chrome {
  headerInert: boolean;
  chromeInert: boolean;
  chromePaints: boolean;
  contentTop: number;
  contentLeft: number;
  contentHeight: number;
  treeWidth: number;
  treeInert: boolean;
  appHeaderH: string;
}

/** The shell's chrome right now, read in one task. */
const chrome = (page: Page): Promise<Chrome> =>
  page.evaluate(() => {
    const h = document.querySelector("header") as HTMLElement;
    const c = document.querySelector('[data-testid="chrome-buttons"]') as HTMLElement | null;
    const sidebar = [...document.querySelectorAll("aside")].find((a) =>
      a.className.includes("z-40"),
    );
    const content = document.querySelector('[data-testid="page-content"]') as HTMLElement | null;
    const treeAside = [...document.querySelectorAll("aside")].find((a) => !a.className.includes("z-40") && !a.classList.contains("inspector-pane")) as HTMLElement | null;
    const probes = [
      [window.innerWidth / 2, 20],
      [40, 28],
      [window.innerWidth - 20, 28],
      [120, 300],
    ];
    const painted = probes.some(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el && (h.contains(el) || !!c?.contains(el) || !!sidebar?.contains(el));
    });
    const r = content?.getBoundingClientRect();
    return {
      headerInert: h.inert || !!h.closest("[inert]"),
      chromeInert: !!c && (c.inert || !!c.closest("[inert]")),
      chromePaints: painted,
      contentTop: r ? Math.round(r.top) : NaN,
      contentLeft: r ? Math.round(r.left) : NaN,
      contentHeight: r ? Math.round(r.height) : NaN,
      treeWidth: treeAside ? Math.round(treeAside.getBoundingClientRect().width) : NaN,
      treeInert: !!treeAside && (treeAside.inert || !!treeAside.closest("[inert]")),
      appHeaderH: getComputedStyle(document.documentElement)
        .getPropertyValue("--app-header-h")
        .trim(),
    };
  });

/** The focus layout with the header hidden, on a `/drive/…?file=` page. */
async function expectFocusLayout(page: Page, inset = 0): Promise<void> {
  await expect
    .poll(async () => {
      const c = await chrome(page);
      return {
        headerInert: c.headerInert,
        chromeInert: c.chromeInert,
        chromePaints: c.chromePaints,
        contentTop: c.contentTop,
        contentLeft: c.contentLeft,
        treeWidth: c.treeWidth,
        treeInert: c.treeInert,
        appHeaderH: c.appHeaderH,
      };
    })
    .toEqual({
      headerInert: true,
      chromeInert: true,
      chromePaints: false,
      contentTop: inset,
      contentLeft: 0,
      treeWidth: 0,
      treeInert: true,
      appHeaderH: `${inset}px`,
    });
  const c = await chrome(page);
  const vh = await page.evaluate(() => window.innerHeight);
  expect(Math.abs(c.contentTop + c.contentHeight - vh)).toBeLessThanOrEqual(1);
  await expect(header(page)).toHaveCount(1);
  await expect(chromeButtons(page)).toHaveCount(1);
}

async function expectOrdinaryHeader(page: Page): Promise<void> {
  await expect.poll(async () => (await chrome(page)).headerInert).toBe(false);
  expect((await box(header(page))).height).toBe(56);
  const c = await chrome(page);
  expect(c.contentTop).toBe(56);
  expect(c.chromePaints).toBe(true);
}

async function enterByButton(page: Page, inset = 0): Promise<void> {
  await expect(focusButton(page)).toHaveCount(1);
  await focusButton(page).click();
  await expectFocusLayout(page, inset);
}

async function revealByPointer(page: Page, inset = 0): Promise<void> {
  const vw = await page.evaluate(() => window.innerWidth);
  await page.mouse.move(vw / 2, 300);
  await page.mouse.move(vw / 2, inset + 3, { steps: 4 });
  await expect.poll(async () => (await chrome(page)).headerInert).toBe(false);
}

async function moveAway(page: Page): Promise<void> {
  const vw = await page.evaluate(() => window.innerWidth);
  await page.mouse.move(vw / 2, 400, { steps: 4 });
}

// ---------------------------------------------------------------------------
// The button
// ---------------------------------------------------------------------------

test("SPEC-CORE-128 §1.1 / I9 / D4 / SPEC-CORE-098 I1–I2 as revised: avatar, a divider 12px from it, the 32×32 Focus mode button 12px after it, then the inspector toggle 12px after that as the last control", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await expect(inspectorToggle(page)).toHaveCount(1);
  const button = focusButton(page);
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAccessibleName("Focus mode (T)");
  await expect(button).toHaveAttribute("title", "Focus mode (T)");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button).not.toHaveClass(/bg-bg-elevated/);

  const avatar = await box(header(page).getByRole("button", { name: "Profile Setup" }));
  const focus = await box(button);
  const toggle = await box(inspectorToggle(page));
  expect(focus.width).toBe(32);
  expect(focus.height).toBe(32);
  const dividers = await header(page)
    .locator("*")
    .evaluateAll(
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
          .map((r) => r.left),
      { from: avatar.left + avatar.width, to: focus.left },
    );
  expect(dividers).toHaveLength(1);
  expect(Math.abs(dividers[0] - (avatar.left + avatar.width) - 12)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(focus.left - (dividers[0] + 1) - 12)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(toggle.left - (focus.left + focus.width) - 12)).toBeLessThanOrEqual(0.5);
  const last = header(page).locator("button, a[href]").filter({ visible: true }).last();
  await expect(last).toHaveAttribute("data-testid", "inspector-toggle");
});

test("SPEC-CORE-098 I10 as revised: the Focus mode button follows the profile button in the focus order and the inspector toggle follows it", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await header(page).getByRole("button", { name: "Profile Setup" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAccessibleName("Focus mode (T)");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("data-testid", "inspector-toggle");
});

test("SPEC-CORE-128 §1.1 / I9 / D5 / SPEC-CORE-098 I3 as revised (failed state): the Focus mode button is drawn as the header's last control, 16px from its right end", async ({
  page,
}) => {
  await open(page, { query: `file=${MISSING}` });
  await ready(page, "missing");
  await expect(focusButton(page)).toHaveCount(1);
  await expect(inspectorToggle(page)).toHaveCount(0);
  const last = header(page).locator("button, a[href]").filter({ visible: true }).last();
  await expect(last).toHaveAccessibleName("Focus mode (T)");
  const h = await box(header(page));
  const f = await box(focusButton(page));
  expect(Math.abs(h.left + h.width - (f.left + f.width) - 16)).toBeLessThanOrEqual(0.5);
});

test("SPEC-CORE-128 §1.1 / I9 (loading state): the Focus mode button is drawn, 12px before the inspector toggle, which stays the last control", async ({
  page,
}) => {
  await open(page, { query: `file=${PENDING}` });
  await ready(page, "pending");
  await expect(inspectorToggle(page)).toHaveCount(1);
  await expect(focusButton(page)).toHaveCount(1);
  const last = header(page).locator("button, a[href]").filter({ visible: true }).last();
  await expect(last).toHaveAttribute("data-testid", "inspector-toggle");
  const f = await box(focusButton(page));
  const t = await box(inspectorToggle(page));
  expect(Math.abs(t.left - (f.left + f.width) - 12)).toBeLessThanOrEqual(0.5);
});

test("SPEC-CORE-128 §1.1 / I9 (/files/{id}): the Focus mode button is drawn there too, as a collection video's last control", async ({
  page,
}) => {
  await open(page, { arrangement: "focus-files", path: `/files/${VIDEO}`, query: "" });
  await ready(page);
  await expect(focusButton(page)).toHaveCount(1);
  const last = header(page).locator("button, a[href]").filter({ visible: true }).last();
  await expect(last).toHaveAccessibleName("Focus mode (T)");
});

test("SPEC-CORE-098 I3 as revised / §3: a page that is not a file page has no Focus mode button and T changes nothing there; the same T on a file page enters", async ({
  page,
}) => {
  await open(page, { query: "" });
  await expect(page.getByTestId("fixture-listing")).toBeVisible();
  await expect(focusButton(page)).toHaveCount(0);
  await pressT(page);
  await page.waitForTimeout(100);
  await expectOrdinaryHeader(page);

  await navigate(page, `file=${VIDEO}`);
  await ready(page);
  await expectOrdinaryHeader(page);
  await pressT(page);
  await expectFocusLayout(page);
});

// ---------------------------------------------------------------------------
// Entering: geometry
// ---------------------------------------------------------------------------

for (const size of [
  { width: 1440, height: 900, frame: { width: 1024, height: 576 } },
  { width: 1280, height: 800, frame: { width: 864, height: 486 } },
]) {
  test(`SPEC-CORE-128 I1 / D1 / D2 (${size.width}×${size.height}): no header, sidebar or tree; the inspector is 384px at the right, full height; the video is ${size.frame.width}×${size.frame.height}`, async ({
    page,
  }) => {
    await open(page, {
      width: size.width,
      height: size.height,
      storage: { "workbench-panels": "[]", "inspector-open:fixture": "true" },
    });
    await ready(page);
    await expectOrdinaryHeader(page);
    await enterByButton(page);

    const insp = await box(inspector(page));
    expect(Math.round(insp.width)).toBe(384);
    expect(Math.round(insp.left)).toBe(size.width - 384);
    expect(Math.round(insp.top)).toBe(0);
    expect(Math.round(insp.height)).toBe(size.height);
    await expect
      .poll(async () => {
        const v = await box(page.locator("video"));
        return [Math.round(v.width), Math.round(v.height)];
      })
      .toEqual([size.frame.width, size.frame.height]);
  });
}

test("SPEC-CORE-128 I8 / D3: in the focus layout Cmd/Ctrl+\\ closes the inspector, the canvas takes the full width and the header stays hidden", async ({
  page,
}) => {
  await open(page, { width: 1440, height: 900 });
  await ready(page);
  await enterByButton(page);
  await expect(inspector(page)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(inspector(page)).toHaveCount(0);
  await expectFocusLayout(page);
  expect(Math.round((await box(pageContent(page))).width)).toBe(1440);
});

test("SPEC-CORE-128 §1.3: entering from the keyboard moves focus inside the header to <body>", async ({ page }) => {
  await open(page);
  await ready(page);
  await focusButton(page).focus();
  await page.keyboard.press("Enter");
  await expectFocusLayout(page);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("SPEC-CORE-128 §1.3 / I1 / D9 (/files/{id}, 1440×900): the content moves up by the header's height and keeps its gap, measured from the viewport's top", async ({
  page,
}) => {
  await open(page, {
    arrangement: "focus-files",
    path: `/files/${VIDEO}`,
    query: "",
    width: 1440,
    height: 900,
  });
  await ready(page);
  const before = await box(page.locator("video"));
  await focusButton(page).click();
  await expect.poll(async () => (await chrome(page)).headerInert).toBe(true);
  await expect
    .poll(async () => Math.round((await box(page.locator("video"))).top))
    .toBe(Math.round(before.top - 56));
  expect((await chrome(page)).appHeaderH).toBe("0px");
});

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

test("SPEC-CORE-128 I6 / §3: T with nothing focused enters and then leaves", async ({ page }) => {
  await open(page);
  await ready(page);
  await pressT(page);
  await expectFocusLayout(page);
  await pressT(page);
  await expectOrdinaryHeader(page);
});

test("SPEC-CORE-128 I6 / failure case: T in an editing element types t and leaves the state as it is", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "fixture-input");
    input.style.cssText = "position:fixed;bottom:4px;left:300px;z-index:100";
    document.body.append(input);
  });
  const input = page.getByTestId("fixture-input");
  await input.focus();
  await page.keyboard.press("t");
  await expect(input).toHaveValue("t");
  await expectOrdinaryHeader(page);

  await pressT(page);
  await expectFocusLayout(page);
  await input.focus();
  await page.keyboard.press("t");
  await expect(input).toHaveValue("tt");
  await expectFocusLayout(page);
});

const COVERS: [string, (page: Page) => Promise<unknown>, (page: Page) => Promise<unknown>][] = [
  [
    "the confirm dialog",
    (page) => page.evaluate(() => window.__fixtureOpenDialog!("confirm")),
    (page) => page.evaluate(() => window.__fixtureOpenDialog!(null)),
  ],
  [
    "the rename dialog",
    (page) => page.evaluate(() => window.__fixtureOpenDialog!("rename")),
    (page) => page.evaluate(() => window.__fixtureOpenDialog!(null)),
  ],
  [
    "the search window",
    async (page) => {
      await blur(page);
      await page.keyboard.press("ControlOrMeta+k");
      await expect(visibleModal(page)).toHaveCount(1);
    },
    async (page) => {
      await page.keyboard.press("Escape");
      await expect(visibleModal(page)).toHaveCount(0);
    },
  ],
  [
    "the quick note panel",
    async (page) => {
      await blur(page);
      await page.keyboard.press("n");
      await expect(page.getByRole("dialog", { name: "Quick note" })).toBeVisible();
    },
    async (page) => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Quick note" })).toHaveCount(0);
    },
  ],
  [
    "the player's pseudo full screen",
    (page) =>
      page.evaluate(() => document.documentElement.setAttribute("data-player-fullscreen", "")),
    (page) =>
      page.evaluate(() => document.documentElement.removeAttribute("data-player-fullscreen")),
  ],
];

for (const [name, cover, uncover] of COVERS) {
  test(`SPEC-CORE-128 I6 / failure case (covered by ${name}): T changes nothing; once the cover closes, T enters`, async ({
    page,
  }) => {
    await open(page);
    await ready(page);
    await cover(page);
    await pressT(page);
    await page.waitForTimeout(100);
    await uncover(page);
    await expectOrdinaryHeader(page);
    await pressT(page);
    await expectFocusLayout(page);
  });

  test(`SPEC-CORE-128 I6 / failure case (covered by ${name}, in the focus layout): T does not leave`, async ({
    page,
  }) => {
    await open(page);
    await ready(page);
    await enterByButton(page);
    await cover(page);
    await pressT(page);
    await page.waitForTimeout(100);
    await uncover(page);
    await expectFocusLayout(page);
  });
}

test("SPEC-CORE-128 I6: T does nothing while a header menu is open (a header control with aria-expanded=true), and enters once it closes", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  const trigger = header(page).getByRole("button", { name: "Quick note" });
  await trigger.evaluate((el) => el.setAttribute("aria-expanded", "true"));
  await pressT(page);
  await page.waitForTimeout(100);
  await expectOrdinaryHeader(page);
  await trigger.evaluate((el) => el.setAttribute("aria-expanded", "false"));
  await pressT(page);
  await expectFocusLayout(page);
});

// ---------------------------------------------------------------------------
// Leaving and restoring
// ---------------------------------------------------------------------------

interface Layout {
  header: Box;
  sidebar: Box | null;
  tree: Box;
  content: Box;
  inspector: Box | null;
  video: Box;
}

const layout = (page: Page): Promise<Layout> =>
  page.evaluate(() => {
    const b = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const asides = [...document.querySelectorAll("aside")];
    return {
      header: b(document.querySelector("header"))!,
      sidebar: b(asides.find((a) => a.className.includes("z-40"))),
      tree: b([...document.querySelectorAll("aside")].find((a) => !a.className.includes("z-40") && !a.classList.contains("inspector-pane")))!,
      content: b(document.querySelector('[data-testid="page-content"]'))!,
      inspector: b(document.querySelector("aside.inspector-pane")),
      video: b(document.querySelector("video"))!,
    };
  });

function expectSameLayout(after: Layout, before: Layout): void {
  for (const key of Object.keys(before) as (keyof Layout)[]) {
    const a = after[key];
    const b = before[key];
    if (b === null || a === null) {
      expect(a, key).toEqual(b);
      continue;
    }
    for (const side of ["left", "top", "width", "height"] as const) {
      expect(Math.abs(a[side] - b[side]), `${key}.${side}`).toBeLessThanOrEqual(1);
    }
  }
}

type TreeState = "hidden" | "shown by setting" | "yielded" | "reopened";

const MATRIX: { width: number; tree: TreeState; sidebar: boolean }[] = [];
for (const sidebar of [true, false]) {
  for (const tree of ["hidden", "shown by setting"] as const) MATRIX.push({ width: 1440, tree, sidebar });
  for (const tree of ["hidden", "yielded", "reopened"] as const) MATRIX.push({ width: 1024, tree, sidebar });
}

for (const row of MATRIX) {
  test(`SPEC-CORE-128 I2 / §1.5 (${row.width} wide, tree ${row.tree}, sidebar stored ${row.sidebar ? "open" : "closed"}): entering, revealing, hiding and leaving put every box back and write no protected key`, async ({
    page,
  }) => {
    const storage: Record<string, string> = {
      "workbench-panels": "[]",
      "inspector-open:fixture": "true",
      "sidebar-open": String(row.sidebar),
    };
    if (row.tree !== "hidden") storage["tree:enabled:fixture"] = "true";
    await open(page, { width: row.width, height: 900, storage });
    await ready(page);
    if (row.tree === "reopened") await treeButton(page).click();
    if (row.width === 1440 && row.sidebar && row.tree === "hidden") {
      await menuButton(page).click();
      await menuButton(page).click();
      expect(await writes(page)).toEqual(["sidebar-open=false", "sidebar-open=true"]);
    }
    await page.waitForTimeout(300);

    const before = await layout(page);
    const treeShown = row.tree === "shown by setting" || row.tree === "reopened";
    expect(Math.round(before.tree.width)).toBe(treeShown ? 280 : 0);
    await expect(treeButton(page)).toHaveAttribute("aria-pressed", String(treeShown));
    const inline = Math.round(before.content.left) === 240;
    if (row.tree === "hidden") expect(inline).toBe(row.width === 1440 && row.sidebar);
    await expect(menuButton(page)).toHaveAttribute("aria-pressed", String(inline));
    const writtenBefore = (await writes(page)).length;

    await enterByButton(page);
    await revealByPointer(page);
    await moveAway(page);
    await expectFocusLayout(page);
    await pressT(page);
    await expectOrdinaryHeader(page);
    await page.waitForTimeout(300);

    expectSameLayout(await layout(page), before);
    expect((await writes(page)).slice(writtenBefore)).toEqual([]);
  });
}

interface Frame {
  headerInert: boolean;
  top: number;
  left: number;
  tree: number;
  sidebarRight: number;
  listing: boolean;
}

/** Samples the chrome on every animation frame from now on. */
async function recordFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[] };
    w.__frames = [];
    const tick = () => {
      const h = document.querySelector("header") as HTMLElement | null;
      const content = document.querySelector('[data-testid="page-content"]');
      const treeAside = [...document.querySelectorAll("aside")].find((a) => !a.className.includes("z-40") && !a.classList.contains("inspector-pane"));
      const r = content?.getBoundingClientRect();
      w.__frames.push({
        headerInert: !!h && (h.inert || !!h.closest("[inert]")),
        top: r ? Math.round(r.top) : -1,
        left: r ? Math.round(r.left) : -1,
        tree: treeAside ? Math.round(treeAside.getBoundingClientRect().width) : -1,
        sidebarRight: (() => {
          const aside = [...document.querySelectorAll("aside")].find((a) =>
            a.className.includes("z-40"),
          );
          const r = aside?.getBoundingClientRect();
          return r && r.width > 0 ? Math.max(0, Math.round(r.right)) : 0;
        })(),
        listing: !!document.querySelector('[data-testid="fixture-listing"]'),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const frames = (page: Page): Promise<Frame[]> =>
  page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.slice());

const isFocusFrame = (f: Frame) =>
  f.headerInert && f.top === 0 && f.left === 0 && f.tree === 0 && f.sidebarRight === 0;

test("SPEC-CORE-128 I4 (entering and leaving): every frame is the ordinary layout or the focus layout, never one mid-transition", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await treeButton(page).click();
  await page.waitForTimeout(300);
  const ordinary = await layout(page);
  const isOrdinaryFrame = (f: Frame) =>
    !f.headerInert &&
    f.top === Math.round(ordinary.content.top) &&
    f.left === Math.round(ordinary.content.left) &&
    f.tree === Math.round(ordinary.tree.width) &&
    f.sidebarRight ===
      (ordinary.sidebar && ordinary.sidebar.width > 0
        ? Math.max(0, Math.round(ordinary.sidebar.left + ordinary.sidebar.width))
        : 0);

  await recordFrames(page);
  await pressT(page);
  await expectFocusLayout(page);
  await pressT(page);
  await expectOrdinaryHeader(page);
  await page.waitForTimeout(300);
  const seen = await frames(page);
  expect(seen.some(isFocusFrame)).toBe(true);
  const bad = seen.findIndex((f) => !isFocusFrame(f) && !isOrdinaryFrame(f));
  expect(bad, `frame ${bad}: ${JSON.stringify(seen[bad])}`).toBe(-1);
});

test("SPEC-CORE-128 §1.4 / I4: moving file to file (to a PDF, then to a file that fails) keeps the state on and every frame in the focus layout", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await recordFrames(page);
  await navigate(page, `file=${PDF}`);
  await ready(page, "pdf");
  await navigate(page, `file=${MISSING}`);
  await ready(page, "missing");
  await expectFocusLayout(page);
  const seen = await frames(page);
  const bad = seen.findIndex((f) => !isFocusFrame(f));
  expect(bad, `frame ${bad}: ${JSON.stringify(seen[bad])}`).toBe(-1);
});

test("SPEC-CORE-128 §1.6 / I4: when the URL stops being a file page URL the state is off in that commit, and coming back to a file is ordinary", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await recordFrames(page);
  await navigate(page, "");
  await expect(page.getByTestId("fixture-listing")).toBeVisible();
  await expectOrdinaryHeader(page);
  const seen = await frames(page);
  const bad = seen.findIndex((f) => f.listing && (f.headerInert || f.top !== 56));
  expect(bad, `frame ${bad}: ${JSON.stringify(seen[bad])}`).toBe(-1);

  await navigate(page, `file=${VIDEO}`);
  await ready(page);
  await page.waitForTimeout(200);
  await expectOrdinaryHeader(page);
  await expect(focusButton(page)).toHaveAttribute("aria-pressed", "false");
});

test("SPEC-CORE-128 §1.6 / §9: after a reload the file page is in its ordinary layout", async ({ page }) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await page.reload();
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await ready(page);
  await expectOrdinaryHeader(page);
  await expect(focusButton(page)).toHaveAttribute("aria-pressed", "false");
});

// ---------------------------------------------------------------------------
// Below 768px
// ---------------------------------------------------------------------------

test("SPEC-CORE-128 I5: below 768px the page is the phone file page whatever the state; widening again gives the focus layout, hidden; nothing is written", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await page.setViewportSize({ width: 700, height: 800 });
  await page.waitForTimeout(300);
  const phone = await chrome(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectOrdinaryHeader(page);
  const writtenBefore = (await writes(page)).length;

  await enterByButton(page);
  await page.setViewportSize({ width: 700, height: 800 });
  await page.waitForTimeout(300);
  const suspended = await chrome(page);
  expect(suspended.headerInert).toBe(false);
  expect(suspended.contentTop).toBe(phone.contentTop);
  expect(suspended.contentLeft).toBe(phone.contentLeft);
  expect(suspended.appHeaderH).toBe(phone.appHeaderH);
  await expect(focusButton(page).filter({ visible: true })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expectFocusLayout(page);
  expect((await writes(page)).slice(writtenBefore)).toEqual([]);
});

test("SPEC-CORE-128 §3: T on a phone file page turns the state on without changing the layout; widening shows the focus layout", async ({
  page,
}) => {
  await open(page, { width: 700 });
  await ready(page);
  await page.waitForTimeout(300);
  const phone = await chrome(page);
  await pressT(page);
  await page.waitForTimeout(200);
  const after = await chrome(page);
  expect(after.contentTop).toBe(phone.contentTop);
  expect(after.headerInert).toBe(false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectFocusLayout(page);
});

// ---------------------------------------------------------------------------
// Reading position and remounts
// ---------------------------------------------------------------------------

test("SPEC-CORE-128 §1.3 / I2: the content at the top of the scrolled pane keeps its distance from the pane's top across entering and leaving", async ({
  page,
}) => {
  await open(page, { query: `file=${PDF}`, height: 700 });
  await ready(page, "pdf");
  await page.waitForTimeout(1000);

  // A PDF page is re-rendered at the new fit width, so its text nodes do not
  // survive the change; the point of the page at the pane's top is followed as
  // a fraction of that page's height instead.
  const topOfPane = () =>
    page.evaluate(() => {
      const w = window as unknown as { __page?: number; __scroller?: Element };
      if (!w.__scroller) {
        const candidates = [...document.querySelectorAll('[data-testid="page-content"] *')].filter(
          (el) => {
            const s = getComputedStyle(el);
            return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 200;
          },
        );
        w.__scroller = candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (!w.__scroller) return null;
        w.__scroller.scrollTop = 400;
      }
      const r = w.__scroller.getBoundingClientRect();
      const top = Math.max(r.top, 0);
      const pages = [...document.querySelectorAll("section[data-pdf-page]")];
      if (w.__page === undefined) {
        w.__page = pages.findIndex((p) => {
          const b = p.getBoundingClientRect();
          return b.top <= top + 2 && b.bottom > top + 2;
        });
      }
      const p = pages[w.__page];
      if (!p) return null;
      const b = p.getBoundingClientRect();
      return { into: top - b.top, height: b.height };
    });

  const before = await topOfPane();
  expect(before).not.toBeNull();
  expect(before!.into).toBeGreaterThan(50);
  const fraction = before!.into / before!.height;
  const drift = async () => {
    const now = await topOfPane();
    return now ? Math.abs(now.into - fraction * now.height) : Number.POSITIVE_INFINITY;
  };
  await pressT(page);
  await expectFocusLayout(page);
  await expect.poll(drift).toBeLessThanOrEqual(1);
  await pressT(page);
  await expectOrdinaryHeader(page);
  await expect.poll(drift).toBeLessThanOrEqual(1);
});

test("SPEC-CORE-128 I3 / §10: entering, revealing, hiding and leaving keep the video, the header, the tree pane and the inspector mounted, and the playback position and play state", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await treeButton(page).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    for (const s of ["video", "header", '[data-testid="fixture-tree"]', "aside.inspector-pane"]) {
      const el = document.querySelector(s) as (Element & { __kept?: boolean }) | null;
      if (el) el.__kept = true;
    }
    const v = document.querySelector("video")!;
    v.muted = true;
    v.currentTime = 1;
  });
  const state = () =>
    page.evaluate(() => {
      const kept = (s: string) =>
        !!(document.querySelector(s) as (Element & { __kept?: boolean }) | null)?.__kept;
      const v = document.querySelector("video")!;
      return {
        video: kept("video"),
        header: kept("header"),
        tree: kept('[data-testid="fixture-tree"]'),
        inspector: kept("aside.inspector-pane"),
        time: Math.round(v.currentTime * 10) / 10,
        paused: v.paused,
      };
    });
  const before = await state();
  expect(before).toMatchObject({ video: true, header: true, tree: true, inspector: true });
  await enterByButton(page);
  await revealByPointer(page);
  await moveAway(page);
  await expectFocusLayout(page);
  expect(await state()).toEqual(before);
  await pressT(page);
  await expectOrdinaryHeader(page);
  expect(await state()).toEqual(before);
});

// ---------------------------------------------------------------------------
// The reveal with a fine pointer
// ---------------------------------------------------------------------------

test("SPEC-CORE-129 §1–2 / I7 / I9 / D6: the pointer at the top reveals the full header over the page without moving it; the Focus mode button is pressed, the tree button is not", async ({
  page,
}) => {
  await open(page, { width: 1440, height: 900 });
  await ready(page);
  expect(await page.evaluate(() => matchMedia("(any-pointer: fine)").matches)).toBe(true);
  await enterByButton(page);
  const before = await layout(page);

  await revealByPointer(page);
  const h = await box(header(page));
  expect(h).toEqual({ left: 0, top: 0, width: 1440, height: 56 });
  await expect(header(page).getByRole("navigation")).toBeVisible();
  await expect(chromeButtons(page)).toBeVisible();
  const after = await layout(page);
  for (const key of ["content", "inspector", "video"] as const) {
    for (const side of ["left", "top", "width", "height"] as const) {
      expect(Math.abs(after[key]![side] - before[key]![side]), `${key}.${side}`).toBeLessThanOrEqual(1);
    }
  }
  expect((await chrome(page)).appHeaderH).toBe("0px");

  const button = focusButton(page);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveAccessibleName("Leave focus mode (T)");
  await expect(button).toHaveAttribute("title", "Leave focus mode (T)");
  await expect(button).toHaveClass(/bg-bg-elevated/);
  await expect(treeButton(page)).toHaveAttribute("aria-pressed", "false");
  expect(await header(page).evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");

  await moveAway(page);
  await expectFocusLayout(page);
});

test("SPEC-CORE-129 §1 / I10: the pointer 10px below the top does not reveal; 7px does", async ({ page }) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await page.mouse.move(640, 300);
  await page.mouse.move(640, 10, { steps: 4 });
  await page.waitForTimeout(150);
  expect((await chrome(page)).headerInert).toBe(true);
  await page.mouse.move(640, 7, { steps: 2 });
  await expect.poll(async () => (await chrome(page)).headerInert).toBe(false);
});

test("SPEC-CORE-129 §1 / I10: a drag with a button held reaching the strip does not reveal", async ({ page }) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(640, 3, { steps: 6 });
  await page.waitForTimeout(150);
  expect((await chrome(page)).headerInert).toBe(true);
  await page.mouse.up();
  await revealByPointer(page);
});

test("SPEC-CORE-129 §3 / I10: keyboard focus inside the revealed header holds it; when focus leaves it hides and focus is on <body>", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await revealByPointer(page);
  await header(page).getByRole("button", { name: "Quick note" }).focus();
  await moveAway(page);
  await page.waitForTimeout(150);
  expect((await chrome(page)).headerInert).toBe(false);
  await blur(page);
  await expectFocusLayout(page);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("SPEC-CORE-129 §3 / I10: the pointer leaving a revealed header hides it at once", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await revealByPointer(page);
  await header(page).getByRole("button", { name: "Quick note" }).hover();
  await moveAway(page);
  await expectFocusLayout(page);
});

test("SPEC-CORE-129 §3 / I10: the pointer leaving a revealed header for a document frame (EPUB, HTML) hides it", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await revealByPointer(page);
  await header(page).getByRole("button", { name: "Quick note" }).hover();
  // A viewer frame under the header, as an EPUB or HTML file draws from the
  // canvas top; pointer events inside it never reach the app's document.
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.srcdoc = "<body style='margin:0;height:100vh'></body>";
    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:24";
    document.body.appendChild(frame);
  });
  expect(
    await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, 400)?.tagName),
  ).toBe("IFRAME");
  await moveAway(page);
  await expectFocusLayout(page);
});

test("SPEC-CORE-129 §3 / I10: an open header menu holds the revealed header", async ({ page }) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await revealByPointer(page);
  const trigger = header(page).getByRole("button", { name: "Profile Setup" });
  await trigger.evaluate((el) => el.setAttribute("aria-expanded", "true"));
  await moveAway(page);
  await page.waitForTimeout(150);
  expect((await chrome(page)).headerInert).toBe(false);
  await trigger.evaluate((el) => el.setAttribute("aria-expanded", "false"));
  await page.mouse.move(640, 420, { steps: 2 });
  await expectFocusLayout(page);
});

test("SPEC-CORE-129 §6 / I10: the menu button opens the overlay sidebar with focus mode on, the sidebar holds the reveal, and nothing writes sidebar-open", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  const writtenBefore = (await writes(page)).length;
  await enterByButton(page);
  await revealByPointer(page);
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveAttribute("aria-pressed", "true");
  await moveAway(page);
  await page.waitForTimeout(150);
  const c = await chrome(page);
  expect(c.headerInert).toBe(false);
  expect(c.contentLeft).toBe(0);
  expect(c.contentTop).toBe(0);
  await page.keyboard.press("Escape");
  await expectFocusLayout(page);
  expect((await writes(page)).slice(writtenBefore)).toEqual([]);
});

test("SPEC-CORE-128 §1.6 / I4: an overlay sidebar opened in focus mode is closed when the URL stops being a file page URL, and the listing gets the inline sidebar", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  const inline = (await layout(page)).sidebar;
  expect(inline).not.toBeNull();
  await enterByButton(page);
  await revealByPointer(page);
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveAttribute("aria-pressed", "true");
  await navigate(page, "");
  await expect(page.getByTestId("fixture-listing")).toBeVisible();
  await expectOrdinaryHeader(page);
  expect((await layout(page)).sidebar).toEqual(inline);
  expect((await chrome(page)).contentLeft).toBe(Math.round(inline!.left + inline!.width));
});

test("SPEC-CORE-128 §1.5 / I4: T with the overlay sidebar open leaves focus mode, closes the overlay and restores the inline sidebar", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  const before = await layout(page);
  await enterByButton(page);
  await revealByPointer(page);
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveAttribute("aria-pressed", "true");
  await pressT(page);
  await expectOrdinaryHeader(page);
  await page.waitForTimeout(300);
  expectSameLayout(await layout(page), before);
});

for (const row of [
  { width: 1024, tree: false },
  { width: 1440, tree: true },
]) {
  test(`SPEC-CORE-128 §1.3 / §1.5 / I4 (${row.width} wide, tree ${row.tree ? "shown" : "hidden"}): an overlay sidebar that is an overlay for another reason is closed entering by T and leaving by T or the tree button, writing nothing`, async ({
    page,
  }) => {
    const storage: Record<string, string> = {
      "workbench-panels": "[]",
      "sidebar-open": "true",
    };
    if (row.tree) storage["tree:enabled:fixture"] = "true";
    await open(page, { width: row.width, height: 900, storage });
    await ready(page);
    await page.waitForTimeout(300);
    await expect(treeButton(page)).toHaveAttribute("aria-pressed", String(row.tree));
    await expect(menuControl(page)).toHaveAttribute("aria-pressed", "false");

    await menuButton(page).click();
    await expect(menuControl(page)).toHaveAttribute("aria-pressed", "true");
    await pressT(page);
    await expectFocusLayout(page);
    await expect(menuControl(page)).toHaveAttribute("aria-pressed", "false");

    await revealByPointer(page);
    await menuButton(page).click();
    await expect(menuControl(page)).toHaveAttribute("aria-pressed", "true");
    await pressT(page);
    await expectOrdinaryHeader(page);
    await expect(menuControl(page)).toHaveAttribute("aria-pressed", "false");

    await enterByButton(page);
    await revealByPointer(page);
    await menuButton(page).click();
    await expect(menuControl(page)).toHaveAttribute("aria-pressed", "true");
    await treeButton(page).click();
    await expectOrdinaryHeader(page);
    await expect(menuControl(page)).toHaveAttribute("aria-pressed", "false");

    expect((await writes(page)).filter((w) => w.startsWith("sidebar-open"))).toEqual([]);
  });
}

for (const shown of [false, true]) {
  test(`SPEC-CORE-129 §7 / I10 / SPEC-CORE-084 I8 as revised (tree ${shown ? "shown" : "hidden"} by setting): the tree button pressed while revealed ends focus mode and leaves the tree visible, writing tree:enabled only when it was hidden`, async ({
    page,
  }) => {
    await open(page);
    await ready(page);
    if (shown) {
      await treeButton(page).click();
      await page.waitForTimeout(300);
    }
    const writtenBefore = (await writes(page)).length;
    await enterByButton(page);
    await revealByPointer(page);
    await expect(treeButton(page)).toHaveAttribute("aria-pressed", "false");
    await treeButton(page).click();
    await expectOrdinaryHeader(page);
    await expect.poll(async () => Math.round((await box(tree(page))).width)).toBe(280);
    await expect(focusButton(page)).toHaveAttribute("aria-pressed", "false");
    expect((await writes(page)).slice(writtenBefore)).toEqual(
      shown ? [] : ["tree:enabled:fixture=true"],
    );
  });
}

test("SPEC-CORE-129 §8 / I8: the search window opened from the revealed header hides it and is visible; when it closes the header stays hidden and focus is on <body>", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await revealByPointer(page);
  await header(page).getByRole("button", { name: "Search" }).click();
  await expect(visibleModal(page)).toHaveCount(1);
  expect((await chrome(page)).headerInert).toBe(true);
  await page.keyboard.press("Escape");
  await expect(visibleModal(page)).toHaveCount(0);
  await expectFocusLayout(page);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("SPEC-CORE-129 §8 / I10: while covered the pointer at the top does not reveal; once the cover closes it does", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await page.evaluate(() => window.__fixtureOpenDialog!("confirm"));
  await page.mouse.move(640, 300);
  await page.mouse.move(640, 3, { steps: 4 });
  await page.waitForTimeout(150);
  expect((await chrome(page)).headerInert).toBe(true);
  await page.evaluate(() => window.__fixtureOpenDialog!(null));
  await moveAway(page);
  await revealByPointer(page);
});

test("SPEC-CORE-128 I8: in the focus layout Cmd/Ctrl+K and N open a visible search window and quick note panel while the header stays hidden", async ({
  page,
}) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(visibleModal(page)).toHaveCount(1);
  expect((await chrome(page)).headerInert).toBe(true);
  await page.keyboard.press("Escape");
  await blur(page);
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "Quick note" })).toBeVisible();
  expect((await chrome(page)).headerInert).toBe(true);
});

test("SPEC-CORE-128 failure case (file fails to load): the error state is drawn in the focus layout and the revealed header's Focus mode button leaves", async ({
  page,
}) => {
  await open(page, { query: `file=${MISSING}` });
  await ready(page, "missing");
  await enterByButton(page);
  await revealByPointer(page);
  await focusButton(page).click();
  await expectOrdinaryHeader(page);
});

test("SPEC-CORE-129 §8: a file-to-file navigation keeps the reveal", async ({ page }) => {
  await open(page);
  await ready(page);
  await enterByButton(page);
  await revealByPointer(page);
  await navigate(page, `file=${PDF}`);
  await ready(page, "pdf");
  expect((await chrome(page)).headerInert).toBe(false);
});

// ---------------------------------------------------------------------------
// Safe area
// ---------------------------------------------------------------------------

test("SPEC-CORE-128 §1.3 / I1 / SPEC-CORE-129 §1–2 (a 24px safe-area inset): the content starts at the inset, --app-header-h is the inset, and the header is revealed from it", async ({
  page,
}) => {
  await open(page, { width: 1180, height: 820 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: { top: 24 } } as never);
  const inset = await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top, 0px)";
    document.body.append(d);
    const h = d.getBoundingClientRect().height;
    d.remove();
    return h;
  });
  expect(inset).toBe(24);
  await ready(page);
  await enterByButton(page, 24);
  await revealByPointer(page, 24);
  expect(Math.round((await box(header(page))).top)).toBe(24);
  expect((await chrome(page)).appHeaderH).toBe("24px");
});

// ---------------------------------------------------------------------------
// Cheat sheet and locales
// ---------------------------------------------------------------------------

test("SPEC-CORE-128 §9 / I9: the cheat sheet on a file page lists T under Focus mode", async ({ page }) => {
  await open(page);
  await ready(page);
  await blur(page);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard Shortcuts" }).first()).toBeVisible();
  const sheet = page
    .getByRole("dialog", { name: "Keyboard Shortcuts" })
    .filter({ hasText: "Toggle focus mode" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Focus mode", { exact: true })).toBeVisible();
  const row = sheet.getByText("Toggle focus mode", { exact: true });
  await expect(row).toBeVisible();
  await expect(row.locator("xpath=..")).toContainText("T");
});

test("SPEC-CORE-128 §9 / I9 (ja): the button's name and title follow the state, and the cheat sheet has 集中モード with 集中モードの切り替え", async ({
  page,
}) => {
  await open(page, { locale: "ja" });
  await ready(page);
  const button = header(page).getByRole("button", { name: /^集中モード/ });
  await expect(button).toHaveAccessibleName("集中モード (T)");
  await expect(button).toHaveAttribute("title", "集中モード (T)");
  await button.click();
  await expectFocusLayout(page);
  await revealByPointer(page);
  await expect(button).toHaveAccessibleName("集中モードを終える (T)");
  await expect(button).toHaveAttribute("title", "集中モードを終える (T)");
  await moveAway(page);
  await blur(page);
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog").filter({ hasText: "集中モードの切り替え" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("集中モード", { exact: true })).toBeVisible();
});
