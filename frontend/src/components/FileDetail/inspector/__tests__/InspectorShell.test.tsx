import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { InspectorShell, type InspectorScroll } from "../InspectorShell";
import { buildInspectorTabs } from "../tabs";
import type { SlotEntry } from "@/lib/addons";

const entry = (id: string, priority = 10): SlotEntry => ({
  id,
  label: `manifest label for ${id}`,
  priority,
  addonName: "some-addon",
});

const info = { label: "Info", content: <p>info body</p> };

function renderShell(
  addonTabs: Array<{
    entry: SlotEntry;
    label: string;
    content: React.ReactNode;
    available?: boolean;
  }> = [],
  coreTabs: Array<{ id: string; label: string; content: React.ReactNode | null }> = [],
  scroll?: InspectorScroll,
) {
  return render(
    <InspectorShell
      header={<div data-testid="header">header</div>}
      tabs={buildInspectorTabs({ info, coreTabs, addonTabs })}
      resetKey="f1"
      scroll={scroll}
    />,
  );
}

const strip = () => screen.queryByTestId("inspector-tabs");
const tabs = () => screen.queryAllByRole("tab");

describe("InspectorShell", () => {
  it("draws no tab strip when nothing has claimed a tab", () => {
    renderShell();

    expect(strip()).toBeNull();
    expect(tabs()).toHaveLength(0);
    expect(screen.getByText("info body")).toBeInTheDocument();
  });

  it("draws a strip of two when one slot entry claims a tab", () => {
    renderShell([{ entry: entry("a"), label: "文字起こし", content: <p>a body</p> }]);

    expect(strip()).not.toBeNull();
    expect(tabs()).toHaveLength(2);
    expect(tabs().map((t) => t.textContent)).toEqual(["Info", "文字起こし"]);
  });

  it("draws three when a second entry appears, with no core change", () => {
    renderShell([
      { entry: entry("a", 10), label: "A", content: <p>a body</p> },
      { entry: entry("b", 20), label: "B", content: <p>b body</p> },
    ]);

    expect(tabs()).toHaveLength(3);
  });

  it("keeps the header out of the region that scrolls", () => {
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    const header = screen.getByTestId("header");
    const panel = screen.getByRole("tabpanel");
    expect(panel).not.toContainElement(header);
    expect(panel.className).toContain("overflow-auto");
  });

  it("defaults to that split, so a caller has to ask for the other one", () => {
    renderShell();
    expect(screen.getByTestId("inspector-shell").dataset.scroll).toBe("panel");
  });
});

describe("InspectorShell in column mode", () => {
  const renderColumn = () =>
    renderShell(
      [{ entry: entry("a"), label: "A", content: <p>a body</p> }],
      [],
      "column",
    );

  it("declares no scroller of its own, in the root, the header or the panel", () => {
    renderColumn();

    const scrolls = (el: Element) =>
      [...el.classList].some((token) =>
        /^overflow(-y)?-(auto|scroll)$/.test(token),
      );

    expect(scrolls(screen.getByTestId("inspector-shell"))).toBe(false);
    expect(scrolls(screen.getByTestId("header").parentElement!)).toBe(false);
    for (const panel of screen.getAllByRole("tabpanel", { hidden: true })) {
      expect(scrolls(panel)).toBe(false);
    }
  });

  it("takes no height to fill, which is what would make the panel a scroller again", () => {
    renderColumn();

    const root = screen.getByTestId("inspector-shell");
    expect(root.className).not.toContain("h-full");
    expect(root.className).toContain("flex-col");
  });

  it("pins the tab strip to whatever scroller encloses it", () => {
    renderColumn();

    const strip = screen.getByTestId("inspector-tabs");
    expect(strip.className).toContain("sticky");
    expect(strip.className).toContain("top-0");
    expect(strip.className).toContain("bg-bg-card");
  });

  describe("tells the panels where the strip's bottom edge is", () => {
    const STRIP_PX = 45;
    let restore: () => void = () => undefined;

    beforeEach(() => {
      const own = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "offsetHeight",
      );
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
          return this.getAttribute("role") === "tablist" ? STRIP_PX : 0;
        },
      });
      restore = () => {
        if (own) Object.defineProperty(HTMLElement.prototype, "offsetHeight", own);
      };
    });

    afterEach(() => restore());

    const stickyTop = () =>
      screen
        .getByTestId("inspector-shell")
        .style.getPropertyValue("--inspector-sticky-top");

    it("as the strip's own height, in the column form", () => {
      renderColumn();
      expect(stickyTop()).toBe(`${STRIP_PX}px`);
    });

    it("as nothing, when there is no strip to stick under", () => {
      renderShell([], [], "column");
      expect(strip()).toBeNull();
      expect(stickyTop()).toBe("0px");
    });

    it("not at all in the pinned form, where the panel scrolls below the strip", () => {
      renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);
      expect(stickyTop()).toBe("");
    });
  });

  it("and the pinned form's strip is not sticky, because nothing scrolls past it", () => {
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    expect(screen.getByTestId("inspector-tabs").className).not.toContain(
      "sticky",
    );
  });

  it("still puts the header above the strip and the strip above the panel", () => {
    renderColumn();

    const root = screen.getByTestId("inspector-shell");
    const children = [...root.children];
    expect(children.indexOf(screen.getByTestId("header").parentElement!)).toBe(0);
    expect(children.indexOf(screen.getByTestId("inspector-tabs"))).toBe(1);
    expect(children.indexOf(screen.getByRole("tabpanel"))).toBe(2);
  });

  it("keeps every panel mounted, the same as the pinned form", () => {
    renderColumn();

    expect(screen.getByText("info body")).toBeInTheDocument();
    expect(screen.getByText("a body")).toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(2);
  });

  it("mounts every panel and hides the ones not selected", () => {
    // Not an optimisation: unmounting on a tab switch would re-fetch the
    // transcript and lose the reader's place.
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    expect(screen.getByText("info body")).toBeInTheDocument();
    expect(screen.getByText("a body")).toBeInTheDocument();

    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(2);
    expect(panels.filter((p) => !p.hasAttribute("hidden"))).toHaveLength(1);
  });

  it("switches which panel is shown without destroying the other", () => {
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);
    const before = screen.getByText("a body");

    fireEvent.click(screen.getByRole("tab", { name: "A" }));

    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("a body")).toBe(before);
  });

  it("points every tab at a panel that exists", () => {
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    for (const tab of tabs()) {
      const id = tab.getAttribute("aria-controls")!;
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("gives the strip one tab stop, and the arrows move within it", () => {
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    const [first, second] = tabs();
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(second).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(second);
  });

  it("names the strip in the reader's language, not in English", () => {
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    expect(screen.getByRole("tablist")).toHaveAccessibleName(
      "Inspector sections",
    );
  });

  it("follows the selection when its tab goes away, and does not spring back", () => {
    const withTab = [
      { entry: entry("a"), label: "A", content: <p>a body</p> },
    ];
    const { rerender } = renderShell(withTab);
    fireEvent.click(screen.getByRole("tab", { name: "A" }));

    const shell = (addonTabs: typeof withTab) => (
      <InspectorShell
        header={<div data-testid="header">header</div>}
        tabs={buildInspectorTabs({ info, addonTabs })}
        resetKey="f1"
      />
    );

    rerender(shell([]));
    expect(screen.getByText("info body")).toBeInTheDocument();

    rerender(shell(withTab));
    expect(screen.getByRole("tab", { name: "Info" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("starts a new file on the first tab", () => {
    const withTab = [
      { entry: entry("a"), label: "A", content: <p>a body</p> },
    ];
    const shell = (resetKey: string) => (
      <InspectorShell
        header={<div data-testid="header">header</div>}
        tabs={buildInspectorTabs({ info, addonTabs: withTab })}
        resetKey={resetKey}
      />
    );
    const { rerender } = render(shell("f1"));
    fireEvent.click(screen.getByRole("tab", { name: "A" }));

    rerender(shell("f2"));

    expect(screen.getByRole("tab", { name: "Info" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("draws no button for an entry that says it has nothing", () => {
    renderShell([
      { entry: entry("a"), label: "A", content: <p>a body</p>, available: false },
    ]);

    expect(strip()).toBeNull();
    expect(screen.queryByRole("tab", { name: "A" })).toBeNull();
  });

  it("keeps the unlisted panel mounted, because it is what reports", () => {
    // The panel is the reporter: unmounting it on the first "nothing" would
    // make that answer permanent.
    renderShell([
      { entry: entry("a"), label: "A", content: <p>a body</p>, available: false },
    ]);

    const panel = screen.getByText("a body").closest("div[id]")!;
    expect(panel.id).toBe("inspector-panel-a");
    expect(panel).toHaveAttribute("hidden");
  });

  it("does not call the unlisted panel a tabpanel", () => {
    renderShell([
      { entry: entry("a", 10), label: "A", content: <p>a body</p> },
      {
        entry: entry("gone", 20),
        label: "Gone",
        content: <p>gone body</p>,
        available: false,
      },
    ]);

    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(2);
    expect(document.getElementById("inspector-panel-gone")).not.toHaveAttribute(
      "role",
    );
  });

  it("never lets the selection land on an unlisted tab", () => {
    renderShell([
      { entry: entry("a", 10), label: "A", content: <p>a body</p> },
      {
        entry: entry("gone", 20),
        label: "Gone",
        content: <p>gone body</p>,
        available: false,
      },
    ]);

    expect(tabs().map((t) => t.textContent)).toEqual(["Info", "A"]);

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // The focus is asserted as well as the selection: the shell corrects a
    // selection that lands on an unlisted tab, but not the focus.
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    const info = screen.getByRole("tab", { name: "Info" });
    expect(info).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(info);
    expect(document.getElementById("inspector-panel-gone")).toHaveAttribute(
      "hidden",
    );
  });

  it("lets go of a tab that is unlisted while it is the one open", () => {
    const shell = (available: boolean) => (
      <InspectorShell
        header={<div data-testid="header">header</div>}
        tabs={buildInspectorTabs({
          info,
          coreTabs: [{ id: "chapters", label: "Chapters", content: <p>rows</p> }],
          addonTabs: [
            { entry: entry("a"), label: "A", content: <p>a body</p>, available },
          ],
        })}
        resetKey="f1"
      />
    );
    const { rerender } = render(shell(true));
    fireEvent.click(screen.getByRole("tab", { name: "A" }));
    expect(document.getElementById("inspector-panel-a")).not.toHaveAttribute(
      "hidden",
    );

    rerender(shell(false));

    expect(document.getElementById("inspector-panel-a")).toHaveAttribute(
      "hidden",
    );
    const selected = tabs().filter(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute("tabindex", "0");
  });

  it("gives an unlisted panel back its button when the entry changes its mind", () => {
    const shell = (available: boolean) => (
      <InspectorShell
        header={<div data-testid="header">header</div>}
        tabs={buildInspectorTabs({
          info,
          addonTabs: [
            { entry: entry("a"), label: "A", content: <p>a body</p>, available },
          ],
        })}
        resetKey="f1"
      />
    );
    const { rerender } = render(shell(false));
    const before = screen.getByText("a body");
    expect(screen.queryByRole("tab", { name: "A" })).toBeNull();

    rerender(shell(true));

    expect(screen.getByRole("tab", { name: "A" })).toBeInTheDocument();
    expect(screen.getByText("a body")).toBe(before);
  });

  it("drops a core tab whose content did not materialise", () => {
    renderShell([], [{ id: "chapters", label: "Chapters", content: null }]);
    expect(strip()).toBeNull();
  });
});

describe("InspectorShell — no addon ids in core", () => {
  it("renders whatever a slot entry is called, without knowing what it is", () => {
    const invented = vi.fn(() => <p>invented body</p>);
    renderShell([
      {
        entry: entry("something-nobody-wrote-yet", 5),
        label: "架空のタブ",
        content: invented(),
      },
    ]);

    expect(screen.getByRole("tab", { name: "架空のタブ" })).toBeInTheDocument();
    expect(screen.getByText("invented body")).toBeInTheDocument();
  });
});
