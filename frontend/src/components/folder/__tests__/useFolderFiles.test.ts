import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFolderFiles } from "../useFolderFiles";
import type { FileItem, FileKind, Folder, TrustFilter } from "@/types";
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
  kind_counts: {},
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
    // A nullish folderPath means no folder to anchor to. The root reached
    // *as a location* is a different state and arrives as `folderPath: ""`.
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

      expect(result.current.files.map((f) => f.id)).toContain("sem-1");

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

/**
 * Each case pins the whole call record, so a second, wrong request cannot hide
 * beside the right one.
 */
describe("useFolderFiles at the Library root", () => {
  const baseParams = {
    driveName: "main",
    sort: "created_at" as const,
    order: "desc" as const,
    refreshKey: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDriveFiles.mockResolvedValue({
      data: [mockFile("f1"), mockFile("f2")],
      meta: { total: 2, page: 1, limit: 30 },
    });
    mockGetFolders.mockImplementation((_drive: string, path?: string) =>
      Promise.resolve(path === "" ? [mockFolder("photos")] : []),
    );
  });

  const settle = async (props: {
    folderPath?: string;
    view?: string | null;
    tagFilter?: string | null;
    typeFilter?: FileKind | null;
    trustFilter?: TrustFilter | null;
  }) => {
    const { result, rerender } = renderHook(
      (p: typeof props) =>
        useFolderFiles({
          ...baseParams,
          typeFilter: p.typeFilter ?? null,
          trustFilter: p.trustFilter ?? null,
          folderPath: p.folderPath,
          view: p.view ?? null,
          tagFilter: p.tagFilter ?? null,
        }),
      { initialProps: props },
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    return { result, rerender };
  };

  /** Every request the hook made, so an extra one cannot hide behind a match. */
  const requests = () => mockGetDriveFiles.mock.calls;

  /**
   * A change of location fires the identical listing request twice (the
   * reset effect bumps the infinite scroll's epoch and `fetchPage`'s
   * identity changes), so repeats are collapsed.
   */
  const distinctRequests = () => {
    const seen = new Set(requests().map((c) => JSON.stringify(c)));
    return [...seen].map((j) => JSON.parse(j));
  };

  const rootRequest = (extra: Record<string, unknown> = {}) => [
    "main",
    { path: "", recursive: false, sort: "created_at", order: "desc", page: 1, limit: 30, ...extra },
  ];

  it("asks for the root folder's own children, once", async () => {
    await settle({ folderPath: "" });
    expect(requests()).toEqual([rootRequest()]);
  });

  it("renders the hierarchy: the root's folders are fetched with the root's path", async () => {
    const { result } = await settle({ folderPath: "" });
    expect(mockGetFolders).toHaveBeenCalledWith("main", "");
    // The stub answers only for the root's own path, so a request for any
    // other folder shows up as an empty hierarchy rather than passing.
    expect(result.current.folders).toHaveLength(1);
  });

  // Each chip narrows the root's own listing; neither may widen it back to
  // the drive.
  it("keeps the root's path while the type chip narrows it", async () => {
    await settle({ folderPath: "", typeFilter: "video" });
    expect(requests()).toEqual([rootRequest({ type: "video" })]);
  });

  it("keeps the root's path while the trust chip narrows it", async () => {
    await settle({ folderPath: "", trustFilter: "verified" });
    expect(requests()).toEqual([rootRequest({ trust: "verified" })]);
  });

  // `path=""` alone is not what narrows; `path=""` *without* `recursive` is.
  // The backend applies no folder predicate for a recursive empty prefix.
  it("widens to the drive for a tag filter with no folder path", async () => {
    await settle({ folderPath: undefined, tagFilter: "soup" });
    expect(requests()).toEqual([
      ["main", { recursive: true, tag: "soup", sort: "created_at", order: "desc", page: 1, limit: 30 }],
    ]);
  });

  it("widens to the drive for a tag filter at the Library root", async () => {
    await settle({ folderPath: "", tagFilter: "soup" });
    expect(requests()).toEqual([
      ["main", { path: "", recursive: true, tag: "soup", sort: "created_at", order: "desc", page: 1, limit: 30 }],
    ]);
  });

  // An empty `tag` is a value the route passes through when a view is
  // present, and `recursive` is what decides whether an empty path means
  // the root or the drive — so an empty tag must not turn the root's own
  // listing into a recursive one.
  it("keeps the root's own listing for an empty tag", async () => {
    await settle({ folderPath: "", tagFilter: "" });
    expect(requests()).toEqual([rootRequest()]);
  });

  // The search request is built by the hook's other branch, which returns
  // before the folder path is ever consulted. A search is not a location.
  it("sends no path when searching from the Library root", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        ...baseParams,
        folderPath: "",
        tagFilter: null,
        typeFilter: null,
        trustFilter: null,
        searchQuery: "cake",
      }),
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    for (const [, params] of requests()) {
      expect(params).not.toHaveProperty("path");
    }
    expect(requests().length).toBe(1);
  });

  it("leaves a cross-folder view drive-wide", async () => {
    await settle({ folderPath: "", view: "favorites" });
    expect(requests()).toEqual([
      ["main", { favorite: true, recursive: false, sort: "created_at", order: "desc", page: 1, limit: 30 }],
    ]);
  });

  it("leaves an ordinary folder path scoped to that folder", async () => {
    await settle({ folderPath: "photos" });
    expect(requests()).toEqual([
      ["main", { path: "photos", recursive: false, sort: "created_at", order: "desc", page: 1, limit: 30 }],
    ]);
  });

  it("follows the location across a re-render, in both directions", async () => {
    const { rerender } = await settle({ folderPath: "" });
    expect(requests()).toEqual([rootRequest()]);

    mockGetDriveFiles.mockClear();
    rerender({ folderPath: undefined, view: "zzz" });
    await waitFor(() => {
      expect(distinctRequests()).toEqual([
        ["main", { recursive: false, sort: "created_at", order: "desc", page: 1, limit: 30 }],
      ]);
    });

    mockGetDriveFiles.mockClear();
    rerender({ folderPath: "" });
    await waitFor(() => {
      expect(distinctRequests()).toEqual([rootRequest()]);
    });
  });

  // The hydration branch is keyed on the folder path, so the root has to
  // satisfy it like any other location.
  it("hydrates from a snapshot taken at the Library root", async () => {
    const { result } = renderHook(() =>
      useFolderFiles({
        ...baseParams,
        folderPath: "",
        tagFilter: null,
        typeFilter: null,
        trustFilter: null,
        initialSnapshot: {
          // `buildListSnapshotKey({driveName, folderPath, view, tagFilter})`
          // — the real one, not a stub.
          key: "main|||",
          items: [mockFile("snap1"), mockFile("snap2"), mockFile("snap3")],
          total: 3,
          pagesLoaded: 1,
          folders: [mockFolder("photos")],
          scrollY: 420,
          filters: { sort: "created_at", order: "desc", typeFilter: null, viewMode: "grid" },
        } as unknown as Parameters<typeof useFolderFiles>[0]["initialSnapshot"],
      }),
    );
    // Read before settling, like the folder-path case above: hydration is
    // what happens at mount, and the revalidation that follows replaces
    // the rows with the fetch's.
    expect(result.current.hydratedScrollY).toBe(420);
    expect(result.current.files.map((f) => f.id)).toEqual(["snap1", "snap2", "snap3"]);
    expect(result.current.folders.map((f) => f.name)).toEqual(["photos"]);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  // The refresh path fetches the folder list through a second copy of the
  // mount effect's predicate, and the Library root has to satisfy both.
  it("refreshes the root's folders when the listing is told to", async () => {
    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) =>
        useFolderFiles({
          ...baseParams,
          refreshKey,
          folderPath: "",
          typeFilter: null,
          trustFilter: null,
          tagFilter: null,
        }),
      { initialProps: { refreshKey: 0 } },
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockGetFolders.mockClear();
    rerender({ refreshKey: 1 });
    await waitFor(() => {
      expect(mockGetFolders).toHaveBeenCalledWith("main", "");
    });
  });
});
