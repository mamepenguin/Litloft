import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VideoPreview } from "../VideoPreview";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

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

  it("does not show video initially", () => {
    render(<VideoPreview fileId="test-123" />);
    expect(screen.queryByTestId("video-preview-player")).toBeNull();
  });

  it("shows video element after hover delay", () => {
    render(<VideoPreview fileId="test-456" />);
    const container = screen.getByTestId("video-preview-container");

    fireEvent.mouseEnter(container);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId("video-preview-player")).toBeInTheDocument();
  });

  it("hides video on mouse leave", () => {
    render(<VideoPreview fileId="test-leave" />);
    const container = screen.getByTestId("video-preview-container");

    fireEvent.mouseEnter(container);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId("video-preview-player")).toBeInTheDocument();

    fireEvent.mouseLeave(container);
    expect(screen.queryByTestId("video-preview-player")).toBeNull();
  });

  it("cleans up timers on unmount", () => {
    const { unmount } = render(<VideoPreview fileId="test-123" />);
    unmount();
  });

  it("shows mute button when video is playing", () => {
    render(<VideoPreview fileId="test-mute" />);
    const container = screen.getByTestId("video-preview-container");

    fireEvent.mouseEnter(container);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole("button", { name: /unmute/i })).toBeInTheDocument();
  });
});
