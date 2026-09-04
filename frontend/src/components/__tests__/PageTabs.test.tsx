import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ListFilter, Sparkles } from "lucide-react";
import { PageTabs } from "../PageTabs";

const LINK_ITEMS = [
  { key: "ask", label: "Ask", href: "/drive/videos/addons/intelligence", icon: Sparkles },
  { key: "find", label: "Find", href: "/drive/videos/addons/intelligence/find", icon: ListFilter },
] as const;

const BUTTON_ITEMS = [
  { key: "watch", label: "Watch" },
  { key: "manage", label: "Manage" },
] as const;

describe("PageTabs", () => {
  it("renders every item", () => {
    render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("names the row for a screen reader", () => {
    render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
    expect(screen.getByLabelText("Views")).toBeInTheDocument();
  });

  it("calls onSelect with the key that was pressed", () => {
    const onSelect = vi.fn();
    render(
      <PageTabs
        items={BUTTON_ITEMS}
        current="watch"
        onSelect={onSelect}
        label="Views"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Manage" }));
    expect(onSelect).toHaveBeenCalledWith("manage");
  });

  describe("a row that navigates is not a tablist", () => {
    // `role="tab"` promises that activating the control swaps a panel in this
    // view. A `<Link>` replaces the page. `ModeTabs` carried both, which is the
    // pairing this component exists to separate.
    it("gives link tabs no tab roles", () => {
      render(<PageTabs items={LINK_ITEMS} current="ask" label="Modes" />);
      expect(screen.queryAllByRole("tab")).toHaveLength(0);
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.getAllByRole("link")).toHaveLength(2);
    });

    it("gives button tabs a tablist and tab roles", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      expect(screen.getByRole("tablist")).toBeInTheDocument();
      expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    // Mixed input takes the weaker promise. Asserted rather than left to the
    // reader, because "some" in the predicate is the whole decision.
    it("treats a mixed row as navigating", () => {
      render(
        <PageTabs
          items={[
            { key: "a", label: "A", href: "/a" },
            { key: "b", label: "B" },
          ]}
          current="a"
          label="Mixed"
        />,
      );
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.queryAllByRole("tab")).toHaveLength(0);
    });
  });

  describe("selection", () => {
    it("marks the current link tab as the current page", () => {
      render(<PageTabs items={LINK_ITEMS} current="find" label="Modes" />);
      expect(
        screen.getByRole("link", { name: /Find/ }).getAttribute("aria-current"),
      ).toBe("page");
      expect(
        screen.getByRole("link", { name: /Ask/ }).getAttribute("aria-current"),
      ).toBeNull();
    });

    it("marks the current button tab as selected", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="manage" label="Views" />);
      expect(
        screen.getByRole("tab", { name: "Manage" }).getAttribute("aria-selected"),
      ).toBe("true");
      expect(
        screen.getByRole("tab", { name: "Watch" }).getAttribute("aria-selected"),
      ).toBe("false");
    });

    // The reason the underline replaced the pill: `ModeTabs`'s selected tab was
    // `bg-accent text-white`, spending the page's one accent fill (DESIGN.md
    // §2.2) on saying which tab you are already looking at.
    it("marks selection with a border, never an accent fill", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      const selected = screen.getByRole("tab", { name: "Watch" });
      expect(selected.classList.contains("border-accent")).toBe(true);
      expect(selected.classList.contains("bg-accent")).toBe(false);
      expect(selected.classList.contains("text-white")).toBe(false);
    });

    // DESIGN.md §Tabs states the selected state as
    // `border-accent font-semibold text-text-primary`. Asserting only the
    // border left two thirds of the sentence unenforced.
    it("gives the selected tab the weight and colour DESIGN.md states", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      const selected = screen.getByRole("tab", { name: "Watch" });
      expect(selected.classList.contains("font-semibold")).toBe(true);
      expect(selected.classList.contains("text-text-primary")).toBe(true);
    });

    it("marks the current button tab as the current page too", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="manage" label="Views" />);
      expect(
        screen.getByRole("tab", { name: "Manage" }).getAttribute("aria-current"),
      ).toBe("page");
      expect(
        screen.getByRole("tab", { name: "Watch" }).getAttribute("aria-current"),
      ).toBeNull();
    });

    // `aria-selected` belongs to a tab. On a link it is invalid ARIA, and it
    // is the half of "a row that navigates is not a tablist" that the role
    // assertions do not reach — adding it changes no role, so nothing else
    // here would notice.
    it("puts no aria-selected on a navigating tab", () => {
      render(<PageTabs items={LINK_ITEMS} current="ask" label="Modes" />);
      for (const link of screen.getAllByRole("link")) {
        expect(link.getAttribute("aria-selected")).toBeNull();
      }
    });

    it("gives the unselected tab a transparent border, so nothing shifts", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      const unselected = screen.getByRole("tab", { name: "Manage" });
      expect(unselected.classList.contains("border-transparent")).toBe(true);
      expect(unselected.classList.contains("border-accent")).toBe(false);
    });
  });

  // The requirement is the *name a screen reader reads*, not the attribute
  // that produces it. Asserting `aria-hidden` on the icon looked like a test
  // and was not one: lucide-react adds that attribute itself whenever no a11y
  // prop is passed, so the assertion held with the component's own copy of it
  // deleted — it measured the dependency. An exact-name match fails whenever
  // the icon becomes announced, whichever layer stopped hiding it.
  it("names the tab by its label alone, with the icon unannounced", () => {
    render(<PageTabs items={LINK_ITEMS} current="ask" label="Modes" />);
    const names = screen.getAllByRole("link").map((el) => el.textContent);
    expect(names).toEqual(["Ask", "Find"]);
    expect(screen.getByRole("link", { name: "Ask" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ask" }).querySelector("svg"),
    ).not.toBeNull();
  });

  describe("the 44px floor", () => {
    it("is cleared on a coarse pointer", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      expect(
        screen.getByRole("tab", { name: "Watch" }).classList.contains(
          "pointer-coarse:min-h-11",
        ),
      ).toBe(true);
    });

    // DESIGN.md §Row Actions: the floor is stated under the mobile sizing
    // rules, so it governs touch and says nothing against a denser row on a
    // fine pointer. An ungated `min-h-11` would satisfy the coarse assertion
    // above while quietly imposing the height everywhere.
    it("is not imposed on a fine pointer", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      const ungated = [...screen.getByRole("tab", { name: "Watch" }).classList].filter(
        (c) => /^min-h-/.test(c),
      );
      expect(ungated).toEqual([]);
    });
  });
});
