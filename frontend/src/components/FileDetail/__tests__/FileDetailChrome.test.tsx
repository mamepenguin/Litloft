import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/videos/clips",
  useSearchParams: () => new URLSearchParams(),
}));

import { FileDetailChrome } from "../FileDetailChrome";

const back = () => screen.getByTestId("file-detail-back");

/** `useIsMobile` reads `innerWidth` and listens for resize. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  setViewportWidth(1440);
});

describe("FileDetailChrome", () => {
  it("shows the whole path on a wide screen, ending in the file", () => {
    render(
      <FileDetailChrome
        drive="main"
        folderPath="videos/clips"
        title="holiday.mp4"
      />,
    );

    const crumbs = screen.getByRole("navigation");
    expect(crumbs).toHaveTextContent("main");
    expect(crumbs).toHaveTextContent("videos");
    expect(crumbs).toHaveTextContent("clips");
    expect(crumbs).toHaveTextContent("holiday.mp4");

    expect(screen.getByRole("link", { name: "videos" })).toHaveAttribute(
      "href",
      "/drive/main/videos",
    );
    expect(screen.getByRole("link", { name: "clips" })).toHaveAttribute(
      "href",
      "/drive/main/videos/clips",
    );
  });

  it("keeps one step of it on a narrow one", () => {
    render(
      <FileDetailChrome
        drive="main"
        folderPath="videos/clips"
        title="holiday.mp4"
      />,
    );

    expect(back()).toHaveTextContent("clips");
    expect(back()).toHaveAttribute("href", "/drive/main/videos/clips");
    expect(back().parentElement?.className).toContain("md:hidden");
    expect(screen.getByRole("navigation").parentElement?.className).toContain(
      "hidden",
    );
  });

  it("treats the drive as the parent for a file at its root", () => {
    render(<FileDetailChrome drive="main" title="loose.mp4" />);

    expect(back()).toHaveTextContent("main");
    expect(back()).toHaveAttribute("href", "/drive/main");
  });

  it("percent-encodes a path it has to build", () => {
    render(
      <FileDetailChrome
        drive="my drive"
        folderPath="a b/c&d"
        title="x.mp4"
      />,
    );

    expect(back()).toHaveAttribute("href", "/drive/my%20drive/a%20b/c%26d");
  });

  it("moves by routing, never by reloading", () => {
    render(
      <FileDetailChrome drive="main" folderPath="videos" title="x.mp4" />,
    );

    expect(back().tagName).toBe("A");
  });

  it("hands the back control over when the host owns what back means", () => {
    const onBack = vi.fn();
    render(
      <FileDetailChrome
        drive="main"
        folderPath="videos"
        title="x.mp4"
        onBack={onBack}
      />,
    );

    expect(back().tagName).toBe("BUTTON");
    fireEvent.click(back());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("names the destination for a screen reader, chevron or not", () => {
    render(
      <FileDetailChrome drive="main" folderPath="videos" title="x.mp4" />,
    );

    expect(back()).toHaveAccessibleName("Back to videos");
  });

  it("draws no inspector toggle where there is no inspector", () => {
    render(<FileDetailChrome drive="main" title="x.mp4" />);

    expect(screen.queryByTestId("inspector-toggle")).toBeNull();
  });

  it("reports the inspector's state on its toggle", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <FileDetailChrome
        drive="main"
        title="x.mp4"
        inspector={{ open: false, onToggle }}
      />,
    );

    const toggle = screen.getByTestId("inspector-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <FileDetailChrome
        drive="main"
        title="x.mp4"
        inspector={{ open: true, onToggle }}
      />,
    );
    expect(screen.getByTestId("inspector-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("leaves the tree toggle to the app toolbar", () => {
    render(<FileDetailChrome drive="main" title="x.mp4" />);
    expect(screen.queryAllByRole("button", { name: /tree/i })).toHaveLength(0);
  });

  it("puts a caller's own leaf where the file name would go", () => {
    render(
      <FileDetailChrome
        drive="main"
        folderPath="notes"
        title="note.md"
        titleNode={<button data-testid="rename">note.md</button>}
      />,
    );

    const crumbs = screen.getByRole("navigation");
    expect(crumbs).toContainElement(screen.getByTestId("rename"));
    expect(screen.getByRole("link", { name: "notes" })).toHaveAttribute(
      "href",
      "/drive/main/notes",
    );
  });

  it("places a node leaf exactly once, wherever it goes", () => {
    // A second copy of a *control* is not free: for a Markdown note the
    // hidden one still fires `blur` when a rotation crosses this
    // breakpoint, and that blur commits a rename.
    render(
      <FileDetailChrome
        drive="main"
        folderPath="notes"
        title="note.md"
        titleNode={<button data-testid="rename">note.md</button>}
      />,
    );

    expect(screen.getAllByTestId("rename")).toHaveLength(1);
  });

  it("keeps the leaf's control on the narrow form, where the path is hidden", () => {
    // A Markdown note's leaf is its rename control, and this row is the
    // only place rename exists.
    setViewportWidth(400);
    render(
      <FileDetailChrome
        drive="main"
        folderPath="notes"
        title="note.md"
        titleNode={<button data-testid="rename">note.md</button>}
      />,
    );

    const rename = screen.getByTestId("rename");
    expect(screen.getByRole("navigation")).not.toContainElement(rename);
    expect(rename.closest("[class*='md:hidden']")).not.toBeNull();
  });

  it("says only 'Back' when back is not up", () => {
    render(
      <FileDetailChrome
        drive="main"
        folderPath="videos"
        title="x.mp4"
        onBack={vi.fn()}
      />,
    );

    expect(back()).toHaveAccessibleName("Back");
    expect(back()).not.toHaveTextContent("videos");
    expect(screen.getByRole("link", { name: "videos" })).toHaveAttribute(
      "href",
      "/drive/main/videos",
    );
  });

  it("keeps the host's back control at every width, since it means something else", () => {
    const onBack = vi.fn();
    render(
      <FileDetailChrome
        drive="main"
        folderPath="videos"
        title="x.mp4"
        onBack={onBack}
      />,
    );

    const wrapper = back().parentElement!;
    expect(wrapper.className).not.toContain("md:hidden");
    expect(screen.getByRole("navigation")).toHaveTextContent("videos");
  });

  it("hides the back control above md when the row owns what back means", () => {
    render(
      <FileDetailChrome drive="main" folderPath="videos" title="x.mp4" />,
    );

    expect(back().parentElement?.className).toContain("md:hidden");
  });
});
describe("what makes this a chrome bar rather than a page header", () => {
  it("is a fixed-height bar with its own border and surface", () => {
    render(<FileDetailChrome drive="main" folderPath="videos" title="a.mp4" />);
    const row = screen.getByTestId("file-detail-chrome");
    for (const cls of ["h-12", "shrink-0", "border-b", "bg-bg-card"]) {
      expect(row.classList.contains(cls)).toBe(true);
    }
    // Padding would let a long path change the row's height, which is what
    // the shell's layout measures against.
    expect([...row.classList].filter((c) => /^py-/.test(c))).toEqual([]);
  });

  it("renders both width forms of the path and hides one in CSS", () => {
    const { container } = render(
      <FileDetailChrome drive="main" folderPath="videos" title="a.mp4" />,
    );
    // Three classes, not two: the tree-toggle wrapper is also `hidden md:flex`.
    const wide = [...container.querySelectorAll("div")].find(
      (el) =>
        el.classList.contains("hidden") &&
        el.classList.contains("md:flex") &&
        el.classList.contains("flex-1"),
    );
    expect(wide).toBeDefined();
    expect(wide!.textContent).toContain("videos");
    expect(screen.getByTestId("file-detail-back")).toBeInTheDocument();
  });
});
