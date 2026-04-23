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
    expect(screen.getByText("ホーム")).toBeInTheDocument();
  });

  it("shows library links when driveBase is set", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("お気に入り")).toBeInTheDocument();
    expect(screen.getByText("最近見た")).toBeInTheDocument();
    expect(screen.getByText("最近追加")).toBeInTheDocument();
    expect(screen.getByText("すべてのファイル")).toBeInTheDocument();
  });

  it("hides library links when driveBase is null", () => {
    render(<SidebarLibrarySection driveBase={null} currentDrive={null} linkClass={linkClass} close={vi.fn()} />);
    expect(screen.queryByText("お気に入り")).not.toBeInTheDocument();
    expect(screen.queryByText("最近見た")).not.toBeInTheDocument();
  });

  it("calls close on link click", () => {
    const close = vi.fn();
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={close} />);
    fireEvent.click(screen.getByText("お気に入り"));
    expect(close).toHaveBeenCalled();
  });

  it("applies linkClass to links", () => {
    render(<SidebarLibrarySection driveBase="/drive/main" currentDrive="main" linkClass={linkClass} close={vi.fn()} />);
    const favLink = screen.getByText("お気に入り").closest("a");
    expect(favLink?.className).toBe("active");
  });
});
