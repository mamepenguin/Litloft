/**
 * The real `DismissScrim`, `ContextMenu` and `useContextMenu`, driven by
 * real gestures in Chromium.
 *
 * Read `build-bundle.ts` first: it says why this target exists, what it
 * holds that `e2e-layout` cannot, and what it still cannot hold.
 *
 * Two claims, and they are the unit's whole requirement:
 *
 *  - **a tap that dismisses a popup must not activate what is under the
 *    finger**, whatever the popup is stacked inside; and
 *  - **a press that *raises* a popup must not either** — the long press,
 *    which is the case that got past four rounds of guards.
 *
 * Every gesture is sent as a CDP `Input.dispatchTouchEvent`, so the
 * `mousedown` / `mouseup` / `click` that follow `touchend` are Chromium's
 * own compatibility events. `page.touchscreen.tap` cannot hold a press
 * open for 500 ms, which is what `useContextMenu` needs before it opens
 * anything.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function open(page: Page, arrangement: string): Promise<void> {
  // The query is a cache-buster: the arrangement is read from
  // `location.hash` as the bundle evaluates, and moving from one hash to
  // another on the same document is not a navigation, so the script would
  // not re-run. `data-arrangement` is what would report that.
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
 * Whether a popup is open, asked of the primitive rather than of the
 * markup: a scrim is mounted for exactly as long as its popup is, and it
 * carries `DISMISS_SCRIM_ATTR`. `ContextMenu` publishes `role="menuitem"`
 * rows but no `role="menu"` container, so a query for the role would read
 * "never opened" here and every case below would pass for the wrong
 * reason. (Measured: it did, before this was written this way.)
 */
async function popupIsOpen(page: Page): Promise<boolean> {
  return (await page.locator("[data-dismiss-scrim]").count()) > 0;
}

/**
 * A touch, held for `holdMs`, at the centre of `selector`.
 *
 * Sent through CDP rather than `page.touchscreen` because that API has
 * only `tap`, and a 500 ms hold is the input `useContextMenu` answers.
 * Chromium synthesises the compatibility mouse events from `touchEnd`
 * itself — which is the sequence under test, and the one a test that
 * dispatched `click` by hand would be faking.
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

/** A tap: the same path, held only as long as a finger is. */
async function tap(page: Page, selector: string): Promise<void> {
  await touchHold(page, selector, 30);
}

/**
 * What the page has to be for a case to be the case it is named for.
 *
 * Measured from the page, before the tap, with computed styles: a
 * declaration read back from the browser rather than a class name read out
 * of the fixture, so a class that compiles to nothing fails here.
 *
 * This is what makes the three entries below distinct. The outcome
 * assertion is identical for all of them — the popup closes and the
 * control is spared, and that it does not vary with the arrangement is the
 * property five rounds of positional rules could not hold — so with the
 * targets alone, all three could be pointed at the shared full-bleed
 * button and the run would stay green: three copies of `plain` wearing
 * three names. Measured, before this existed: it did.
 */
interface Requirement {
  /** What the fact is about, read from the page under test. */
  of: string;
  /** The element must not be on the page at all. */
  absent?: boolean;
  /** Computed style declarations that must hold on it. */
  style?: Record<string, string>;
  /** An ancestor selector the element must be inside. */
  inside?: string;
  /** An ancestor that must carry a transform, named for what it stands for. */
  insideTransform?: string;
}

/**
 * `$target` is the control this case taps, resolved here rather than
 * written twice.
 *
 * It is what ties a requirement to the case: a fact about `#bar` alone is
 * still true after the entry is pointed somewhere else, and retargeting
 * all three at the shared full-bleed button is the mutation that made
 * three copies of `plain` out of this table.
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

/**
 * What a dismissing tap must do, where it lands, and what has to be true
 * of the page for that to mean anything.
 */
const DISMISSING = [
  {
    arrangement: "plain",
    target: "#underneath",
    why: "a scrim over a z-0 button",
    requires: [
      { of: TARGET, style: { position: "fixed", "z-index": "0" } },
      // No chrome at all: this case *is* the absence of it, and either of
      // the others' surfaces appearing here would make it a copy.
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
    // A population, pinned like one. Cutting an entry from the table
    // removes a case and leaves the run green, which is how a suite stops
    // measuring the thing it was written for (detector rule 5, and
    // review-workflow's note that a shrinking population is not a
    // shrinking claim).
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

      // The page is what the title says it is, before the tap decides
      // anything. Retargeting this case at another arrangement's control
      // fails here rather than passing as a third copy of `plain`.
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
    // The other side of "outside": a press inside the popup is the user
    // working it. If the primitive were given the wrong subtree, this row
    // would both fail to run and take the popup down with it.
    await open(page, "plain");

    await tap(page, "#row-Move");

    expect(await activations(page, "#underneath")).toBe(0);
    expect(await popupIsOpen(page)).toBe(false);
  });
});

/**
 * The sheet slides in, so every box in it moves for a moment.
 *
 * Waits for the drawer to stop moving rather than for the assertion to
 * start passing: a poll on the assertion returns the first time it
 * happens to hold, which for a box travelling up through the viewport is
 * a different claim than "it ends up there".
 *
 * Five consecutive frames at the same offset, not two. Two was measured
 * flaky — vaul applies the transform on the frame after mount, so the
 * frame pair before the transition starts reads as settled and the run
 * measures a sheet that has not moved yet.
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
   * Where each box lands, and why it is the box it is.
   *
   * Declared per element rather than derived from what the run
   * observed: `anchored` is on screen because it resolves against the
   * wrapper it hangs from, `pinned-to-the-screen` is not because
   * `position: fixed` resolves against `Drawer.Content`'s transform, and
   * the drawer's own box says how far past the fold that is.
   */
  const ONSCREEN = { id: "anchored", onScreen: true };
  const OFFSCREEN = { id: "pinned-to-the-screen", onScreen: false };
  const BOXES = [ONSCREEN, OFFSCREEN];

  test("both boxes are measured, and each says which it is", () => {
    // The population, declared. Cutting `OFFSCREEN` — with its `const`,
    // which is the tidy-up `eslint` asks for once the array stops using
    // it — leaves the block saying only "an anchored box is visible",
    // which the `plain` arrangement already says and which is true in
    // any arrangement. That is the shape this repository has hit
    // twenty-two times; it is not being written a twenty-third.
    expect(BOXES).toEqual([
      { id: "anchored", onScreen: true },
      { id: "pinned-to-the-screen", onScreen: false },
    ]);
  });

  test("the sheet is really translated, which is what makes the two differ", async ({
    page,
  }) => {
    // The premise. Without a transform on `Drawer.Content` both boxes
    // resolve against the viewport and the case below passes for the
    // wrong reason — so the transform is read, and so is the drawer
    // reaching past the bottom of the screen.
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
    // Not merely on screen: exactly where `absolute top-full mt-1
    // right-0` puts it, on both axes. A bound ("somewhere below the
    // trigger") let a 64px gap call itself anchored — measured — while
    // the axis beside it was already exact, and the asymmetry was the
    // finding.
    //
    // The horizontal edge read is the one the direction pins. This
    // arrangement draws the menu hanging leftward, which is what the
    // component picks for a trigger at the right of the row, so it is the
    // *right* edges that have to coincide. Reading `left` here would
    // measure the menu's width instead, and would have gone on passing
    // when the component still hung it the other way.
    //
    // Read against the *wrapper*, which is what `absolute` resolves
    // against. Reading against the button instead needs the wrapper's
    // padding as a magic number, and that number is the fixture's rather
    // than the component's.
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
 * The state the file detail opens in, and the one the first round of this
 * unit broke while fixing the other.
 *
 * Collapsed, the sheet draws the same action row a second time as a 56px
 * resting strip — `fixed bottom-0`, no transform, and the drawer is not
 * mounted at all. There is nothing below that row, so the direction a
 * menu hangs in cannot be a constant: downward is off the screen there,
 * and upward is off the screen inside the expanded sheet's scroller.
 * `FileActions` measures and flips for this reason, in this exact strip,
 * and `DESIGN.md` says so directly above the paragraph this unit added.
 */
test.describe("a menu in the sheet's resting strip", () => {
  const IN_THE_STRIP = [
    { arrangement: "sheet-peek-down", id: "anchored", onScreen: false },
    { arrangement: "sheet-peek-up", id: "anchored", onScreen: true },
    // The form this unit replaced is whole *here* — which is why the
    // first round's measurement, taken only in the expanded sheet,
    // pointed the wrong way. Both states are drawn now.
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
    // The premise, and the difference from the expanded sheet: nothing
    // here is transformed, so `fixed` means the viewport — and the row's
    // own bottom edge is the screen's.
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
          drawerMounted: !!document.querySelector("[data-vaul-drawer]"),
        };
      }),
    ).toEqual({
      transformed: false,
      bottomIsTheScreen: true,
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
          // Whole, not merely intersecting: the defect this replaces left
          // 1.5px of an 82px menu visible, which "on screen" by any
          // overlap test would have called a pass.
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
    // The regression the mechanism created, and the reason this whole
    // target exists. `useContextMenu` opens `ContextMenu` from a 500 ms
    // timer on `touchstart` — a press the primitive never answered — so
    // nothing armed for the click the lift produces, and a scrim that is
    // only appearance cannot stand in for one. On a phone that is
    // "long-press a file card, and land on the file".
    await open(page, "long-press");
    expect(await popupIsOpen(page)).toBe(false);

    await touchHold(page, "#card", 700);

    expect(await popupIsOpen(page)).toBe(true);
    expect(await activations(page, "#card")).toBe(0);
  });

  test("a short tap on the same card is an ordinary tap", async ({ page }) => {
    // The boundary. If the swallow were armed by any press rather than by
    // one that raised a popup, this card could never be opened at all —
    // which is the failure mode a fix for the case above walks into.
    await open(page, "long-press");

    await tap(page, "#card");

    expect(await popupIsOpen(page)).toBe(false);
    expect(await activations(page, "#card")).toBe(1);
  });

  test("the tap that dismisses that menu is spared too", async ({ page }) => {
    // Both halves in one gesture sequence: raise the menu by a press
    // nothing answered, then dismiss it by one that is answered. Neither
    // may reach the card.
    await open(page, "long-press");
    await touchHold(page, "#card", 700);
    expect(await popupIsOpen(page)).toBe(true);

    await tap(page, "#card");

    expect(await popupIsOpen(page)).toBe(false);
    expect(await activations(page, "#card")).toBe(0);
  });
});

/**
 * The three sheet states against the two axes — the six cells the first
 * rounds of this unit each answered one of.
 *
 * Round 1 measured the expanded sheet only and made the menu hang
 * downward everywhere; the resting strip, which is the state the file
 * detail opens in, then had it off the bottom. Round 2 measured the
 * vertical axis in all three states and left the horizontal one a
 * constant; the row is drawn at the *right* of the strip, so the menu ran
 * off the right edge in all three. Round 3 drew the menu with three rows
 * while the addon declares five kinds, so the height the vertical
 * decision is made on was set by a sentence rather than by the component.
 *
 * ## Three outcomes, not two
 *
 * "On screen" and "off screen" cannot say what this row needs to say. A
 * box past the fold *inside a scroller* is reached by scrolling; the same
 * box past the fold with nothing to scroll is gone. Those are different
 * results and the defect this unit exists for is the second one, so the
 * table names which it expects:
 *
 * - `within` — the box is inside the frame the component measured
 *   against, and inside the viewport.
 * - `scrollable` — past the frame's visible edge, and the frame has grown
 *   enough scroll to reach it. A degradation, not a loss.
 * - `clipped` — past the frame with no scroll that reaches it. This is
 *   the failure the unit is about, and it is asserted only of directions
 *   the component does *not* pick.
 *
 * **The frame, not the viewport**, because those come apart exactly where
 * this matters: drawn upward at `half` the menu lands well inside the
 * screen and is still cut off, because the box it is inside is the
 * sheet's `overflow-auto` scroller and the menu starts above it. A test
 * that asked the viewport would call that arrangement fine. The frame is
 * walked here the way the component walks it.
 *
 * ## Why the vertical axis has no reversal inside the expanded sheet
 *
 * Measured, and worth stating as the mechanism rather than as the
 * outcome: expanded, the row is drawn about eleven pixels below the top
 * of the sheet's own scroller, which is the frame the walk finds. So
 * `spaceAbove` is ~11 whatever the snap is, `spaceAbove > spaceBelow` is
 * never true, and the flip is structurally unreachable in `half` and in
 * `full`. It is reachable in `peek`, where the walk stops at the `fixed`
 * strip and the frame is the viewport. That is why the answer is the same
 * at `half` and at `full`, and it stays true when the snap points move.
 *
 * ## Why `peek` is the state that can lose the menu
 *
 * The same difference decides what an overshoot costs. Expanded, the
 * frame is a scroller and it is `overflow-auto` in **both** axes, so a
 * box past either trailing edge grows the scroll and stays reachable —
 * measured, including horizontally, which is why the wrong horizontal
 * direction reads `scrollable` there rather than `clipped`. At `peek`
 * there is no scroller: the frame is the viewport, nothing grows, and a
 * box past the edge is gone. That is the state the file detail opens in
 * and the state both of this unit's shipped defects were in.
 *
 * A sheet that scrolls sideways is not a good outcome and is not being
 * defended here; it is what the measurement says, and calling it
 * `clipped` would be writing the expectation the table wanted rather
 * than the one the browser gives.
 *
 * What this cannot say is *which* direction the component picks — the
 * fixture takes that as a prop. `FileAIActionsButton.test.tsx` decides
 * it, and `componentFixtureParity.test.tsx` is what keeps this fixture
 * drawing the class list that component produces.
 */
type CellOutcome = "within" | "scrollable" | "clipped";

const CELLS: readonly {
  state: "peek" | "half" | "full";
  axis: "vertical" | "horizontal";
  arrangement: string;
  outcome: CellOutcome;
}[] = [
  // peek — the walk stops at the `fixed` strip, so the frame is the
  // viewport and there is nothing to scroll in either direction.
  { state: "peek", axis: "vertical", arrangement: "sheet-peek-up", outcome: "within" },
  { state: "peek", axis: "vertical", arrangement: "sheet-peek-down", outcome: "clipped" },
  { state: "peek", axis: "horizontal", arrangement: "sheet-peek-up", outcome: "within" },
  { state: "peek", axis: "horizontal", arrangement: "sheet-peek-left", outcome: "clipped" },

  // half — the frame is the sheet's own scroller, about 200px tall
  // against a menu of five rows. Neither direction fits it, and the
  // component picks the one whose overflow the scroller can reach.
  { state: "half", axis: "vertical", arrangement: "sheet-half-right", outcome: "scrollable" },
  { state: "half", axis: "vertical", arrangement: "sheet-half-up", outcome: "clipped" },
  { state: "half", axis: "horizontal", arrangement: "sheet-half-right", outcome: "within" },
  { state: "half", axis: "horizontal", arrangement: "sheet-half-left", outcome: "scrollable" },

  // full — the same frame with room below, so the picked direction is
  // inside the viewport outright and the reversal is off the top.
  { state: "full", axis: "vertical", arrangement: "sheet-full-right", outcome: "within" },
  { state: "full", axis: "vertical", arrangement: "sheet-full-up", outcome: "clipped" },
  { state: "full", axis: "horizontal", arrangement: "sheet-full-right", outcome: "within" },
  { state: "full", axis: "horizontal", arrangement: "sheet-full-left", outcome: "scrollable" },
] as const;

test.describe("the menu's box, in every sheet state and on both axes", () => {
  test("the table covers three states and two axes, and both directions of each", () => {
    // Counted as well as enumerated. Without the literal the table can be
    // walked back to any length and every case it still holds keeps
    // passing (detector rule 1, and rule 5's shape that keeps recurring).
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

    // Every state × axis draws **both** directions, and one of the two is
    // the one the component does not pick. Pooling the outcomes across
    // the whole table hid that `half · vertical` had a single row: the
    // vertical axis was discriminating in `peek` alone, and three
    // fixture mutations that reversed a direction left the run green.
    for (const state of ["peek", "half", "full"] as const) {
      for (const axis of ["vertical", "horizontal"] as const) {
        const rows = CELLS.filter((c) => c.state === state && c.axis === axis);
        expect(rows, `${state} · ${axis}`).toHaveLength(2);
        // One of the two has to be a direction that does *not* fit the
        // frame — `clipped` where nothing recovers it, `scrollable` where
        // the frame can be scrolled to it. Requiring `clipped`
        // specifically would be requiring the sheet not to scroll
        // sideways, which is a separate question from whether this axis
        // is measured at all.
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

        // The frame the component measured against, found the way the
        // component finds it: the first ancestor that clips, or the
        // viewport when the walk leaves through a `fixed` box.
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
        // And inside the screen, which the frame being on screen makes
        // true but does not say.
        const onScreen =
          cell.axis === "horizontal"
            ? m.left >= 0 && m.right <= m.vw
            : m.top >= 0 && m.bottom <= m.vh;
        expect(onScreen, `${where} — on screen on this axis`).toBe(true);
        return;
      }

      expect(within, `${where} — expected to be past the frame`).toBe(false);

      // Past the frame either way; which of the two it is, is whether the
      // frame can be scrolled far enough to bring it back — **on the axis
      // this cell is about**. Scrolling down does not recover a box that
      // is off to the right, and a box that overshoots the frame's top
      // starts above its content origin, where scrolling has nowhere to
      // go: only the trailing edge of each axis is recoverable.
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
