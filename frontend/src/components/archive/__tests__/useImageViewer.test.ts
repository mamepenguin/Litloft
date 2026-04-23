import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { createElement } from "react";
import { useImageViewer } from "../useImageViewer";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
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
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
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
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
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
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
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
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(result.current.imageIndex).toBe(2);
  });

  it("calls onClose on Escape key", () => {
    renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
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
        new KeyboardEvent("keydown", { key: " ", bubbles: true })
      );
    });
    expect(result.current.playing).toBe(true);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true })
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

  it("auto-hides controls after 3 seconds when playing", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setPlaying(true);
    });
    expect(result.current.showControls).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.showControls).toBe(false);
  });

  it("toggles controls on handleImageAreaClick", () => {
    const { result } = renderHook(
      () => useImageViewer("image", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      result.current.setShowControls(false);
    });
    act(() => {
      result.current.handleImageAreaClick();
    });
    expect(result.current.showControls).toBe(true);
  });

  it("does not respond to keys when viewMode is not image", () => {
    const { result } = renderHook(
      () => useImageViewer("listing", imageEntries, "file-1", onClose),
      { wrapper },
    );
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(result.current.imageIndex).toBe(0);
  });
});
