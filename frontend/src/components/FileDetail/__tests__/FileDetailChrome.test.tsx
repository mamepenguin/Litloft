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

  it("places a node leaf exactly once, wherever it goes", () => {
    // Unlike the path, which is rendered twice and hidden in CSS, the
    // leaf is placed. A second copy of a *control* is not free: for a
    // Markdown note the hidden one still fires `blur` when a rotation
    // crosses this breakpoint, and that blur commits a rename — a
    // half-typed filename saved by turning the phone sideways.
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
    // Dropping the file's *name* below `md` is what the sizing rules ask
    // for. But a Markdown note's leaf is its rename control, and this
    // row is the only place rename exists — dropping a function is not
    // the same as dropping a label.
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
    // With `onBack` the destination is the host's, not the parent
    // folder — during collection playback it is the collection. Naming
    // the folder there would put the same word in the row twice,
    // pointing at two different places.
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
    // The path is still beside it, and its own "videos" still goes to
    // the folder — which is now the only thing claiming to.
    expect(screen.getByRole("link", { name: "videos" })).toHaveAttribute(
      "href",
      "/drive/main/videos",
    );
  });

  it("keeps the host's back control at every width, since it means something else", () => {
    // A host that supplies `onBack` is saying the breadcrumb cannot
    // express where back goes — during collection playback it is the
    // collection, not the folder this track sits in. Hiding it above
    // `md` would leave the desktop with no way back at all, which is
    // what the row it replaced did have.
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
    // And the path is still there beside it, answering the question the
    // collection cannot: where does this file live.
    expect(screen.getByRole("navigation")).toHaveTextContent("videos");
  });

  it("hides the back control above md when the row owns what back means", () => {
    render(
      <FileDetailChrome drive="main" folderPath="videos" title="x.mp4" />,
    );

    expect(back().parentElement?.className).toContain("md:hidden");
  });
});
