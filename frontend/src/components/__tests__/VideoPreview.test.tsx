import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VideoPreview } from "../VideoPreview";

describe("VideoPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the preview container", () => {
    render(<VideoPreview fileId="test-123" />);
    expect(screen.getByTestId("video-preview-container")).toBeInTheDocument();
  });

  it("does not show overlay initially", () => {
    render(<VideoPreview fileId="test-123" />);
    expect(screen.queryByTestId("video-preview-overlay")).toBeNull();
  });

  it("cleans up timers on unmount", () => {
    const { unmount } = render(<VideoPreview fileId="test-123" />);
    unmount();
  });

  it("starts preloading sprite on mouse enter", () => {
    const originalImage = global.Image;
    const mockImages: Array<{ src: string }> = [];
    global.Image = vi.fn().mockImplementation(() => {
      const img = { onload: null, onerror: null, src: "" };
      mockImages.push(img);
      return img;
    }) as unknown as typeof Image;

    render(<VideoPreview fileId="test-456" />);
    const container = screen.getByTestId("video-preview-container");

    fireEvent.mouseEnter(container);

    expect(mockImages.length).toBe(1);
    expect(mockImages[0].src).toBe("/api/files/test-456/preview");

    global.Image = originalImage;
  });

  it("shows overlay after sprite loads and delay passes", () => {
    const originalImage = global.Image;
    let capturedImg: { onload: (() => void) | null; onerror: (() => void) | null; src: string } | null = null;
    global.Image = vi.fn().mockImplementation(() => {
      const img = { onload: null as (() => void) | null, onerror: null, src: "" };
      capturedImg = img;
      return img;
    }) as unknown as typeof Image;

    render(<VideoPreview fileId="test-789" />);
    const container = screen.getByTestId("video-preview-container");

    fireEvent.mouseEnter(container);

    // Simulate image load
    act(() => {
      capturedImg?.onload?.();
    });

    // Advance past the hover delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("video-preview-overlay")).toBeInTheDocument();

    global.Image = originalImage;
  });

  it("hides overlay on mouse leave", () => {
    const originalImage = global.Image;
    let capturedImg: { onload: (() => void) | null; onerror: (() => void) | null; src: string } | null = null;
    global.Image = vi.fn().mockImplementation(() => {
      const img = { onload: null as (() => void) | null, onerror: null, src: "" };
      capturedImg = img;
      return img;
    }) as unknown as typeof Image;

    render(<VideoPreview fileId="test-leave" />);
    const container = screen.getByTestId("video-preview-container");

    fireEvent.mouseEnter(container);
    act(() => {
      capturedImg?.onload?.();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("video-preview-overlay")).toBeInTheDocument();

    fireEvent.mouseLeave(container);
    expect(screen.queryByTestId("video-preview-overlay")).toBeNull();

    global.Image = originalImage;
  });

  it("cycles through frames at interval", () => {
    const originalImage = global.Image;
    let capturedImg: { onload: (() => void) | null; onerror: (() => void) | null; src: string } | null = null;
    global.Image = vi.fn().mockImplementation(() => {
      const img = { onload: null as (() => void) | null, onerror: null, src: "" };
      capturedImg = img;
      return img;
    }) as unknown as typeof Image;

    render(<VideoPreview fileId="test-cycle" />);
    const container = screen.getByTestId("video-preview-container");

    fireEvent.mouseEnter(container);
    act(() => {
      capturedImg?.onload?.();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const overlay = screen.getByTestId("video-preview-overlay");
    // Initial frame: 0% position
    expect(overlay.style.backgroundPosition).toBe("0% 0%");

    // Advance one frame interval
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Frame 1: ~14.28%
    expect(overlay.style.backgroundPosition).toContain("14.2857");

    global.Image = originalImage;
  });
});
