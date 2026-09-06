import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SidebarDriveSwitcher } from "../SidebarDriveSwitcher";
import { SidebarLibrarySection } from "../SidebarLibrarySection";
import type { Drive } from "@/types";
import { wearsSidebarHeadingClasses } from "@/test/sidebarHeadingClasses";

const drive = (name: string, isProtected = false): Drive => ({
  name,
  protected: isProtected,
  file_count: 0,
});

const DRIVES = [drive("media"), drive("notes"), drive("vault", true)];

describe("SidebarDriveSwitcher", () => {
  it("shows the current drive as one row, not the whole list", () => {
    render(<SidebarDriveSwitcher drives={DRIVES} currentDrive="media" close={vi.fn()} />);

    expect(screen.getByRole("button", { name: /media/ })).toBeInTheDocument();
    expect(screen.getByText("media")).toBeInTheDocument();
    expect(screen.queryByText("notes")).not.toBeInTheDocument();
    expect(screen.queryByText("vault")).not.toBeInTheDocument();
  });

  it("opens the other drives when the row is pressed", () => {
    render(<SidebarDriveSwitcher drives={DRIVES} currentDrive="media" close={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /media/ }));

    expect(screen.getByRole("link", { name: /notes/ })).toHaveAttribute(
      "href",
      "/drive/notes",
    );
    expect(screen.getByRole("link", { name: /vault/ })).toBeInTheDocument();
    // The name you are already on is not offered as a destination.
    expect(screen.queryByRole("link", { name: /media/ })).not.toBeInTheDocument();
  });

  it("stays open only until the drive actually changes", () => {
    const { rerender } = render(
      <SidebarDriveSwitcher drives={DRIVES} currentDrive="media" close={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /media/ }));
    expect(screen.getByRole("link", { name: /notes/ })).toBeInTheDocument();

    rerender(<SidebarDriveSwitcher drives={DRIVES} currentDrive="notes" close={vi.fn()} />);

    expect(screen.queryByRole("link", { name: /vault/ })).not.toBeInTheDocument();
  });

  /**
   * H-2's sidebar half. On the root the body already lists every drive as
   * a card; a sidebar repeating it is the same answer twice on one screen.
   */
  describe("off a drive", () => {
    const renderRoot = () =>
      render(<SidebarDriveSwitcher drives={DRIVES} currentDrive={null} close={vi.fn()} />);

    it("folds the list behind a row that names it", () => {
      renderRoot();
      const row = screen.getByRole("button", { name: /Drives \(3\)/ });
      expect(row).toHaveAttribute("aria-expanded", "false");
      for (const name of ["media", "notes", "vault"]) {
        expect(screen.queryByRole("link", { name: new RegExp(name) })).toBeNull();
      }
    });

    it("opens on one press", () => {
      renderRoot();
      fireEvent.click(screen.getByRole("button", { name: /Drives \(3\)/ }));
      expect(
        screen.getByRole("button", { name: /Drives \(3\)/ }),
      ).toHaveAttribute("aria-expanded", "true");
      for (const name of ["media", "notes", "vault"]) {
        expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveAttribute(
          "href",
          `/drive/${name}`,
        );
      }
    });

    it("names itself with the words on screen (WCAG 2.5.3)", () => {
      renderRoot();
      const row = screen.getByRole("button", { name: /Drives \(3\)/ });
      // Its content *is* its accessible name, so the query above is the
      // assertion. No `aria-label`: an override identical to the visible
      // text is one more string to keep in step, and this row has nothing
      // to add to what it already reads.
      expect(row.getAttribute("aria-label")).toBeNull();
      expect(row.textContent).toContain("Drives");
    });

    it("is a fold row, not a section heading", () => {
      // Phase 1 cut the sidebar to five headings and
      // `sidebar-headings.test.ts` pins that count from the source; this is
      // the same claim about what reaches the screen. A sidebar heading is
      // a `div` around a `button` and has never been an `h1`-`h6`, so
      // counting heading *elements* here was zero either way — what tells
      // the two apart is the classes they wear.
      const { container } = renderRoot();
      const row = screen.getByRole("button", { name: /Drives \(3\)/ });
      expect(row.tagName).toBe("BUTTON");

      const classed = [...container.querySelectorAll("[class]")];
      // "None of them wears a heading" is also true of nothing at all, and
      // the row this test is about has to be one of the ones being asked.
      expect(classed).toContain(row);
      expect(
        classed.filter(wearsSidebarHeadingClasses).map((el) => el.className),
      ).toEqual([]);
    });

    it("shows the one drive rather than a row to unfold it", () => {
      // Folded or open it is one line either way, so the fold row would
      // turn one line into two. A choice between one thing is not a choice.
      render(
        <SidebarDriveSwitcher drives={[drive("media")]} currentDrive={null} close={vi.fn()} />,
      );
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.getByRole("link", { name: /media/ })).toBeInTheDocument();
    });

    it("folds again on the way back from a drive", () => {
      const { rerender } = renderRoot();
      fireEvent.click(screen.getByRole("button", { name: /Drives \(3\)/ }));
      expect(screen.getByRole("link", { name: /notes/ })).toBeInTheDocument();

      rerender(<SidebarDriveSwitcher drives={DRIVES} currentDrive="notes" close={vi.fn()} />);
      rerender(<SidebarDriveSwitcher drives={DRIVES} currentDrive={null} close={vi.fn()} />);

      expect(
        screen.getByRole("button", { name: /Drives \(3\)/ }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("remembers nothing across the trip", () => {
      const before = new Set(Object.keys(localStorage));
      renderRoot();
      fireEvent.click(screen.getByRole("button", { name: /Drives \(3\)/ }));
      // The first two axes of the sidebar restore what the system took
      // away. This one was never taken, so there is nothing to restore
      // and no key to add. DESIGN.md §Sidebar.
      expect(new Set(Object.keys(localStorage))).toEqual(before);
    });
  });

  it("offers no switch when there is nowhere else to go", () => {
    render(
      <SidebarDriveSwitcher drives={[drive("media")]} currentDrive="media" close={vi.fn()} />,
    );

    expect(screen.getByText("media")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing at all when no drive is visible", () => {
    const { container } = render(
      <SidebarDriveSwitcher drives={[]} currentDrive={null} close={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the drives it is handed, so a locked one cannot appear", () => {
    // getDrives() drops locked protected drives before they reach here
    // (a drive is a security boundary). This fixes that the switcher
    // adds nothing of its own — no cached list, no name from the URL.
    render(
      <SidebarDriveSwitcher drives={[drive("media")]} currentDrive={null} close={vi.fn()} />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("vault")).not.toBeInTheDocument();
  });
});

describe("sidebar top — item 10", () => {
  const props = {
    driveBase: "/drive/media",
    currentDrive: "media",
    drives: DRIVES,
    linkClass: () => "link",
    close: vi.fn(),
  };

  it("puts the drive row above the views", () => {
    const { container } = render(<SidebarLibrarySection {...props} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("media")).toBeLessThan(text.indexOf("Home"));
  });

  it("has no LIBRARY heading over the views", () => {
    render(<SidebarLibrarySection {...props} />);
    expect(screen.queryByText("Library")).not.toBeInTheDocument();
  });

  it("keeps the views, in order, and adds none", () => {
    // Item 10 moves the drive list; it does not re-rank the views.
    // Asserted as the whole ordered list rather than a filtered subset:
    // filtering to the five expected names makes the test blind to a
    // sixth view inserted between them, to Trash moving above
    // Favorites, and to a rename (which drops out of the filter and the
    // expectation at the same time).
    const { container } = render(<SidebarLibrarySection {...props} />);
    const labels = Array.from(container.querySelectorAll("a")).map((a) =>
      (a.textContent ?? "").trim(),
    );
    expect(labels).toEqual([
      "Litloft",
      "Home",
      "Favorites",
      "Liked",
      "Recently Viewed",
      "Recently Added",
      "All Files",
      "Trash",
    ]);
  });

  it("names the addon group through the catalogue, not in English source", () => {
    render(
      <SidebarLibrarySection
        {...props}
        addons={{ knowledge: { label: "Knowledge", icon: "notebook-pen", href: "/", scope: "drive" } }}
      />,
    );
    // `getByText` returns the innermost element holding the text —
    // the `<span class="truncate">` — and the classes under test are
    // on its parent. Asserting on the span's own className checks
    // "truncate" against a regex it can never match, which is green
    // whatever the heading does.
    const label = screen.getByText("Addons");
    const heading = label.parentElement!;
    expect(heading.className).toMatch(/text-\[11px\]/);
    expect(heading.className).not.toMatch(/uppercase|tracking-wider/);
    // `closest`, not `within(parentElement)`: `within` searches
    // descendants only, so if the heading became a button the query
    // would look *inside* that button, find nothing, and pass.
    expect(label.closest("button")).toBeNull();
  });
});
