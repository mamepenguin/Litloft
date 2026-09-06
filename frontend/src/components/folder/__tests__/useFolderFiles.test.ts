import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFolderFiles } from "../useFolderFiles";
import type { FileItem, Folder } from "@/types";
import type { ListSnapshot } from "@/lib/listSnapshot";

const mockFile = (id: string, drive = "main"): FileItem => ({
  image_width: null,
  image_height: null,
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
});

const mockFolder = (name: string): Folder => ({
  name,
  path: name,
  file_count: 5,
  thumbnail_file_id: null,
  dominant_kind: null,
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

const mockReadSearchCache = vi.fn();
const mockWriteSearchCache = vi.fn();
const mockSearchCacheKey = vi.fn(
  (k: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${k.drive}::${k.query}::${k.type ?? "all"}::${k.includeSceneClip ? 1 : 0}`,
);
const mockClearSearchCache = vi.fn();

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => mockReadSearchCache(...args),
  writeSearchCache: (...args: unknown[]) => mockWriteSearchCache(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchCacheKey: (...args: unknown[]) => (mockSearchCacheKey as any)(...args),
  clearSearchCache: (...args: unknown[]) => mockClearSearchCache(...args),
}));

const mockFetchSemanticHits = vi.fn().mockResolvedValue([]);
const mockIsSemanticSearchAvailable = vi.fn().mockResolvedValue(false);

vi.mock("@/lib/semanticSearch", () => ({
  fetchSemanticHits: (...args: unknown[]) => mockFetchSemanticHits(...args),
  isSemanticSearchAvailable: (...args: unknown[]) =>
    mockIsSemanticSearchAvailable(...args),
}));

describe("useFolderFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDriveFiles.mockResolvedValue({
      data: [mockFile("f1"), mockFile("f2")],
      meta: { total: 2, page: 1, limit: 30 },
    });
    mockGetFolders.mockResolvedValue([mockFolder("photos")]);
    mockReadSearchCache.mockReturnValue(null);
    mockFetchSemanticHits.mockResolvedValue([]);
    mockIsSemanticSearchAvailable.mockResolvedValue(false);
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

  // spec 2026-08-21-folder-scoped-tag-filter §4
  it("scopes a tag filter to the current folder's subtree", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "recipes",
        view: null,
        tagFilter: "soup",
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
      path: "recipes",
      recursive: true,
      tag: "soup",
    }));
  });

  it("sends no path for a tag filter at the drive root", async () => {
    // §3.1: path="" would narrow to root-level files, not widen to the drive.
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: "soup",
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
      path: undefined,
      tag: "soup",
    }));
  });

  it("keeps a plain folder listing non-recursive", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "recipes",
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

    expect(mockGetDriveFiles).toHaveBeenCalledWith("main", expect.objectContaining({
      path: "recipes",
      recursive: false,
    }));
  });

  it("sends no path when there is no folder to anchor to", async () => {
    // A nullish folderPath means the drive root, where FolderBrowser only
    // ever renders a view or a tag filter (a plain root listing is
    // DriveHome / RootFileListing, which calls getDriveFiles directly with
    // path: ""). Sending "" here would narrow instead of widen (§3.1).
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: undefined,
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

    expect(mockGetDriveFiles).toHaveBeenCalledWith("main", expect.objectContaining({
      path: undefined,
      recursive: false,
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

  it("filters and orders the liked view by when it was liked", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: "liked",
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
      liked: true,
      sort: "liked_at",
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

  it("hydrates folder snapshot immediately, then revalidates files and folders", async () => {
    const cachedFile = mockFile("cached");
    const freshFile = mockFile("fresh");
    const cachedFolder = mockFolder("cached-folder");
    const freshFolder = mockFolder("fresh-folder");
    const snapshot: ListSnapshot = {
      key: "main|movies||",
      scrollY: 420,
      pagesLoaded: 2,
      items: [cachedFile],
      total: 42,
      folders: [cachedFolder],
      filters: {
        sort: "created_at",
        order: "desc",
        typeFilter: null,
        viewMode: "grid",
      },
      ts: Date.now(),
    };
    mockGetDriveFiles.mockResolvedValueOnce({
      data: [freshFile],
      meta: { total: 1, page: 1, limit: 60 },
    });
    mockGetFolders.mockResolvedValueOnce([freshFolder]);

    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "movies",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
        initialSnapshot: snapshot,
      }),
    );

    expect(result.current.files.map((f) => f.id)).toEqual(["cached"]);
    expect(result.current.folders.map((f) => f.name)).toEqual(["cached-folder"]);
    expect(result.current.hydratedScrollY).toBe(420);
    expect(result.current.loading).toBe(false);

    await waitFor(() => {
      expect(result.current.files.map((f) => f.id)).toEqual(["fresh"]);
    });

    expect(mockGetDriveFiles).toHaveBeenCalledWith(
      "main",
      expect.objectContaining({ path: "movies", page: 1, limit: 60 }),
    );
    expect(mockGetFolders).toHaveBeenCalledWith("main", "movies");
    expect(result.current.folders.map((f) => f.name)).toEqual(["fresh-folder"]);
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

  describe("searchCache hydration", () => {
    it("search mode + cache hit → useInfiniteScroll receives initial from cache (mount fetch is skipped)", async () => {
      const cachedFile = mockFile("cached-1");
      mockReadSearchCache.mockReturnValue({
        filenameMatches: [cachedFile],
        filenameTotal: 42,
        semanticHits: [],
        ts: Date.now(),
      });

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
        }),
      );

      // Initial render should already include the cached items without
      // a network round-trip.
      expect(result.current.files.map((f) => f.id)).toContain("cached-1");
      expect(result.current.total).toBeGreaterThanOrEqual(42);

      // useInfiniteScroll's initial-skip behavior means no filename
      // fetch is issued on mount.
      expect(mockGetDriveFiles).not.toHaveBeenCalled();
    });

    it("search mode + cache hit → semanticHits is initialized from cache (revalidation still runs)", async () => {
      const semanticHit = {
        file_id: "sem-1",
        drive: "main",
        filename: "sem.mp4",
        file_type: "video",
        score: 0.9,
        match_types: ["transcript"],
        segments: [
          {
            time_range: [10, 20] as [number, number],
            matches: [{ type: "transcript", score: 0.7 }],
          },
        ],
        file: null,
      };
      mockReadSearchCache.mockReturnValue({
        filenameMatches: [],
        filenameTotal: 0,
        semanticHits: [semanticHit],
        ts: Date.now(),
      });
      mockIsSemanticSearchAvailable.mockResolvedValue(true);
      mockFetchSemanticHits.mockResolvedValue([]);

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
        }),
      );

      // Cached semantic hit must appear in the merged list immediately.
      expect(result.current.files.map((f) => f.id)).toContain("sem-1");

      // Stale-while-revalidate: the hook should still call
      // fetchSemanticHits to refresh in the background.
      await waitFor(() => {
        expect(mockFetchSemanticHits).toHaveBeenCalled();
      });
    });

    it("search mode + cache miss → previous behavior preserved (filename fetch on mount)", async () => {
      mockReadSearchCache.mockReturnValue(null);

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
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetDriveFiles).toHaveBeenCalledWith(
        "main",
        expect.objectContaining({ search: "vacation" }),
      );
    });

    it("non-search mode → cache is ignored (readSearchCache not called)", async () => {
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
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockReadSearchCache).not.toHaveBeenCalled();
    });
  });
});
