import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Filter } from "lucide-react";

import { MENU_SURFACE_GAP_PX, ToolbarMenu } from "@/components/ToolbarMenu";

/**
 * What `e2e-layout/fixtures/toolbar-menu.html` writes, against what
 * `ToolbarMenu` renders.
 *
 * The fixture draws its own markup — it has to, since a static page off
 * `file://` cannot import a `.tsx` — so it drifts away from what it claims
 * to reproduce and keeps every case title. This is the pin: the browser
 * spec measures a recipe, and this says the recipe is the app's.
 *
 * **What is pinned and what is not.** Every string the *component* owns is
 * compared: the wrapper, the trigger, and the surface in the four pieces
 * `useMenuSurface` assembles it from. The fixture's `bar` and `row` are the
 * page's own — a sticky bar for the wrapper to sit on and a row to give the
 * menu a height — and no component owns those exact lists. Nothing the
 * spec asserts is a function of either: it reads boxes relative to the
 * trigger and the viewport, never an absolute number that a different
 * padding would move.
 *
 * jsdom lays nothing out, so this file can say the strings agree and
 * nothing about where they put a box. That is the browser spec's half.
 */
const FIXTURE = readFileSync(
  resolve(__dirname, "../../../e2e-layout/fixtures/toolbar-menu.html"),
  "utf8",
);

const SPEC: Record<string, string | number> = JSON.parse(
  FIXTURE.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const str = (key: string) => SPEC[key] as string;
const tokens = (list: string) => list.split(/\s+/).filter(Boolean);
const sorted = (list: string[]) => [...list].sort();

/**
 * The rendered list is exactly the union of the declared parts.
 *
 * A union rather than a subset on purpose: `toContain` per part would stay
 * green when the component grows a token the fixture never draws, which is
 * the drift this file exists to catch.
 */
function expectComposedOf(rendered: string, parts: string[]) {
  const expected = new Set<string>();
  for (const part of parts) for (const token of tokens(part)) expected.add(token);
  expect(sorted(tokens(rendered))).toEqual(sorted([...expected]));
}

/**
 * State the wrapper's box and the menu's, so a case can reach a corner the
 * zeroes jsdom reports cannot.
 *
 * Without this every rect is zero, the menu fits everywhere and only the
 * downward form is ever drawn — so the `up` half of the fixture would be
 * pinned against nothing.
 */
function stubBoxes(
  wrapper: { top: number; bottom: number },
  menu: { height: number; width: number },
) {
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if ((this as HTMLElement).classList.contains("relative")) {
        return { ...wrapper, left: 300, right: 460 } as DOMRect;
      }
      if (this.getAttribute("role") === "menu") return { ...menu } as DOMRect;
      return original.call(this);
    },
  );
}

/** Open a `ToolbarMenu` resolved to the requested corner. */
function openAt(corner: { up: boolean; align: "start" | "end" }) {
  if (corner.up) stubBoxes({ top: 700, bottom: 740 }, { height: 300, width: 200 });
  const { container } = render(
    <ToolbarMenu label="Sort" value="Newest first" icon={Filter} align={corner.align}>
      {() => <button type="button" role="menuitem">Row</button>}
    </ToolbarMenu>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
  return container;
}

/**
 * The four corners the fixture declares, and the keys each of them is
 * built from.
 *
 * Declared per corner rather than derived from the two axes: deriving both
 * sides from one table is what makes a deletion invisible, because the
 * removed element leaves the expectation and the observation at the same
 * time.
 */
const CORNERS = [
  { up: false, align: "end", direction: "down", side: "right" },
  { up: false, align: "start", direction: "down", side: "left" },
  { up: true, align: "end", direction: "up", side: "right" },
  { up: true, align: "start", direction: "up", side: "left" },
] as const;

describe("the toolbar-menu layout fixture's class lists", () => {
  afterEach(cleanup);
  afterEach(() => vi.restoreAllMocks());

  it("declares the four corners the component can resolve to", () => {
    // Counted as well as enumerated, so the table cannot be walked back.
    expect(CORNERS).toHaveLength(4);
    expect([...new Set(CORNERS.map((c) => c.direction))]).toEqual([
      "down",
      "up",
    ]);
    expect([...new Set(CORNERS.map((c) => c.side))]).toEqual(["right", "left"]);
  });

  it("declares the wrapper and the trigger the component renders", () => {
    openAt({ up: false, align: "end" });
    const button = screen.getByRole("button", { name: /Sort/ });
    expect(sorted(tokens(button.className))).toEqual(
      sorted(tokens(str("trigger"))),
    );
    expect(sorted(tokens(button.parentElement!.className))).toEqual(
      sorted(tokens(str("wrapper"))),
    );
  });

  for (const corner of CORNERS) {
    it(`declares the menu's ${corner.direction} / ${corner.side} class list`, () => {
      openAt({ up: corner.up, align: corner.align });
      expectComposedOf(screen.getByRole("menu").className, [
        str("surfaceBase"),
        str(corner.direction),
        str(corner.side),
        str(`${corner.direction}-${corner.side}`),
      ]);
    });
  }

  it("declares the gap the component reserves for the menu", () => {
    // The fixture measures the gap Chromium leaves against `SPEC.gapPx`,
    // and the component adds `MENU_SURFACE_GAP_PX` to the panel's height
    // before asking whether it fits. Two numbers in two files, tied here,
    // so the browser measurement is a measurement of the component's
    // arithmetic rather than of a literal beside it.
    expect(SPEC.gapPx).toBe(MENU_SURFACE_GAP_PX);
  });
});
