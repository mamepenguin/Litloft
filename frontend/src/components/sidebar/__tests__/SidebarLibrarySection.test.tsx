import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarLibrarySection } from "../SidebarLibrarySection";

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

const linkClass = (href: string) =>
  href.includes("favorites") ? "active" : "inactive";

// The same shape `Sidebar` passes: the override wins where a caller gives
// one, and the href decides otherwise.
const overrideAware = (href: string, active?: boolean) =>
  (active ?? href.includes("favorites")) ? "active" : "inactive";

describe("SidebarLibrarySection", () => {
  it("renders Litloft logo link", () => {
    render(<SidebarLibrarySection libraryActive={false} driveBase={null} currentDrive={null} linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("Litloft")).toBeInTheDocument();
  });

  it("renders home link", () => {
    render(<SidebarLibrarySection libraryActive={false} driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("shows library links when driveBase is set", () => {
    render(<SidebarLibrarySection libraryActive={false} driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("Recently Viewed")).toBeInTheDocument();
    expect(screen.getByText("Recently Added")).toBeInTheDocument();
    expect(screen.getByText("All Files")).toBeInTheDocument();
  });

  it("hides library links when driveBase is null", () => {
    render(<SidebarLibrarySection libraryActive={false} driveBase={null} currentDrive={null} linkClass={linkClass} close={vi.fn()} />);
    expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Viewed")).not.toBeInTheDocument();
  });

  it("calls close on link click", () => {
    const close = vi.fn();
    render(<SidebarLibrarySection libraryActive={false} driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={close} />);
    fireEvent.click(screen.getByText("Favorites"));
    expect(close).toHaveBeenCalled();
  });

  it("applies linkClass to links", () => {
    render(<SidebarLibrarySection libraryActive={false} driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    const favLink = screen.getByText("Favorites").closest("a");
    expect(favLink?.className).toBe("active");
  });

  it("draws Library, and leaves it to its owner to say whether it is selected", () => {
    // `linkClass` above answers from the href, and Library's href is not
    // what decides its highlight — so the prop is the only thing that can,
    // and this is the pair that shows it reaches the row.
    const { rerender } = render(
      <SidebarLibrarySection libraryActive={false} driveBase="/drive/main" currentDrive="main" linkClass={overrideAware} close={vi.fn()} />,
    );
    expect(screen.getByText("Library").closest("a")).toHaveAttribute("href", "/drive/main?view=library");
    expect(screen.getByText("Library").closest("a")?.className).toBe("inactive");

    rerender(
      <SidebarLibrarySection libraryActive driveBase="/drive/main" currentDrive="main" linkClass={overrideAware} close={vi.fn()} />,
    );
    expect(screen.getByText("Library").closest("a")?.className).toBe("active");
  });

  it("keeps the rows this section no longer owns out of it", () => {
    // Trash, Missing Files and Dashboard moved below the reader's own
    // sections (spec §5.1) and are `SidebarSystemSection`'s. Asserted here
    // rather than only there, because a row rendered in *both* places
    // passes that file's tests and appears twice on the column.
    render(<SidebarLibrarySection libraryActive={false} driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.queryByText("Trash")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing Files")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});
