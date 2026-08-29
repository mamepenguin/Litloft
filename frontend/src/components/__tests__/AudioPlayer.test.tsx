import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AudioPlayer } from "../AudioPlayer";
import type { FileItem } from "@/types";
import { MEDIA_CLOCK_IDLE_MS } from "@/lib/mediaClock";

const mockSaveWatchProgress = vi.fn().mockResolvedValue(undefined);
const mockGetWatchProgress = vi
  .fn()
  .mockResolvedValue({ position: 0, duration: 0 });

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  saveWatchProgress: (...args: unknown[]) => mockSaveWatchProgress(...args),
  getWatchProgress: (...args: unknown[]) => mockGetWatchProgress(...args),
  deleteWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({
    nickname: "Alice",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

const mockFile: FileItem = {
  id: "audio-1",
  filename: "song.mp3",
  title: "Test Song",
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "audio",
  mime_type: "audio/mp3",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 5000000,
  duration: 180,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("AudioPlayer", () => {
  it("renders audio element with correct src", () => {
    render(<AudioPlayer file={mockFile} />);
    const audio = document.querySelector("audio");
    expect(audio).toBeInTheDocument();
    expect(audio?.getAttribute("src")).toBe("/api/files/audio-1/stream");
  });

  it("displays filename and file size", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(screen.getByText("4.8 MB")).toBeInTheDocument();
  });

  it("renders file type icon", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(screen.getByTestId("icon-audio")).toBeInTheDocument();
  });

  it("calls onEnded when audio ends", () => {
    const onEnded = vi.fn();
    render(<AudioPlayer file={mockFile} onEnded={onEnded} />);
    const audio = document.querySelector("audio")!;
    audio.dispatchEvent(new Event("ended"));
    expect(onEnded).toHaveBeenCalled();
  });

  it("renders fallback text", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(screen.getByText("Your browser does not support audio playback.")).toBeInTheDocument();
  });

  // Regression: audio was the one backend with no teardown save, so
  // navigating away discarded up to SAVE_INTERVAL seconds of listening.
  // Video and the .loft player both had one. Closed by moving
  // persistence into usePlaybackProgress.
  describe("teardown", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockGetWatchProgress.mockResolvedValue({ position: 0, duration: 0 });
      mockSaveWatchProgress.mockResolvedValue(undefined);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // Regression: audio used RESUME_THRESHOLD 3 while video and .loft
    // used 5, with nothing explaining the difference. A stored position
    // of 4s used to be restored here and nowhere else; now it falls
    // inside the shared dead zone.
    it("uses the same resume dead zone as every other backend", async () => {
      mockGetWatchProgress.mockResolvedValue({ position: 4, duration: 180 });
      render(<AudioPlayer file={mockFile} />);
      const audio = document.querySelector("audio")!;
      Object.defineProperty(audio, "duration", {
        value: 180,
        configurable: true,
      });
      const currentTime = vi.fn();
      Object.defineProperty(audio, "currentTime", {
        get: () => 0,
        set: currentTime,
        configurable: true,
      });

      act(() => {
        vi.advanceTimersByTime(MEDIA_CLOCK_IDLE_MS);
      });
      await act(async () => {});

      expect(currentTime).not.toHaveBeenCalled();
    });

    it("saves the position when the listener navigates away", async () => {
      const { unmount } = render(<AudioPlayer file={mockFile} />);
      const audio = document.querySelector("audio")!;
      Object.defineProperty(audio, "duration", {
        value: 180,
        configurable: true,
      });
      Object.defineProperty(audio, "currentTime", {
        value: 42,
        writable: true,
        configurable: true,
      });

      // Let the resume read settle first; saving stands still until it
      // does, so that it cannot overwrite the position being restored.
      await act(async () => {});

      unmount();

      expect(mockSaveWatchProgress).toHaveBeenCalledWith("audio-1", 42, 180);
    });
  });
});
