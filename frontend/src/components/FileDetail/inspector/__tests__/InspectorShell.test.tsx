/**
 * The inspector as it is actually rendered.
 *
 * `tabs.test.ts` covers the composition rules as arithmetic. These
 * mount the thing, because the §2 acceptance criteria are all stated
 * about the real surface — "no tab strip with no addons", "『情報｜文字
 * 起こし』 with one", "three tabs with two" — and a pure-function test
 * of the composer is not that surface.
 *
 * No addon is named here either. Tabs arrive as slot entries, which is
 * the generic container core defines, so these read the same whether
 * the second tab comes from the intelligence addon or from something
 * written next year.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { InspectorShell } from "../InspectorShell";
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
) {
  return render(
    <InspectorShell
      header={<div data-testid="header">header</div>}
      tabs={buildInspectorTabs({ info, coreTabs, addonTabs })}
      resetKey="f1"
    />,
  );
}

const strip = () => screen.queryByTestId("inspector-tabs");
const tabs = () => screen.queryAllByRole("tab");

describe("InspectorShell", () => {
  it("draws no tab strip when nothing has claimed a tab", () => {
    // With no addon installed there is one tab, so the inspector looks
    // exactly as it did before any of this — which the design asked for.
    renderShell();

    expect(strip()).toBeNull();
    expect(tabs()).toHaveLength(0);
    expect(screen.getByText("info body")).toBeInTheDocument();
  });

  it("draws a strip of two when one slot entry claims a tab", () => {
    renderShell([{ entry: entry("a"), label: "文字起こし", content: <p>a body</p> }]);

    expect(strip()).not.toBeNull();
    // Exactly two. A lower bound would pass on a strip that lost one.
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
    // The whole point of the split: the per-file actions stay in one
    // place instead of being somewhere in a long column.
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    const header = screen.getByTestId("header");
    const panel = screen.getByRole("tabpanel");
    expect(panel).not.toContainElement(header);
    expect(panel.className).toContain("overflow-auto");
  });

  it("mounts every panel and hides the ones not selected", () => {
    // Not an optimisation — a correctness requirement. The companion's
    // occupants fetch, subscribe to the playback clock and hold a scroll
    // position; `globals.css` records the same invariant for the grid
    // form. Unmounting on every tab switch would re-fetch the transcript
    // and lose the reader's place whenever they glanced at the tags.
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
    // The same node, not a new one: a remount would replace it.
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
    // The commit this belongs to is about an English literal turning up
    // in a row of Japanese headings; the strip's own name is one.
    renderShell([{ entry: entry("a"), label: "A", content: <p>a body</p> }]);

    expect(screen.getByRole("tablist")).toHaveAccessibleName(
      "Inspector sections",
    );
  });

  it("follows the selection when its tab goes away, and does not spring back", () => {
    // A tab really does vanish: the reader moves the transcript below
    // the player, or a file turns out to have no chapters. Remembering
    // the dead id means the selection jumps off whatever they are
    // reading the moment that tab returns.
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

    // No strip at all: the only other tab has no button, so Info is
    // alone and a strip of one is no strip.
    expect(strip()).toBeNull();
    expect(screen.queryByRole("tab", { name: "A" })).toBeNull();
  });

  it("keeps the unlisted panel mounted, because it is what reports", () => {
    // The panel is the reporter. Unmounting it on the first "nothing"
    // would make that answer permanent — the file's transcript could
    // arrive and no one would be left to say so.
    renderShell([
      { entry: entry("a"), label: "A", content: <p>a body</p>, available: false },
    ]);

    const panel = screen.getByText("a body").closest("div[id]")!;
    expect(panel.id).toBe("inspector-panel-a");
    expect(panel).toHaveAttribute("hidden");
  });

  it("does not call the unlisted panel a tabpanel", () => {
    // `role="tabpanel"` is a promise that a tab points at it, and none
    // does. A screen reader walking the tablist would be told the group
    // has three panels and find two buttons.
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
    // Two listed and one not: the arrows have to walk past the unlisted
    // one rather than through it, or one press shows a panel whose own
    // entry has just said it is empty.
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

    // Wrapping goes back to Info, not on to the unlisted one — and the
    // focus goes with it. The selection alone would not show this: the
    // shell already corrects a selection that lands on an unlisted tab,
    // so a walk that steps onto one still *ends* on Info. What it loses
    // is the focus, which stays behind on a tab that is no longer
    // selected, because the unlisted tab has no button to move it to.
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    const info = screen.getByRole("tab", { name: "Info" });
    expect(info).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(info);
    expect(document.getElementById("inspector-panel-gone")).toHaveAttribute(
      "hidden",
    );
  });

  it("lets go of a tab that is unlisted while it is the one open", () => {
    // The arrow-key test above walks the strip and so never reaches the
    // line that resolves the selection — a separate expression, and the
    // one this path uses. What reaches it is the entry answering "I have
    // nothing" *while the reader is looking at it*: an empty fetch
    // settles, a transcript is deleted, the host swaps the file under a
    // reused mount.
    //
    // Resolved against every tab rather than the listed ones, the panel
    // the entry has just called empty stays on screen — and worse, no
    // button matches the selection, so none is `aria-selected` and the
    // roving tabindex leaves every one of them at -1: the whole strip
    // drops out of the keyboard tab order.
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
    // And the strip is still reachable: exactly one button is selected,
    // and it is the one the keyboard can get to.
    const selected = tabs().filter(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute("tabindex", "0");
  });

  it("gives an unlisted panel back its button when the entry changes its mind", () => {
    // The whole reason the panel stays mounted. A transcript that was
    // still fetching says "nothing" first and "something" a moment
    // later, and the tab has to come back.
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
    // The same node: it was hidden, not rebuilt.
    expect(screen.getByText("a body")).toBe(before);
  });

  it("drops a core tab whose content did not materialise", () => {
    renderShell([], [{ id: "chapters", label: "Chapters", content: null }]);
    expect(strip()).toBeNull();
  });
});

describe("InspectorShell — no addon ids in core", () => {
  it("renders whatever a slot entry is called, without knowing what it is", () => {
    // The §2 guarantee, stated as a test: a second `player-side` entry
    // from an addon nobody has written yet gets a tab, and core needed
    // no edit to give it one.
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
