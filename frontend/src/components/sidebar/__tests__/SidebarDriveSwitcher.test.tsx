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
      expect(row.getAttribute("aria-label")).toBeNull();
      expect(row.textContent).toContain("Drives");
    });

    it("is a fold row, not a section heading", () => {
      // A sidebar heading is a `div` around a `button`, never an `h1`-`h6`,
      // so the classes it wears are what identify one.
      const { container } = renderRoot();
      const row = screen.getByRole("button", { name: /Drives \(3\)/ });
      expect(row.tagName).toBe("BUTTON");

      const classed = [...container.querySelectorAll("[class]")];
      expect(classed).toContain(row);
      expect(
        classed.filter(wearsSidebarHeadingClasses).map((el) => el.className),
      ).toEqual([]);
    });

    it("shows the one drive rather than a row to unfold it", () => {
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
    // getDrives() drops locked protected drives before they reach here, so
    // the switcher must add nothing of its own — no cached list, no name from
    // the URL.
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

  const at = (text: string, needle: string) => {
    const i = text.indexOf(needle);
    expect(i, `${needle} is not on the column`).not.toBe(-1);
    return i;
  };

  it("puts the drive row above the views", () => {
    const { container } = render(<SidebarLibrarySection libraryActive={false} {...props} />);
    const text = container.textContent ?? "";
    expect(at(text, "media")).toBeLessThan(at(text, "Home"));
  });

  it("heads the views with VIEWS, below the purpose rows and not over them", () => {
    const { container } = render(<SidebarLibrarySection libraryActive={false} {...props} />);
    const text = container.textContent ?? "";
    expect(at(text, "Library")).toBeLessThan(at(text, "Views"));
    expect(at(text, "Views")).toBeLessThan(at(text, "Favorites"));
    expect(screen.getByText("Views").closest("a")).toBeNull();
  });

  it("keeps the views, in order, and adds none", () => {
    const { container } = render(<SidebarLibrarySection libraryActive={false} {...props} />);
    const labels = Array.from(container.querySelectorAll("a")).map((a) =>
      (a.textContent ?? "").trim(),
    );
    expect(labels).toEqual([
      "Home",
      "Library",
      "Favorites",
      "Liked",
      "Recently Viewed",
      "Recently Added",
      "All Files",
    ]);
  });

  it("names the source group through the catalogue, not in English source", () => {
    render(
      <SidebarLibrarySection libraryActive={false}
        {...props}
        sourceAddons={[
          {
            name: "media_import",
            href: "/drive/d/addons/media_import",
            navigation: { label: "YouTube & Feeds", placement: "sources", priority: 10 },
          },
        ]}
      />,
    );
    // `getByText` returns the inner `<span class="truncate">`; the classes
    // under test are on its parent.
    const label = screen.getByText("Sources");
    const heading = label.parentElement!;
    expect(heading.className).toMatch(/text-\[11px\]/);
    expect(heading.className).not.toMatch(/uppercase|tracking-wider/);
    // `closest`, not `within(parentElement)`: `within` searches descendants
    // only, so it would pass if the heading itself became a button.
    expect(label.closest("button")).toBeNull();
  });
});
