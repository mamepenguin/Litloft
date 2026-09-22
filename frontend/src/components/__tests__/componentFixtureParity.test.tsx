/**
 * The component fixture hand-writes the page around the real components,
 * because `SelectionBar` and `InspectorShell` need Next.js, `next-intl` and
 * a backend; this catches the app moving while the fixture stays still.
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
 * Guarded so an addon that is not checked out is not a core failure. An
 * initialised submodule that has lost the file is a stale pin, which is.
 */
const ADDON_DIR = resolve(SRC, "addons/intelligence");
const ADDON_MENU = resolve(ADDON_DIR, "FileAIActionsButton.tsx");
const addonLinked =
  existsSync(ADDON_DIR) && readdirSync(ADDON_DIR).length > 0;

describe("the component fixture's page", () => {
  it("puts the bottom bar where SelectionBar puts it", () => {
    const bar = /className="(fixed bottom-0[^"]*)"/.exec(
      read(resolve(SRC, "components/SelectionBar.tsx")),
    );
    expect(bar, "SelectionBar no longer declares a fixed bottom bar").not.toBe(
      null,
    );

    expect(fixtureClasses("bar")).toEqual(
      expect.arrayContaining(positioningOf(bar![1])),
    );
    expect(positioningOf(bar![1])).toContain("z-50");
  });

  it("gives the tab strip InspectorShell's own tier", () => {
    const strip = /sticky top-0 z-\[?\d+\]?/.exec(
      read(resolve(SRC, "components/FileDetail/inspector/InspectorShell.tsx")),
    );
    expect(strip, "InspectorShell no longer declares a sticky strip").not.toBe(
      null,
    );

    expect(fixtureClasses("tabstrip").join(" ")).toContain(strip![0]);
  });

  it("stands in for a drawer that really is transformed", () => {
    // The transform is vaul's, applied to `Drawer.Content` at runtime, so
    // there is no class in this tree to compare against.
    const sheet = read(resolve(SRC, "components/MobileInspectorSheet.tsx"));
    expect(sheet).toContain("<Drawer.Content");
    expect(/<Drawer\.Content[\s\S]{0,400}?className="fixed bottom-0/.test(sheet)).toBe(
      true,
    );

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
    const component = read(ADDON_MENU);
    // Anchored on the template itself rather than on `role="menu"`: a
    // distance limit between the two goes stale without going red.
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

    // `MENU_GAP_PX` is reserved in the component's fit decision, so the gap
    // class must match it. Tailwind's spacing step is 4px.
    const gap = /const MENU_GAP_PX = (\d+);/.exec(component);
    expect(gap, "FileAIActionsButton no longer declares MENU_GAP_PX").not.toBe(
      null,
    );
    const step = Number(gap![1]) / 4;
    expect(menu![1]).toContain(`mt-${step}`);
    expect(menu![1]).toContain(`mb-${step}`);
    },
  );

  it("copies the scroller the transition names, including its own colour", () => {
    // The browser suite measures the fixture's scroller, so what it holds
    // about a snapshot — bounded by the window, opaque — is only true of
    // the app while this copy matches it.
    const layout = read(resolve(SRC, "components/folder/TwoPaneLayout.tsx"));
    const section = /<section\n[^>]*className=\{`([^`]*)`\}[^>]*data-listing-scroller/.exec(
      layout,
    );
    expect(
      section,
      "TwoPaneLayout no longer names a scroller for the transition",
    ).not.toBe(null);

    const fixtureScroller = fixtureClasses("listing-scroller");
    expect(fixture).toContain("data-listing-scroller");
    for (const fact of ["overflow-y-auto", "bg-bg-primary"]) {
      expect(section![1]).toContain(fact);
      expect(fixtureScroller).toContain(fact);
    }
  });

  it("sends the tree's folder navigation through the transition entry point", () => {
    const layout = read(resolve(SRC, "components/folder/TwoPaneLayout.tsx"));
    const push = /navigateWithTransition\(\s*folderTransitionKind\([\s\S]*?\),\s*\(\) =>\s*router\.push\(/.exec(
      layout,
    );
    expect(
      push,
      "the tree's folder navigation no longer runs inside a transition",
    ).not.toBe(null);
  });

  it("bounds #pane the way TwoPaneLayout bounds its tree column", () => {
    // Compared as facts rather than as a class list: the aside carries a
    // transition and a width expression this fixture has no reason to copy.
    const layout = read(resolve(SRC, "components/folder/TwoPaneLayout.tsx"));
    const aside = /<aside\n\s+className=\{`([^`]*)`\}/.exec(layout);
    expect(aside, "TwoPaneLayout no longer declares its aside inline").not.toBe(
      null,
    );

    expect(aside![1]).toContain("overflow-hidden");
    expect(fixtureClasses("tree-pane")).toContain("overflow-hidden");

    expect(layout).toContain('className="flex h-full w-[100vw] flex-col md:w-[280px]"');
    expect(fixtureClasses("tree-pane")).toContain("w-[280px]");

    // Bounded on the left: `InspectorColumn` is flush with the window's
    // right edge, so that axis cannot be separated there.
    expect(fixtureClasses("tree-pane")).toContain("left-0");
    expect(fixtureClasses("tree-pane")).not.toContain("right-0");
  });

  it("gives the dialog arrangement FileSaveDialog's own root", () => {
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

    // The picker's list is capped at `max-h-48` but never against the
    // viewport, so unlike `AddButton` it does not shrink on a short screen.
    const picker = read(resolve(SRC, "components/FolderPicker.tsx"));
    expect(picker).toContain("max-h-48");
    expect(/max-h-\[\d+vh\]/.test(picker)).toBe(false);
    expect(/max-h-\[\d+vh\]/.test(read(resolve(SRC, "components/AddButton.tsx")))).toBe(
      true,
    );
  });

  it("names the arrangements the browser suite runs", () => {
    const declared = [...fixture.matchAll(/^\s{2}"?([a-z-]+)"?: \w+,$/gm)].map(
      (m) => m[1],
    );
    expect(declared).toEqual([
      "chrome-buttons",
      "folder-listing-header-deep",
      "folder-listing-header-shallow",
      "file-detail-chrome-deep",
      "file-detail-chrome-note",
      "file-detail-chrome-plain-phone",
      "file-detail-chrome-collection",
      "file-detail-chrome-note-deep",
      "archive-toolbar-deep",
      "page-frame-full",
      "page-frame-wide",
      "page-frame-list",
      "page-frame-reading",
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
      "sheet-under-sidebar",
      "sheet-over-page-peek",
      "sheet-over-page-half",
      "sheet-over-page-full",
      "measured-sheet-peek",
      "measured-sheet-half",
      "measured-sheet-full",
      "measured-inspector-left-edge",
      "measured-inspector-right-edge",
      "measured-tree-pane",
      "measured-picker-in-dialog",
      "add-menu",
      "quick-note-footer-ja",
      "quick-note-footer-en",
      "scoped-search-ja",
      "scoped-search-en",
      "player-seek-bar",
      "player-hairline",
      "player-captions",
      "folder-push",
      "open-ghost",
      "citation-seams",
      "citation-seams-prose",
    ]);
  });
});
