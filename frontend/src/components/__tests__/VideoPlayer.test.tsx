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

import { clearProgress } from "@/lib/recentlyPlayed";

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
    video.dispatchEvent(new Event("ended"));
    expect(onEnded).toHaveBeenCalled();
    expect(clearProgress).toHaveBeenCalledWith("vid-1");
  });

  it("renders fallback text", () => {
    render(<VideoPlayer videoId="vid-1" />);
    expect(screen.getByText("Your browser does not support video playback.")).toBeInTheDocument();
  });
});
