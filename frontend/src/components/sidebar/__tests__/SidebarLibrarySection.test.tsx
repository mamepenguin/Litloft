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

describe("SidebarLibrarySection", () => {
  it("renders Litloft logo link", () => {
    render(<SidebarLibrarySection driveBase={null} currentDrive={null} linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("Litloft")).toBeInTheDocument();
  });

  it("renders home link", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("shows library links when driveBase is set", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("Recently Viewed")).toBeInTheDocument();
    expect(screen.getByText("Recently Added")).toBeInTheDocument();
    expect(screen.getByText("All Files")).toBeInTheDocument();
  });

  it("hides library links when driveBase is null", () => {
    render(<SidebarLibrarySection driveBase={null} currentDrive={null} linkClass={linkClass} close={vi.fn()} />);
    expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Viewed")).not.toBeInTheDocument();
  });

  it("calls close on link click", () => {
    const close = vi.fn();
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={close} />);
    fireEvent.click(screen.getByText("Favorites"));
    expect(close).toHaveBeenCalled();
  });

  it("applies linkClass to links", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    const favLink = screen.getByText("Favorites").closest("a");
    expect(favLink?.className).toBe("active");
  });

  it("hides the dashboard link when the viewer is not admin", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("hides the dashboard link while admin status is unknown (isAdmin=false)", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} isAdmin={false} />);
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows the dashboard link only when the viewer is admin", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} isAdmin />);
    const adminLink = screen.getByText("Dashboard").closest("a");
    expect(adminLink).toHaveAttribute("href", "/admin");
  });
});
