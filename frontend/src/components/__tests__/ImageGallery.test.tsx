import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ImageGallery } from "../ImageGallery";
import { ShortcutsProvider } from "../ShortcutsProvider";
import type { FileItem } from "@/types";

function renderWithShortcuts(ui: ReactNode) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}

vi.mock("@/lib/api", () => ({
  getDriveFiles: vi.fn(),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

import { getDriveFiles } from "@/lib/api";
const mockGetDriveFiles = vi.mocked(getDriveFiles);

function makeImage(id: string, title: string): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${title}.jpg`,
    title,
    description: "",
    drive: "photos",
    folder_path: "vacation",
    file_type: "image",
    mime_type: "image/jpeg",
    thumbnail_url: `/api/files/${id}/thumbnail`,
    has_thumbnail: false,
    file_size: 500000,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-03-20T10:00:00",
    updated_at: "2026-03-20T10:00:00",
  };
}

const images = [
  makeImage("img1", "Photo 1"),
  makeImage("img2", "Photo 2"),
  makeImage("img3", "Photo 3"),
];

const defaultProps = {
  open: true,
  file: images[0],
  onClose: vi.fn(),
};

function setupMock(data: FileItem[] = images) {
  mockGetDriveFiles.mockResolvedValue({
    data,
    meta: { total: data.length, page: 1, limit: 500 },
  });
}

/**
 * Put a reader back in front of the frame.
 *
 * `runAllTimersAsync` settles the image load, and it also runs the
 * chrome's 2s idle timer, so anything that asserts on the chrome has to
 * say that someone is still there.
 *
 * Both signals, because the viewer listens to different ones per pointer
 * mode: a coarse pointer produces no movement, so `pointermove` is not
 * bound there. Sending only that one made these tests depend on which
 * pointer mode the previous test happened to leave stubbed — the
 * shuffled-order run is what said so.
 */
function wakeChrome() {
  act(() => {
    document.dispatchEvent(new Event("pointermove", { bubbles: true }));
    document.dispatchEvent(new Event("focusin", { bubbles: true }));
  });
}

describe("ImageGallery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMock();
    defaultProps.onClose = vi.fn();
  });

  afterEach(() => {
    // A stubbed `matchMedia` outlives its test otherwise, and the next
    // one resolves a pointer mode it never asked for.
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <ImageGallery {...defaultProps} open={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows loading spinner initially", () => {
    render(<ImageGallery {...defaultProps} />);
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("shows counter after loading", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("shows image title", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("Photo 1")).toBeInTheDocument();
  });

  it("navigates to next image on right button click", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    wakeChrome();
    const nextBtn = screen.getByLabelText("Next image");
    fireEvent.click(nextBtn);

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("hides prev button on first image", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    wakeChrome();
    expect(screen.queryByLabelText("Previous image")).toBeNull();
    expect(screen.getByLabelText("Next image")).toBeInTheDocument();
  });

  it("hides next button on last image", async () => {
    render(<ImageGallery {...defaultProps} file={images[2]} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    wakeChrome();
    expect(screen.getByLabelText("Previous image")).toBeInTheDocument();
    expect(screen.queryByLabelText("Next image")).toBeNull();
  });

  it("closes on Escape even after the chrome has withdrawn", async () => {
    // What withdraws is the chrome, not the viewer. Escape has to reach
    // the reader's way out whether or not the bar with the close button
    // in it is on screen.
    renderWithShortcuts(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("Photo 1").closest("div")!).toHaveAttribute(
      "inert",
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("navigates with arrow keys", async () => {
    renderWithShortcuts(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("toggles slideshow with space key", async () => {
    renderWithShortcuts(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByLabelText("Play")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: " " });
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: " " });
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("calls onClose on close button click", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    fireEvent.click(screen.getByLabelText("Close"));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("hides slideshow controls when only one image", async () => {
    setupMock([images[0]]);
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.queryByLabelText("Play")).toBeNull();
    expect(screen.queryByLabelText("Slideshow interval")).toBeNull();
  });

  /** Answer the pointer queries the way a given device would. */
  function stubPointer(mode: "fine" | "coarse") {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes(mode),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  async function openIntervalPanel() {
    // With the provider: the panel claims Escape through the shortcut
    // stack, so a bare render would leave it unregistered and the test
    // would be measuring nothing.
    renderWithShortcuts(<ImageGallery {...defaultProps} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    wakeChrome();
    fireEvent.click(screen.getByLabelText("Slideshow interval"));
    return screen.getByTestId("slideshow-interval-panel");
  }

  it("gives a mouse the popover and a finger the sheet", async () => {
    // `DESIGN.md` §Over-video chrome names two shapes, not one that
    // stretches. The panel is the video player's own shell, so this also
    // pins that the viewers are using it rather than a lookalike.
    stubPointer("fine");
    expect(await openIntervalPanel()).toHaveAttribute(
      "data-placement",
      "popover",
    );
  });

  it("gives a finger the sheet", async () => {
    stubPointer("coarse");
    expect(await openIntervalPanel()).toHaveAttribute(
      "data-placement",
      "sheet",
    );
  });

  it("does not dim behind the popover", async () => {
    // §Over-video chrome: a mouse user sees the whole frame at once and
    // the panel covers very little of it, so there is nothing to dim.
    stubPointer("fine");
    await openIntervalPanel();
    const backdrop = screen.getByTestId("slideshow-interval-backdrop");
    expect(backdrop.className).not.toMatch(/bg-black\/\d/);
  });

  it("parks the popover under the bar that opened it, not above it", async () => {
    // The panel's shell was written for the player, whose controls are
    // at the bottom of the frame. These viewers' bar is at the top, and
    // the shell parked against the bottom edge regardless: measured at
    // 1512x757, the panel opened 621px from the button that opened it,
    // in the opposite corner. With the anchor it is 78px away and clears
    // the 54px bar by 2. jsdom lays nothing out, so the margin that
    // decides it is what can be pinned here.
    stubPointer("fine");
    const panel = await openIntervalPanel();
    expect(panel.className).toMatch(/(^|\s)mt-14(\s|$)/);
    expect(panel.className).not.toMatch(/(^|\s)mb-16(\s|$)/);
  });

  it("dismisses the panel on Escape without closing the viewer", async () => {
    // The panel's own handler only sees keys whose React path runs
    // through it, and opening it leaves focus on the trigger — a sibling
    // of the portal. So Escape went past to the viewer's shortcut, and a
    // reader dismissing a three-option menu lost their place in the
    // folder. The `<select>` this replaced swallowed Escape.
    stubPointer("fine");
    await openIntervalPanel();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("slideshow-interval-panel")).toBeNull();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("holds the chrome open while the interval panel is up", async () => {
    // Reading a panel is not idleness. Measured in the browser before
    // this hold existed: 2.6s after opening the panel the bar was
    // `opacity: 0` and `inert` while the panel stayed at full opacity —
    // a panel floating where the control that opened it used to be.
    stubPointer("fine");
    const panel = await openIntervalPanel();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByTestId("slideshow-interval-panel")).toBe(panel);
    expect(screen.getByText("Photo 1").closest("div")!).not.toHaveAttribute(
      "inert",
    );
  });

  it("puts withdrawn chrome out of reach, not just out of sight", async () => {
    // §Layering. An `opacity: 0` element keeps its place in the tab
    // order, so a keyboard user lands on controls nobody can see.
    render(<ImageGallery {...defaultProps} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const bar = screen.getByText("Photo 1").closest("div")!;
    expect(bar).toHaveAttribute("inert");
    expect(bar).toHaveAttribute("aria-hidden", "true");

    wakeChrome();
    expect(bar).not.toHaveAttribute("inert");
  });

  it("offers the interval as over-frame chrome rather than a native select", async () => {
    // `DESIGN.md` §Over-video chrome: a bare `<select>` in a bar over
    // media is sized by its widest option and drawn by the OS, so it
    // matches nothing else in the row.
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    wakeChrome();

    expect(document.querySelectorAll("select")).toHaveLength(0);

    const trigger = screen.getByLabelText("Slideshow interval");
    expect(trigger).toHaveTextContent("5s");
    fireEvent.click(trigger);

    const panel = screen.getByTestId("slideshow-interval-panel");
    expect(panel).toBeInTheDocument();
    const chosen = within(panel)
      .getAllByRole("radio")
      .find((r) => r.getAttribute("aria-checked") === "true");
    expect(chosen).toHaveTextContent("5s");
  });
});

// DESIGN.md §Layering: an immersive viewer takes the page out of reach, not
// just out of sight. `useInertBackdrop` is well covered on its own, but the
// hook being right proves nothing about this component being wired to it —
// deleting the ref from the root left the whole suite green.
describe("ImageGallery backdrop", () => {
  function outsideTheViewer() {
    const viewer = document.querySelector('[role="dialog"]');
    return [
      ...document.querySelectorAll("button, a[href], input, select"),
    ].filter((el) => !viewer?.contains(el) && !el.closest("[inert]"));
  }

  it("puts the page out of reach and locks the scroll while open", () => {
    render(
      <ShortcutsProvider>
        <button>page control</button>
        <ImageGallery {...defaultProps} />
      </ShortcutsProvider>,
    );

    expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
    expect(outsideTheViewer()).toEqual([]);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("gives both back when it closes", () => {
    const { rerender } = render(
      <ShortcutsProvider>
        <button>page control</button>
        <ImageGallery {...defaultProps} />
      </ShortcutsProvider>,
    );

    rerender(
      <ShortcutsProvider>
        <button>page control</button>
        <ImageGallery {...defaultProps} open={false} />
      </ShortcutsProvider>,
    );

    expect(outsideTheViewer()).toHaveLength(1);
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });
});
