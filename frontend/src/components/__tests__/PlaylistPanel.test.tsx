import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PlaylistPanel } from "../PlaylistPanel";
import type { FileItem } from "@/types";

function makeTrackFile(id: string, type: "audio" | "video" = "audio"): FileItem {
  return {
    id,
    filename: `${id}.mp3`,
    title: `Track ${id}`,
    description: "",
    drive: "main",
    folder_path: "music",
    file_type: type,
    mime_type: type === "audio" ? "audio/mp3" : "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1000,
    duration: 180,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

vi.mock("@/lib/api", () => ({
  getPlaylist: vi.fn(),
  getDriveFiles: vi.fn(),
  removePlaylistItem: vi.fn().mockResolvedValue(undefined),
  reorderPlaylistItems: vi.fn().mockResolvedValue({}),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

vi.mock("@/lib/format", () => ({
  formatDuration: (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`,
}));

import { getPlaylist, getDriveFiles } from "@/lib/api";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

describe("PlaylistPanel", () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getPlaylist).mockResolvedValue({
      id: "pl1",
      name: "Test Playlist",
      drive: "main",
      items: [
        { id: 1, position: 0, file: makeTrackFile("f1") },
        { id: 2, position: 1, file: makeTrackFile("f2") },
        { id: 3, position: 2, file: makeTrackFile("f3") },
      ],
      created_at: "",
      updated_at: "",
    });

    vi.mocked(getDriveFiles).mockResolvedValue({
      data: [makeTrackFile("f1"), makeTrackFile("f2")],
      meta: { total: 2, page: 1, limit: 500 },
    });
  });

  it("loads and displays user playlist tracks", async () => {
    render(
      <PlaylistPanel
        playlistId="pl1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Test Playlist")).toBeInTheDocument();
    });
    expect(screen.getByText("1/3 tracks")).toBeInTheDocument();
    expect(screen.getByText("Track f1")).toBeInTheDocument();
    expect(screen.getByText("Track f2")).toBeInTheDocument();
    expect(screen.getByText("Track f3")).toBeInTheDocument();
  });

  it("highlights current track index", async () => {
    render(
      <PlaylistPanel
        playlistId="pl1"
        currentFileId="f2"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("2/3 tracks")).toBeInTheDocument();
    });
  });

  it("navigates to track on click", async () => {
    render(
      <PlaylistPanel
        playlistId="pl1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Track f2")).toBeInTheDocument();
    });

    const trackButtons = screen.getAllByRole("button");
    const f2Button = trackButtons.find((b) => b.textContent?.includes("Track f2"));
    if (f2Button) fireEvent.click(f2Button);
    expect(onNavigate).toHaveBeenCalledWith("f2");
  });

  it("renders loop toggle button", async () => {
    render(
      <PlaylistPanel
        playlistId="pl1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Loop ON")).toBeInTheDocument();
    });
  });

  it("toggles loop state", async () => {
    render(
      <PlaylistPanel
        playlistId="pl1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Loop ON")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Loop ON"));
    expect(screen.getByLabelText("Loop OFF")).toBeInTheDocument();
  });

  it("shows duration for tracks", async () => {
    render(
      <PlaylistPanel
        playlistId="pl1"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("3:00")).toHaveLength(3);
    });
  });

  it("loads folder playlist when folderPlay is true", async () => {
    render(
      <PlaylistPanel
        folderPlay={true}
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath="music"
        onNavigate={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("music")).toBeInTheDocument();
    });
  });

  it("returns null when no tracks", () => {
    vi.mocked(getPlaylist).mockResolvedValueOnce({
      id: "pl1",
      name: "Empty",
      drive: "main",
      items: [],
      created_at: "",
      updated_at: "",
    });

    const { container } = render(
      <PlaylistPanel
        playlistId="empty"
        currentFileId="f1"
        currentFileType="audio"
        drive="main"
        folderPath=""
        onNavigate={onNavigate}
      />
    );

    expect(container.innerHTML).toBe("");
  });
});
