import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { VideoPlayer } from "../VideoPlayer";

const mockSetupMediaSession = vi.fn(() => () => {});
const mockSetupBackgroundPiP = vi.fn(() => () => {});

const mockSaveWatchProgress = vi.fn().mockResolvedValue(undefined);
const mockGetWatchProgress = vi.fn().mockResolvedValue({ position: 0, duration: 0 });

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getSubtitleUrl: (id: string, index: number) => `/api/files/${id}/subtitles/${index}`,
  saveWatchProgress: (...args: unknown[]) => mockSaveWatchProgress(...(args as [])),
  getWatchProgress: (...args: unknown[]) => mockGetWatchProgress(...(args as [])),
  deleteWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/mediaSession", () => ({
  setupMediaSession: (...args: unknown[]) => mockSetupMediaSession(...(args as [])),
}));

vi.mock("@/lib/backgroundPiP", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backgroundPiP")>()),
  setupBackgroundPiP: (...args: unknown[]) => mockSetupBackgroundPiP(...(args as [])),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "Alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

interface StubbedWindow extends Window {
  webkit?: unknown;
  __litloftShell?: { version?: number };
  __litloft?: { receive(payload: unknown): void };
}

let posted: Record<string, unknown>[] = [];
const loadId = () => posted.find((m) => m.type === "media.load")?.loadId as string;

function report(reading: Record<string, unknown> = {}) {
  (window as StubbedWindow).__litloft?.receive({
    type: "media.state",
    loadId: loadId(),
    status: "ready",
    seekId: null,
    time: 0,
    duration: 120,
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

const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
First line
`;

beforeEach(() => {
  posted = [];
  window.localStorage.clear();
  mockSaveWatchProgress.mockClear();
  mockGetWatchProgress.mockClear();
  mockGetWatchProgress.mockResolvedValue({ position: 0, duration: 0 });
  mockSetupMediaSession.mockClear();
  mockSetupBackgroundPiP.mockClear();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("pointer: fine"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/subtitles") ? new Response(vtt) : new Response("", { status: 404 }),
    ),
  );
  (window as StubbedWindow).__litloftShell = { version: 2 };
  (window as StubbedWindow).webkit = {
    messageHandlers: { litloft: { postMessage: (body: unknown) => posted.push(body as Record<string, unknown>) } },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as StubbedWindow).webkit;
  delete (window as StubbedWindow).__litloftShell;
  delete (window as StubbedWindow).__litloft;
});

async function openSettings() {
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
}

describe("VideoPlayer inside the iOS shell", () => {
  it("draws no video element and has the shell load the file as video", () => {
    render(<VideoPlayer videoId="vid-1" title="A film" subtitleText="Movies" />);

    expect(document.querySelector("video")).toBeNull();
    expect(posted.find((m) => m.type === "media.load")).toMatchObject({
      kind: "video",
      url: "http://localhost:3000/api/files/vid-1/stream",
      title: "A film",
      artist: "Movies",
    });
  });

  it("leaves the lock screen and picture in picture to the shell", () => {
    render(<VideoPlayer videoId="vid-1" title="A film" />);

    expect(mockSetupMediaSession).not.toHaveBeenCalled();
    expect(mockSetupBackgroundPiP).not.toHaveBeenCalled();
  });

  it("tells the shell where the frame is", async () => {
    render(<VideoPlayer videoId="vid-1" />);

    await waitFor(() => expect(posted.some((m) => m.type === "media.surface")).toBe(true));
    expect(posted.find((m) => m.type === "media.surface")?.loadId).toBe(loadId());
  });

  it("keeps Litloft's controls and offers no switch to the browser's", async () => {
    render(<VideoPlayer videoId="vid-1" />);
    await openSettings();

    expect(screen.queryByRole("switch", { name: "Browser controls" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Autoplay" })).toBeInTheDocument();
  });

  it("offers picture in picture only once the shell can start it, and asks the shell for it", async () => {
    render(<VideoPlayer videoId="vid-1" />);
    await openSettings();
    expect(screen.queryByRole("switch", { name: "Picture-in-Picture" })).toBeNull();

    act(() => report({ pipPossible: true }));

    fireEvent.click(await screen.findByRole("switch", { name: "Picture-in-Picture" }));
    expect(posted.filter((m) => m.type === "media.pip")).toEqual([
      { type: "media.pip", loadId: loadId(), active: true },
    ]);
  });

  it("shows the caption for the moment the shell reports", async () => {
    render(
      <VideoPlayer
        videoId="vid-1"
        subtitles={[{ index: 0, language: "ja", format: "vtt", label: "日本語" }]}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/files/vid-1/subtitles/0", expect.anything()));

    act(() => report({ time: 0.5, paused: false }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByText("First line")).toBeNull();

    act(() => report({ time: 2, paused: false }));

    expect(await screen.findByText("First line")).toBeInTheDocument();
  });

  it("shows no caption when the viewer turned captions off", async () => {
    window.localStorage.setItem("video-share-captions", "false");
    render(
      <VideoPlayer
        videoId="vid-1"
        subtitles={[{ index: 0, language: "ja", format: "vtt", label: "日本語" }]}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    act(() => report({ time: 2, paused: false }));

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByText("First line")).toBeNull();
  });

  it("says when the file cannot be loaded, and when it is waiting for data", async () => {
    render(<VideoPlayer videoId="vid-1" />);

    act(() => report({ waiting: true, paused: false }));
    expect(await screen.findByRole("status")).toHaveTextContent("Loading…");

    act(() => report({ status: "failed" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this file");
  });

  it("starts an autoplay once the shell says the file is ready", async () => {
    render(<VideoPlayer videoId="vid-1" autoPlay />);
    expect(posted.some((m) => m.type === "media.play")).toBe(false);

    await act(async () => report());

    await waitFor(() => expect(posted.some((m) => m.type === "media.play")).toBe(true));
  });

  it("starts an autoplay the viewer chose in the player's own setting", async () => {
    window.localStorage.setItem("video-share-autoplay", "true");
    render(<VideoPlayer videoId="vid-1" />);

    await act(async () => report());

    await waitFor(() => expect(posted.some((m) => m.type === "media.play")).toBe(true));
  });

  it("does not start by itself otherwise", async () => {
    render(<VideoPlayer videoId="vid-1" />);

    await act(async () => report());
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(posted.some((m) => m.type === "media.play")).toBe(false);
  });

  it("starts where the viewer left off, before it plays", async () => {
    mockGetWatchProgress.mockResolvedValueOnce({ position: 75, duration: 120 });
    render(<VideoPlayer videoId="vid-1" autoPlay />);

    await act(async () => report());

    await waitFor(() => expect(posted.some((m) => m.type === "media.play")).toBe(true));
    const types = posted.map((m) => m.type);
    const seek = posted.findIndex((m) => m.type === "media.seek" && m.time === 75);
    expect(seek).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("media.play")).toBeGreaterThan(seek);
  });

  it("records where the file ended rather than forgetting it", async () => {
    const onEnded = vi.fn();
    render(<VideoPlayer videoId="vid-1" onEnded={onEnded} />);
    await act(async () => report({ time: 5, paused: false }));

    await act(async () => report({ time: 120, duration: 120, ended: true, paused: false }));

    await waitFor(() =>
      expect(mockSaveWatchProgress).toHaveBeenCalledWith("vid-1", 120, 120),
    );
    expect(onEnded).toHaveBeenCalled();
  });

  it("hands its controller to the page, and takes it back when it goes", () => {
    const onMediaController = vi.fn();
    const { unmount } = render(<VideoPlayer videoId="vid-1" onMediaController={onMediaController} />);
    const mc = onMediaController.mock.calls.at(-1)?.[0];
    expect(mc).toBeTruthy();
    expect(mc.getCaptions()).toBe("unavailable");

    unmount();
    expect(onMediaController).toHaveBeenLastCalledWith(null);
    expect(posted.at(-1)).toMatchObject({ type: "media.unload" });
  });
});

describe("VideoPlayer with a shell that is behind this page", () => {
  it("plays the file itself rather than sending commands the shell cannot read", () => {
    (window as StubbedWindow).__litloftShell = { version: 1 };
    render(<VideoPlayer videoId="vid-1" />);

    expect(document.querySelector("video")).not.toBeNull();
    expect(posted).toEqual([]);
  });

  it("does the same when the shell announces nothing at all", () => {
    delete (window as StubbedWindow).__litloftShell;
    render(<VideoPlayer videoId="vid-1" />);

    expect(document.querySelector("video")).not.toBeNull();
    expect(posted).toEqual([]);
  });
});

describe("VideoPlayer in a browser", () => {
  it("keeps its element and says nothing to a shell", () => {
    delete (window as StubbedWindow).webkit;
  delete (window as StubbedWindow).__litloftShell;
    render(<VideoPlayer videoId="vid-1" />);

    expect(document.querySelector("video")).not.toBeNull();
    expect(posted).toEqual([]);
    expect(mockSetupBackgroundPiP).toHaveBeenCalled();
  });
});
