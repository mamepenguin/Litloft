/**
 * The component fixture lays out at the width its config asked for.
 *
 * ## The defect this exists to make unreachable
 *
 * Chromium's `isMobile` emulation gives a page the mobile *layout*
 * viewport unless the page asks for the device width itself. A page with
 * no `<meta name="viewport">` opened under `isMobile` therefore lays out
 * around 980px however narrow the context is — the pointer is coarse, the
 * touch points are there, and the width is a different page's.
 *
 * `e2e-layout/spec-viewport.spec.ts` holds that for the static fixtures
 * beside it, after the trap shipped there. This target was outside its
 * population, and it is the one where the trap is armed at every moment
 * rather than in the specs that opt in: `playwright-components.config.ts`
 * runs the whole directory on `Pixel 5`, which is `isMobile`.
 *
 * What the width decides here is not cosmetic. The fixture's dismiss
 * scrim carries `sm:hidden`, so a page that fell back to the mobile
 * default has no scrim at all — `display: none` — and every case that
 * taps one would be measuring an arrangement that is not the one on
 * screen. `popup-dismiss.spec.ts` also builds its viewport frame out of
 * `window.innerWidth`, so a width that is not the context's silently
 * redefines the box it checks against.
 *
 * ## Why this is a sibling rather than a widened population
 *
 * Three things differ from `e2e-layout`, and each of them would have to
 * be faked to fold this in:
 *
 *  - **The artefact.** What a case here opens is `.build/index.html`,
 *    which vite emits and `build-bundle.ts` then rewrites the script tag
 *    of. Reading `fixtures/index.html` off disk measures a page nothing
 *    opens.
 *  - **The context.** `e2e-layout`'s file declares `375 x 667` and
 *    `isMobile` for itself, over a config whose device is desktop. Here
 *    the context is the config's, and pinning it is half of what this
 *    file is for.
 *  - **The build.** The page exists only after the components config's
 *    own `globalSetup` has run.
 *
 * ## What it holds
 *
 * That every page this target's build emits is safe to open under the
 * context the config gives it, and that the context is one where an
 * unsafe page would fail — the first case builds a page with no viewport
 * meta and measures that it is caught, so a config that stopped being
 * `isMobile` fails here rather than quietly turning the rest into a
 * tautology.
 *
 * Its limit: a case that calls `page.setContent` writes its own markup,
 * and no enumeration of the build output can reach it.
 *
 * It says nothing about what the fixture draws. That is
 * `popup-dismiss.spec.ts`'s subject, and `componentFixtureParity.test.tsx`
 * pins the fixture against the components it stands in for.
 */

import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { OUT_DIR, PAGE } from "./build-bundle";
import { DESKTOP_ONLY } from "./projects";

/**
 * Every page the build emits, written out.
 *
 * Declared rather than read off the directory, so the two can disagree: a
 * page added without a thought for its layout viewport appears on disk
 * and not here, and the case below goes red naming it.
 *
 * The count is a literal beside them for the reason
 * `e2e-layout/spec-viewport.spec.ts` gives at eight entries — a
 * simultaneous deletion from both sides leaves a derived count agreeing
 * with itself. Be exact about what it buys *here*: with one page the
 * `toEqual` already carries the case, and deriving the count survives
 * (measured). The literal is what keeps the case true the day a second
 * page is added, which is when nobody re-reads this.
 */
const PAGES = ["index.html"] as const;

const PAGE_COUNT = 1;

/**
 * The context `playwright-components.config.ts` gives every case in this
 * directory, as a pair of literals rather than as a read of the same
 * device table the config reads.
 *
 * Reading `devices["Pixel 5"]` here would make this agree with the config
 * by construction and say nothing. Written out, changing the config's
 * device is an edit that fails here — which is the moment to re-read the
 * two claims below that depend on the number: that 393 is under `sm`, so
 * a page which fell back is on the other side of the breakpoint the
 * fixture's scrim turns on, and that it is far enough under Chromium's
 * ~980px default that the two cannot be confused.
 */
const DEVICE_WIDTH_PX = 393;
const DEVICE_HEIGHT_PX = 727;

/**
 * Which spec runs at which width, declared here as well as in the config.
 *
 * The config gained a second, desktop project for the one arrangement that
 * cannot be drawn at 393px. That makes "which width did this spec run at" a
 * question with two answers, and this file's whole subject is that the
 * answer a spec got is the one it was promised.
 *
 * Enumerated by file, both sides. A `testMatch` naming a file that no longer
 * exists silently runs nothing; a spec added to the directory and to neither
 * project's rule silently runs at whichever width the default gives it.
 * Written out here, either is a failure that names the file.
 *
 * The desktop side is the config's own export rather than a second copy of
 * the glob — a copy is a thing that can disagree — while the *membership* is
 * declared, which is the half a read of the config cannot give.
 */
const AT_THE_PHONE_WIDTH = [
  "anchored-direction.spec.ts",
  "popup-dismiss.spec.ts",
  "sheet-gesture.spec.ts",
  "spec-viewport.spec.ts",
] as const;

const AT_THE_DESKTOP_WIDTH = ["anchored-direction-desktop.spec.ts"] as const;

test.describe("the component fixture lays out at the width it was given", () => {
  test("every spec in this directory is assigned to exactly one project", () => {
    // The spec directory, reached through the build's own output rather
    // than through `import.meta.url`: `build-bundle.ts` is CJS (it uses
    // `__dirname`), and one `import.meta` in this file flips it to ESM and
    // breaks that import at load.
    const onDisk = readdirSync(resolve(OUT_DIR, ".."))
      .filter((name) => name.endsWith(".spec.ts"))
      .sort();

    // Every spec is claimed once. `toEqual` on the union, and the two lists
    // kept apart, so moving a file between widths is an edit to both sides
    // and adding one is an edit to neither — which is the failure.
    expect([...AT_THE_PHONE_WIDTH, ...AT_THE_DESKTOP_WIDTH].sort()).toEqual(
      onDisk,
    );
    expect(
      AT_THE_PHONE_WIDTH.filter((name) =>
        (AT_THE_DESKTOP_WIDTH as readonly string[]).includes(name),
      ),
    ).toEqual([]);

    // And the desktop list is what the config actually routes. The glob is
    // a suffix match on the path, so this is the same question Playwright
    // asks, put to the same string.
    const suffix = DESKTOP_ONLY.replace(/^\*\*\//, "");
    expect(AT_THE_DESKTOP_WIDTH).toEqual([suffix]);

    // The negative half: nothing at the phone width matches the desktop
    // rule. Without it the glob could widen to `**/*.spec.ts` and the two
    // lists above would still agree with each other.
    for (const name of AT_THE_PHONE_WIDTH) expect(name).not.toBe(suffix);
  });

  test("the context is one the trap can occur in", async ({ page }) => {
    // The negative control, and the only case here that `isMobile` arms.
    //
    // Every case below asserts that a page was *not* caught by the trap,
    // which is equally true of a context where the trap cannot happen at
    // all — so the enumeration on its own cannot tell "the page declares
    // a viewport" from "the config is no longer `isMobile`", and the
    // whole file passes either way. This case separates them.
    //
    // Built here rather than borrowed from the build, because the page
    // there is expected to be immune and an immune page cannot show that
    // the context bites.
    await page.setContent(
      "<!doctype html><html><head><title>no viewport meta</title></head>" +
        "<body>measured, not asked</body></html>",
    );

    const measured = await page.evaluate(
      (width) => ({
        laidOutAtTheContextWidth: window.innerWidth === width,
        aboveSm: window.matchMedia("(min-width: 640px)").matches,
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }),
      DEVICE_WIDTH_PX,
    );

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

  test("the run's context is the one the literals above describe", ({
    page,
  }) => {
    // The other half of the control. `isMobile` being on is checked by
    // the case above; this checks the size it is on at, because the two
    // claims below — under `sm`, and nowhere near the fallback — are
    // properties of 393 rather than of any phone.
    expect(page.viewportSize()).toEqual({
      width: DEVICE_WIDTH_PX,
      height: DEVICE_HEIGHT_PX,
    });
  });

  test("the pages checked are the pages the build emitted", () => {
    const onDisk = readdirSync(OUT_DIR)
      .filter((name) => name.endsWith(".html"))
      .sort();
    expect(onDisk).toHaveLength(PAGE_COUNT);
    expect(onDisk).toEqual([...PAGES].sort());

    // And the enumeration is of the thing the other spec opens, not of a
    // directory that happens to sit beside it.
    expect([...PAGES]).toContain(basename(PAGE));
  });

  for (const emitted of PAGES) {
    test(emitted, async ({ page }) => {
      await page.goto(pathToFileURL(resolve(OUT_DIR, emitted)).href);

      const measured = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        aboveSm: window.matchMedia("(min-width: 640px)").matches,
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }));

      // The width, against the literal above rather than against anything
      // read back from the page.
      expect(measured.innerWidth).toBe(DEVICE_WIDTH_PX);
      expect(measured.clientWidth).toBe(DEVICE_WIDTH_PX);

      // Not the detection — the message. The width above is what goes red
      // first; this says which *consequence* a reader was about to
      // inherit, and it is the one that decides whether the fixture has a
      // scrim to tap.
      expect(measured.aboveSm).toBe(false);

      // `hasTouch`'s consequence rather than `isMobile`'s, though the
      // device sets both: this pins the pointer type the gestures in
      // `popup-dismiss.spec.ts` are synthesised for.
      expect(measured.coarse).toBe(true);
    });
  }
});
