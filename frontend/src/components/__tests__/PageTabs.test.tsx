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
    // view. A `<Link>` replaces the page.
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

    it("marks selection with a border, never an accent fill", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      const selected = screen.getByRole("tab", { name: "Watch" });
      expect(selected.classList.contains("border-accent")).toBe(true);
      expect(selected.classList.contains("bg-accent")).toBe(false);
      expect(selected.classList.contains("text-white")).toBe(false);
    });

    it("gives the selected tab the weight and colour DESIGN.md states", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      const selected = screen.getByRole("tab", { name: "Watch" });
      expect(selected.classList.contains("font-semibold")).toBe(true);
      expect(selected.classList.contains("text-text-primary")).toBe(true);
    });

    // `aria-current="page"` names the current page in a set of navigations.
    // A tab swaps a panel, so its state is `aria-selected` and nothing else.
    it("puts no aria-current on a tab that does not navigate", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="manage" label="Views" />);
      for (const tab of screen.getAllByRole("tab")) {
        expect(tab.getAttribute("aria-current")).toBeNull();
      }
    });

    // `aria-selected` belongs to a tab. On a link it is invalid ARIA.
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

  // Not an `aria-hidden` assertion on the icon: lucide-react adds that
  // attribute itself whenever no a11y prop is passed.
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

    it("is not imposed on a fine pointer", () => {
      render(<PageTabs items={BUTTON_ITEMS} current="watch" label="Views" />);
      const ungated = [...screen.getByRole("tab", { name: "Watch" }).classList].filter(
        (c) => /^min-h-/.test(c),
      );
      expect(ungated).toEqual([]);
    });
  });

  it("emits no aria-controls on a row that navigates", () => {
    render(
      <PageTabs
        items={[
          { key: "a", label: "A", href: "/a", controls: "panel-a", id: "tab-a" },
          { key: "b", label: "B", controls: "panel-b", id: "tab-b" },
        ]}
        current="a"
        label="Views"
      />,
    );
    const button = screen.getByRole("button", { name: "B" });
    expect(button.getAttribute("aria-controls")).toBeNull();
    expect(button.getAttribute("role")).toBeNull();
    expect(button.id).toBe("");
  });
});
