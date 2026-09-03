import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { SidebarDriveSwitcher } from "../SidebarDriveSwitcher";
import { SidebarLibrarySection } from "../SidebarLibrarySection";
import type { Drive } from "@/types";

const drive = (name: string, isProtected = false): Drive => ({
  name,
  protected: isProtected,
  file_count: 0,
});

const DRIVES = [drive("media"), drive("notes"), drive("vault", true)];

describe("SidebarDriveSwitcher", () => {
  it("shows the current drive as one row, not the whole list", () => {
    render(<SidebarDriveSwitcher drives={DRIVES} currentDrive="media" close={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Switch drive" })).toBeInTheDocument();
    expect(screen.getByText("media")).toBeInTheDocument();
    expect(screen.queryByText("notes")).not.toBeInTheDocument();
    expect(screen.queryByText("vault")).not.toBeInTheDocument();
  });

  it("opens the other drives when the row is pressed", () => {
    render(<SidebarDriveSwitcher drives={DRIVES} currentDrive="media" close={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Switch drive" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Switch drive" }));
    expect(screen.getByRole("link", { name: /notes/ })).toBeInTheDocument();

    rerender(<SidebarDriveSwitcher drives={DRIVES} currentDrive="notes" close={vi.fn()} />);

    expect(screen.queryByRole("link", { name: /vault/ })).not.toBeInTheDocument();
  });

  it("lists every drive where there is no current one, so the way in survives", () => {
    // The root picker and /admin have no drive to fold into. Folding
    // anyway would leave the switch naming nothing.
    render(<SidebarDriveSwitcher drives={DRIVES} currentDrive={null} close={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Switch drive" })).not.toBeInTheDocument();
    for (const name of ["media", "notes", "vault"]) {
      expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveAttribute(
        "href",
        `/drive/${name}`,
      );
    }
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

  it("keeps the five filter views, in order", () => {
    // Item 10 moves the drive list; it does not re-rank the views.
    const { container } = render(<SidebarLibrarySection {...props} />);
    const labels = Array.from(container.querySelectorAll("a")).map((a) =>
      (a.textContent ?? "").trim(),
    );
    const views = labels.filter((l) =>
      ["Favorites", "Liked", "Recently Viewed", "Recently Added", "All Files"].includes(l),
    );
    expect(views).toEqual([
      "Favorites",
      "Liked",
      "Recently Viewed",
      "Recently Added",
      "All Files",
    ]);
  });

  it("names the addon group through the catalogue, not in English source", () => {
    render(
      <SidebarLibrarySection
        {...props}
        addons={{ knowledge: { label: "Knowledge", icon: "notebook-pen", href: "/", scope: "drive" } }}
      />,
    );
    const heading = screen.getByText("Addons");
    expect(heading.className).not.toMatch(/uppercase|tracking-wider/);
    expect(within(heading.parentElement!).queryByRole("button")).toBeNull();
  });
});
