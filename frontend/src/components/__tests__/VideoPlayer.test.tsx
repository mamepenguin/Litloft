import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { VideoPlayer } from "../VideoPlayer";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
  clearProgress: vi.fn(),
}));

import { clearProgress, saveProgress } from "@/lib/recentlyPlayed";

describe("VideoPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders video element with correct src", () => {
    render(<VideoPlayer videoId="vid-1" />);
    const video = document.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute("src")).toBe("/api/files/vid-1/stream");
  });

  it("renders with controls and playsInline", () => {
    render(<VideoPlayer videoId="vid-1" />);
    const video = document.querySelector("video");
    expect(video?.hasAttribute("controls")).toBe(true);
  });

  it("calls onEnded when video ends", () => {
    const onEnded = vi.fn();
    render(<VideoPlayer videoId="vid-1" onEnded={onEnded} />);
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 300, configurable: true });
    Object.defineProperty(video, "currentTime", { value: 300, configurable: true });
    video.dispatchEvent(new Event("ended"));
    expect(onEnded).toHaveBeenCalled();
    // Completion is recorded, never erased — clearing is reserved for
    // the explicit "remove from history" action.
    expect(saveProgress).toHaveBeenCalledWith("vid-1", 300, 300);
    expect(clearProgress).not.toHaveBeenCalled();
  });

  it("renders fallback text", () => {
    render(<VideoPlayer videoId="vid-1" />);
    expect(screen.getByText("Your browser does not support video playback.")).toBeInTheDocument();
  });
});
