import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";

import { installShellStub } from "../../test/shellStub";
import { VideoPlayer } from "../VideoPlayer";

const nativeShell = vi.hoisted(() => ({ active: false }));

vi.mock("@/lib/nativeBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nativeBridge")>()),
  isNativeShell: () => nativeShell.active,
}));

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getSubtitleUrl: (id: string, index: number) =>
    `/api/files/${id}/subtitles/${index}`,
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  getWatchProgress: vi.fn().mockResolvedValue({ position: 0, duration: 0 }),
  deleteWatchProgress: vi.fn().mockResolvedValue(undefined),
  getPlayedSegments: vi.fn().mockResolvedValue({
    segment_seconds: 5,
    segments: [],
  }),
}));

vi.mock("@/lib/mediaSession", () => ({
  setupMediaSession: vi.fn(() => () => {}),
}));

vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
  getSavedProgress: vi.fn(() => 0),
  saveProgress: vi.fn(),
  clearProgress: vi.fn(),
}));

import { setupMediaSession } from "@/lib/mediaSession";
import { getSavedProgress, saveProgress } from "@/lib/recentlyPlayed";

const getSavedProgressMock = vi.mocked(getSavedProgress);
const saveProgressMock = vi.mocked(saveProgress);
const setupMediaSessionMock = vi.mocked(setupMediaSession);

let shell: ReturnType<typeof installShellStub> | null = null;

function enterShell() {
  nativeShell.active = true;
  shell = installShellStub(2);
}

function shellLoads(): Record<string, unknown>[] {
  return (shell?.posted ?? []).filter(
    (message): message is Record<string, unknown> =>
      typeof message === "object" &&
      message !== null &&
      (message as { type?: unknown }).type === "media.load",
  );
}

function keepCurrentTime(video: HTMLVideoElement, seconds: number) {
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    writable: true,
    value: seconds,
  });
}

function keepDuration(video: HTMLVideoElement, seconds: number) {
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: seconds,
  });
}

function fireLoadedMetadata(video: HTMLVideoElement) {
  act(() => {
    video.dispatchEvent(new Event("loadedmetadata"));
  });
}

beforeEach(() => {
  nativeShell.active = false;
  window.localStorage.clear();
  vi.clearAllMocks();
  getSavedProgressMock.mockReturnValue(0);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("pointer: fine"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
});

afterEach(() => {
  shell?.remove();
  shell = null;
  nativeShell.active = false;
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-196 I1/I2: a non-empty src is the element's source everywhere", () => {
  type Row = {
    where: string;
    src: string | undefined;
    shell: boolean;
    srcAttr?: string;
  };

  const rows: Row[] = [
    { where: "in a browser, src undefined", src: undefined, shell: false, srcAttr: "/api/files/vid-1/stream" },
    { where: "in a browser, src empty", src: "", shell: false, srcAttr: "/api/files/vid-1/stream" },
    { where: "in a browser, src given", src: "/api/addons/relay/files/vid-1/stream", shell: false, srcAttr: "/api/addons/relay/files/vid-1/stream" },
    { where: "inside the shell, src undefined", src: undefined, shell: true },
    { where: "inside the shell, src empty", src: "", shell: true },
    { where: "inside the shell, src given", src: "/api/addons/relay/files/vid-1/stream", shell: true, srcAttr: "/api/addons/relay/files/vid-1/stream" },
  ];

  it.each(rows)("$where", ({ src, shell: insideShell, srcAttr }) => {
    if (insideShell) enterShell();
    render(<VideoPlayer videoId="vid-1" src={src} />);

    const videos = document.querySelectorAll("video");
    if (srcAttr === undefined) {
      expect(videos).toHaveLength(0);
      return;
    }

    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute("src")).toBe(srcAttr);
  });

  it("renders ShellVideoPlayer only in the shell without a non-empty src", async () => {
    enterShell();
    render(<VideoPlayer videoId="vid-1" src={undefined} />);
    expect(document.querySelector("video")).toBeNull();
    await waitFor(() => expect(shellLoads()).toHaveLength(1));

    shell?.remove();
    shell = null;
    nativeShell.active = false;

    render(<VideoPlayer videoId="vid-1" src="/api/addons/relay/files/vid-1/stream" />);
    expect(document.querySelectorAll("video")).toHaveLength(1);
    expect(shellLoads()).toHaveLength(0);
  });
});

describe("SPEC-CORE-196 I3: everything but the element's source stays keyed on videoId", () => {
  const sources = [
    { label: "without src", src: undefined },
    { label: "with src", src: "/api/addons/relay/files/vid-1/stream" },
  ];

  it.each(sources)(
    "SPEC-CORE-196 I3: reads and saves progress for videoId $label",
    async ({ src }) => {
      render(<VideoPlayer videoId="vid-1" src={src} />);
      const video = document.querySelector("video")!;
      keepDuration(video, 300);
      keepCurrentTime(video, 300);

      fireLoadedMetadata(video);
      await waitFor(() =>
        expect(getSavedProgressMock).toHaveBeenCalledWith("vid-1"),
      );

      fireEvent.ended(video);
      await waitFor(() =>
        expect(saveProgressMock).toHaveBeenCalledWith("vid-1", 300, 300),
      );
    },
  );

  it.each(sources)(
    "SPEC-CORE-196 I3: hands out a controller and takes it back $label",
    async ({ src }) => {
      const onMediaController = vi.fn();
      const { unmount } = render(
        <VideoPlayer
          videoId="vid-1"
          src={src}
          onMediaController={onMediaController}
        />,
      );

      await waitFor(() => expect(onMediaController).toHaveBeenCalledTimes(1));
      expect(onMediaController.mock.calls[0][0]).toBeTruthy();

      unmount();
      expect(onMediaController).toHaveBeenLastCalledWith(null);
    },
  );

  it.each(sources)(
    "SPEC-CORE-196 I3: ends progress before onEnded $label",
    async ({ src }) => {
      const onEnded = vi.fn();
      render(<VideoPlayer videoId="vid-1" src={src} onEnded={onEnded} />);
      const video = document.querySelector("video")!;
      keepDuration(video, 300);
      keepCurrentTime(video, 300);

      fireEvent.ended(video);

      expect(saveProgressMock).toHaveBeenCalledWith("vid-1", 300, 300);
      expect(saveProgressMock.mock.invocationCallOrder[0]).toBeLessThan(
        onEnded.mock.invocationCallOrder[0],
      );
    },
  );

  it.each(sources)(
    "SPEC-CORE-196 I3: the media session artwork is videoId's thumbnail $label",
    async ({ src }) => {
      render(<VideoPlayer videoId="vid-1" src={src} title="A film" />);

      await waitFor(() =>
        expect(setupMediaSessionMock).toHaveBeenCalledTimes(1),
      );
      const metadata = setupMediaSessionMock.mock.calls[0][1];
      expect(metadata.artwork).toEqual([
        { src: "/api/files/vid-1/thumbnail" },
      ]);
    },
  );
});

describe("SPEC-CORE-196 I3b: a new src under the same videoId rebinds the player", () => {
  it("hands null and then a new controller and seeks to initialTime", async () => {
    const onMediaController = vi.fn();
    const { rerender } = render(
      <VideoPlayer videoId="vid-1" src="/one" onMediaController={onMediaController} />,
    );
    expect(onMediaController).toHaveBeenCalledTimes(1);

    const video = document.querySelector("video")!;
    keepDuration(video, 300);
    keepCurrentTime(video, 30);

    rerender(
      <VideoPlayer
        videoId="vid-1"
        src="/two"
        initialTime={90}
        onMediaController={onMediaController}
      />,
    );

    expect(
      onMediaController.mock.calls.map(([mc]) => (mc === null ? null : "controller")),
    ).toEqual(["controller", null, "controller"]);
    await waitFor(() => expect(video.currentTime).toBe(90));

    const newControllerOrder = onMediaController.mock.invocationCallOrder[2];
    const savedAfter = saveProgressMock.mock.calls.filter(
      (_, index) =>
        saveProgressMock.mock.invocationCallOrder[index] > newControllerOrder,
    );
    expect(savedAfter.map((call) => call[1])).not.toContain(0);
  });

  it("hands null and then a new controller and seeks to the stored position", async () => {
    getSavedProgressMock.mockReturnValue(42);
    const onMediaController = vi.fn();
    const { rerender } = render(
      <VideoPlayer videoId="vid-1" src="/one" onMediaController={onMediaController} />,
    );
    expect(onMediaController).toHaveBeenCalledTimes(1);

    const video = document.querySelector("video")!;
    keepDuration(video, 300);
    fireLoadedMetadata(video);
    await waitFor(() => expect(video.currentTime).toBe(42));

    keepCurrentTime(video, 0);
    rerender(
      <VideoPlayer
        videoId="vid-1"
        src="/two"
        onMediaController={onMediaController}
      />,
    );

    expect(
      onMediaController.mock.calls.map(([mc]) => (mc === null ? null : "controller")),
    ).toEqual(["controller", null, "controller"]);
    await waitFor(() => expect(video.currentTime).toBe(42));

    const newControllerOrder = onMediaController.mock.invocationCallOrder[2];
    const savedAfter = saveProgressMock.mock.calls.filter(
      (_, index) =>
        saveProgressMock.mock.invocationCallOrder[index] > newControllerOrder,
    );
    expect(savedAfter.map((call) => call[1])).not.toContain(0);
  });
});

describe("SPEC-CORE-196 I3c: loadedmetadata starts playback only when autoplay says so", () => {
  type Row = {
    label: string;
    src: string | undefined;
    preference: boolean;
    autoPlay: boolean;
    plays: boolean;
  };

  const rows: Row[] = [
    { label: "with src, the preference on", src: "/api/addons/relay/files/vid-1/stream", preference: true, autoPlay: false, plays: true },
    { label: "with src, the autoPlay prop", src: "/api/addons/relay/files/vid-1/stream", preference: false, autoPlay: true, plays: true },
    { label: "with src, neither", src: "/api/addons/relay/files/vid-1/stream", preference: false, autoPlay: false, plays: false },
    { label: "without src, the preference on", src: undefined, preference: true, autoPlay: false, plays: true },
  ];

  it.each(rows)("$label", async ({ src, preference, autoPlay, plays }) => {
    window.localStorage.setItem("video-share-autoplay", String(preference));
    render(<VideoPlayer videoId="vid-1" src={src} autoPlay={autoPlay} />);
    const video = document.querySelector("video")!;
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "play", { configurable: true, value: play });
    keepDuration(video, 300);

    await act(async () => {
      video.dispatchEvent(new Event("loadedmetadata"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(play).toHaveBeenCalledTimes(plays ? 1 : 0);
  });
});

describe("SPEC-CORE-196 I4: an element error reaches onError", () => {
  it("calls onError once per error event", () => {
    const onError = vi.fn();
    render(
      <VideoPlayer
        videoId="vid-1"
        src="/api/addons/relay/files/vid-1/stream"
        onError={onError}
      />,
    );
    const video = document.querySelector("video")!;

    fireEvent.error(video);
    fireEvent.error(video);

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("does not call onError for a track's load failure", () => {
    const onError = vi.fn();
    render(
      <VideoPlayer
        videoId="vid-1"
        src="/api/addons/relay/files/vid-1/stream"
        onError={onError}
      />,
    );
    const track = document.querySelector("track")!;

    fireEvent.error(track);

    expect(onError).not.toHaveBeenCalled();
  });

  it("does nothing without onError", () => {
    render(
      <VideoPlayer videoId="vid-1" src="/api/addons/relay/files/vid-1/stream" />,
    );

    expect(() => fireEvent.error(document.querySelector("video")!)).not.toThrow();
  });
});
