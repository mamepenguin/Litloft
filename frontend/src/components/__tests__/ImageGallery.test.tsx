import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ImageGallery } from "../ImageGallery";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { FileItem } from "@/types";
import { installPointerEvent } from "@/test/pointerEvent";
import { SPREAD_MODE_KEY } from "@/lib/spreadPreference";

installPointerEvent();

function renderWithShortcuts(ui: ReactNode) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}

vi.mock("@/lib/api", () => ({
  getDriveFiles: vi.fn(),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

import { getDriveFiles } from "@/lib/api";
import { immersive, installShellStub } from "@/test/shellStub";
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
 * `runAllTimersAsync` settles the image load, and it also runs the
 * chrome's 2s idle timer, so anything that asserts on the chrome has to
 * say that someone is still there.
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
    // The spread switch is remembered on the device, and a test that turns
    // it on would otherwise open the next one in spreads.
    localStorage.removeItem(SPREAD_MODE_KEY);
  });

  afterEach(() => {
    // A stubbed `matchMedia` outlives its test otherwise, and the next
    // one resolves a pointer mode it never asked for.
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.removeItem(SPREAD_MODE_KEY);
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

  it("pages on a swipe across the picture", async () => {
    renderWithShortcuts(<ImageGallery {...defaultProps} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const frame = screen.getByAltText("Photo 1").closest(".touch-none")!;
    fireEvent.pointerDown(frame, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 400 });
    fireEvent.pointerUp(frame, { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 400 });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("zooms the picture with the = key, and pages back to fit", async () => {
    renderWithShortcuts(<ImageGallery {...defaultProps} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const content = () =>
      screen.getAllByRole("img")[0].closest("[data-face]")!.parentElement as HTMLElement;
    fireEvent.keyDown(document, { key: "=" });
    expect(content().style.transform).toContain("scale(1.25)");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(content().style.transform).toBe("");
  });

  it("opens at fit after being closed while zoomed", async () => {
    const { rerender } = renderWithShortcuts(<ImageGallery {...defaultProps} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const content = () =>
      screen.getAllByRole("img")[0].closest("[data-face]")!.parentElement as HTMLElement;
    fireEvent.keyDown(document, { key: "=" });
    expect(content().style.transform).toContain("scale(1.25)");
    rerender(
      <ShortcutsProvider>
        <ImageGallery {...defaultProps} open={false} />
      </ShortcutsProvider>,
    );
    rerender(
      <ShortcutsProvider>
        <ImageGallery {...defaultProps} />
      </ShortcutsProvider>,
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(content().style.transform).toBe("");
  });

  it("takes a ctrl wheel when opened after it was mounted closed", async () => {
    const { rerender } = renderWithShortcuts(
      <ImageGallery {...defaultProps} open={false} />,
    );
    rerender(
      <ShortcutsProvider>
        <ImageGallery {...defaultProps} />
      </ShortcutsProvider>,
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const frame = screen.getAllByRole("img")[0].closest(".touch-none")!;
    const event = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true });
    act(() => {
      frame.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("goes back to fit when turning on spreads splits the page in view", async () => {
    // Wide pages: with spreads on, the same index becomes a half.
    setupMock(
      images.map((img) => ({ ...img, image_width: 1600, image_height: 1000 })),
    );
    renderWithShortcuts(<ImageGallery {...defaultProps} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const content = () =>
      screen.getAllByRole("img")[0].closest("[data-face]")!.parentElement as HTMLElement;
    fireEvent.keyDown(document, { key: "=" });
    expect(content().style.transform).toContain("scale(1.25)");
    fireEvent.click(screen.getByLabelText("Read as spread / Read single pages"));
    expect(document.querySelector("[data-face]")!.getAttribute("data-face")).toBe("half");
    expect(content().style.transform).toBe("");
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
    stubPointer("fine");
    await openIntervalPanel();
    const backdrop = screen.getByTestId("slideshow-interval-backdrop");
    expect(backdrop.className).not.toMatch(/bg-black\/\d/);
  });

  it("parks the popover under the bar that opened it, not above it", async () => {
    // The panel's shell was written for the player, whose controls are
    // at the bottom of the frame. These viewers' bar is at the top.
    stubPointer("fine");
    const panel = await openIntervalPanel();
    expect(panel.className).toMatch(/(^|\s)mt-14(\s|$)/);
    expect(panel.className).not.toMatch(/(^|\s)mb-16(\s|$)/);
  });

  it("enters from the edge it hangs off", async () => {
    // A top-anchored panel rising from below starts a panel-height down
    // the frame, in open space, and travels toward its own trigger.
    stubPointer("fine");
    const panel = await openIntervalPanel();
    expect(panel.className).toMatch(/animate-slide-down-bar/);
    expect(panel.className).not.toMatch(/animate-slide-up-bar/);
  });

  it("dismisses the panel on Escape without closing the viewer", async () => {
    // The panel's own handler only sees keys whose React path runs
    // through it, and opening it leaves focus on the trigger — a sibling
    // of the portal.
    stubPointer("fine");
    await openIntervalPanel();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("slideshow-interval-panel")).toBeNull();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("holds the chrome open while the interval panel is up", async () => {
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
    // An `opacity: 0` element keeps its place in the tab
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
    // A bare `<select>` in a bar over
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

  it("leaves the page its keys while it is mounted closed", async () => {
    const search = vi.fn();
    function PageKeys() {
      useShortcuts("global", "global", [{ key: "ctrl+k", label: "search", handler: search }]);
      return null;
    }
    renderWithShortcuts(
      <>
        <PageKeys />
        <ImageGallery {...defaultProps} open={false} />
      </>,
    );
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("keeps the page's own keys from firing while it is open", async () => {
    const search = vi.fn();
    function PageKeys() {
      useShortcuts("global", "global", [{ key: "ctrl+k", label: "search", handler: search }]);
      return null;
    }
    renderWithShortcuts(
      <>
        <PageKeys />
        <ImageGallery {...defaultProps} />
      </>,
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(search).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "=" });
    expect(
      screen.getAllByRole("img")[0].closest("[data-face]")!.parentElement!.style.transform,
    ).toContain("scale(1.25)");
  });
});

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

describe("ImageGallery in the iOS shell", () => {
  it("holds the shell immersive only while open", () => {
    setupMock();
    const shell = installShellStub(4);
    try {
      const { rerender, unmount } = renderWithShortcuts(<ImageGallery {...defaultProps} open={false} />);
      expect(shell.posted).toEqual([]);

      rerender(
        <ShortcutsProvider>
          <ImageGallery {...defaultProps} open />
        </ShortcutsProvider>,
      );
      expect(shell.posted).toEqual([immersive(true)]);

      rerender(
        <ShortcutsProvider>
          <ImageGallery {...defaultProps} open={false} />
        </ShortcutsProvider>,
      );
      expect(shell.posted).toEqual([immersive(true), immersive(false)]);
      unmount();
    } finally {
      shell.remove();
    }
  });
});
