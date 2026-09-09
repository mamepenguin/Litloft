/**
 * The component fixture's *page*, against the screens it imitates.
 *
 * `e2e-components/` bundles the real `DismissScrim`, `ContextMenu` and
 * `useContextMenu` — that half needs no parity test, and a mutation proves
 * it: delete the arming line from the primitive and the browser run goes
 * red. What it hand-writes is the page around them, because
 * `SelectionBar`, `InspectorShell` and `MobileInspectorSheet` need
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
import { readFileSync } from "node:fs";
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
    ]);
  });
});
