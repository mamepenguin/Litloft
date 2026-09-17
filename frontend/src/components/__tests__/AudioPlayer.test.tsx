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
  image_width: null,
  image_height: null,
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
  liked_at: null,
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

  it("displays the filename, and no size under it", () => {
    // The size on a `.loft` reference is the pointer's, not the track's.
    const { container } = render(<AudioPlayer file={mockFile} />);
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(container.textContent).not.toContain("4.8 MB");
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

describe("AudioPlayer inside the iOS shell", () => {
  interface StubbedWindow extends Window {
    webkit?: unknown;
    __litloft?: { receive(payload: unknown): void };
  }
  let posted: Record<string, unknown>[];

  const loadIdFor = (fileId: string) =>
    posted.filter((m) => m.type === "media.load" && String(m.url).includes(`/${fileId}/`)).at(-1)
      ?.loadId as string;

  /** What the shell reports about `fileId`: loaded, playable, and where it is. */
  function report(
    fileId: string,
    reading: {
      time: number;
      duration: number;
      ended?: boolean;
      paused?: boolean;
      status?: string;
      waiting?: boolean;
    },
  ) {
    (window as StubbedWindow).__litloft?.receive({
      type: "media.state",
      loadId: loadIdFor(fileId),
      status: "ready",
      seekId: null,
      paused: true,
      rate: 1,
      volume: 1,
      buffered: 0,
      ended: false,
      waiting: false,
      pip: false,
      pipPossible: false,
      ...reading,
    });
  }

  const fileB: FileItem = { ...mockFile, id: "audio-2", filename: "b.mp3", title: "Song B" };

  beforeEach(() => {
    posted = [];
    (window as StubbedWindow).webkit = {
      messageHandlers: {
        litloft: { postMessage: (body: unknown) => posted.push(body as Record<string, unknown>) },
      },
    };
  });

  afterEach(() => {
    delete (window as StubbedWindow).webkit;
    delete (window as StubbedWindow).__litloft;
  });

  /** Two players on one file would both stream it and both be heard. */
  it("renders no audio element, so nothing plays twice", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(document.querySelector("audio")).toBeNull();
  });

  it("hands the shell an address AVPlayer can resolve", () => {
    render(<AudioPlayer file={mockFile} />);

    const load = posted.find((m) => m.type === "media.load");
    expect(load).toMatchObject({
      kind: "audio",
      url: "http://localhost:3000/api/files/audio-1/stream",
      title: "Test Song",
      artworkUrl: "http://localhost:3000/api/files/audio-1/thumbnail",
    });
  });

  it("offers a transport of its own, since the element's is gone", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
  });

  /**
   * Playing before the resume decision starts at zero, and the restored
   * position lands a moment later — heard as the file starting over.
   */
  it("starts an autoplay only after the resume point is applied", async () => {
    mockGetWatchProgress.mockResolvedValueOnce({ position: 60, duration: 180 });
    render(<AudioPlayer file={mockFile} autoPlay />);
    expect(posted.some((m) => m.type === "media.play")).toBe(false);

    await act(async () => {
      report("audio-1", { time: 0, duration: 180, paused: true });
    });

    const types = posted.map((m) => m.type);
    const seek = posted.findIndex((m) => m.type === "media.seek" && m.time === 60);
    const play = types.indexOf("media.play");
    expect(seek).toBeGreaterThanOrEqual(0);
    expect(play).toBeGreaterThan(seek);
  });

  it("does not start without autoplay", async () => {
    render(<AudioPlayer file={mockFile} />);

    await act(async () => {
      report("audio-1", { time: 0, duration: 180, paused: true });
    });

    expect(posted.some((m) => m.type === "media.play")).toBe(false);
  });

  /** The shell has one player; a late play would start whatever loaded next. */
  it("does not start the next file with the previous file's autoplay", async () => {
    let settle: (value: { position: number; duration: number }) => void = () => {};
    mockGetWatchProgress.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    const { rerender } = render(<AudioPlayer file={mockFile} autoPlay />);
    await act(async () => {
      report("audio-1", { time: 0, duration: 180, paused: true });
    });

    // Autoplay stays on as it advances, so only the stale read can be blamed.
    rerender(<AudioPlayer file={fileB} autoPlay />);
    const before = posted.length;
    await act(async () => {
      settle({ position: 0, duration: 0 });
    });

    expect(posted.slice(before).some((m) => m.type === "media.play")).toBe(false);
  });

  it("says when the shell cannot load the file", async () => {
    render(<AudioPlayer file={mockFile} autoPlay />);
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      report("audio-1", { time: 0, duration: 0, paused: true, status: "failed" });
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(posted.some((m) => m.type === "media.play")).toBe(false);
  });

  it("does not carry a failure over to the next file", async () => {
    const { rerender } = render(<AudioPlayer file={mockFile} />);
    await act(async () => {
      report("audio-1", { time: 0, duration: 0, paused: true, status: "failed" });
    });

    rerender(<AudioPlayer file={fileB} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says it is loading while the shell waits for data, until it plays", async () => {
    render(<AudioPlayer file={mockFile} />);
    await act(async () => {
      report("audio-1", { time: 11, duration: 180, paused: false, waiting: true });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.getByRole("button", { name: /^(Play|Pause)$/ })).toBeEnabled();

    await act(async () => {
      report("audio-1", { time: 12, duration: 180, paused: false });
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not carry a wait over to the next file, or back to the same one", async () => {
    const { rerender } = render(<AudioPlayer file={mockFile} />);
    await act(async () => {
      report("audio-1", { time: 11, duration: 180, paused: false, waiting: true });
    });

    rerender(<AudioPlayer file={fileB} />);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<AudioPlayer file={mockFile} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  /** The player lives on across files, so the failure must be the old load's alone. */
  it("does not carry a failure over to the same file opened again", async () => {
    const { rerender } = render(<AudioPlayer file={mockFile} />);
    await act(async () => {
      report("audio-1", { time: 0, duration: 0, status: "failed" });
    });
    rerender(<AudioPlayer file={fileB} />);
    rerender(<AudioPlayer file={mockFile} />);

    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      report("audio-1", { time: 0, duration: 180 });
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
  });

  /** Renaming the file being listened to must not reload it. */
  it("keeps playing when the file is renamed", () => {
    const { rerender } = render(<AudioPlayer file={mockFile} />);
    const loads = posted.filter((m) => m.type === "media.load").length;

    rerender(<AudioPlayer file={{ ...mockFile, title: "Renamed" }} />);

    expect(posted.filter((m) => m.type === "media.load")).toHaveLength(loads);
    expect(posted.some((m) => m.type === "media.unload")).toBe(false);
  });

  it("gives the file back when it goes away", () => {
    const { unmount } = render(<AudioPlayer file={mockFile} />);
    posted.length = 0;

    unmount();

    expect(posted.some((m) => m.type === "media.unload")).toBe(true);
  });

  describe("watch history", () => {
    beforeEach(() => {
      mockSaveWatchProgress.mockClear();
      mockGetWatchProgress.mockClear();
    });

    it("saves the position as the file plays", async () => {
      vi.useFakeTimers();
      try {
        render(<AudioPlayer file={mockFile} />);
        await act(async () => {
          report("audio-1", { time: 2, duration: 180 });
          await vi.advanceTimersByTimeAsync(MEDIA_CLOCK_IDLE_MS);
        });
        await act(async () => {
          report("audio-1", { time: 30, duration: 180 });
          await vi.advanceTimersByTimeAsync(MEDIA_CLOCK_IDLE_MS * 2);
        });

        expect(mockSaveWatchProgress).toHaveBeenCalledWith("audio-1", 30, 180);
      } finally {
        vi.useRealTimers();
      }
    });

    /** Unloading used to zero the reading before this save could read it. */
    it("saves where the listener got to when they leave", async () => {
      vi.useFakeTimers();
      try {
        const { unmount } = render(<AudioPlayer file={mockFile} />);
        await act(async () => {
          report("audio-1", { time: 2, duration: 180 });
          await vi.advanceTimersByTimeAsync(MEDIA_CLOCK_IDLE_MS);
        });
        await act(async () => {
          report("audio-1", { time: 30, duration: 180 });
          await vi.advanceTimersByTimeAsync(MEDIA_CLOCK_IDLE_MS);
        });
        expect(mockSaveWatchProgress).toHaveBeenLastCalledWith("audio-1", 30, 180);
        // Past the teardown threshold, short of the next periodic save.
        await act(async () => {
          report("audio-1", { time: 33, duration: 180 });
          await vi.advanceTimersByTimeAsync(MEDIA_CLOCK_IDLE_MS);
        });
        mockSaveWatchProgress.mockClear();

        unmount();

        expect(mockSaveWatchProgress).toHaveBeenCalledWith("audio-1", 33, 180);
      } finally {
        vi.useRealTimers();
      }
    });

    it("records the end and moves on when the file runs out", async () => {
      const onEnded = vi.fn();
      render(<AudioPlayer file={mockFile} onEnded={onEnded} />);

      await act(async () => {
        report("audio-1", { time: 180, duration: 180, ended: true, paused: true });
      });

      expect(onEnded).toHaveBeenCalledOnce();
      expect(mockSaveWatchProgress).toHaveBeenCalledWith("audio-1", 180, 180);
    });

    /**
     * The previous file's end is still in flight when autoplay moves to the
     * next one; applied there, it marks a file nobody heard as finished.
     */
    it("does not mark the next file finished with the previous file's end", async () => {
      const onEnded = vi.fn();
      const { rerender } = render(<AudioPlayer file={mockFile} onEnded={onEnded} />);
      await act(async () => {
        report("audio-1", { time: 180, duration: 180, ended: true, paused: true });
      });

      rerender(<AudioPlayer file={fileB} onEnded={onEnded} />);
      await act(async () => {
        // Still about audio-1: taken before audio-2 was loaded.
        report("audio-1", { time: 180, duration: 180, ended: true, paused: true });
      });

      expect(onEnded).toHaveBeenCalledOnce();
      expect(mockSaveWatchProgress).not.toHaveBeenCalledWith("audio-2", expect.anything(), expect.anything());
    });
  });
});
