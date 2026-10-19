import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { createElement } from "react";
import { useImageViewer } from "../useImageViewer";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { ArchiveEntry } from "@/types";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(ShortcutsProvider, null, children);

vi.mock("@/lib/api", () => ({
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
}));

function makeImageEntry(path: string): ArchiveEntry {
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

const imageEntries = [
  makeImageEntry("img1.jpg"),
  makeImageEntry("img2.jpg"),
  makeImageEntry("img3.jpg"),
];

describe("useImageViewer", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with default state", () => {
    const { result } = renderHook(
      () => useImageViewer("listing", imageEntries, "file-1", onClose),
      { wrapper },
    );
    expect(result.current.imageIndex).toBe(0);
    expect(result.current.imageLoading).toBe(false);
    expect(result.current.playing).toBe(false);
    expect(result.current.slideshowInterval).toBe(5);
    expect(result.current.showControls).toBe(true);
  });

  it("sets imageLoading when viewMode is image", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    expect(result.current.imageLoading).toBe(true);
  });

  it("navigates images with setImageIndex", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setImageIndex(2);
    });
    expect(result.current.imageIndex).toBe(2);
  });

  it("handles ArrowRight key to advance image", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(result.current.imageIndex).toBe(1);
  });

  it("handles ArrowLeft key to go back", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setImageIndex(2);
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    expect(result.current.imageIndex).toBe(1);
  });

  it("does not go below 0 on ArrowLeft at first image", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    expect(result.current.imageIndex).toBe(0);
  });

  it("does not exceed last index on ArrowRight", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setImageIndex(2);
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(result.current.imageIndex).toBe(2);
  });

  it("calls onClose on Escape key", () => {
    renderHook(() => useImageViewer("image", imageEntries, "file-1", onClose), {
      wrapper,
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles playing on Space key", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });
    expect(result.current.playing).toBe(true);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });
    expect(result.current.playing).toBe(false);
  });

  it("advances image during slideshow after interval", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setPlaying(true);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.imageIndex).toBe(1);
  });

  it("wraps around to first image at end of slideshow", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setImageIndex(2);
    });
    act(() => {
      result.current.setPlaying(true);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.imageIndex).toBe(0);
  });

  it("auto-hides controls after 2 seconds of being left alone", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    expect(result.current.playing).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.showControls).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showControls).toBe(false);
  });

  it("toggles controls on handleImageAreaClick", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.handleImageAreaClick();
    });
    expect(result.current.showControls).toBe(false);
    act(() => {
      result.current.handleImageAreaClick();
    });
    expect(result.current.showControls).toBe(true);
  });

  it("brings the controls back and restarts the clock on showChrome", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.showControls).toBe(false);
    act(() => {
      result.current.showChrome();
    });
    expect(result.current.showControls).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.showControls).toBe(true);
  });

  it("turns the slide at the interval, not the interval plus a render", () => {
    // `useSpreadPaging` rebuilds `paging` every render, so an effect depending
    // on it restarts the timer whenever the chrome's idle timer re-renders.
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setSlideshowInterval(3);
      result.current.setPlaying(true);
    });
    expect(result.current.imageIndex).toBe(0);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.showControls).toBe(false);
    expect(result.current.imageIndex).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.imageIndex).toBe(1);
  });

  it("does not pair on a page nothing has measured", () => {
    // An unmeasured page must read as unknown, not portrait: pairing on a
    // guess draws a spread and takes it away mid-load.
    localStorage.setItem("image-viewer:spread-mode", "true");
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setImageIndex(1);
    });
    act(() => {
      result.current.rememberOrientation(2, "portrait");
    });

    expect(result.current.face.kind).toBe("single");

    act(() => {
      result.current.rememberOrientation(1, "portrait");
    });
    expect(result.current.face.kind).toBe("pair");
    expect(result.current.face.indices).toEqual([1, 2]);
  });

  it("remembers what it has seen, so a turn back is one press", () => {
    // `pageBack` has to ask about a page behind the reader, which a
    // two-entry lookup cannot answer.
    localStorage.setItem("image-viewer:spread-mode", "true");
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      for (const [i, o] of [
        [0, "portrait"],
        [1, "portrait"],
        [2, "portrait"],
      ] as const) {
        result.current.rememberOrientation(i, o);
      }
      result.current.setImageIndex(3);
    });

    act(() => {
      result.current.navigatePrev();
    });
    expect(result.current.imageIndex).toBe(1);
  });

  it("does not respond to keys when viewMode is not image", () => {
    const { result } = renderHook(
      () => useImageViewer("listing", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(result.current.imageIndex).toBe(0);
  });

  it("keeps the page's own keys from firing while the viewer is open", () => {
    const search = vi.fn();
    const useBoth = () => {
      useShortcuts("global", "global", [{ key: "ctrl+k", label: "search", handler: search }]);
      return useImageViewer("image", imageEntries, "file-1", onClose);
    };
    renderHook(useBoth, { wrapper });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("gives the page its keys back once the viewer is closed", () => {
    const search = vi.fn();
    const useBoth = () => {
      useShortcuts("global", "global", [{ key: "ctrl+k", label: "search", handler: search }]);
      return useImageViewer("listing", imageEntries, "file-1", onClose);
    };
    renderHook(useBoth, { wrapper });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
