/**
 * SPEC-CORE-082 I1: the tab strip is the inspector's first row on every
 * surface, and the header (title, action row, tags) is the first block of
 * the Info panel, so it is out of sight while another tab is selected.
 */
import { describe, it, expect } from "vitest";
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

const info = { label: "Info", content: <p data-testid="info-body">info body</p> };

function renderShell({
  withTab = true,
  scroll,
}: { withTab?: boolean; scroll?: InspectorScroll } = {}) {
  return render(
    <InspectorShell
      header={<div data-testid="header">header</div>}
      tabs={buildInspectorTabs({
        info,
        coreTabs: [],
        addonTabs: withTab
          ? [{ entry: entry("a"), label: "A", content: <p>a body</p> }]
          : [],
      })}
      resetKey="f1"
      scroll={scroll}
    />,
  );
}

const infoPanel = () => document.getElementById("inspector-panel-info");

/** True when `a` comes before `b` in document order. */
const precedes = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe.each<[string, InspectorScroll | undefined]>([
  ["the desktop pane", undefined],
  ["the phone sheet (column)", "column"],
])("SPEC-CORE-082 I1 header inside Info, %s", (_surface, scroll) => {
  it("SPEC-CORE-082 I1 draws the tab strip as the shell's first row", () => {
    renderShell({ scroll });

    const root = screen.getByTestId("inspector-shell");
    expect(root.firstElementChild).toBe(screen.getByTestId("inspector-tabs"));
  });

  it("SPEC-CORE-082 I1 puts nothing of the header above the strip", () => {
    renderShell({ scroll });

    const strip = screen.getByTestId("inspector-tabs");
    const header = screen.getByTestId("header");
    expect(precedes(strip, header)).toBe(true);
  });

  it("SPEC-CORE-082 renders the header as the Info panel's first block, before Info's own content", () => {
    renderShell({ scroll });

    const panel = infoPanel();
    expect(panel).not.toBeNull();
    const header = screen.getByTestId("header");
    expect(panel).toContainElement(header);
    expect(precedes(header, screen.getByTestId("info-body"))).toBe(true);
  });

  it("SPEC-CORE-082 I1 hides the header with Info when another tab is selected, without unmounting it", () => {
    renderShell({ scroll });
    const header = screen.getByTestId("header");

    fireEvent.click(screen.getByRole("tab", { name: "A" }));

    expect(infoPanel()).toHaveAttribute("hidden");
    expect(screen.getByTestId("header")).toBe(header);
    expect(header).not.toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Info" }));
    expect(screen.getByTestId("header")).toBe(header);
    expect(header).toBeVisible();
  });

  it("SPEC-CORE-082 keeps the header the first block of Info when Info is the only tab and no strip is drawn", () => {
    renderShell({ scroll, withTab: false });

    expect(screen.queryByTestId("inspector-tabs")).toBeNull();
    const panel = infoPanel();
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(screen.getByTestId("header"));
    expect(precedes(screen.getByTestId("header"), screen.getByTestId("info-body"))).toBe(
      true,
    );
  });
});

describe("SPEC-CORE-082 in column mode", () => {
  it("SPEC-CORE-082 I10 keeps the strip sticky now that it is the first row", () => {
    renderShell({ scroll: "column" });

    const strip = screen.getByTestId("inspector-tabs");
    expect(strip.className).toContain("sticky");
    expect(screen.getByTestId("inspector-shell").firstElementChild).toBe(strip);
  });

  it("SPEC-CORE-082 has no header block of its own outside the panels", () => {
    renderShell({ scroll: "column" });

    const root = screen.getByTestId("inspector-shell");
    const header = screen.getByTestId("header");
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels.some((panel) => panel.contains(header))).toBe(true);
    for (const child of Array.from(root.children)) {
      const isPanel = panels.includes(child as HTMLElement);
      const isStrip = child === screen.getByTestId("inspector-tabs");
      if (!isPanel && !isStrip) {
        expect(child).not.toContainElement(header);
      }
    }
  });
});
