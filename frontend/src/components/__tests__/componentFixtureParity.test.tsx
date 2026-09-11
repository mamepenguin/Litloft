/**
 * The component fixture's *page*, against the screens it imitates.
 *
 * `e2e-components/` bundles the real `DismissScrim`, `ContextMenu` and
 * `useContextMenu` — that half needs no parity test, and a mutation proves
 * it: delete the arming line from the primitive and the browser run goes
 * red. What it hand-writes is the page around them, because
 * `SelectionBar` and `InspectorShell` need
 * Next.js, `next-intl` and a backend. `review-workflow.md` asks for a
 * parity test per fixture for exactly this reason, and this is it.
 *
 * The gap it closes is one-directional and worth stating. The app side is
 * already pinned on its own (`SelectionBar.test.tsx` fails if the bar
 * leaves `z-50`), so an author moving a real tier gets a red test — and
 * had nothing telling them the fixture two directories away still claims
 * the old value. Measured before this file existed: dropping the fixture's
 * bar to `z-10`, deleting the sticky strip and deleting the `translate3d`
 * all left the eight browser cases green **under titles that still named
 * them**.
 *
 * The browser suite now also measures those facts at runtime, from
 * computed styles, before each tap. That catches the fixture drifting; it
 * cannot catch the *app* moving and the fixture staying still, which is
 * what this file is for.
 *
 * jsdom renders nothing here. Every assertion is a comparison of source
 * text, which is what a claim about "the fixture says what the component
 * says" is.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../..");
const FIXTURE = resolve(HERE, "../../../e2e-components/fixtures/app.tsx");

const read = (path: string): string => readFileSync(path, "utf8");

const fixture = read(FIXTURE);

/** The class list of the fixture element with this `id`. */
function fixtureClasses(id: string): string[] {
  const el = new RegExp(`id="${id}"[^>]*className="([^"]*)"`).exec(fixture);
  if (!el) throw new Error(`the fixture has no #${id} with a class list`);
  return el[1].split(/\s+/).filter(Boolean);
}

/** Positioning is what an arrangement is made of; colour and padding are not. */
const POSITIONING = /^(fixed|absolute|sticky|relative|inset-.+|top-.+|bottom-.+|left-.+|right-.+|z-.+)$/;

function positioningOf(classList: string): string[] {
  return classList.split(/\s+/).filter((c) => POSITIONING.test(c));
}

/**
 * The addon's source, when the addon is linked.
 *
 * `design-decisions.md` §Addons: "In-process addon enable/disable is
 * controlled by adding/removing a symlink. Do not modify core code." A
 * core test that reads through that symlink unguarded turns removing it
 * — or cloning without `--recurse-submodules` — into a core failure,
 * which is core code the addon's absence modifies. The guard is
 * `file-kind-parity.test.ts`'s, two directories over, for the same
 * reason.
 *
 * The directory-not-empty half matters separately: an initialised
 * submodule that has lost this file is a stale pin, and that is a real
 * defect rather than a disabled addon.
 */
const ADDON_DIR = resolve(SRC, "addons/intelligence");
const ADDON_MENU = resolve(ADDON_DIR, "FileAIActionsButton.tsx");
const addonLinked =
  existsSync(ADDON_DIR) && readdirSync(ADDON_DIR).length > 0;

describe("the component fixture's page", () => {
  it("puts the bottom bar where SelectionBar puts it", () => {
    // Round 5's worst case: the scrim and the menu live inside this bar,
    // and no scrim tier could clear it. The arrangement is only that case
    // while the fixture's bar carries the real bar's box and tier.
    const bar = /className="(fixed bottom-0[^"]*)"/.exec(
      read(resolve(SRC, "components/SelectionBar.tsx")),
    );
    expect(bar, "SelectionBar no longer declares a fixed bottom bar").not.toBe(
      null,
    );

    expect(fixtureClasses("bar")).toEqual(
      expect.arrayContaining(positioningOf(bar![1])),
    );
    // Named as well as compared, so a reader of a failure sees which value
    // moved rather than two lists.
    expect(positioningOf(bar![1])).toContain("z-50");
  });

  it("gives the tab strip InspectorShell's own tier", () => {
    // The strip is written *after* the scrim inside the drawer, which is
    // the half that made "the scrim is above the chrome" impossible to
    // state as a number. `sticky top-0 z-10` is the shape it has in column
    // mode — the sheet's mode.
    const strip = /sticky top-0 z-\[?\d+\]?/.exec(
      read(resolve(SRC, "components/FileDetail/inspector/InspectorShell.tsx")),
    );
    expect(strip, "InspectorShell no longer declares a sticky strip").not.toBe(
      null,
    );

    expect(fixtureClasses("tabstrip").join(" ")).toContain(strip![0]);
  });

  it("stands in for a drawer that really is transformed", () => {
    // The transform is vaul's, not ours: `Drawer.Content` is what carries
    // it at runtime, so there is no class in this tree to compare against
    // and the fixture writes its own `translate3d`. What can be pinned is
    // that the arrangement is still real — the sheet still renders a
    // `Drawer.Content`, and it is still the `fixed bottom-0` box a
    // `fixed` descendant would otherwise resolve against the viewport
    // from.
    const sheet = read(resolve(SRC, "components/MobileInspectorSheet.tsx"));
    expect(sheet).toContain("<Drawer.Content");
    expect(/<Drawer\.Content[\s\S]{0,400}?className="fixed bottom-0/.test(sheet)).toBe(
      true,
    );

    // And that the fixture's stand-in has a transform at all. Deleting it
    // turns `transformed` into a second copy of `plain`, which is one of
    // the three mutations that used to leave the browser suite green.
    expect(fixture).toMatch(/transform: "translate3d\(/);
  });

  it.runIf(addonLinked)(
    "is pinned to an intelligence that still has the menu",
    () => {
      expect(
        existsSync(ADDON_MENU),
        `${ADDON_MENU} is missing while the submodule is initialised — stale pin?`,
      ).toBe(true);
    },
  );

  it.runIf(addonLinked && existsSync(ADDON_MENU))(
    "gives #anchored the positioning FileAIActionsButton produces",
    () => {
    // The link the chain was missing. `e2e-components` measures the
    // fixture's boxes; the addon's own suite decides which direction the
    // component picks. Nothing joined the two, so the fixture could
    // measure a menu the component does not draw — and did: while the
    // component hung the menu rightward unconditionally, the browser
    // suite was green about a box that was 134px off the right edge of a
    // 393px phone.
    //
    // Core's vitest follows `src/addons/*`, so the addon's source is
    // readable from here. Compared as **sets of positioning tokens** and
    // written out on both sides: which of `left-0` / `right-0` the
    // component picks for a given box is the addon suite's question, and
    // whether that box is on screen is the browser suite's. This one asks
    // only that the fixture is drawing from the same vocabulary.
    const component = read(ADDON_MENU);
    // Anchored on the template itself rather than on `role="menu"`: the
    // two are separated by a comment block that grows, and a distance
    // limit is a needle that goes stale without going red.
    const menu = /className=\{`(absolute [^`]*min-w-\[240px\][^`]*)`\}/.exec(
      component,
    );
    expect(
      menu,
      "FileAIActionsButton no longer declares its menu class list inline",
    ).not.toBe(null);

    // The template's conditionals are spelled as string literals inside
    // it, so every direction the component can take is in this text.
    const componentTokens = new Set(positioningOf(menu![1].replace(/[${}?:"]/g, " ")));

    const fixtureMenu = /id="anchored"[\s\S]*?className=\{`([^`]*)`\}/.exec(
      fixture,
    );
    expect(fixtureMenu, "the fixture has no #anchored template").not.toBe(null);
    const fixtureTokens = new Set(
      positioningOf(fixtureMenu![1].replace(/[${}?:"]/g, " ")),
    );

    // Declared, not derived from either side: a token dropped from both
    // at once would leave a comparison of the two sets equal.
    const EXPECTED = [
      "absolute",
      "bottom-full",
      "left-0",
      "right-0",
      "top-full",
      "z-30",
    ];
    expect([...componentTokens].sort()).toEqual(EXPECTED);
    expect([...fixtureTokens].sort()).toEqual(EXPECTED);

    // The gap is not a positioning token, and it was the other half of
    // the same hole: changing `mt-1`/`mb-1` to `mt-8`/`mb-8` moved the
    // menu 28px off its trigger with every test in both repositories
    // green. It is tied to the constant the component compares against,
    // so the class and the arithmetic cannot drift apart — `MENU_GAP_PX`
    // is added to the menu's height to ask whether it fits below, and a
    // menu that is drawn 32px away while 4px is reserved for it fits
    // where the decision says it does not.
    //
    // Tailwind's spacing step is 4px, and that 4 is written here rather
    // than derived from the class being checked.
    const gap = /const MENU_GAP_PX = (\d+);/.exec(component);
    expect(gap, "FileAIActionsButton no longer declares MENU_GAP_PX").not.toBe(
      null,
    );
    const step = Number(gap![1]) / 4;
    expect(menu![1]).toContain(`mt-${step}`);
    expect(menu![1]).toContain(`mb-${step}`);
    },
  );

  it("bounds #pane the way TwoPaneLayout bounds its tree column", () => {
    // The arrangement the desktop project exists for. What makes it worth
    // drawing is a frame whose **right edge is inside the viewport**, and
    // that is a property of two classes on `TwoPaneLayout`'s `<aside>`: an
    // `overflow` value the walk recognises, and a width that is not the
    // window's. Lose either in the app and the fixture is measuring a box
    // the tree no longer has.
    //
    // Compared as facts rather than as a class list: the aside carries a
    // transition and a width expression this fixture has no reason to
    // copy, and pinning the whole string would go red on every unrelated
    // edit to it.
    const layout = read(resolve(SRC, "components/folder/TwoPaneLayout.tsx"));
    const aside = /<aside\n\s+className=\{`([^`]*)`\}/.exec(layout);
    expect(aside, "TwoPaneLayout no longer declares its aside inline").not.toBe(
      null,
    );

    // The clipping half. `clippingFrame` tests `/auto|scroll|hidden/`, so
    // an aside that became `overflow-clip` would stop being a frame the
    // walk can see at all — which is the case
    // `src/__tests__/anchoredDropdowns.test.ts` enumerates.
    expect(aside![1]).toContain("overflow-hidden");
    expect(fixtureClasses("tree-pane")).toContain("overflow-hidden");

    // The narrowness half. The app's width is on the aside's inner box;
    // both sides are written out, and the fixture's is the same number
    // because a column of some other width is a column with some other
    // answer.
    expect(layout).toContain('className="flex h-full w-[100vw] flex-col md:w-[280px]"');
    expect(fixtureClasses("tree-pane")).toContain("w-[280px]");

    // And the fixture's column is bounded on the *left*, which is the
    // whole point: `InspectorColumn` beside it is `right-0` and flush with
    // the window, so its frame's right edge and the visible band's are the
    // same number and the axis cannot be separated there.
    expect(fixtureClasses("tree-pane")).toContain("left-0");
    expect(fixtureClasses("tree-pane")).not.toContain("right-0");
  });

  it("gives the dialog arrangement FileSaveDialog's own root", () => {
    // `FolderPicker`'s four dialog callers are the reason the picker can
    // end below the fold: a dialog root is `fixed inset-0`, so the walk
    // stops there and the frame is the visible band, and nothing scrolls
    // behind a centred dialog to recover the overhang.
    //
    // That stop is a property of `position: fixed` on the root. A dialog
    // that became `absolute` inside a scroller would hand the walk a
    // different box, and the browser case would be measuring an
    // arrangement the app does not have.
    const dialog = read(resolve(SRC, "components/FileSaveDialog.tsx"));
    const root = /className="(fixed inset-0[^"]*)"\n\s+role="dialog"/.exec(
      dialog,
    );
    expect(root, "FileSaveDialog no longer opens with a fixed inset-0 root").not.toBe(
      null,
    );
    const EXPECTED_ROOT = ["fixed", "inset-0", "z-[100]"];
    expect(positioningOf(root![1]).sort()).toEqual(EXPECTED_ROOT);

    const fixtureRoot =
      /<div className="(fixed inset-0 z-\[100\][^"]*)">\n\s+<div className="absolute inset-0 bg-black\/60" \/>/.exec(
        fixture,
      );
    expect(fixtureRoot, "the fixture has no dialog root").not.toBe(null);
    expect(positioningOf(fixtureRoot![1]).sort()).toEqual(EXPECTED_ROOT);

    // The picker's height does not follow the viewport, which is what
    // makes the vertical answer load-bearing here rather than cosmetic.
    //
    // Stated precisely, because the loose version of it is false: the
    // panel is not uncapped — its folder list scrolls at `max-h-48`. What
    // it has no cap *against* is the viewport. `AddButton` and the toolbar
    // surface are `max-h-[60vh]` / `[70vh]`, so on a short screen they
    // shrink; a fixed 192px list plus a filter row plus a breadcrumb that
    // wraps is the same height whatever the screen is. A trigger low in a
    // centred dialog therefore has a panel that is too tall for the room
    // below however small the room gets.
    const picker = read(resolve(SRC, "components/FolderPicker.tsx"));
    expect(picker).toContain("max-h-48");
    expect(/max-h-\[\d+vh\]/.test(picker)).toBe(false);
    expect(/max-h-\[\d+vh\]/.test(read(resolve(SRC, "components/AddButton.tsx")))).toBe(
      true,
    );
  });

  it("names the arrangements the browser suite runs", () => {
    // The two files are edited apart, so the fixture's own table is pinned
    // here as well as in the spec: an arrangement deleted from the page
    // would otherwise leave the spec's entry pointing at a hash the
    // fixture answers with a thrown error, which is a red run for the
    // wrong reason.
    const declared = [...fixture.matchAll(/^\s{2}"?([a-z-]+)"?: \w+,$/gm)].map(
      (m) => m[1],
    );
    expect(declared).toEqual([
      "plain",
      "bottom-bar",
      "transformed",
      "long-press",
      "sheet",
      "sheet-peek-down",
      "sheet-peek-up",
      "sheet-peek-left",
      "sheet-half-right",
      "sheet-half-up",
      "sheet-half-left",
      "sheet-full-right",
      "sheet-full-left",
      "sheet-full-up",
      "sheet-gesture",
      "sheet-gesture-short",
      "measured-sheet-peek",
      "measured-sheet-half",
      "measured-sheet-full",
      "measured-inspector-left-edge",
      "measured-inspector-right-edge",
      "measured-tree-pane",
      "measured-picker-in-dialog",
    ]);
  });
});
