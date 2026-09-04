/**
 * Tests for the one page row every file detail surface wears.
 *
 * Before it there were three rows and none of them carried a path: the
 * 2-pane header showed a bare filename, the Markdown shell a filename
 * plus editor controls, and the collection route a back link on its own
 * — so the canonical URL had a breadcrumb nowhere and, on a phone, no
 * way back at all (M-6 / MB-3).
 *
 * Both widths are always in the DOM; which one shows is a CSS class,
 * and jsdom loads no stylesheet. So the width assertions here are about
 * the class that decides, and the behaviour assertions are about the
 * control that class reveals. The look itself is on the manual pass.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/videos/clips",
  useSearchParams: () => new URLSearchParams(),
}));

import { FileDetailChrome } from "../FileDetailChrome";

const back = () => screen.getByTestId("file-detail-back");

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

    // Every step above the leaf is walkable, which is the whole point
    // of showing them.
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
    // The two forms trade places on the `md` breakpoint rather than by
    // measurement: the full path is hidden below it, the single step
    // above it.
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

    // A `Link` renders an anchor Next intercepts; a `window.location`
    // assignment would throw the whole app away to move one folder up
    // (hako project_spa_navigation).
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

  it("leaves the tree toggle out where there is no tree", () => {
    // `TreeToggle` names itself for what pressing it would do, and the
    // tree starts enabled, so it offers to turn the tree off.
    const treeToggles = () => screen.queryAllByRole("button", { name: /tree/i });

    const { rerender } = render(
      <FileDetailChrome drive="main" title="x.mp4" />,
    );
    // The default really did render one, or the assertion below proves
    // nothing about the flag.
    expect(treeToggles()).toHaveLength(1);

    rerender(
      <FileDetailChrome drive="main" title="x.mp4" showTreeToggle={false} />,
    );
    expect(treeToggles()).toHaveLength(0);
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
    // The path above the leaf stays navigable when the leaf is a node,
    // the same way it does when the leaf is text.
    expect(screen.getByRole("link", { name: "notes" })).toHaveAttribute(
      "href",
      "/drive/main/notes",
    );
  });
});
