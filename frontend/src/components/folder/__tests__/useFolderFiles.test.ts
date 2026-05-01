import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFolderFiles } from "../useFolderFiles";
import type { FileItem, Folder } from "@/types";

const mockFile = (id: string, drive = "main"): FileItem => ({
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive,
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 60,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const mockFolder = (name: string): Folder => ({
  name,
  path: name,
  file_count: 5,
  thumbnail_file_id: null,
});

const mockGetDriveFiles = vi.fn().mockResolvedValue({
  data: [mockFile("f1"), mockFile("f2")],
  meta: { total: 2, page: 1, limit: 30 },
});
const mockGetFolders = vi.fn().mockResolvedValue([mockFolder("photos")]);
const mockBatchGetFiles = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getFolders: (...args: unknown[]) => mockGetFolders(...args),
  batchGetFiles: (...args: unknown[]) => mockBatchGetFiles(...args),
}));

vi.mock("@/lib/recentlyPlayed", () => ({
  getRecentFileIds: () => [],
}));

describe("useFolderFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDriveFiles.mockResolvedValue({
      data: [mockFile("f1"), mockFile("f2")],
      meta: { total: 2, page: 1, limit: 30 },
    });
    mockGetFolders.mockResolvedValue([mockFolder("photos")]);
  });

  it("fetches files and folders on mount", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.files).toHaveLength(2);
    expect(result.current.folders).toHaveLength(1);
    expect(mockGetDriveFiles).toHaveBeenCalled();
    expect(mockGetFolders).toHaveBeenCalledWith("main", "");
  });

  it("passes favorite flag for favorites view", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: "favorites",
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDriveFiles).toHaveBeenCalledWith("main", expect.objectContaining({
      favorite: true,
    }));
  });

  it("does not fetch folders for special views", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: "favorites",
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.folders).toHaveLength(0);
  });

  it("passes tag filter", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: "nature",
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDriveFiles).toHaveBeenCalledWith("main", expect.objectContaining({
      tag: "nature",
    }));
  });

  it("passes type filter", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: "video",
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDriveFiles).toHaveBeenCalledWith("main", expect.objectContaining({
      type: "video",
    }));
  });

  it("uses created_at sort for recent-added view", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: "recent-added",
        tagFilter: null,
        typeFilter: null,
        sort: "title",
        order: "asc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDriveFiles).toHaveBeenCalledWith("main", expect.objectContaining({
      sort: "created_at",
      order: "desc",
    }));
  });

  it("uses likes sort for popular view", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: "popular",
        tagFilter: null,
        typeFilter: null,
        sort: "title",
        order: "asc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDriveFiles).toHaveBeenCalledWith("main", expect.objectContaining({
      sort: "likes",
      order: "desc",
    }));
  });

  it("reports isRecent for recent view", () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: "recent",
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    expect(result.current.isRecent).toBe(true);
  });

  it("handles getFolders error gracefully", async () => {
    mockGetFolders.mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.folders).toHaveLength(0);
  });

  it("handles getDriveFiles error gracefully", async () => {
    mockGetDriveFiles.mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.files).toHaveLength(0);
    expect(result.current.total).toBe(0);
  });

  it("calls getDriveFiles with search param when searchQuery is set", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
        searchQuery: "vacation",
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetDriveFiles).toHaveBeenCalledWith(
      "main",
      expect.objectContaining({ search: "vacation" })
    );
  });

  it("does not pass search param when searchQuery is undefined", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const call = mockGetDriveFiles.mock.calls[0];
    expect(call?.[1]?.search).toBeUndefined();
  });

  it("does not fetch folders when searchQuery is set", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
        searchQuery: "vacation",
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.folders).toHaveLength(0);
    expect(mockGetFolders).not.toHaveBeenCalled();
  });
});
