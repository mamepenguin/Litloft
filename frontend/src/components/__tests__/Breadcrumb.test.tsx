import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "../Breadcrumb";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { vi } from "vitest";

describe("Breadcrumb", () => {
  it("renders drive name at root level", () => {
    render(<Breadcrumb driveName="main" />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("renders home link", () => {
    render(<Breadcrumb driveName="main" />);
    expect(screen.getByLabelText("Home")).toBeInTheDocument();
  });

  it("renders folder segments", () => {
    render(<Breadcrumb driveName="main" folderPath="photos/vacation" />);
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("photos")).toBeInTheDocument();
    expect(screen.getByText("vacation")).toBeInTheDocument();
  });

  it("makes last segment non-clickable", () => {
    render(<Breadcrumb driveName="main" folderPath="photos/vacation" />);
    const vacation = screen.getByText("vacation");
    // Last segment is a span, not a link
    expect(vacation.tagName).toBe("SPAN");
  });

  it("makes intermediate segments clickable links", () => {
    render(<Breadcrumb driveName="main" folderPath="photos/vacation" />);
    const photos = screen.getByText("photos");
    expect(photos.closest("a")).toHaveAttribute(
      "href",
      "/drive/main/photos"
    );
  });

  it("renders drive link to drive root", () => {
    render(<Breadcrumb driveName="main" folderPath="photos" />);
    const driveLink = screen.getByText("main");
    expect(driveLink.closest("a")).toHaveAttribute("href", "/drive/main");
  });

  describe("trailingSegment", () => {
    it("renders trailingSegment as the last non-clickable label", () => {
      render(<Breadcrumb driveName="main" trailingSegment="My Mix" />);
      const trailing = screen.getByText("My Mix");
      expect(trailing.tagName).toBe("SPAN");
      expect(trailing.closest("a")).toBeNull();
    });

    it("makes the drive name a Link when trailingSegment is provided", () => {
      render(<Breadcrumb driveName="main" trailingSegment="My Mix" />);
      const driveLink = screen.getByText("main");
      expect(driveLink.closest("a")).toHaveAttribute("href", "/drive/main");
    });

    it("preserves a name containing '/' as one segment", () => {
      // The trailingSegment escape hatch's whole purpose: virtual-folder
      // names shouldn't be split on '/'.
      render(<Breadcrumb driveName="main" trailingSegment="Mix A/B" />);
      expect(screen.getByText("Mix A/B")).toBeInTheDocument();
      expect(screen.queryByText("Mix A")).toBeNull();
      expect(screen.queryByText("B")).toBeNull();
    });

    it("combines with folderPath segments when both are provided", () => {
      render(
        <Breadcrumb
          driveName="main"
          folderPath="photos/vacation"
          trailingSegment="My Mix"
        />,
      );
      // photos and vacation become intermediate Links because they are
      // no longer the leaf.
      expect(screen.getByText("photos").closest("a")).toHaveAttribute(
        "href",
        "/drive/main/photos",
      );
      expect(screen.getByText("vacation").closest("a")).toHaveAttribute(
        "href",
        "/drive/main/photos/vacation",
      );
      // trailingSegment is the leaf.
      expect(screen.getByText("My Mix").tagName).toBe("SPAN");
    });
  });
});
