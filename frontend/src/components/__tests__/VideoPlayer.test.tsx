import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VideoPlayer } from "../VideoPlayer";
import { ShortcutsProvider } from "../ShortcutsProvider";

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
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("pointer: fine"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("renders video element with correct src", () => {
    render(<VideoPlayer videoId="vid-1" />);
    const video = document.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute("src")).toBe("/api/files/vid-1/stream");
  });

  it("uses Litloft controls by default and keeps playsInline", async () => {
    render(<VideoPlayer videoId="vid-1" />);
    const video = document.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(false);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(await screen.findByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(document.querySelector("[data-player-gestures]")).not.toBeNull();
  });

  it("uses browser controls without Litloft overlays when stored", async () => {
    window.localStorage.setItem("native-player-ui", "browser");
    render(<VideoPlayer videoId="vid-1" />);
    const video = document.querySelector("video")!;

    await waitFor(() => expect(video.hasAttribute("controls")).toBe(true));
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(document.querySelector("[data-player-gestures]")).toBeNull();
  });

  it("switches modes without replacing the video element", async () => {
    render(<VideoPlayer videoId="vid-1" />);
    const original = document.querySelector("video")!;
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(
      await screen.findByRole("switch", { name: "Browser controls" }),
    );

    await waitFor(() => expect(original.hasAttribute("controls")).toBe(true));
    expect(document.querySelector("video")).toBe(original);

    fireEvent.click(
      screen.getByRole("button", { name: "Use Litloft controls" }),
    );
    await waitFor(() => expect(original.hasAttribute("controls")).toBe(false));
    expect(document.querySelector("video")).toBe(original);
  });

  it("routes f through the frame fullscreen controller, not the video", async () => {
    const { container } = render(
      <ShortcutsProvider>
        <VideoPlayer videoId="vid-1" />
      </ShortcutsProvider>,
    );
    const frame = container.querySelector<HTMLElement>("[data-testid='player-frame']")!;
    const video = container.querySelector("video")!;
    const frameRequest = vi.fn().mockResolvedValue(undefined);
    const videoRequest = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(frame, "requestFullscreen", { value: frameRequest });
    Object.defineProperty(video, "requestFullscreen", { value: videoRequest });

    await screen.findByRole("button", { name: "Settings" });
    fireEvent.keyDown(document, { key: "f" });
    await waitFor(() => expect(frameRequest).toHaveBeenCalledOnce());
    expect(videoRequest).not.toHaveBeenCalled();
  });

  it("falls back to the native controller for f in browser mode", async () => {
    window.localStorage.setItem("native-player-ui", "browser");
    const { container } = render(
      <ShortcutsProvider>
        <VideoPlayer videoId="vid-1" />
      </ShortcutsProvider>,
    );
    const video = container.querySelector("video")!;
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    await waitFor(() => expect(video.hasAttribute("controls")).toBe(true));
    fireEvent.keyDown(document, { key: "f" });

    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("pins the same frame for pseudo-fullscreen on a coarse device", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("pointer: coarse"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    window.scrollTo = vi.fn();
    const { container } = render(
      <ShortcutsProvider>
        <VideoPlayer videoId="vid-1" />
      </ShortcutsProvider>,
    );
    const frame = container.querySelector<HTMLElement>("[data-testid='player-frame']")!;

    await screen.findByRole("button", { name: "Settings" });
    fireEvent.keyDown(document, { key: "f" });
    await waitFor(() => expect(frame).toHaveClass("fixed", "inset-0", "z-50"));
    expect(frame).not.toHaveClass("aspect-video");
  });

  it("does not treat waiting on a paused video as active playback", async () => {
    const landscapeListeners = new Set<(event: MediaQueryListEvent) => void>();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        if (query === "(orientation: landscape)") {
          landscapeListeners.add(listener);
        }
      },
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        landscapeListeners.delete(listener);
      },
    }));
    window.scrollTo = vi.fn();
    const { container } = render(
      <ShortcutsProvider>
        <VideoPlayer videoId="vid-1" />
      </ShortcutsProvider>,
    );
    const video = container.querySelector("video")!;
    const frame = container.querySelector<HTMLElement>("[data-testid='player-frame']")!;
    Object.defineProperty(video, "paused", { configurable: true, value: true });
    Object.defineProperty(video, "ended", { configurable: true, value: false });

    fireEvent.waiting(video);
    await act(async () => {
      for (const listener of landscapeListeners) {
        listener({ matches: true } as MediaQueryListEvent);
      }
      await Promise.resolve();
    });

    expect(frame).not.toHaveClass("fixed");
  });

  it("unwinds pseudo-fullscreen history before switching to browser controls", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("pointer: coarse"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    window.scrollTo = vi.fn();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(
      <ShortcutsProvider>
        <VideoPlayer videoId="vid-1" />
      </ShortcutsProvider>,
    );

    fireEvent.keyDown(document, { key: "f" });
    await waitFor(() =>
      expect(screen.getByTestId("player-frame")).toHaveClass("fixed"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("switch", { name: "Browser controls" }));

    expect(back).toHaveBeenCalledOnce();
  });

  it("preserves the selected subtitle track across a mode round-trip", async () => {
    render(<VideoPlayer videoId="vid-1" />);
    const video = document.querySelector("video")!;
    const tracks = [
      { id: "en", label: "English", language: "en", mode: "showing" },
      { id: "ja", label: "日本語", language: "ja", mode: "disabled" },
    ] as TextTrack[];
    const list = Object.assign(
      new EventTarget(),
      { length: tracks.length },
      tracks,
    );
    Object.defineProperty(video, "textTracks", {
      configurable: true,
      value: list,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("radio", { name: "日本語" }));
    expect(tracks.map((track) => track.mode)).toEqual(["disabled", "showing"]);
    fireEvent.click(screen.getByRole("switch", { name: "Browser controls" }));
    await waitFor(() => expect(video.hasAttribute("controls")).toBe(true));
    fireEvent.click(
      screen.getByRole("button", { name: "Use Litloft controls" }),
    );
    await waitFor(() => expect(video.hasAttribute("controls")).toBe(false));
    await waitFor(() =>
      expect(tracks.map((track) => track.mode)).toEqual([
        "disabled",
        "showing",
      ]),
    );
  });

  it("leaves only the gesture layer covering the frame and taking input", async () => {
    const { container } = render(<VideoPlayer videoId="vid-1" />);
    await screen.findByRole("button", { name: "Settings" });
    const frame = container.querySelector<HTMLElement>("[data-testid='player-frame']")!;
    const blocking = Array.from(frame.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.className.includes("inset-0") &&
        !element.className.includes("pointer-events-none"),
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0]).toHaveAttribute("data-player-gestures");
  });

  it("does not dispatch player arrow shortcuts from the focused seek bar", async () => {
    render(
      <ShortcutsProvider>
        <VideoPlayer videoId="vid-1" duration={120} />
      </ShortcutsProvider>,
    );
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 30,
    });
    const seek = await screen.findByRole("slider", { name: "Seek" });
    seek.focus();
    fireEvent.keyDown(seek, { key: "ArrowRight" });
    expect(video.currentTime).toBe(30);
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
