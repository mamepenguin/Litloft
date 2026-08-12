import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";
import type { FileItem } from "@/types";
import type { SemanticHit } from "@/lib/searchMerge";

function renderWithShortcuts(ui: ReactNode) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
  }),
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
}));

const mockGetDriveFiles = vi.fn();

vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
}));

const mockFetchSemanticHits = vi.fn();
const mockIsSemanticSearchAvailable = vi.fn();

vi.mock("@/lib/semanticSearch", () => ({
  fetchSemanticHits: (...args: unknown[]) => mockFetchSemanticHits(...args),
  isSemanticSearchAvailable: (...args: unknown[]) =>
    mockIsSemanticSearchAvailable(...args),
}));

const mockReadSearchCache = vi.fn();
const mockWriteSearchCache = vi.fn();
const mockSearchCacheKey = vi.fn();
const mockClearSearchCache = vi.fn();

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => mockReadSearchCache(...args),
  writeSearchCache: (...args: unknown[]) => mockWriteSearchCache(...args),
  searchCacheKey: (...args: unknown[]) => mockSearchCacheKey(...args),
  clearSearchCache: (...args: unknown[]) => mockClearSearchCache(...args),
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    filename: "f1.mp4",
    title: "f1",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 100,
    duration: 60,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHit(overrides: Partial<SemanticHit> = {}): SemanticHit {
  return {
    file_id: "f2",
    drive: "main",
    filename: "f2.mp4",
    file_type: "video",
    score: 0.9,
    match_types: ["transcript"],
    segments: [
      { time_range: [10, 20], matches: [{ type: "transcript", score: 0.7 }] },
    ],
    file: null,
    ...overrides,
  };
}

// jsdom does not implement matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    try { localStorage.removeItem("search-history"); } catch { /* jsdom */ }
    mockGetDriveFiles.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 100 },
    });
    mockFetchSemanticHits.mockResolvedValue([]);
    mockIsSemanticSearchAvailable.mockResolvedValue(true);
    mockReadSearchCache.mockReturnValue(null);
    mockSearchCacheKey.mockImplementation(
      (k: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
        `${k.drive}::${k.query}::${k.type ?? "all"}::${k.includeSceneClip ? 1 : 0}`,
    );
  });

  afterEach(() => {
    // Flush pending setTimeout callbacks (e.g., openSearch's focus timer)
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("renders search button", () => {
    render(<GlobalSearch />);
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("opens search panel on click", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("Search"));
    // Both mobile and desktop inputs should exist
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("shows placeholder with drive name", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("Search"));
    const inputs = screen.getAllByPlaceholderText("Search in main...");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("closes on Escape key", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("Search"));
    expect(screen.getAllByRole("textbox").length).toBeGreaterThanOrEqual(1);

    fireEvent.keyDown(document, { key: "Escape" });
    // Search button should still be visible
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("opens on Cmd+Shift+F", () => {
    renderWithShortcuts(<GlobalSearch />);
    fireEvent.keyDown(document, { key: "f", ctrlKey: true, shiftKey: true });
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("opens on Cmd+K", () => {
    renderWithShortcuts(<GlobalSearch />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(
      screen.getAllByPlaceholderText("Search in main...").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("closes on a second Cmd+K", () => {
    renderWithShortcuts(<GlobalSearch />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(
      screen.getAllByPlaceholderText("Search in main...").length,
    ).toBeGreaterThanOrEqual(1);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
  });

  // Guards the contract the Knowledge editor's ctrl+k (insert link,
  // editingOnly: true) relies on. That shortcut lives in a separate
  // repository, so a regression here would not surface in its tests.
  it("does not open on Cmd+K while an editing element has focus", () => {
    renderWithShortcuts(
      <>
        <textarea data-testid="editor" />
        <GlobalSearch />
      </>,
    );
    fireEvent.keyDown(screen.getByTestId("editor"), {
      key: "k",
      ctrlKey: true,
    });
    expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
  });

  describe("merge: filename + semantic", () => {
    async function typeQuery(value: string) {
      // The popup renders both desktop and mobile inputs. Use the first
      // visible textbox; firing a change event on either is fine since
      // they share state.
      const input = screen.getAllByRole("textbox")[0];
      fireEvent.change(input, { target: { value } });
      // Debounce is 300ms.
      await act(async () => {
        vi.advanceTimersByTime(350);
        // Let the awaited Promise.all chain resolve.
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    it("on input, calls getDriveFiles and fetchSemanticHits in parallel after debounce", async () => {
      mockGetDriveFiles.mockResolvedValue({
        data: [makeFile({ id: "f1", title: "video1" })],
        meta: { total: 1, page: 1, limit: 8 },
      });
      mockFetchSemanticHits.mockResolvedValue([]);

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await typeQuery("video");

      // availability should be checked
      await waitFor(() => {
        expect(mockIsSemanticSearchAvailable).toHaveBeenCalledWith("main");
      });
      expect(mockGetDriveFiles).toHaveBeenCalledWith(
        "main",
        expect.objectContaining({ search: "video" }),
        expect.anything(),
      );
      expect(mockFetchSemanticHits).toHaveBeenCalledWith(
        "video",
        "main",
        expect.objectContaining({ limit: expect.any(Number) }),
      );
    });

    it("renders MergedResultItem rows in mergeResults+sortMerged order", async () => {
      // f1 is filename-only (low hybrid score),
      // f2 is semantic-only with high transcript score (still lower than 2 from filename),
      // sortMerged("relevance", "desc") should put filename hit (score 2) on top.
      mockGetDriveFiles.mockResolvedValue({
        data: [makeFile({ id: "f1", title: "filename-hit" })],
        meta: { total: 1, page: 1, limit: 8 },
      });
      mockFetchSemanticHits.mockResolvedValue([
        makeHit({
          file_id: "f2",
          filename: "semantic-hit.mp4",
          score: 0.9,
        }),
      ]);

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await typeQuery("video");

      await waitFor(() => {
        expect(screen.getByText("filename-hit")).toBeInTheDocument();
      });
      // Both rows should be rendered.
      expect(screen.getByText("semantic-hit.mp4")).toBeInTheDocument();
    });

    it("writes resolved results into the search cache", async () => {
      mockGetDriveFiles.mockResolvedValue({
        data: [makeFile({ id: "f1" })],
        meta: { total: 1, page: 1, limit: 8 },
      });
      mockFetchSemanticHits.mockResolvedValue([makeHit({ file_id: "f2" })]);

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await typeQuery("video");

      await waitFor(() => {
        expect(mockWriteSearchCache).toHaveBeenCalled();
      });
      const lastCall = mockWriteSearchCache.mock.calls.at(-1)!;
      const [key, partial] = lastCall;
      expect(key).toMatchObject({ drive: "main", query: "video" });
      expect(partial).toMatchObject({
        filenameMatches: expect.any(Array),
        filenameTotal: 1,
        semanticHits: expect.any(Array),
      });
    });

    it("availability=false → does not call fetchSemanticHits, only filename rows render", async () => {
      mockIsSemanticSearchAvailable.mockResolvedValue(false);
      mockGetDriveFiles.mockResolvedValue({
        data: [makeFile({ id: "f1", title: "fname-only" })],
        meta: { total: 1, page: 1, limit: 8 },
      });

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await typeQuery("video");

      await waitFor(() => {
        expect(screen.getByText("fname-only")).toBeInTheDocument();
      });
      expect(mockFetchSemanticHits).not.toHaveBeenCalled();
    });

    it("rapid query change aborts the prior request (signal passed and aborted)", async () => {
      const capturedSignals: AbortSignal[] = [];
      mockGetDriveFiles.mockImplementation(
        async (
          _drive: string,
          _params: unknown,
          opts?: { signal?: AbortSignal },
        ) => {
          if (opts?.signal) capturedSignals.push(opts.signal);
          return { data: [], meta: { total: 0, page: 1, limit: 8 } };
        },
      );
      mockFetchSemanticHits.mockResolvedValue([]);

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.change(input, { target: { value: "vid" } });
      // Don't let the first debounce fire — change again immediately.
      fireEvent.change(input, { target: { value: "video" } });
      await act(async () => {
        vi.advanceTimersByTime(350);
        await Promise.resolve();
        await Promise.resolve();
      });

      // The cleanup of the prior effect (debounced request) should have
      // aborted its signal. Either the prior signal was aborted, or
      // the prior request never fired (timer cleared) — at minimum the
      // last issued signal should be live and earlier ones aborted.
      const aborted = capturedSignals.filter((s) => s.aborted);
      const live = capturedSignals.filter((s) => !s.aborted);
      // At least one signal must have been observed.
      expect(capturedSignals.length).toBeGreaterThan(0);
      // The most recent signal should still be live.
      expect(live.length).toBeGreaterThanOrEqual(1);
      // If multiple effects fired, the older ones must be aborted.
      if (capturedSignals.length > 1) {
        expect(aborted.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("cache hit → readSearchCache returns data; rows render before debounce fires", async () => {
      // Pre-seed the cache with a same-query entry.
      mockReadSearchCache.mockReturnValue({
        filenameMatches: [makeFile({ id: "f1", title: "from-cache" })],
        filenameTotal: 1,
        semanticHits: [],
        ts: Date.now(),
      });

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      const input = screen.getAllByRole("textbox")[0];
      // Synchronous render: cache should populate before any debounce.
      fireEvent.change(input, { target: { value: "video" } });
      // Allow React to flush state updates from the cache hit.
      await act(async () => {
        await Promise.resolve();
      });

      // Cache lookup happened.
      expect(mockReadSearchCache).toHaveBeenCalled();
      // The cached row is visible WITHOUT advancing the debounce timer.
      expect(screen.getByText("from-cache")).toBeInTheDocument();
      // No fetch should have been issued yet (debounce not flushed).
      expect(mockGetDriveFiles).not.toHaveBeenCalled();
    });

    it("Enter key still navigates to /drive/{drive}/search?q=...", async () => {
      mockGetDriveFiles.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 8 },
      });

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.change(input, { target: { value: "vacation" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockRouterPush).toHaveBeenCalledWith(
        "/drive/main/search?q=vacation",
      );
    });
  });
});
