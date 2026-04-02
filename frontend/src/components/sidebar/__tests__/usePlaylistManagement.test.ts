import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePlaylistManagement } from "../usePlaylistManagement";
import type { PlaylistSummary } from "@/types";

vi.mock("@/lib/api", () => ({
  createPlaylist: vi.fn().mockResolvedValue({}),
  updatePlaylist: vi.fn().mockResolvedValue({}),
  deletePlaylist: vi.fn().mockResolvedValue({}),
  getPlaylists: vi.fn().mockResolvedValue([]),
}));

import { createPlaylist, updatePlaylist, deletePlaylist, getPlaylists } from "@/lib/api";

const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
} as any;

const makePl = (id: string, name: string, itemCount = 0, firstFileId: string | null = null): PlaylistSummary => ({
  id,
  name,
  drive: "main",
  item_count: itemCount,
  first_file_id: firstFileId,
  created_at: "",
  updated_at: "",
});

describe("usePlaylistManagement", () => {
  const close = vi.fn();
  const setOverrideDrive = vi.fn();
  let playlistList: PlaylistSummary[];
  let setPlaylistList: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    playlistList = [makePl("pl1", "Playlist 1", 3)];
    setPlaylistList = vi.fn();
  });

  function renderPM() {
    return renderHook(() =>
      usePlaylistManagement({
        currentDrive: "main",
        playlistList,
        setPlaylistList,
        close,
        router: mockRouter,
        setOverrideDrive,
      })
    );
  }

  it("initializes with no creating/renaming state", () => {
    const { result } = renderPM();
    expect(result.current.creatingPlaylist).toBe(false);
    expect(result.current.renamingId).toBeNull();
    expect(result.current.contextMenu).toBeNull();
  });

  it("creates a playlist and refreshes list", async () => {
    const updated = [makePl("pl1", "Playlist 1"), makePl("pl2", "New")];
    vi.mocked(getPlaylists).mockResolvedValueOnce(updated);
    const { result } = renderPM();

    act(() => {
      result.current.setNewPlaylistName("New");
    });

    await act(async () => {
      await result.current.handleCreatePlaylist();
    });

    expect(createPlaylist).toHaveBeenCalledWith("main", "New");
    expect(setPlaylistList).toHaveBeenCalledWith(updated);
    expect(result.current.creatingPlaylist).toBe(false);
    expect(result.current.newPlaylistName).toBe("");
  });

  it("does not create with empty name", async () => {
    const { result } = renderPM();

    await act(async () => {
      await result.current.handleCreatePlaylist();
    });

    expect(createPlaylist).not.toHaveBeenCalled();
  });

  it("trims whitespace from new playlist name", async () => {
    vi.mocked(getPlaylists).mockResolvedValueOnce([]);
    const { result } = renderPM();

    act(() => {
      result.current.setNewPlaylistName("  Trimmed  ");
    });

    await act(async () => {
      await result.current.handleCreatePlaylist();
    });

    expect(createPlaylist).toHaveBeenCalledWith("main", "Trimmed");
  });

  it("renames a playlist and refreshes list", async () => {
    const updated = [makePl("pl1", "Renamed")];
    vi.mocked(getPlaylists).mockResolvedValueOnce(updated);
    const { result } = renderPM();

    act(() => {
      result.current.setRenamingId("pl1");
      result.current.setRenameValue("Renamed");
    });

    await act(async () => {
      await result.current.handleRenamePlaylist();
    });

    expect(updatePlaylist).toHaveBeenCalledWith("main", "pl1", "Renamed");
    expect(setPlaylistList).toHaveBeenCalledWith(updated);
    expect(result.current.renamingId).toBeNull();
  });

  it("does not rename with empty value", async () => {
    const { result } = renderPM();

    act(() => {
      result.current.setRenamingId("pl1");
      result.current.setRenameValue("");
    });

    await act(async () => {
      await result.current.handleRenamePlaylist();
    });

    expect(updatePlaylist).not.toHaveBeenCalled();
  });

  it("deletes a playlist and refreshes list", async () => {
    vi.mocked(getPlaylists).mockResolvedValueOnce([]);
    const { result } = renderPM();

    await act(async () => {
      await result.current.handleDeletePlaylist("pl1");
    });

    expect(deletePlaylist).toHaveBeenCalledWith("main", "pl1");
    expect(setPlaylistList).toHaveBeenCalledWith([]);
    expect(result.current.contextMenu).toBeNull();
  });

  it("navigates to first file on playlist click", () => {
    const { result } = renderPM();

    act(() => {
      result.current.handlePlaylistClick(makePl("pl1", "Test", 1, "file-42"));
    });

    expect(setOverrideDrive).toHaveBeenCalledWith("main");
    expect(close).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/files/file-42?playlist=pl1");
  });

  it("does not navigate for empty playlist", () => {
    const { result } = renderPM();

    act(() => {
      result.current.handlePlaylistClick(makePl("pl1", "Test", 0));
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does nothing when currentDrive is null", async () => {
    const { result } = renderHook(() =>
      usePlaylistManagement({
        currentDrive: null,
        playlistList: [],
        setPlaylistList,
        close,
        router: mockRouter,
        setOverrideDrive,
      })
    );

    act(() => {
      result.current.setNewPlaylistName("Test");
    });

    await act(async () => {
      await result.current.handleCreatePlaylist();
    });

    expect(createPlaylist).not.toHaveBeenCalled();
  });
});
