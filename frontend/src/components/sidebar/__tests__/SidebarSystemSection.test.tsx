import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SidebarSystemSection } from "../SidebarSystemSection";

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

const linkClass = (href: string) => (href.includes("trash") ? "active" : "inactive");

const summary = (missing: number) => ({ missing_count: missing }) as never;

describe("SidebarSystemSection", () => {
  it("draws Trash on a drive", () => {
    render(<SidebarSystemSection driveBase="/drive/main" linkClass={linkClass} close={vi.fn()} />);
    expect(screen.getByText("Trash").closest("a")).toHaveAttribute("href", "/drive/main?view=trash");
  });

  it("draws nothing drive-scoped off a drive", () => {
    render(<SidebarSystemSection driveBase={null} linkClass={linkClass} close={vi.fn()} />);
    expect(screen.queryByText("Trash")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing Files")).not.toBeInTheDocument();
  });

  it("draws Missing Files only when the drive has some, with the count", () => {
    const { rerender } = render(
      <SidebarSystemSection driveBase="/drive/main" linkClass={linkClass} close={vi.fn()} driveSummary={summary(0)} />,
    );
    expect(screen.queryByText("Missing Files")).not.toBeInTheDocument();

    rerender(
      <SidebarSystemSection driveBase="/drive/main" linkClass={linkClass} close={vi.fn()} driveSummary={summary(3)} />,
    );
    expect(screen.getByText("Missing Files")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides Dashboard and its heading until the viewer is known to be admin", () => {
    // Three states, declared rather than derived: unknown (the prop is
    // absent while the auth probe is in flight), known-not-admin, and
    // admin. The first two must look the same — flashing an admin row and
    // taking it away is the failure the default guards against.
    for (const props of [{}, { isAdmin: false }]) {
      const { unmount } = render(
        <SidebarSystemSection driveBase="/drive/main" linkClass={linkClass} close={vi.fn()} {...props} />,
      );
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
      expect(screen.queryByText("Administration")).not.toBeInTheDocument();
      unmount();
    }

    render(<SidebarSystemSection driveBase="/drive/main" linkClass={linkClass} close={vi.fn()} isAdmin />);
    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Administration")).toBeInTheDocument();
  });
});
