/**
 * Every gesture is sent as a CDP `Input.dispatchTouchEvent`, so the
 * `mousedown` / `mouseup` / `click` that follow `touchend` are Chromium's
 * own compatibility events.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function open(page: Page, arrangement: string): Promise<void> {
  // The query is a cache-buster: the arrangement is read from
  // `location.hash` as the bundle evaluates, and moving from one hash to
  // another on the same document is not a navigation.
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
}

/** Activations of a control, or `-1` if it is not on the page any more. */
async function activations(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    return el ? Number(el.dataset.clicks) : -1;
  }, selector);
}

/**
 * Asked of the scrim, which is mounted for exactly as long as its popup is.
 * `ContextMenu` has `role="menuitem"` rows but no `role="menu"` container,
 * so a query for the role would always read "never opened".
 */
async function popupIsOpen(page: Page): Promise<boolean> {
  return (await page.locator("[data-dismiss-scrim]").count()) > 0;
}

/**
 * Sent through CDP rather than `page.touchscreen`, which has only `tap`:
 * `useContextMenu` answers a 500 ms hold.
 */
async function touchHold(
  page: Page,
  selector: string,
  holdMs: number,
): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  // The compatibility click is dispatched after `touchEnd` returns; one
  // frame is enough for it, and for React to commit whatever it caused.
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
}

async function tap(page: Page, selector: string): Promise<void> {
  await touchHold(page, selector, 30);
}

/**
 * What the page has to be for a case to be the case it is named for, read
 * back as computed styles so a class that compiles to nothing fails.
 *
 * The outcome assertion is identical for every arrangement, so without
 * these all of them could point at the same button and stay green.
 */
interface Requirement {
  of: string;
  absent?: boolean;
  style?: Record<string, string>;
  inside?: string;
  /** An ancestor that must carry a transform, named for what it stands for. */
  insideTransform?: string;
}

/**
 * The control the case taps. A fact about `#bar` alone is still true
 * after the entry is pointed somewhere else; this ties it to the target.
 */
const TARGET = "$target";

async function meets(
  page: Page,
  requirement: Requirement,
  target: string,
): Promise<string[]> {
  const req: Requirement = {
    ...requirement,
    of: requirement.of === TARGET ? target : requirement.of,
  };
  return page.evaluate((r) => {
    const wrong: string[] = [];
    const el = document.querySelector(r.of) as HTMLElement | null;
    if (r.absent) return el ? [`${r.of} is on the page and must not be`] : [];
    if (!el) return [`${r.of} is not on the page`];
    const style = getComputedStyle(el);
    for (const [prop, want] of Object.entries(r.style ?? {})) {
      const got = style.getPropertyValue(prop);
      if (got !== want) wrong.push(`${r.of} ${prop} is ${got}, not ${want}`);
    }
    if (r.inside && !document.querySelector(r.inside)?.contains(el)) {
      wrong.push(`${r.of} is not inside ${r.inside}`);
    }
    if (r.insideTransform) {
      const box = document.querySelector(r.insideTransform) as HTMLElement | null;
      const transform = box ? getComputedStyle(box).transform : "none";
      if (!box) wrong.push(`${r.insideTransform} is not on the page`);
      else if (transform === "none") {
        wrong.push(`${r.insideTransform} carries no transform`);
      } else if (!box.contains(el)) {
        wrong.push(`${r.of} is not inside ${r.insideTransform}`);
      }
    }
    return wrong;
  }, req);
}

const DISMISSING = [
  {
    arrangement: "plain",
    target: "#underneath",
    why: "a scrim over a z-0 button",
    requires: [
      { of: TARGET, style: { position: "fixed", "z-index": "0" } },
      { of: "#bar", absent: true },
      { of: "#tabstrip", absent: true },
    ] as Requirement[],
  },
  {
    arrangement: "bottom-bar",
    target: "#bulk",
    why: "scrim and menu inside a fixed bottom-0 z-50 bar, tapping a bulk action",
    requires: [
      {
        of: "#bar",
        style: { position: "fixed", bottom: "0px", "z-index": "50" },
      },
      { of: TARGET, inside: "#bar" },
      { of: "[data-dismiss-scrim]", inside: "#bar" },
    ] as Requirement[],
  },
  {
    arrangement: "transformed",
    target: "#tabstrip",
    why: "scrim inside a transformed box, tapping a sticky strip written after it",
    requires: [
      { of: TARGET, style: { position: "sticky", "z-index": "10" } },
      { of: TARGET, insideTransform: "#drawer" },
      { of: "[data-dismiss-scrim]", insideTransform: "#drawer" },
    ] as Requirement[],
  },
] as const;

test.describe("a tap that dismisses a popup", () => {
  test("the arrangements are the ones this unit was bitten by", () => {
    expect(DISMISSING).toHaveLength(3);
    expect(DISMISSING.map((d) => d.arrangement)).toEqual([
      "plain",
      "bottom-bar",
      "transformed",
    ]);
  });

  for (const { arrangement, target, why, requires } of DISMISSING) {
    test(`${arrangement}: ${why}`, async ({ page }) => {
      await open(page, arrangement);
      expect(await popupIsOpen(page)).toBe(true);

      for (const requirement of requires) {
        expect(
          await meets(page, requirement, target),
          JSON.stringify(requirement),
        ).toEqual([]);
      }

      await tap(page, target);

      expect(await popupIsOpen(page)).toBe(false);
      expect(await activations(page, target)).toBe(0);
    });
  }

  test("the popup's own rows still work", async ({ page }) => {
    await open(page, "plain");

    await tap(page, "#row-Move");

    expect(await activations(page, "#underneath")).toBe(0);
    expect(await popupIsOpen(page)).toBe(false);
  });
});

/**
 * Waits for the drawer to stop moving rather than polling the assertion,
 * which would return the first time a travelling box happens to pass.
 *
 * Five frames, not two: vaul applies the transform on the frame after
 * mount, so a pair before the transition starts reads as settled.
 */
const STILL_FRAMES = 5;

async function sheetSettles(page: Page): Promise<void> {
  await page.waitForFunction((frames) => {
    const el = document.querySelector("[data-vaul-drawer]") as HTMLElement | null;
    if (!el) return false;
    const w = window as unknown as { tops?: number[] };
    const tops = (w.tops ??= []);
    tops.push(el.getBoundingClientRect().top);
    if (tops.length > frames) tops.shift();
    return tops.length === frames && new Set(tops).size === 1;
  }, STILL_FRAMES);
}

test.describe("a menu drawn inside the Bottom Sheet", () => {
  /**
   * `pinned-to-the-screen` is off screen because `position: fixed`
   * resolves against `Drawer.Content`'s transform.
   */
  const ONSCREEN = { id: "anchored", onScreen: true };
  const OFFSCREEN = { id: "pinned-to-the-screen", onScreen: false };
  const BOXES = [ONSCREEN, OFFSCREEN];

  test("both boxes are measured, and each says which it is", () => {
    expect(BOXES).toEqual([
      { id: "anchored", onScreen: true },
      { id: "pinned-to-the-screen", onScreen: false },
    ]);
  });

  test("the sheet is really translated, which is what makes the two differ", async ({
    page,
  }) => {
    // Without a transform on `Drawer.Content` both boxes resolve against
    // the viewport and the cases below pass for the wrong reason.
    await open(page, "sheet");
    await sheetSettles(page);

    const drawer = await page.evaluate(() => {
      const el = document.querySelector("[data-vaul-drawer]") as HTMLElement;
      const box = el.getBoundingClientRect();
      return {
        transformed: getComputedStyle(el).transform !== "none",
        pastTheFold: box.bottom > window.innerHeight,
      };
    });

    expect(drawer).toEqual({ transformed: true, pastTheFold: true });
  });

  for (const { id, onScreen } of BOXES) {
    test(`#${id} is ${onScreen ? "on" : "off"} the screen`, async ({ page }) => {
      await open(page, "sheet");
      await sheetSettles(page);

      expect(
        await page.evaluate((sel) => {
          const box = document.getElementById(sel)!.getBoundingClientRect();
          return box.top < window.innerHeight && box.bottom > 0;
        }, id),
      ).toBe(onScreen);
    });
  }

  test("the anchored menu hangs off the wrapper it is positioned against", async ({
    page,
  }) => {
    // The menu hangs leftward here, so it is the *right* edges that have
    // to coincide; reading `left` would measure the menu's width instead.
    // Read against the wrapper, which is what `absolute` resolves against,
    // so the fixture's padding does not enter as a magic number.
    await open(page, "sheet");
    await sheetSettles(page);

    const { wrapper, menu } = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      const anchored = document.getElementById("anchored")!;
      return { wrapper: box(anchored.parentElement!), menu: box(anchored) };
    });

    expect({
      top: Math.round(menu.top - wrapper.bottom),
      right: Math.round(menu.right - wrapper.right),
    }).toEqual({ top: 4, right: 0 });
  });
});

/**
 * Collapsed, the sheet draws the action row as a `fixed` resting strip with
 * no drawer mounted. Downward is off the screen there and upward is off the
 * screen inside the expanded sheet, so the direction cannot be a constant.
 */
test.describe("a menu in the sheet's resting strip", () => {
  const IN_THE_STRIP = [
    { arrangement: "sheet-peek-down", id: "anchored", onScreen: false },
    { arrangement: "sheet-peek-up", id: "anchored", onScreen: true },
    { arrangement: "sheet-peek-down", id: "pinned-to-the-screen", onScreen: true },
  ];

  test("both directions and the old form are measured, in the state that starts", () => {
    expect(IN_THE_STRIP).toEqual([
      { arrangement: "sheet-peek-down", id: "anchored", onScreen: false },
      { arrangement: "sheet-peek-up", id: "anchored", onScreen: true },
      {
        arrangement: "sheet-peek-down",
        id: "pinned-to-the-screen",
        onScreen: true,
      },
    ]);
  });

  test("the strip is on the bottom edge, and carries no transform", async ({
    page,
  }) => {
    await open(page, "sheet-peek-down");

    expect(
      await page.evaluate(() => {
        const strip = document.querySelector(
          '[data-testid="mobile-inspector-peek"]',
        ) as HTMLElement;
        return {
          transformed: getComputedStyle(strip).transform !== "none",
          bottomIsTheScreen:
            Math.round(strip.getBoundingClientRect().bottom) ===
            window.innerHeight,
          height: strip.getBoundingClientRect().height,
          paddingBottom: strip.style.paddingBottom,
          drawerMounted: !!document.querySelector("[data-vaul-drawer]"),
        };
      }),
    ).toEqual({
      transformed: false,
      bottomIsTheScreen: true,
      // Chromium reports no inset, so the strip is its 56px row.
      height: 56,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      drawerMounted: false,
    });
  });

  for (const { arrangement, id, onScreen } of IN_THE_STRIP) {
    test(`${arrangement}: #${id} is ${onScreen ? "on" : "off"} the screen`, async ({
      page,
    }) => {
      await open(page, arrangement);

      expect(
        await page.evaluate((sel) => {
          const box = document.getElementById(sel)!.getBoundingClientRect();
          // Whole, not merely intersecting: a sliver left visible is still
          // a menu off the screen.
          return box.top >= 0 && box.bottom <= window.innerHeight;
        }, id),
      ).toBe(onScreen);
    });
  }
});

test.describe("a press that raises a popup", () => {
  test("long-press opens the menu and does not activate the card", async ({
    page,
  }) => {
    // `useContextMenu` opens from a timer on `touchstart`, a press the
    // scrim never answered, so nothing is armed for the click the lift
    // produces.
    await open(page, "long-press");
    expect(await popupIsOpen(page)).toBe(false);

    await touchHold(page, "#card", 700);

    expect(await popupIsOpen(page)).toBe(true);
    expect(await activations(page, "#card")).toBe(0);
  });

  test("a short tap on the same card is an ordinary tap", async ({ page }) => {
    await open(page, "long-press");

    await tap(page, "#card");

    expect(await popupIsOpen(page)).toBe(false);
    expect(await activations(page, "#card")).toBe(1);
  });

  test("the tap that dismisses that menu is spared too", async ({ page }) => {
    await open(page, "long-press");
    await touchHold(page, "#card", 700);
    expect(await popupIsOpen(page)).toBe(true);

    await tap(page, "#card");

    expect(await popupIsOpen(page)).toBe(false);
    expect(await activations(page, "#card")).toBe(0);
  });
});

/**
 * Three outcomes, not two: a box past the fold inside a scroller is reached
 * by scrolling, and the same box with nothing to scroll is gone.
 *
 * - `within` — inside the frame the component measured against, and
 *   inside the viewport.
 * - `scrollable` — past the frame's visible edge, and the frame has grown
 *   enough scroll to reach it.
 * - `clipped` — past the frame with no scroll that reaches it.
 *
 * The frame, not the viewport: drawn upward at `half` the menu lands inside
 * the screen and is still cut off by the sheet's `overflow-auto` scroller.
 *
 * Expanded, the row sits just below the top of the sheet's scroller, so the
 * vertical flip is unreachable at `half` and `full`; at `peek` the walk
 * stops at the `fixed` strip and the frame is the viewport, where nothing
 * grows. Which direction the component picks is a prop of the fixture.
 */
type CellOutcome = "within" | "scrollable" | "clipped";

const CELLS: readonly {
  state: "peek" | "half" | "full";
  axis: "vertical" | "horizontal";
  arrangement: string;
  outcome: CellOutcome;
}[] = [
  { state: "peek", axis: "vertical", arrangement: "sheet-peek-up", outcome: "within" },
  { state: "peek", axis: "vertical", arrangement: "sheet-peek-down", outcome: "clipped" },
  { state: "peek", axis: "horizontal", arrangement: "sheet-peek-up", outcome: "within" },
  { state: "peek", axis: "horizontal", arrangement: "sheet-peek-left", outcome: "clipped" },

  { state: "half", axis: "vertical", arrangement: "sheet-half-right", outcome: "scrollable" },
  { state: "half", axis: "vertical", arrangement: "sheet-half-up", outcome: "clipped" },
  { state: "half", axis: "horizontal", arrangement: "sheet-half-right", outcome: "within" },
  { state: "half", axis: "horizontal", arrangement: "sheet-half-left", outcome: "scrollable" },

  { state: "full", axis: "vertical", arrangement: "sheet-full-right", outcome: "within" },
  { state: "full", axis: "vertical", arrangement: "sheet-full-up", outcome: "clipped" },
  { state: "full", axis: "horizontal", arrangement: "sheet-full-right", outcome: "within" },
  { state: "full", axis: "horizontal", arrangement: "sheet-full-left", outcome: "scrollable" },
] as const;

test.describe("the menu's box, in every sheet state and on both axes", () => {
  test("the table covers three states and two axes, and both directions of each", () => {
    expect(CELLS).toHaveLength(12);

    expect([...new Set(CELLS.map((c) => c.state))]).toEqual([
      "peek",
      "half",
      "full",
    ]);
    expect([...new Set(CELLS.map((c) => c.axis))]).toEqual([
      "vertical",
      "horizontal",
    ]);

    // Per state × axis, not pooled across the table: a pooled check lets
    // one cell hold a single direction.
    for (const state of ["peek", "half", "full"] as const) {
      for (const axis of ["vertical", "horizontal"] as const) {
        const rows = CELLS.filter((c) => c.state === state && c.axis === axis);
        expect(rows, `${state} · ${axis}`).toHaveLength(2);
        // Not `clipped` specifically: that would require the sheet not to
        // scroll sideways, a separate question.
        expect(
          rows.some((r) => r.outcome !== "within"),
          `${state} · ${axis} draws no direction that fails to fit`,
        ).toBe(true);
      }
    }
  });

  for (const cell of CELLS) {
    test(`${cell.state} · ${cell.axis} · ${cell.arrangement} · ${cell.outcome}`, async ({
      page,
    }) => {
      await open(page, cell.arrangement);
      // vaul animates the drawer into place. Measured before it settles,
      // the expanded states report the animation rather than the state.
      await page.waitForTimeout(600);

      const m = await page.evaluate(() => {
        const el = document.getElementById("anchored")!;
        const r = el.getBoundingClientRect();

        // Found the way the component finds it: the first ancestor that
        // clips, or the viewport when the walk leaves through a `fixed` box.
        let frame = {
          left: 0,
          right: window.innerWidth,
          top: 0,
          bottom: window.innerHeight,
          scrollBelow: 0,
          scrollRight: 0,
        };
        for (
          let node = el.parentElement;
          node;
          node = node.parentElement
        ) {
          const { overflowX, overflowY, position } = getComputedStyle(node);
          if (/auto|scroll|hidden/.test(overflowX + overflowY)) {
            const b = node.getBoundingClientRect();
            frame = {
              left: b.left,
              right: b.right,
              top: b.top,
              bottom: b.bottom,
              scrollBelow:
                node.scrollHeight - node.clientHeight - node.scrollTop,
              scrollRight:
                node.scrollWidth - node.clientWidth - node.scrollLeft,
            };
            break;
          }
          if (position === "fixed") break;
        }

        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          vw: window.innerWidth,
          vh: window.innerHeight,
          frame,
        };
      });

      const where = `[${m.left}, ${m.right}] x [${m.top}, ${m.bottom}] in frame [${m.frame.left}, ${m.frame.right}] x [${m.frame.top}, ${m.frame.bottom}], scrollBelow ${m.frame.scrollBelow}`;

      const within =
        cell.axis === "horizontal"
          ? m.left >= m.frame.left && m.right <= m.frame.right
          : m.top >= m.frame.top && m.bottom <= m.frame.bottom;

      if (cell.outcome === "within") {
        expect(within, where).toBe(true);
        const onScreen =
          cell.axis === "horizontal"
            ? m.left >= 0 && m.right <= m.vw
            : m.top >= 0 && m.bottom <= m.vh;
        expect(onScreen, `${where} — on screen on this axis`).toBe(true);
        return;
      }

      expect(within, `${where} — expected to be past the frame`).toBe(false);

      // Only the trailing edge of each axis is recoverable: a box that
      // overshoots the frame's top starts above its content origin.
      const overflow =
        cell.axis === "horizontal"
          ? m.right - m.frame.right
          : m.bottom - m.frame.bottom;
      const scrollAvailable =
        cell.axis === "horizontal" ? m.frame.scrollRight : m.frame.scrollBelow;
      const reachable = overflow > 0 && scrollAvailable >= overflow;

      expect(reachable, `${where} — reachable by scrolling?`).toBe(
        cell.outcome === "scrollable",
      );
    });
  }
});
