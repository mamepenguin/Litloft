import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArchiveImageViewer } from "../ArchiveImageViewer";
import type { ReactElement } from "react";
import type { ArchiveEntry } from "@/types";
import { installPointerEvent } from "@/test/pointerEvent";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { immersive, installShellStub } from "@/test/shellStub";

installPointerEvent();

vi.mock("@/lib/api", () => ({
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
}));

function makeImage(path: string): ArchiveEntry {
  return {
    path,
    filename: path.split("/").pop()!,
    file_size: 100,
    compressed_size: 50,
    file_type: "image",
    mime_type: "image/jpeg",
    is_dir: false,
  };
}

const images = [
  makeImage("img1.jpg"),
  makeImage("img2.jpg"),
  makeImage("img3.jpg"),
];

const defaultProps = {
  fileId: "file-1",
  currentImage: images[1],
  imageEntries: images,
  imageIndex: 1,
  imageLoading: false,
  setImageLoading: vi.fn(),
  playing: false,
  setPlaying: vi.fn(),
  slideshowInterval: 5,
  setSlideshowInterval: vi.fn(),
  showControls: true,
  chromeProps: {
    inert: false,
    "aria-hidden": undefined,
    style: { opacity: 1, pointerEvents: "auto" as const },
    onPointerDown: vi.fn(),
  },
  onIntervalOpenChange: vi.fn(),
  rememberOrientation: vi.fn(),
  face: {
    kind: "single" as const,
    index: 1,
    indices: [1],
    showRightHalf: false,
  },
  faceLabel: "2",
  subPageLabel: null,
  canGoPrev: true,
  canGoNext: true,
  handleImageAreaClick: vi.fn(),
  closeViewer: vi.fn(),
  spreadMode: false,
  setSpreadMode: vi.fn(),
  readingDirection: "ltr" as const,
  setReadingDirection: vi.fn(),
  isCurrentLandscape: false,
  setIsCurrentLandscape: vi.fn(),
  showRightHalf: false,
  navigatePrev: vi.fn(),
  navigateNext: vi.fn(),
};

describe("ArchiveImageViewer", () => {
  it("tells the viewer what every drawn page turned out to be", () => {
    const rememberOrientation = vi.fn();
    render(
      <ArchiveImageViewer
        {...defaultProps}
        rememberOrientation={rememberOrientation}
        face={{
          kind: "pair",
          index: 1,
          indices: [1, 2],
          showRightHalf: false,
        }}
      />,
    );

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);

    // Both pages of the pair, not only the one the face is named by:
    // the second is the index the next face's pairing will ask about.
    Object.defineProperty(images[0], "naturalWidth", { value: 800 });
    Object.defineProperty(images[0], "naturalHeight", { value: 1200 });
    fireEvent.load(images[0]);
    Object.defineProperty(images[1], "naturalWidth", { value: 1600 });
    Object.defineProperty(images[1], "naturalHeight", { value: 900 });
    fireEvent.load(images[1]);

    expect(rememberOrientation).toHaveBeenCalledWith(1, "portrait");
    expect(rememberOrientation).toHaveBeenCalledWith(2, "landscape");
  });

  it("renders current image", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    const img = screen.getByAltText("img2.jpg");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "/api/files/file-1/archive/entry?path=img2.jpg",
    );
  });

  it("shows filename and counter", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByText("img2.jpg")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("shows prev and next buttons when controls visible", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByLabelText("Previous image")).toBeInTheDocument();
    expect(screen.getByLabelText("Next image")).toBeInTheDocument();
  });

  it("hides prev button at first image", () => {
    render(
      <ArchiveImageViewer
        {...defaultProps}
        imageIndex={0}
        currentImage={images[0]}
        canGoPrev={false}
      />,
    );
    expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Next image")).toBeInTheDocument();
  });

  it("hides next button at last image", () => {
    render(
      <ArchiveImageViewer
        {...defaultProps}
        imageIndex={2}
        currentImage={images[2]}
        canGoNext={false}
      />,
    );
    expect(screen.getByLabelText("Previous image")).toBeInTheDocument();
    expect(screen.queryByLabelText("Next image")).not.toBeInTheDocument();
  });

  it("hides navigation when controls are hidden", () => {
    render(<ArchiveImageViewer {...defaultProps} showControls={false} />);
    expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next image")).not.toBeInTheDocument();
  });

  it("calls closeViewer on close button click", () => {
    const closeViewer = vi.fn();
    render(<ArchiveImageViewer {...defaultProps} closeViewer={closeViewer} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(closeViewer).toHaveBeenCalled();
  });

  it("renders download link with correct href", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    const link = screen.getByLabelText("Download");
    expect(link).toHaveAttribute(
      "href",
      "/api/files/file-1/archive/entry?path=img2.jpg",
    );
    expect(link).toHaveAttribute("download", "img2.jpg");
  });

  it("shows play/pause button for multiple images", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("shows pause label when playing", () => {
    render(<ArchiveImageViewer {...defaultProps} playing={true} />);
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
  });

  it("shows loading spinner when imageLoading is true", () => {
    render(<ArchiveImageViewer {...defaultProps} imageLoading={true} />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders slideshow interval selector", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByLabelText("Slideshow interval")).toBeInTheDocument();
  });
});

describe("ArchiveImageViewer backdrop", () => {
  function outsideTheViewer() {
    const viewer = document.querySelector('[role="dialog"]');
    return [
      ...document.querySelectorAll("button, a[href], input, select"),
    ].filter((el) => !viewer?.contains(el) && !el.closest("[inert]"));
  }

  it("puts the page out of reach and locks the scroll while mounted", () => {
    render(
      <>
        <button>listing control</button>
        <ArchiveImageViewer {...defaultProps} />
      </>,
    );

    expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
    expect(outsideTheViewer()).toEqual([]);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("gives both back when it unmounts", () => {
    const { rerender } = render(
      <>
        <button>listing control</button>
        <ArchiveImageViewer {...defaultProps} />
      </>,
    );

    rerender(
      <>
        <button>listing control</button>
      </>,
    );

    expect(outsideTheViewer()).toHaveLength(1);
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });

  it("pages on a swipe across the picture", () => {
    const navigatePrev = vi.fn();
    render(<ArchiveImageViewer {...defaultProps} navigatePrev={navigatePrev} />);
    const frame = screen.getByAltText("img2.jpg").closest(".touch-none")!;
    fireEvent.pointerDown(frame, { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 400 });
    fireEvent.pointerUp(frame, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 400 });
    expect(navigatePrev).toHaveBeenCalledTimes(1);
  });

  it("zooms the picture with the = key and back with 0", () => {
    render(
      <ShortcutsProvider>
        <ArchiveImageViewer {...defaultProps} />
      </ShortcutsProvider>,
    );
    const content = screen.getByAltText("img2.jpg").closest("[data-face]")!
      .parentElement as HTMLElement;
    fireEvent.keyDown(document, { key: "=" });
    expect(content.style.transform).toContain("scale(1.25)");
    fireEvent.keyDown(document, { key: "0" });
    expect(content.style.transform).toBe("");
  });

  describe("goes back to fit when what is shown changes", () => {
    const content = () =>
      document.querySelector("[data-face]")!.parentElement as HTMLElement;

    function zoomed(ui: ReactElement) {
      const r = render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
      fireEvent.keyDown(document, { key: "=" });
      expect(content().style.transform).toContain("scale(1.25)");
      return (next: ReactElement) =>
        r.rerender(<ShortcutsProvider>{next}</ShortcutsProvider>);
    }

    it("on another image", () => {
      const rerender = zoomed(<ArchiveImageViewer {...defaultProps} />);
      rerender(
        <ArchiveImageViewer
          {...defaultProps}
          imageIndex={2}
          currentImage={images[2]}
          face={{ kind: "single", index: 2, indices: [2], showRightHalf: false }}
        />,
      );
      expect(content().style.transform).toBe("");
    });

    it("on the other half of a split page", () => {
      const half = { kind: "half" as const, index: 1, indices: [1], showRightHalf: false };
      const rerender = zoomed(<ArchiveImageViewer {...defaultProps} face={half} />);
      rerender(
        <ArchiveImageViewer
          {...defaultProps}
          face={{ ...half, showRightHalf: true }}
          showRightHalf
        />,
      );
      expect(content().style.transform).toBe("");
    });

    it("when the same page becomes part of a pair", () => {
      const rerender = zoomed(<ArchiveImageViewer {...defaultProps} />);
      rerender(
        <ArchiveImageViewer
          {...defaultProps}
          spreadMode
          face={{ kind: "pair", index: 1, indices: [1, 2], showRightHalf: false }}
        />,
      );
      expect(content().style.transform).toBe("");
    });
  });
});

describe("ArchiveImageViewer in the iOS shell", () => {
  it("holds the shell immersive while shown", () => {
    const shell = installShellStub(4);
    try {
      const { unmount } = render(<ArchiveImageViewer {...defaultProps} />);
      expect(shell.posted).toEqual([immersive(true)]);

      unmount();
      expect(shell.posted).toEqual([immersive(true), immersive(false)]);
    } finally {
      shell.remove();
    }
  });
});
