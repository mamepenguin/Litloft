import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarLibrarySection } from "../sidebar/SidebarLibrarySection";

const defaultProps = {
  driveBase: "/drive/main",
  currentDrive: "main",
  linkClass: () => "link-class",
  close: vi.fn(),
};

describe("SidebarLibrarySection - Trash link", () => {
  it("renders trash link when driveBase is provided", () => {
    render(<SidebarLibrarySection {...defaultProps} />);
    expect(screen.getByText("ゴミ箱")).toBeInTheDocument();
  });

  it("trash link has correct href", () => {
    render(<SidebarLibrarySection {...defaultProps} />);
    const trashLink = screen.getByText("ゴミ箱").closest("a");
    expect(trashLink).toHaveAttribute("href", "/drive/main?view=trash");
  });

  it("does not render trash link when driveBase is null", () => {
    render(<SidebarLibrarySection {...defaultProps} driveBase={null} />);
    expect(screen.queryByText("ゴミ箱")).not.toBeInTheDocument();
  });
});
