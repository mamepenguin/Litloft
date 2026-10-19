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
 * one tab. A one-tab render would compare the fixture's strip against
 * nothing and pass.
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
 * Takes the snap rather than the state, because what the browser fixture
 * reproduces is vaul's arithmetic on a *number*, including the derived
 * ones `half` takes.
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
    renderSheet(SHEET_SNAP_HALF_FALLBACK);
    const handle = document.querySelector<HTMLElement>("[data-vaul-handle]")!;
    expectSameClasses(handle.className, str("handle"));
  });

  it("declares the expression the visible box takes its height from", () => {
    const { visible, scroller } = renderSheet(SHEET_SNAP_FULL);

    expect(visible.style.height).toBe(SHEET_VISIBLE_HEIGHT);
    expect(str("visibleHeight")).toBe(SHEET_VISIBLE_HEIGHT);
    expect(scroller.style.maxHeight).toBe("");
    // Through the constant rather than through the rendered style: jsdom
    // reorders the arguments of an `env()` it re-serialises, so the
    // rendered string is not the string either side wrote.
    expect(str("scrollerPaddingBottom")).toBe(SHEET_SCROLLER_PADDING_BOTTOM);
  });

  it("declares the drawer's height as the fraction the browser cases are arithmetic on", () => {
    const { drawer } = renderSheet(SHEET_SNAP_HALF_FALLBACK);
    expect(SPEC.drawerVh).toBe(SHEET_DRAWER_VH);
    expect(drawer.style.height).toBe(
      `${sheetDrawerHeightPx(window.innerHeight)}px`,
    );
  });

  it("gives the drawer no viewport unit of its own", () => {
    // CSS `vh` is the large viewport and vaul solves every snap in
    // `window.innerHeight`; any viewport unit is a second answer to "which
    // viewport".
    const { drawer } = renderSheet(SHEET_SNAP_HALF_FALLBACK);
    const written = `${drawer.className} ${drawer.getAttribute("style") ?? ""}`;
    expect(written).not.toMatch(/\d\s*(?:[sld]?vh|vmin|vmax)\b/);
    expect(SPEC.drawer as string).not.toMatch(/\d\s*(?:[sld]?vh|vmin|vmax)\b/);
  });

  it("mounts the scroller inside the visible box, and the child inside the scroller", () => {
    const { visible, scroller } = renderSheet(SHEET_SNAP_FULL);
    expect(visible).toContainElement(scroller);
    expect(scroller).toContainElement(screen.getByTestId("sheet-child"));
  });
});

describe("both forms of the inspector", () => {
  const FORMS = [
    { scroll: "column", keys: ["columnRoot", "columnHeader", "columnStrip", "columnPanel"] },
    { scroll: "panel", keys: ["panelRoot", "panelHeader", "panelStrip", "panelPanel"] },
  ] as const;
  const compared: string[] = [];

  // Recorded **after** the `it()` it belongs to, not before, so a skipped
  // `it()` takes its push with it.
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
    const overflowing = (className: string) =>
      [...tokens(className)].filter((token) =>
        /^overflow(-y)?-(auto|scroll)$/.test(token),
      );

    expect(overflowing(str("columnRoot"))).toEqual([]);
    expect(overflowing(str("columnHeader"))).toEqual([]);
    expect(overflowing(str("columnPanel"))).toEqual([]);
    expect(overflowing(str("panelPanel"))).toEqual(["overflow-auto"]);
    expect(overflowing(str("scroller"))).toEqual(["overflow-auto"]);
    expect(tokens(str("columnStrip"))).toContain("overflow-x-auto");
    expect(tokens(str("panelStrip"))).toContain("overflow-x-auto");
  });
});

describe("vaul's snap arithmetic, which the fixture reproduces", () => {
  // `half` is derived from the player's bottom edge, so a value that is
  // neither of the two named snaps is what vaul is handed on a video page.
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
    expect(FIXTURE_HTML).toContain("window.innerHeight * (1 - snap)");
    expect(FIXTURE_HTML).toContain("--snap-point-height");
  });
});

describe("the fixture's declarations", () => {
  /**
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
    "peekHeight",
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

  it("points at the files that compare the other two lists", () => {
    const elsewhere: [readonly string[], string, string][] = [
      [
        COMPARED_IN_MEDIA_SHELL,
        "frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx",
        "SPEC.",
      ],
      [
        COMPARED_IN_FILE_PREVIEW,
        "frontend/src/components/__tests__/FilePreview.test.tsx",
        "FIXTURE.",
      ],
    ];
    expect(elsewhere).toHaveLength(2);
    // Every list but this file's own is covered, so adding a fourth
    // without a row here is red rather than silent.
    expect(elsewhere.map(([list]) => list.length).reduce((a, b) => a + b)).toBe(
      EVERYWHERE.length - COMPARED_HERE.length,
    );

    for (const [keys, path, accessor] of elsewhere) {
      const source = readFileSync(resolve(REPO_ROOT, path), "utf-8");
      for (const key of keys) {
        expect(source).toContain(`${accessor}${key}`);
      }
    }
  });
});
