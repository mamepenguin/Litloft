/**
 * The one frame in the tree whose right edge is not the window's.
 *
 * ## Why this file is separate, and desktop
 *
 * `anchored-direction.spec.ts` beside it runs at Pixel 5's 393px, which is
 * what everything else in this target measures — those are touch behaviours,
 * and the sheet's three states only exist on a phone. This file is the
 * exception: it draws `TwoPaneLayout`'s tree column, which is `w-[100vw]`
 * below `md` and `md:w-[280px]` above it. At 393 the column *is* the window
 * and there is nothing to measure; a 280px column drawn there would be a
 * fixture of an arrangement the app does not have.
 *
 * `playwright-components.config.ts` gives this file its own project and keeps
 * the other three out of it. The mapping is asserted in
 * `spec-viewport.spec.ts` rather than trusted.
 *
 * ## What it holds that nothing else can
 *
 * `clippingFrame` collects all four edges of the box that clips a panel, and
 * the frame the arithmetic uses is that box **intersected** with the visible
 * band. Everywhere else in the tree those two agree on the right-hand edge:
 * `InspectorPane` is `w-96` at the end of a full-width row and flush against
 * the window in both of its forms, and the sheet spans the viewport. So a
 * walk that collected no `right` at all is rescued by the intersection, and
 * unit J's first half reported exactly that as a survivor it could not kill
 * in a browser.
 *
 * A column bounded on the *left* is where they separate: the frame ends
 * 280px in, the window ends at 1280, and a panel measured against the wrong
 * one gets the opposite answer. That is the case below.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { DESKTOP_VIEWPORT } from "./projects";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function openAt(
  page: Page,
  arrangement: string,
): Promise<{ openUp: boolean; side: string }> {
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  await expect(page.locator("#trigger")).toBeVisible();
  await page.locator("#trigger").click();
  await expect(page.locator("#anchored")).toBeVisible();
  // `animate-fade-in-scale` starts at `scale(.95)`, and a box read during it
  // reports 95% of every number.
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const el = document.getElementById("anchored")!;
    return {
      openUp: el.dataset.openUp === "true",
      side: el.dataset.side ?? "",
    };
  });
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

async function box(page: Page, selector: string): Promise<Box> {
  const rect = await page.locator(selector).boundingBox();
  if (!rect) throw new Error(`${selector} has no box`);
  return {
    top: rect.y,
    bottom: rect.y + rect.height,
    left: rect.x,
    right: rect.x + rect.width,
  };
}

test("the run's context is the desktop one, and above md", async ({ page }) => {
  // The control, and the mirror of `spec-viewport.spec.ts`'s for the phone
  // project. Every case below is about a column narrower than the window; at
  // a width where `md` did not match, the fixture's own `md:` classes would
  // draw a different column and the assertions would be about something
  // else. Booleans and the config's own literals, so a project renamed or
  // resized fails here rather than quietly measuring the wrong arrangement.
  await page.goto(FIXTURE);
  expect(page.viewportSize()).toEqual({ ...DESKTOP_VIEWPORT });
  const measured = await page.evaluate(() => ({
    aboveMd: window.matchMedia("(min-width: 768px)").matches,
    innerWidth: window.innerWidth,
  }));
  expect(measured.aboveMd).toBe(true);
  expect(measured.innerWidth).toBe(DESKTOP_VIEWPORT.width);
});

test("a menu in a column bounded on the left takes the column's right edge, not the window's", async ({
  page,
}) => {
  const answer = await openAt(page, "measured-tree-pane");
  const pane = await box(page, "#tree-pane");
  const menu = await box(page, "#anchored");
  const viewport = page.viewportSize()!;

  // The premise. If the column ever became flush with the window this case
  // would still pass while measuring nothing, which is the shape the
  // arrangement exists to avoid — so it is asserted rather than assumed.
  expect(pane.right).toBeLessThan(viewport.width);

  // The trigger prefers the left edge and has no room there. Only a frame
  // that knows where the column ends can say so: measured against the
  // window, the room to the right of the trigger's left edge is a thousand
  // pixels and nothing flips.
  expect(answer.side).toBe("right");

  // And the box that answer produced is inside the column, which is what the
  // side is *for*: the aside is `overflow-hidden`, so anything past its edge
  // is not merely off-centre, it is not drawn.
  expect(menu.left).toBeGreaterThanOrEqual(pane.left);
  expect(menu.right).toBeLessThanOrEqual(pane.right);
});

test("the folder picker near the foot of a dialog opens upward", async ({
  page,
}) => {
  const answer = await openAt(page, "measured-picker-in-dialog");
  const menu = await box(page, "#anchored");
  const trigger = await box(page, "#trigger");
  const viewport = page.viewportSize()!;

  // The premise: the trigger is low enough that a downward panel would not
  // fit. Without this the case passes on a dialog that happened to be short.
  expect(viewport.height - trigger.bottom).toBeLessThan(menu.bottom - menu.top);

  // A modal dialog root is `fixed inset-0`, so the walk stops there and the
  // frame is the visible band. Nothing scrolls behind a centred dialog, and
  // this panel's height does not follow the viewport — its list caps at a
  // fixed 192px rather than at a fraction of the screen — so a downward
  // answer here is a folder list that cannot be reached at all.
  expect(answer.openUp).toBe(true);
  expect(menu.top).toBeGreaterThanOrEqual(0);
  expect(menu.bottom).toBeLessThanOrEqual(viewport.height);
});
