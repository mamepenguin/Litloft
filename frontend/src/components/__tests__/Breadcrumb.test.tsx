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

  // The trail either names the current page or stops short of it, and which
  // one is a decision the caller makes.
  describe("driveIsAncestor", () => {
    it("makes the drive a link the reader can follow back", () => {
      render(<Breadcrumb driveName="Videos" driveIsAncestor />);
      const link = screen.getByRole("link", { name: "Videos" });
      expect(link.getAttribute("href")).toBe("/drive/Videos");
    });

    it("leaves the drive as plain text without it", () => {
      render(<Breadcrumb driveName="Videos" />);
      expect(screen.queryByRole("link", { name: "Videos" })).toBeNull();
      expect(screen.getByText("Videos")).toBeInTheDocument();
    });

    // The page names itself in a heading, so the trail must not also name it.
    it("adds no segment of its own", () => {
      render(<Breadcrumb driveName="Videos" driveIsAncestor />);
      const links = screen.getAllByRole("link").map((el) => el.textContent);
      // Home carries an icon and no text; the drive is the only labelled one.
      expect(links.filter(Boolean)).toEqual(["Videos"]);
    });

    it("encodes a drive name that needs it", () => {
      render(<Breadcrumb driveName="My Drive" driveIsAncestor />);
      expect(
        screen.getByRole("link", { name: "My Drive" }).getAttribute("href"),
      ).toBe("/drive/My%20Drive");
    });
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
      expect(screen.getByText("photos").closest("a")).toHaveAttribute(
        "href",
        "/drive/main/photos",
      );
      expect(screen.getByText("vacation").closest("a")).toHaveAttribute(
        "href",
        "/drive/main/photos/vacation",
      );
      expect(screen.getByText("My Mix").tagName).toBe("SPAN");
    });
  });

  // Which element each segment is, once the trail is too deep to draw whole.
  // Nothing in the layout measurements can tell a link from a name, and the
  // cases above are all short enough that nothing folds.
  describe("folded", () => {
    const DEEP = "a/b/c/d/e";

    it("draws the folder the reader is in as a name, not a link", () => {
      render(<Breadcrumb driveName="main" folderPath={DEEP} />);
      const here = screen.getByText("e");
      expect(here.tagName).toBe("SPAN");
      expect(here.closest("a")).toBeNull();
    });

    it("draws the folder above as a link to itself", () => {
      render(<Breadcrumb driveName="main" folderPath={DEEP} />);
      expect(screen.getByText("d").closest("a")).toHaveAttribute(
        "href",
        "/drive/main/a/b/c/d",
      );
    });

    it("sends the marker to the deepest folder it hid", () => {
      render(<Breadcrumb driveName="main" folderPath={DEEP} />);
      expect(screen.getByText("…").closest("a")).toHaveAttribute(
        "href",
        "/drive/main/a/b/c",
      );
    });

    it("draws nothing for the folders behind the marker", () => {
      render(<Breadcrumb driveName="main" folderPath={DEEP} />);
      for (const hidden of ["a", "b", "c"]) {
        expect(screen.queryByText(hidden)).toBeNull();
      }
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    it("offers a drop target for every folder it draws, and none for the marker", () => {
      const seen: string[] = [];
      render(
        <Breadcrumb
          driveName="main"
          folderPath={DEEP}
          getDropTargetProps={(path) => {
            seen.push(path);
            return { onDrop: () => {} };
          }}
        />,
      );
      // The drive and the folder above: every segment drawn as a link. The
      // folder the reader is in is a name rather than a link, and the marker
      // stands for folders that are not drawn, so a drop on either would have
      // nothing to mean.
      expect(seen).toEqual(["", "a/b/c/d"]);
    });
  });
});
