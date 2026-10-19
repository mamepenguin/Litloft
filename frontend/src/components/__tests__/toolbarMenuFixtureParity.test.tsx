import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Filter } from "lucide-react";

import { MENU_SURFACE_GAP_PX, ToolbarMenu } from "@/components/ToolbarMenu";

/**
 * The fixture draws its own markup because a static page off `file://`
 * cannot import a `.tsx`, so its class lists are pinned against the
 * component here. `bar` and `row` are the page's own and not compared.
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
 * Equality with the union rather than `toContain` per part, which would stay
 * green when the component grows a token the fixture never draws.
 */
function expectComposedOf(rendered: string, parts: string[]) {
  const expected = new Set<string>();
  for (const part of parts) for (const token of tokens(part)) expected.add(token);
  expect(sorted(tokens(rendered))).toEqual(sorted([...expected]));
}

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
    expect(SPEC.gapPx).toBe(MENU_SURFACE_GAP_PX);
  });
});
