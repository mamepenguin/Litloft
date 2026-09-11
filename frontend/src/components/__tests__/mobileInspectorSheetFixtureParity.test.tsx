/**
 * The layout fixture's class lists, against the components it copies.
 *
 * `e2e-layout/mobile-inspector-sheet.spec.ts` measures where the drawer,
 * the box inside it and the scroller land at each snap, and it can only
 * measure the markup in front of it — markup that file writes itself.
 * Take `scroll="column"` off the sheet's inspector, or put the
 * hand-written `max-height` back on the scroller, and every case there
 * stays green, because the fixture never asked the components anything.
 *
 * This is what asks. Both forms of `InspectorShell` and the sheet's own
 * chrome are rendered from the real components and compared with the
 * fixture's declarations, whole and in both directions: a class dropped
 * from either side is red.
 *
 * It also pins the one thing the fixture reproduces rather than copies —
 * vaul's `--snap-point-height`. The fixture computes it as
 * `innerHeight × (1 − snap)`; the case at the bottom renders a real vaul
 * drawer at each snap and reads the variable back off the DOM, so a vaul
 * upgrade that changes the formula fails here rather than making every
 * browser case measure a drawer nobody ships.
 *
 * jsdom lays nothing out, so nothing here is evidence about a position.
 * That is the browser spec's, and this is what connects the two.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import {
  SHEET_DRAWER_VH,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  sheetDrawerHeightPx,
} from "@/lib/sheetSnap";
import {
  MobileInspectorSheet,
  SHEET_STATE_FULL,
  SHEET_STATE_HALF,
  SHEET_SCROLLER_PADDING_BOTTOM,
  SHEET_VISIBLE_HEIGHT,
} from "@/components/MobileInspectorSheet";
import { InspectorShell } from "@/components/FileDetail/inspector/InspectorShell";
import { buildInspectorTabs } from "@/components/FileDetail/inspector/tabs";
import type { InspectorScroll } from "@/components/FileDetail/inspector/InspectorShell";
import type { SlotEntry } from "@/lib/addons";

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const FIXTURE_PATH = resolve(
  REPO_ROOT,
  "frontend/e2e-layout/fixtures/mobile-inspector-sheet.html",
);
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, "utf-8");

const SPEC: Record<string, string | number> = JSON.parse(
  FIXTURE_HTML.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const str = (key: string) => SPEC[key] as string;

const tokens = (className: string) =>
  new Set(className.split(/\s+/).filter(Boolean));

/**
 * Sorted before comparing: the order utilities are written in is not a
 * property of anything, and pinning it would make a reorder red for no
 * reason. Which utilities are present is the property.
 */
const sorted = (set: Set<string>) => [...set].sort();

const expectSameClasses = (rendered: string, declared: string) =>
  expect(sorted(tokens(rendered))).toEqual(sorted(tokens(declared)));

const entry = (id: string): SlotEntry => ({
  id,
  label: `manifest label for ${id}`,
  priority: 10,
  addonName: "some-addon",
});

/**
 * Two tabs, because the fixture draws a strip and there is no strip with
 * one tab (`tabs.ts` rule 2). A one-tab render would compare the fixture's
 * strip against nothing and pass.
 */
function renderShell(scroll: InspectorScroll) {
  const view = render(
    <InspectorShell
      scroll={scroll}
      header={<div data-testid="header">header</div>}
      tabs={buildInspectorTabs({
        info: { label: "Info", content: <p>info body</p> },
        coreTabs: [],
        addonTabs: [
          { entry: entry("a"), label: "Transcript", content: <p>a body</p> },
        ],
      })}
      resetKey="f1"
    />,
  );
  const root = screen.getByTestId("inspector-shell");
  return {
    ...view,
    root,
    header: screen.getByTestId("header").parentElement!,
    strip: screen.getByTestId("inspector-tabs"),
    // The selected one. The hidden panels carry the same list, and
    // picking by role keeps this reading the panel the reader sees.
    panel: screen.getByRole("tabpanel"),
    tabs: screen.getAllByRole("tab"),
  };
}

/**
 * The drawer at one snap.
 *
 * Takes the snap rather than the state, because what the browser fixture
 * reproduces is vaul's arithmetic on a *number* — including the derived
 * ones `half` now takes. `full`'s own value is the one fixed point, so
 * it is the state used to reach it and everything else goes through
 * `half`'s `halfSnap`.
 */
function renderSheet(snap: number) {
  render(
    <MobileInspectorSheet
      state={snap === SHEET_SNAP_FULL ? SHEET_STATE_FULL : SHEET_STATE_HALF}
      onStateChange={vi.fn()}
      halfSnap={snap}
      peek={null}
    >
      <div data-testid="sheet-child" />
    </MobileInspectorSheet>,
  );
  return {
    drawer: screen.getByTestId("mobile-inspector-sheet"),
    surface: screen.getByTestId("mobile-inspector-surface"),
    visible: screen.getByTestId("mobile-inspector-visible"),
    scroller: screen.getByTestId("mobile-inspector-content"),
  };
}

describe("the sheet's own chrome", () => {
  it("declares the drawer, the surface, the box inside it and the scroller", () => {
    const { drawer, surface, visible, scroller } = renderSheet(
      SHEET_SNAP_HALF_FALLBACK,
    );

    expectSameClasses(drawer.className, str("drawer"));
    expectSameClasses(surface.className, str("surface"));
    expectSameClasses(visible.className, str("visible"));
    expectSameClasses(scroller.className, str("scroller"));
  });

  it("paints the sheet on the surface and not on the drawer", () => {
    // Which of the two carries the paint is the whole reason the surface
    // exists: a content pull translates it, and vaul overwrites the
    // drawer's own transform on every frame of a knob drag. Painting the
    // drawer instead would leave a second card behind the one that moves.
    const { drawer, surface } = renderSheet(SHEET_SNAP_HALF_FALLBACK);
    const paint = ["bg-bg-card", "rounded-t-2xl", "border-t"];
    for (const utility of paint) {
      expect(tokens(surface.className)).toContain(utility);
      expect(tokens(drawer.className)).not.toContain(utility);
    }
  });

  it("declares the handle, which is what stands between the drawer's top edge and the scroller", () => {
    // The reason the replaced `max-height` cap was short: it capped the
    // scroller by the snap and then pushed it down by whatever was above
    // it. The fixture has to draw the same thing above the scroller or
    // its "the cap ends below the screen" case is about a different gap.
    renderSheet(SHEET_SNAP_HALF_FALLBACK);
    const handle = document.querySelector<HTMLElement>("[data-vaul-handle]")!;
    expectSameClasses(handle.className, str("handle"));
  });

  it("declares the expression the visible box takes its height from", () => {
    const { visible, scroller } = renderSheet(SHEET_SNAP_FULL);

    expect(visible.style.height).toBe(SHEET_VISIBLE_HEIGHT);
    expect(str("visibleHeight")).toBe(SHEET_VISIBLE_HEIGHT);
    // And nothing else caps the scroller. A `max-height` here would be a
    // second definition of the same number and the fixture's `cap-50vh`
    // case would be measuring what ships.
    expect(scroller.style.maxHeight).toBe("");
    // Through the constant rather than through the rendered style: jsdom
    // reorders the arguments of an `env()` it re-serialises, so the
    // rendered string is not the string either side wrote.
    expect(str("scrollerPaddingBottom")).toBe(SHEET_SCROLLER_PADDING_BOTTOM);
  });

  it("declares the drawer's height as the fraction the browser cases are arithmetic on", () => {
    const { drawer } = renderSheet(SHEET_SNAP_HALF_FALLBACK);
    // `drawerVh` is the fixture's copy of `SHEET_DRAWER_VH`, and the
    // browser spec sizes its own drawer from it. This is the line that
    // makes it a claim about the app — the height the component actually
    // wrote on the element, in px, against jsdom's own window.
    expect(SPEC.drawerVh).toBe(SHEET_DRAWER_VH);
    expect(drawer.style.height).toBe(
      `${sheetDrawerHeightPx(window.innerHeight)}px`,
    );
  });

  it("gives the drawer no viewport unit of its own", () => {
    // The first finding of round two, as a rule rather than as the one
    // spelling it arrived in. CSS `vh` is the large viewport and vaul
    // solves every snap in `window.innerHeight`; `svh`, `lvh` and `dvh`
    // are three more answers to "which viewport", and a `calc()` or a
    // `min()` around any of them is a fourth. The drawer's height comes
    // from `sheetDrawerHeightPx` and there is no second definition of it
    // anywhere on the element.
    const { drawer } = renderSheet(SHEET_SNAP_HALF_FALLBACK);
    const written = `${drawer.className} ${drawer.getAttribute("style") ?? ""}`;
    expect(written).not.toMatch(/\d\s*(?:[sld]?vh|vmin|vmax)\b/);
    expect(SPEC.drawer as string).not.toMatch(/\d\s*(?:[sld]?vh|vmin|vmax)\b/);
  });

  it("mounts the scroller inside the visible box, and the child inside the scroller", () => {
    // **The component's tree, not the fixture's.** The class lists above
    // would still match if the sheet stopped nesting these — a scroller
    // beside the box instead of inside it carries the same utilities and
    // does none of the work — so this is what says the box encloses the
    // scroller here.
    //
    // The fixture's own nesting is not reachable from this file: it is
    // JavaScript in `fixtures/mobile-inspector-sheet.html` that nothing
    // here executes. Measured: rebuilding the fixture to append them as
    // siblings left every case in this file green and turned 29 browser
    // cases red, so the fixture's half is held by the browser suite. Do
    // not read this case as covering it.
    const { visible, scroller } = renderSheet(SHEET_SNAP_FULL);
    expect(visible).toContainElement(scroller);
    expect(scroller).toContainElement(screen.getByTestId("sheet-child"));
  });
});

describe("both forms of the inspector", () => {
  // Declared as a table rather than two hand-written cases, and the loop
  // records what it registered so shrinking it disagrees with the
  // declaration rather than passing quietly.
  const FORMS = [
    { scroll: "column", keys: ["columnRoot", "columnHeader", "columnStrip", "columnPanel"] },
    { scroll: "panel", keys: ["panelRoot", "panelHeader", "panelStrip", "panelPanel"] },
  ] as const;
  const compared: string[] = [];

  // Recorded **after** the `it()` it belongs to, not before. With the
  // push first, anything between the two lines — a `continue`, a
  // condition, a `throw` — drops the registration and leaves the record,
  // and this guard goes on agreeing with a loop that registered nothing.
  // With it last, a skipped `it()` takes its push with it.
  it("compares exactly the two forms the fixture declares", () => {
    expect(compared).toEqual(["column", "panel"]);
    expect(FORMS.flatMap((form) => [...form.keys]).sort()).toEqual(
      [
        "columnHeader",
        "columnPanel",
        "columnRoot",
        "columnStrip",
        "panelHeader",
        "panelPanel",
        "panelRoot",
        "panelStrip",
      ].sort(),
    );
  });

  for (const form of FORMS) {
    const [rootKey, headerKey, stripKey, panelKey] = form.keys;

    it(`declares the ${form.scroll} form's four boxes`, () => {
      const shell = renderShell(form.scroll);

      expect(shell.root.dataset.scroll).toBe(form.scroll);
      expectSameClasses(shell.root.className, str(rootKey));
      expectSameClasses(shell.header.className, str(headerKey));
      expectSameClasses(shell.strip.className, str(stripKey));
      expectSameClasses(shell.panel.className, str(panelKey));
    });
    compared.push(form.scroll);
  }

  it("declares the tab button, which is what gives the strip its height", () => {
    const shell = renderShell("column");
    // The unselected one. The selected tab carries `border-accent` and a
    // heavier weight, and a strip of two selected tabs is not a strip the
    // app ever draws.
    const unselected = shell.tabs.find(
      (tab) => tab.getAttribute("aria-selected") !== "true",
    )!;
    expectSameClasses(unselected.className, str("tab"));
  });

  it("puts the scroller in the column form and in the panel form's panel, and nowhere else", () => {
    // The C-1 defect as a comparison rather than as a count: the two
    // forms differ in *which* box declares the overflow, and that is the
    // whole of it.
    const overflowing = (className: string) =>
      [...tokens(className)].filter((token) =>
        /^overflow(-y)?-(auto|scroll)$/.test(token),
      );

    expect(overflowing(str("columnRoot"))).toEqual([]);
    expect(overflowing(str("columnHeader"))).toEqual([]);
    expect(overflowing(str("columnPanel"))).toEqual([]);
    expect(overflowing(str("panelPanel"))).toEqual(["overflow-auto"]);
    expect(overflowing(str("scroller"))).toEqual(["overflow-auto"]);
    // The strip scrolls sideways in both forms — which is why the browser
    // spec names the box that scrolls instead of counting scroll
    // containers, since `overflow-x: auto` computes `overflow-y` to
    // `auto` as well.
    expect(tokens(str("columnStrip"))).toContain("overflow-x-auto");
    expect(tokens(str("panelStrip"))).toContain("overflow-x-auto");
  });
});

describe("vaul's snap arithmetic, which the fixture reproduces", () => {
  // Two implementations, not one table read twice: vaul computes the
  // offset inside a React render from `window.innerHeight`, and the
  // expectation is the published formula written out here. A vaul upgrade
  // that changes either the formula or the variable's name fails this.
  //
  // Three, not two: `half` is no longer a constant — it is derived from
  // the player's bottom edge — so a value that is neither of the two the
  // component knows is exactly what vaul is handed on a video page. A
  // table of the two named snaps would leave "vaul accepts an arbitrary
  // snap point" untested, which is the premise unit D rests on.
  const SNAPS = [SHEET_SNAP_HALF_FALLBACK, 0.627736, SHEET_SNAP_FULL];
  expect(SNAPS).toHaveLength(3);

  // And what the loop registered, recorded after each `it()`. The length
  // above pins the table; it says nothing about the walk over it, and a
  // `continue` here leaves the table — and so that assertion — untouched.
  const publishedFor: number[] = [];

  it("registers one case per snap the table declares", () => {
    expect(publishedFor).toEqual(SNAPS);
  });

  for (const snap of SNAPS) {
    it(`publishes innerHeight × (1 − ${snap}) as --snap-point-height`, () => {
      const { drawer } = renderSheet(snap);
      const published = drawer.style.getPropertyValue("--snap-point-height");

      expect(published).not.toBe("");
      expect(Number.parseFloat(published)).toBeCloseTo(
        window.innerHeight * (1 - snap),
        5,
      );
    });
    publishedFor.push(snap);
  }

  it("is the same expression the fixture computes it with", () => {
    // A text match, and it is the only tie there can be: the fixture's
    // copy runs in a browser this file never opens. What the case above
    // buys is that the formula is vaul's; what this one buys is that the
    // fixture is using that formula and not another.
    expect(FIXTURE_HTML).toContain("window.innerHeight * (1 - snap)");
    expect(FIXTURE_HTML).toContain("--snap-point-height");
  });
});

describe("the fixture's declarations", () => {
  /**
   * Every key, and which file compares it against a component.
   *
   * The fixture's builders index `SPEC` by name, so a key removed here
   * and there together would leave both halves agreeing about nothing —
   * and a key added with nothing comparing it is a class list the
   * browser cases measure and no component has ever been asked about.
   *
   * The `page` half is compared in
   * `FileDetail/__tests__/MediaShell.test.tsx`, which is where a real
   * `FileDetailShell` is already mounted; the `sheet` half is compared
   * above; and the player's bleed in `FilePreview.test.tsx`, which is the
   * only suite that renders the real `FilePreview` — the shell harness
   * stubs it, so the class list is not on the page there at all.
   * Splitting the *list* would let either side grow a key the others did
   * not know about, so the list stays whole and only the comparisons are
   * elsewhere.
   */
  const COMPARED_HERE = [
    "columnHeader",
    "columnPanel",
    "columnRoot",
    "columnStrip",
    "drawer",
    "drawerVh",
    "handle",
    "panelHeader",
    "panelPanel",
    "panelRoot",
    "panelStrip",
    "scroller",
    "scrollerPaddingBottom",
    "surface",
    "tab",
    "visible",
    "visibleHeight",
  ];
  const COMPARED_IN_MEDIA_SHELL = [
    "canvas",
    "chrome",
    "framedShimPaddingTop",
    "mediaHost",
    "pageRoot",
    "peekPx",
    "player",
  ];
  const COMPARED_IN_FILE_PREVIEW = ["playerBleed"];
  expect(COMPARED_HERE).toHaveLength(17);
  expect(COMPARED_IN_MEDIA_SHELL).toHaveLength(7);
  expect(COMPARED_IN_FILE_PREVIEW).toHaveLength(1);

  const EVERYWHERE = [
    ...COMPARED_HERE,
    ...COMPARED_IN_MEDIA_SHELL,
    ...COMPARED_IN_FILE_PREVIEW,
  ];

  it("names every key the fixture uses, and no others", () => {
    expect(Object.keys(SPEC).sort()).toEqual([...EVERYWHERE].sort());
  });

  it("keeps the three lists disjoint", () => {
    // A key in two lists would be one nobody had to look at: the union
    // above would still match while one of the comparisons quietly
    // stopped.
    expect(new Set(EVERYWHERE).size).toBe(EVERYWHERE.length);
  });

  it("points at the file that compares the other half", () => {
    // Detector rule 4: the paragraph above says MediaShell.test.tsx
    // compares those five. Until this file can fail when that stops
    // being true, that is a sentence. It reads the other file and checks
    // each key is named in it.
    const mediaShell = readFileSync(
      resolve(
        REPO_ROOT,
        "frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx",
      ),
      "utf-8",
    );
    for (const key of COMPARED_IN_MEDIA_SHELL) {
      expect(mediaShell).toContain(`SPEC.${key}`);
    }
  });
});
