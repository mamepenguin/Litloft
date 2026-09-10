/**
 * A fixture lays out at the width the spec asked for.
 *
 * ## The defect this exists to make unreachable
 *
 * Chromium's `isMobile` emulation gives a page the mobile *layout*
 * viewport unless the page asks for the device width itself. A fixture
 * with no `<meta name="viewport">` opened under `isMobile` therefore lays
 * out around 980px however narrow the context is — the pointer is coarse,
 * the touch points are there, and the width is a different page's.
 *
 * That shipped here: a spec declared `375 x 667` and its fixture laid out
 * at 981, so `(min-width: 640px)` answered `true` under a heading that
 * says 375. Nothing was wrong on the screen, because that spec's subject
 * is a height the pointer decides. The next claim added there would have
 * been about a width, and it would have been quietly answered by a page
 * nobody was looking at. `review-workflow.md`'s detector rule 5, in the
 * form it names directly: **the parameters are part of the observation.**
 *
 * ## Why this measures rather than greps
 *
 * A scan for `<meta name="viewport">` in the markup is the shape
 * `review-workflow.md` rejects for stylesheets — there is no bounded list
 * of ways a page can end up with the wrong layout viewport, and a
 * whitelist of spellings loses to the next one. So each fixture is opened
 * under the hostile context and asked what width it actually got.
 *
 * ## What it holds
 *
 * That **every** fixture in this directory is safe to open under
 * `isMobile`, and that the context it says so in is one where an unsafe
 * page would fail — the first case builds a page with no viewport meta
 * and measures that it is caught, so removing the hostile half of the
 * setup fails here rather than quietly turning the rest into a tautology.
 *
 * It holds that for every fixture, not only the ones that use `isMobile`
 * today. One spec here does
 * (`popup-dismiss.spec.ts`, whose two viewports straddle the `sm`
 * breakpoint and so depend on the width being real); the rest do not, and
 * a later author adding it should not have to know this trap exists.
 *
 * It says nothing about what any fixture draws. That is each spec's own
 * subject.
 */

import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_DIR = resolve(__dirname, "fixtures");

/**
 * Every fixture this directory holds, written out.
 *
 * Declared rather than read off the directory, so the two can disagree:
 * a fixture added without a thought for its layout viewport appears on
 * disk and not here, and the case below goes red naming it. Deleting one
 * removes it from both at once, which is why the length is written out as
 * a literal beside them (detector rule 1, and rule 5's "never build the
 * expected value out of the observation").
 */
const FIXTURES = [
  "addon-policy.html",
  "button-touch-floor.html",
  "file-actions-menu.html",
  "justified-grid.html",
  "list-row-furniture.html",
  "mobile-inspector-sheet.html",
  "popup-dismiss.html",
  "related-files.html",
] as const;

const FIXTURE_COUNT = 8;

/**
 * The context the trap needs, and a viewport narrow enough that the
 * mobile default cannot be mistaken for it.
 *
 * 375 is the phone width the reports in this workstream were made at, and
 * it is on the far side of `sm` from Chromium's ~980px default — so a
 * page that fell back reads `true` for `(min-width: 640px)` and this file
 * says which one it is rather than only that the number moved.
 */
const WIDTH_PX = 375;
const HEIGHT_PX = 667;

test.describe("a fixture lays out at the width it was given", () => {
  test.use({
    viewport: { width: WIDTH_PX, height: HEIGHT_PX },
    hasTouch: true,
    // The hostile half, and the one this file is about. Deleting it used
    // to disarm every case below — a detector that stops detecting when
    // one line of its own setup goes. The negative control below is what
    // makes that edit fail.
    isMobile: true,
  });

  test("the context is one the trap can occur in", async ({ page }) => {
    // The negative control, and the only case here that `isMobile` arms.
    //
    // Every case below asserts that a fixture was *not* caught by the
    // trap, which is equally true of a context where the trap cannot
    // happen at all — so the enumeration on its own cannot tell "every
    // fixture declares a viewport" from "`isMobile` is not set", and the
    // whole file passes either way. This case separates them: a page that
    // does not ask for the device width, opened in the same context, and
    // required to come back with a width that is not the one the context
    // declared.
    //
    // Built here rather than borrowed from the directory because every
    // fixture there is expected to be immune, and an immune page cannot
    // show that the context bites.
    await page.setContent(
      "<!doctype html><html><head><title>no viewport meta</title></head>" +
        "<body>measured, not asked</body></html>",
    );

    const measured = await page.evaluate((width) => ({
      laidOutAtTheContextWidth: window.innerWidth === width,
      aboveSm: window.matchMedia("(min-width: 640px)").matches,
      coarse: window.matchMedia("(pointer: coarse)").matches,
    }), WIDTH_PX);

    // Booleans, declared: the fallback width itself is Chromium's number
    // and would make this a case about the emulator's version. What has
    // to hold is that the page did *not* get the context's width and did
    // cross `sm` — which is the consequence every case below denies.
    expect(measured).toEqual({
      laidOutAtTheContextWidth: false,
      aboveSm: true,
      coarse: true,
    });
  });

  test("the fixtures checked are the fixtures on disk", () => {
    const onDisk = readdirSync(FIXTURE_DIR)
      .filter((name) => name.endsWith(".html"))
      .sort();
    expect(onDisk).toHaveLength(FIXTURE_COUNT);
    expect(onDisk).toEqual([...FIXTURES].sort());
  });

  for (const fixture of FIXTURES) {
    test(fixture, async ({ page }) => {
      await page.goto(pathToFileURL(resolve(FIXTURE_DIR, fixture)).href);

      const measured = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        aboveSm: window.matchMedia("(min-width: 640px)").matches,
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }));

      // The width, against the literal above rather than against anything
      // read back from the page.
      expect(measured.innerWidth).toBe(WIDTH_PX);
      expect(measured.clientWidth).toBe(WIDTH_PX);

      // Not the detection — the message. Measured: with the meta taken
      // off a fixture, deleting this line still leaves the case red on
      // `innerWidth` above. It is here so the failure says which
      // *consequence* a reader was about to inherit, in the units the
      // specs around it are written in, rather than only that a number
      // moved.
      expect(measured.aboveSm).toBe(false);

      // `hasTouch`'s consequence, not `isMobile`'s, though the two are
      // set together above: this pins the pointer type a fixture's own
      // spec reads when it drives a tap. What holds `isMobile` is the
      // negative control at the top of the block, not this line.
      expect(measured.coarse).toBe(true);
    });
  }
});
