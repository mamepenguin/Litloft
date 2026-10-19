import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { ArchiveToolbar, BAR_ROOMY } from "../ArchiveToolbar";
import type { ArchiveContents } from "@/types";

vi.mock("@/lib/api", () => ({
  getDownloadUrl: (fileId: string) => `/api/files/${fileId}/stream`,
}));

const archive: ArchiveContents = {
  entries: [],
  total_entries: 5,
  total_size: 10240,
};

const breadcrumbs = [
  { label: "Archive", path: "" },
  { label: "docs", path: "docs" },
];

function renderToolbar(
  overrides: Partial<React.ComponentProps<typeof ArchiveToolbar>> = {}
) {
  const props: React.ComponentProps<typeof ArchiveToolbar> = {
    fileId: "file-1",
    archive,
    breadcrumbs,
    handleBreadcrumbClick: vi.fn(),
    viewMode: "grid",
    onViewModeChange: vi.fn(),
    sort: "name",
    order: "asc",
    typeFilter: null,
    onSortChange: vi.fn(),
    onOrderChange: vi.fn(),
    onTypeFilterChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<ArchiveToolbar {...props} />), props };
}

function controlsRow(): HTMLElement {
  return screen.getByTestId("archive-controls");
}

function openMenu(name: RegExp): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name }));
  const menus = screen.getAllByRole("menu");
  return menus[menus.length - 1];
}

describe("ArchiveToolbar", () => {
  it("renders breadcrumbs", () => {
    renderToolbar();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("calls handleBreadcrumbClick when a breadcrumb is clicked", () => {
    const handleBreadcrumbClick = vi.fn();
    renderToolbar({ handleBreadcrumbClick });

    fireEvent.click(screen.getByText("Archive"));
    expect(handleBreadcrumbClick).toHaveBeenCalledWith("");
  });

  // A trail too deep to draw folds, and the marker is then the only control
  // standing for the folders it hid.
  describe("a folded trail", () => {
    const deep = ["Archive", "a", "b", "c", "d"].map((label, i, all) => ({
      label,
      path: all.slice(1, i + 1).join("/"),
    }));

    it("draws the archive, the folder above and the folder inside it", () => {
      renderToolbar({ breadcrumbs: deep });
      for (const drawn of ["Archive", "c", "d"]) {
        expect(screen.getByText(drawn)).toBeInTheDocument();
      }
      for (const hidden of ["a", "b"]) {
        expect(screen.queryByText(hidden)).toBeNull();
      }
    });

    it("sends the marker to the deepest folder it hid", () => {
      const handleBreadcrumbClick = vi.fn();
      renderToolbar({ breadcrumbs: deep, handleBreadcrumbClick });

      fireEvent.click(screen.getByText("…"));
      expect(handleBreadcrumbClick).toHaveBeenCalledWith("a/b");
    });

    it("keeps the drawn folders pointing at their own paths", () => {
      const handleBreadcrumbClick = vi.fn();
      renderToolbar({ breadcrumbs: deep, handleBreadcrumbClick });

      fireEvent.click(screen.getByText("c"));
      expect(handleBreadcrumbClick).toHaveBeenLastCalledWith("a/b/c");
      fireEvent.click(screen.getByText("Archive"));
      expect(handleBreadcrumbClick).toHaveBeenLastCalledWith("");
    });
  });

  it("draws no <select>", () => {
    const { container } = renderToolbar();
    expect(container.querySelectorAll("select").length).toBe(0);
  });

  it("offers order and direction as one menu of six rows", () => {
    renderToolbar();

    expect(
      within(controlsRow()).getAllByRole("button", { name: /^Sort: / }).length
    ).toBe(1);

    const menu = openMenu(/^Sort: /);
    expect(within(menu).getAllByRole("menuitemradio").length).toBe(6);
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((row) => row.textContent)
    ).toEqual([
      "Name A→Z",
      "Name Z→A",
      "Size smallest",
      "Size largest",
      "Type A→Z",
      "Type Z→A",
    ]);
  });

  it("names the order that is on", () => {
    renderToolbar({ sort: "size", order: "desc" });
    expect(
      screen.getByRole("button", { name: "Sort: Size largest" })
    ).toBeInTheDocument();
  });

  it("moves field and direction together from one row", () => {
    const onSortChange = vi.fn();
    const onOrderChange = vi.fn();
    renderToolbar({ onSortChange, onOrderChange });

    const menu = openMenu(/^Sort: /);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Size largest" }));

    expect(onSortChange).toHaveBeenCalledWith("size");
    expect(onOrderChange).toHaveBeenCalledWith("desc");
  });

  it("offers the six type filters as a menu", () => {
    renderToolbar();
    const menu = openMenu(/^File type: /);
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((row) => row.textContent)
    ).toEqual(["All", "Image", "Text", "Video", "Audio", "Other"]);
  });

  it("calls onTypeFilterChange with the chosen type, and with null for All", () => {
    const onTypeFilterChange = vi.fn();
    renderToolbar({ onTypeFilterChange, typeFilter: "image" });

    expect(
      screen.getByRole("button", { name: "File type: Image" })
    ).toBeInTheDocument();

    const menu = openMenu(/^File type: /);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Image" }));
    expect(onTypeFilterChange).toHaveBeenCalledWith("image");

    // Choosing a row closes the menu, so "All" needs it opened again.
    const reopened = openMenu(/^File type: /);
    fireEvent.click(within(reopened).getByRole("menuitemradio", { name: "All" }));
    expect(onTypeFilterChange).toHaveBeenCalledWith(null);
  });

  it("names the layout that is on, and switches it", () => {
    const onViewModeChange = vi.fn();
    renderToolbar({ viewMode: "grid", onViewModeChange });

    expect(
      screen.getByRole("button", { name: "View: Grid view" })
    ).toBeInTheDocument();

    const menu = openMenu(/^View: /);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "List view" }));
    expect(onViewModeChange).toHaveBeenCalledWith("list");
  });

  // These two triggers are at the *left* of the bar, so the default
  // right-anchored menu would hang off the frame.
  it("hangs its two left-hand menus from their left edges", () => {
    renderToolbar();
    for (const trigger of [/^Sort: /, /^File type: /]) {
      const menu = openMenu(trigger);
      expect(menu.className).toContain("sm:left-0");
      expect(menu.className).not.toContain("sm:right-0");
      fireEvent.keyDown(menu, { key: "Escape" });
    }
  });

  // The archive's download link lives in the breadcrumb bar above and is out
  // of scope for this row.
  it("has no unlabelled control in the row of controls", () => {
    renderToolbar();
    const unlabelled = Array.from(
      controlsRow().querySelectorAll("button, a")
    ).filter((el) => !el.textContent?.trim() && !el.getAttribute("aria-label"));
    expect(unlabelled.length).toBe(0);
  });

  it("looks at a row that actually holds the controls", () => {
    // Four, not three: both scopes of the bar are in the tree at once —
    // Sort, File type, the `…` that holds them below 640, and View.
    renderToolbar();
    expect(controlsRow().querySelectorAll("button").length).toBe(4);
  });

  // `BAR_ROOMY` and `sm:hidden` are two halves of one decision: a control
  // removed from the bar without arriving in the overflow is a function the
  // reader can no longer reach at that width.
  it("says which controls leave the bar in an attribute, not only in a class", () => {
    renderToolbar();
    const scoped = Array.from(
      controlsRow().querySelectorAll<HTMLElement>("[data-bar]")
    );
    expect(
      scoped.map((el) => el.querySelector("button")!.getAttribute("aria-label"))
    ).toEqual(["Sort: Name A→Z", "File type: All"]);
    // Attribute and class on the same element, saying the same thing. Split
    // across two they could disagree, and the class is the one that decides.
    for (const el of scoped) {
      expect(el.className).toContain(BAR_ROOMY.className);
    }
  });

  it("puts the two that leave into the overflow, at exactly the widths they left", () => {
    // Read from `BAR_ROOMY` rather than written out: a bar that hides a
    // control at 900px while the overflow only offers it below 640px loses
    // the function outright in between, and nothing about that fails.
    const breakpoint = BAR_ROOMY.className.match(/^hidden (\w+):flex$/)![1];
    renderToolbar();
    const overflow = screen
      .getByRole("button", { name: "More actions" })
      .closest("div")!;
    expect(overflow.className).toContain(`${breakpoint}:hidden`);
  });

  it("closes the overflow on Escape and hands focus back to its trigger", () => {
    renderToolbar();
    const trigger = screen.getByRole("button", { name: "More actions" });
    const menu = openMenu(/^More actions$/);

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("hands focus back when a row in the overflow is pressed", () => {
    renderToolbar();
    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(
      within(openMenu(/^More actions$/)).getByRole("menuitemradio", {
        name: "Image",
      })
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not let the Escape reach the shortcut registry as well", () => {
    // A React `onKeyDown` is invisible to `ShortcutsProvider`, so an Escape
    // that bubbles past this box is answered twice — once here and once by
    // whatever the registry has on the stack.
    renderToolbar();
    const onDocumentEscape = vi.fn();
    document.addEventListener("keydown", onDocumentEscape);
    fireEvent.keyDown(openMenu(/^More actions$/), { key: "Escape" });
    document.removeEventListener("keydown", onDocumentEscape);
    expect(onDocumentEscape).not.toHaveBeenCalled();
  });

  // The anchored form of every menu here is `absolute` inside this card, so
  // a clipping ancestor hides its rows.
  it("does not clip the popovers its own menus open", () => {
    const { container } = renderToolbar();
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).not.toContain("overflow-hidden");
    expect(controlsRow().closest(".overflow-hidden")).toBeNull();
  });

  it("offers every folded row inside the overflow menu", () => {
    renderToolbar();
    const menu = openMenu(/^More actions$/);
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((row) => row.textContent)
    ).toEqual([
      "Name A→Z",
      "Name Z→A",
      "Size smallest",
      "Size largest",
      "Type A→Z",
      "Type Z→A",
      "All",
      "Image",
      "Text",
      "Video",
      "Audio",
      "Other",
    ]);
  });

  it("moves order and filter from the overflow menu too", () => {
    const onSortChange = vi.fn();
    const onOrderChange = vi.fn();
    const onTypeFilterChange = vi.fn();
    renderToolbar({ onSortChange, onOrderChange, onTypeFilterChange });

    fireEvent.click(
      within(openMenu(/^More actions$/)).getByRole("menuitemradio", {
        name: "Size largest",
      })
    );
    expect(onSortChange).toHaveBeenCalledWith("size");
    expect(onOrderChange).toHaveBeenCalledWith("desc");

    fireEvent.click(
      within(openMenu(/^More actions$/)).getByRole("menuitemradio", {
        name: "Image",
      })
    );
    expect(onTypeFilterChange).toHaveBeenCalledWith("image");
  });
});
