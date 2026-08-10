import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock profile context
const mockProfile = { nickname: null as string | null, setNickname: vi.fn(), clearNickname: vi.fn() };
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => mockProfile,
}));

// Mock API
const mockGetWatchProgress = vi.fn();
const mockSaveWatchProgress = vi.fn();
const mockDeleteWatchProgress = vi.fn();
vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getWatchProgress: (...args: unknown[]) => mockGetWatchProgress(...args),
  saveWatchProgress: (...args: unknown[]) => mockSaveWatchProgress(...args),
  deleteWatchProgress: (...args: unknown[]) => mockDeleteWatchProgress(...args),
}));

// Mock recentlyPlayed
const mockGetSavedProgress = vi.fn().mockReturnValue(0);
const mockSaveProgress = vi.fn();
const mockClearProgress = vi.fn();
const mockAddRecentlyPlayed = vi.fn();
vi.mock("@/lib/recentlyPlayed", () => ({
  getSavedProgress: (...args: unknown[]) => mockGetSavedProgress(...args),
  saveProgress: (...args: unknown[]) => mockSaveProgress(...args),
  clearProgress: (...args: unknown[]) => mockClearProgress(...args),
  addRecentlyPlayed: (...args: unknown[]) => mockAddRecentlyPlayed(...args),
}));

import { VideoPlayer } from "../components/VideoPlayer";

describe("VideoPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile.nickname = null;
    mockGetWatchProgress.mockResolvedValue({ position: 0, duration: 0 });
    mockSaveWatchProgress.mockResolvedValue(undefined);
    mockDeleteWatchProgress.mockResolvedValue(undefined);
  });

  it("renders video element", () => {
    render(<VideoPlayer videoId="abc123" />);
    const video = screen.getByText("Your browser does not support video playback.").closest("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toBe("/api/files/abc123/stream");
  });

  it("uses localStorage when no profile is set", () => {
    mockProfile.nickname = null;
    render(<VideoPlayer videoId="abc123" />);
    const video = document.querySelector("video")!;

    // Simulate loadedmetadata
    Object.defineProperty(video, "duration", { value: 300, writable: true });
    fireEvent.loadedMetadata(video);

    expect(mockGetSavedProgress).toHaveBeenCalledWith("abc123");
    expect(mockGetWatchProgress).not.toHaveBeenCalled();
  });

  it("uses server API when profile is set", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchProgress.mockResolvedValue({ position: 60, duration: 300 });

    render(<VideoPlayer videoId="abc123" />);
    const video = document.querySelector("video")!;

    Object.defineProperty(video, "duration", { value: 300, writable: true });
    fireEvent.loadedMetadata(video);

    await waitFor(() => {
      expect(mockGetWatchProgress).toHaveBeenCalledWith("abc123");
    });
    expect(mockGetSavedProgress).not.toHaveBeenCalled();
  });

  it("saves progress to server on timeupdate when profile is set", () => {
    mockProfile.nickname = "Alice";
    render(<VideoPlayer videoId="abc123" />);
    const video = document.querySelector("video")!;

    Object.defineProperty(video, "currentTime", { value: 10, writable: true, configurable: true });
    Object.defineProperty(video, "duration", { value: 300, writable: true });
    fireEvent.timeUpdate(video);

    expect(mockSaveWatchProgress).toHaveBeenCalledWith("abc123", 10, 300);
    expect(mockSaveProgress).not.toHaveBeenCalled();
  });

  it("saves progress to localStorage on timeupdate when no profile", () => {
    mockProfile.nickname = null;
    render(<VideoPlayer videoId="abc123" />);
    const video = document.querySelector("video")!;

    Object.defineProperty(video, "currentTime", { value: 10, writable: true, configurable: true });
    Object.defineProperty(video, "duration", { value: 300, writable: true });
    fireEvent.timeUpdate(video);

    expect(mockSaveProgress).toHaveBeenCalledWith("abc123", 10, 300);
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  // Spec 2026-08-10-media-import-watch-surface.md §4.2: reaching the end
  // must leave a *completed* history record. The continue-watching query
  // filters it out via its own 90% gate, so deleting the row here only
  // destroyed the distinction between "watched to the end" and "never
  // opened".
  it("records the final position on ended when profile is set", () => {
    mockProfile.nickname = "Alice";
    const onEnded = vi.fn();
    render(<VideoPlayer videoId="abc123" onEnded={onEnded} />);
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 300, configurable: true });
    Object.defineProperty(video, "currentTime", { value: 300, configurable: true });

    fireEvent.ended(video);

    expect(mockSaveWatchProgress).toHaveBeenCalledWith("abc123", 300, 300);
    expect(mockDeleteWatchProgress).not.toHaveBeenCalled();
    expect(mockClearProgress).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalled();
  });

  it("records the final position on ended when no profile", () => {
    mockProfile.nickname = null;
    const onEnded = vi.fn();
    render(<VideoPlayer videoId="abc123" onEnded={onEnded} />);
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 300, configurable: true });
    Object.defineProperty(video, "currentTime", { value: 300, configurable: true });

    fireEvent.ended(video);

    expect(mockSaveProgress).toHaveBeenCalledWith("abc123", 300, 300);
    expect(mockClearProgress).not.toHaveBeenCalled();
    expect(mockDeleteWatchProgress).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalled();
  });

  // "Do not fabricate a completed state" (spec §7). A live stream or a
  // media element that never probed its length has no duration to
  // compare a position against, so the last periodic save stands.
  it("does not write a completion record when duration is unknown", () => {
    mockProfile.nickname = "Alice";
    const onEnded = vi.fn();
    render(<VideoPlayer videoId="abc123" onEnded={onEnded} />);
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: NaN, configurable: true });
    Object.defineProperty(video, "currentTime", { value: 42, configurable: true });

    fireEvent.ended(video);

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    expect(mockDeleteWatchProgress).not.toHaveBeenCalled();
    // Playback lifecycle still fires — an unobservable duration must not
    // make the video unplayable or break collection advance.
    expect(onEnded).toHaveBeenCalled();
  });
});
