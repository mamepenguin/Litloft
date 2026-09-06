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

/** The row of controls, i.e. everything below the breadcrumb bar. */
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

  // ARC-2. The folder toolbar answers this question with menus and the
  // archive answered it with three OS-drawn selects, on the same app one
  // click apart. A count, not a spot check: the sort select was the one the
  // survey photographed, and there were two more beside it.
  it("draws no <select>", () => {
    const { container } = renderToolbar();
    expect(container.querySelectorAll("select").length).toBe(0);
  });

  it("offers order and direction as one menu of six rows", () => {
    renderToolbar();

    // One control, not two: field and direction were separate selects, and
    // "Name" + "Descending" is a sentence the reader had to assemble.
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

    // Choosing a row closes the menu, so "All" needs it opened again. `null`
    // rather than the empty string the removed `<select>` carried: the value
    // and its absence are now the same type.
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

  // Measured in Chromium at 768 and 1512 before it was fixed: these two
  // triggers are at the *left* of the bar, and the default right-anchored
  // menu put its left edge at -55 with two columns of every row off the
  // frame. jsdom computes no layout, so what is asserted here is the class
  // that decides it — the geometry is recorded in `ToolbarMenu.tsx`.
  it("hangs its two left-hand menus from their left edges", () => {
    renderToolbar();
    for (const trigger of [/^Sort: /, /^File type: /]) {
      const menu = openMenu(trigger);
      expect(menu.className).toContain("sm:left-0");
      expect(menu.className).not.toContain("sm:right-0");
      fireEvent.keyDown(menu, { key: "Escape" });
    }
  });

  // 案 2's rule, applied to the second toolbar that takes these menus: a
  // control on the bar says what it is in a word. The archive's download link
  // lives in the breadcrumb bar above and is out of scope for this row.
  it("has no unlabelled control in the row of controls", () => {
    renderToolbar();
    const unlabelled = Array.from(
      controlsRow().querySelectorAll("button, a")
    ).filter((el) => !el.textContent?.trim() && !el.getAttribute("aria-label"));
    expect(unlabelled.length).toBe(0);
  });

  it("looks at a row that actually holds the controls", () => {
    // Every control in an empty row is labelled. This is what says the
    // selector above found the row rather than an empty div. Four, not
    // three: jsdom computes no layout, so both scopes of the bar are in the
    // tree at once — Sort, File type, the `…` that holds them below 640, and
    // View.
    renderToolbar();
    expect(controlsRow().querySelectorAll("button").length).toBe(4);
  });

  // The folder toolbar's rule, and the reason it is a test rather than a
  // comment: `BAR_ROOMY` and `sm:hidden` are two halves of one decision, and
  // a control removed from the bar without arriving here is a function the
  // reader can no longer reach at that width. Nothing in the layout fails
  // when that happens.
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

  // The contract `ToolbarMenu` documents and its own test asserts, applied to
  // the one menu on this bar that is written by hand. Without the Escape the
  // menu cannot be dismissed from the keyboard at all; without the focus
  // return it unmounts with focus on `<body>` and the next Tab restarts from
  // the top of the document.
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

  // The anchored form of every menu here is `absolute` inside this card. A
  // clipping ancestor paints about four pixels of a 290px popover and hides
  // every row at 640 and up — measured only by opening it, which jsdom cannot
  // do, so what is asserted is the property that decides it.
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
