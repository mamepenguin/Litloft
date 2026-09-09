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
  MobileInspectorSheet,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF,
  SHEET_SNAP_POINTS,
  SHEET_SCROLLER_PADDING_BOTTOM,
  SHEET_VISIBLE_HEIGHT,
} from "@/components/MobileInspectorSheet";
import { declareEach, expectDistinct } from "@/test/declareEach";

import { InspectorShell } from "@/components/FileDetail/inspector/InspectorShell";
import { buildInspectorTabs } from "@/components/FileDetail/inspector/tabs";
import type { InspectorScroll } from "@/components/FileDetail/inspector/InspectorShell";
import type { SlotEntry } from "@/lib/addons";

/**
 * vitest's `it`, narrowed to the two arguments the helper uses.
 *
 * `it` is overloaded (options objects, `.each`, modifiers), so handing it
 * over unnarrowed makes the helper infer the options overload rather than
 * a test body.
 */
const registerCase: (title: string, body: () => void | Promise<void>) => void =
  it;

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

function renderSheet(snap: number) {
  render(
    <MobileInspectorSheet snap={snap} onSnapChange={vi.fn()} peek={null}>
      <div data-testid="sheet-child" />
    </MobileInspectorSheet>,
  );
  return {
    drawer: screen.getByTestId("mobile-inspector-sheet"),
    visible: screen.getByTestId("mobile-inspector-visible"),
    scroller: screen.getByTestId("mobile-inspector-content"),
  };
}

describe("the sheet's own chrome", () => {
  it("declares the drawer, the box inside it and the scroller", () => {
    const { drawer, visible, scroller } = renderSheet(SHEET_SNAP_HALF);

    expectSameClasses(drawer.className, str("drawer"));
    expectSameClasses(visible.className, str("visible"));
    expectSameClasses(scroller.className, str("scroller"));
  });

  it("declares the handle, which is what stands between the drawer's top edge and the scroller", () => {
    // The reason the replaced `max-height` cap was short: it capped the
    // scroller by the snap and then pushed it down by whatever was above
    // it. The fixture has to draw the same thing above the scroller or
    // its "the cap ends below the screen" case is about a different gap.
    renderSheet(SHEET_SNAP_HALF);
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
    const { drawer } = renderSheet(SHEET_SNAP_HALF);
    // `drawerVh` is the only number the browser spec asserts about the
    // drawer itself, and it is a literal there. This is the line that
    // makes it a claim about the app.
    expect(drawer.className).toContain(`h-[${(SPEC.drawerVh as number) * 100}vh]`);
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
    // siblings left every case in this file green and turned the browser
    // cases that measure that nesting red, so the fixture's half is held
    // by the browser suite. Do not read this case as covering it.
    //
    // No count here. The one that was written down was taken before the
    // same commit grew the browser suite, so it was stale in the act of
    // being recorded, and nothing would ever have gone red over it.
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

  compared.push(
    ...declareEach(FORMS, registerCase, (form) => {
      const [rootKey, headerKey, stripKey, panelKey] = form.keys;

      return {
        title: `declares the ${form.scroll} form's four boxes`,
        id: form.scroll,
        body: () => {
          const shell = renderShell(form.scroll);

          expect(shell.root.dataset.scroll).toBe(form.scroll);
          expectSameClasses(shell.root.className, str(rootKey));
          expectSameClasses(shell.header.className, str(headerKey));
          expectSameClasses(shell.strip.className, str(stripKey));
          expectSameClasses(shell.panel.className, str(panelKey));
        },
      };
    }),
  );

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
  // This is the case the browser suite's cases rest on — it is what pins the
  // fixture's hand-written copy of the formula against the real library —
  // so the loop that declares it is registered rather than counted.
  // `expect(SNAPS).toHaveLength(2)` read the literal two lines above it,
  // so `if (snap === SHEET_SNAP_FULL) continue;` as the loop's first
  // statement dropped the `full` half of it and stayed green.
  const SNAPS = [SHEET_SNAP_HALF, SHEET_SNAP_FULL];
  // The hand-written pair against the array the sheet hands vaul: a snap
  // added to or removed from the component is red here rather than
  // measured at one fewer snap in silence.
  expect(SNAPS).toEqual(SHEET_SNAP_POINTS);
  expect(expectDistinct(SNAPS)).toEqual({ unique: 2, total: 2 });

  const declaredSnaps = declareEach(SNAPS, registerCase, (snap) => ({
    title: `publishes innerHeight × (1 − ${snap}) as --snap-point-height`,
    id: String(snap),
    body: () => {
      const { drawer } = renderSheet(snap);
      const published = drawer.style.getPropertyValue("--snap-point-height");

      expect(published).not.toBe("");
      expect(Number.parseFloat(published)).toBeCloseTo(
        window.innerHeight * (1 - snap),
        5,
      );
    },
  }));

  it("asked it of both snaps", () => {
    // The register against the declaration, and the declaration against
    // two numbers written out — the pins above cannot both be satisfied
    // by a population that shrank.
    expect(declaredSnaps).toEqual(SNAPS.map(String));
    expect(expectDistinct(declaredSnaps)).toEqual({ unique: 2, total: 2 });
  });

  it("is asked at every snap the browser suite measures at, too", () => {
    // The third population of these two numbers, and the one nothing
    // could reach: `mobile-inspector-sheet.spec.ts` runs in a Playwright
    // node context where importing the component would drag React and
    // vaul into a file whose whole premise is that vaul is not running.
    // So it is read as text, the same way `inspectorThresholdParity`
    // reads `DESIGN.md` — two files, no code either of them runs.
    //
    // Without this the browser suite silently measures the drawer at one
    // snap fewer than the sheet has whenever a snap point is added: its
    // cases are the cross product of its heights, its snaps and its
    // groups, and every count in that file follows from its own
    // hand-written `SNAPS` rather than from the component's.
    const spec = readFileSync(
      resolve(REPO_ROOT, "frontend/e2e-layout/mobile-inspector-sheet.spec.ts"),
      "utf-8",
    );
    const block = spec.match(/const SNAPS = \[([\s\S]*?)\] as const;/);
    expect({ found: block !== null }).toEqual({ found: true });

    const declared = [...block![1].matchAll(/snap:\s*([\d.]+)/g)].map((m) =>
      Number(m[1]),
    );
    // A regex that matched nothing yields `[]`, which is not
    // `SHEET_SNAP_POINTS` — so a rename of that table fails here rather
    // than passing vacuously.
    expect(declared).toEqual(SHEET_SNAP_POINTS);
  });

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
  it("names every key the fixture uses, and no others", () => {
    // The fixture's builders index `SPEC` by name, so a key removed here
    // and there together would leave both halves agreeing about nothing.
    expect(Object.keys(SPEC).sort()).toEqual([
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
      "tab",
      "visible",
      "visibleHeight",
    ]);
  });
});
