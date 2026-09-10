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
 * `isMobile`, not only the ones that use it today. One spec here does
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
    // The hostile half. Everything here would pass without it.
    isMobile: true,
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

      // The precondition. Without it this case would hold for a context
      // where `isMobile` never applied, which is the one arrangement the
      // trap cannot occur in.
      expect(measured.coarse).toBe(true);
    });
  }
});
