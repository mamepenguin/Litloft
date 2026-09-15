import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { FileItem } from "@/types";
import type { SemanticHit } from "@/lib/searchMerge";
import { accentFills } from "@/__tests__/helpers/accentFills";
import { confirmConversionThenEnter } from "@/__tests__/helpers/imeEnter";
import { MATCH_BADGES } from "@/lib/matchBadges";
import enMessages from "@/messages-core/en.json";

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

// Mutable so a test can put the component on a page with no drive in context
// (the root page), where the recent-files section must not render or fetch.
const driveState = vi.hoisted(() => ({ current: "main" as string | null }));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => driveState.current,
}));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();

vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
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

// Every term list the empty state is rendered with, including renders that
// are replaced before anything else happens — the DOM alone cannot show those.
const offeredTerms = vi.hoisted(() => ({ renders: [] as string[][] }));

vi.mock("../search/SearchEmptyState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../search/SearchEmptyState")>();
  return {
    ...actual,
    SearchEmptyState: (props: Parameters<typeof actual.SearchEmptyState>[0]) => {
      offeredTerms.renders.push(
        props.items.flatMap((item) => (item.kind === "term" ? [item.term] : [])),
      );
      return <actual.SearchEmptyState {...props} />;
    },
  };
});

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
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

Element.prototype.scrollIntoView = vi.fn();

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
    driveState.current = "main";
    try { localStorage.removeItem("search-history"); } catch { /* jsdom */ }
    mockGetWatchHistory.mockResolvedValue([]);
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
    vi.runAllTimers();
    vi.useRealTimers();
  });

  describe("the keyboard entry", () => {
    const openModal = () => {
      renderWithShortcuts(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
    };

    it("is on the mobile draw too, which is a different branch", () => {
      const mql = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
      mql.mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      try {
        openModal();
        // The mobile sheet has a back arrow the desktop modal does not,
        // so this asserts the branch as well as the footer in it.
        expect(screen.getByLabelText("Close")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /Keyboard Shortcuts/ }),
        ).toBeInTheDocument();
      } finally {
        mql.mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));
      }
    });

    it("is in the footer, inside the panel and outside the scrolling results", () => {
      openModal();
      const entry = screen.getByRole("button", { name: /Keyboard Shortcuts/ });
      expect(entry.closest(".overflow-y-auto")).toBeNull();

      const panel = screen
        .getByPlaceholderText(/Search/)
        .closest(".bg-bg-primary");
      expect(panel).not.toBeNull();
      expect(panel).toContainElement(entry);

      expect(panel!.parentElement!.children).toHaveLength(2);
    });

    it("is 768px wide on the desktop centre, not 512px", () => {
      openModal();
      const panel = screen
        .getByPlaceholderText(/Search/)
        .closest(".bg-bg-primary");
      expect(panel).not.toBeNull();
      expect(panel!.className).toContain("max-w-3xl");
      expect(panel!.className).not.toContain("max-w-lg");
    });

    it("leaves the mobile sheet uncapped", () => {
      const mql = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
      mql.mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      try {
        openModal();
        const sheet = screen
          .getByPlaceholderText(/Search/)
          .closest(".bg-bg-primary");
        expect(sheet).not.toBeNull();
        expect(sheet!.className).toContain("inset-0");
        expect(sheet!.className).not.toMatch(/\bmax-w-/);
      } finally {
        mql.mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));
      }
    });

    it("closes the search and opens the cheat sheet", () => {
      openModal();
      fireEvent.click(screen.getByRole("button", { name: /Keyboard Shortcuts/ }));

      expect(screen.queryByPlaceholderText(/Search/)).toBeNull();
      expect(
        screen.getByRole("heading", { name: /Keyboard Shortcuts/ }),
      ).toBeInTheDocument();
    });

    it("does not reopen the search when the cheat sheet closes", () => {
      openModal();
      fireEvent.click(screen.getByRole("button", { name: /Keyboard Shortcuts/ }));
      fireEvent.keyDown(document.body, { key: "Escape" });

      expect(
        screen.queryByRole("heading", { name: /Keyboard Shortcuts/ }),
      ).toBeNull();
      expect(screen.queryByPlaceholderText(/Search/)).toBeNull();
    });
  });

  it("renders search button", () => {
    render(<GlobalSearch />);
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("opens search panel on click", () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("Search"));
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("does not focus the input after unmounting before focus is due", () => {
    const { unmount } = render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("Search"));
    unmount();
    const matchMedia = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
    matchMedia.mockClear();

    vi.advanceTimersByTime(1000);

    expect(matchMedia).not.toHaveBeenCalled();
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

  // Opening focuses the search input on a 50ms timer. Once it has focus the
  // event target is an INPUT, which ShortcutsProvider treats as "editing" —
  // so a global binding with editingOnly unset would no longer fire and the
  // toggle would be dead in the browser while passing a test that keeps
  // firing at `document`.
  it("closes on a second Cmd+K after the input takes focus", () => {
    renderWithShortcuts(<GlobalSearch />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(document.activeElement?.tagName).toBe("INPUT");

    fireEvent.keyDown(document.activeElement!, { key: "k", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
  });

  it("closes on Cmd+Shift+F after the input takes focus", () => {
    renderWithShortcuts(<GlobalSearch />);
    fireEvent.keyDown(document, { key: "f", ctrlKey: true, shiftKey: true });

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(document.activeElement?.tagName).toBe("INPUT");

    fireEvent.keyDown(document.activeElement!, {
      key: "f",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
  });

  it("closing wins ctrl+k over an editing context registered beneath", () => {
    const addonHandler = vi.fn();

    function AddonEditor() {
      useShortcuts("addon-editor", "Addon", [
        { key: "ctrl+k", label: "Insert link", editingOnly: true, handler: addonHandler },
      ]);
      return null;
    }

    renderWithShortcuts(
      <>
        <AddonEditor />
        <GlobalSearch />
      </>,
    );

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    fireEvent.keyDown(document.activeElement!, { key: "k", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
    expect(addonHandler).not.toHaveBeenCalled();
  });

  // Push order alone would hand the chord to the editor.
  it("closing wins ctrl+k over an editing context registered after it", () => {
    const addonHandler = vi.fn();

    function LateAddonEditor() {
      const [loaded, setLoaded] = useState(false);
      useShortcuts(
        "addon-editor",
        "Addon",
        [
          {
            key: "ctrl+k",
            label: "Insert link",
            editingOnly: true,
            handler: addonHandler,
          },
        ],
        loaded,
      );
      return (
        <button data-testid="finish-load" onClick={() => setLoaded(true)} />
      );
    }

    renderWithShortcuts(
      <>
        <LateAddonEditor />
        <GlobalSearch />
      </>,
    );

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    fireEvent.click(screen.getByTestId("finish-load"));

    fireEvent.keyDown(document.activeElement!, { key: "k", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
    expect(addonHandler).not.toHaveBeenCalled();
  });

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

  describe("empty query state", () => {
    function seedHistory(terms: string[]) {
      localStorage.setItem("search-history:main", JSON.stringify(terms));
    }

    afterEach(() => {
      try {
        localStorage.removeItem("search-history:main");
        localStorage.removeItem("search-history:other");
      } catch {
        /* jsdom */
      }
    });

    it("ignores a persisted history value that is not an array", () => {
      localStorage.setItem(
        "search-history:main",
        JSON.stringify({ term: "whisper" }),
      );
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      expect(
        screen.getAllByPlaceholderText("Search in main...").length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("whisper")).toBeNull();
    });

    it("drops non-string entries from persisted history", () => {
      localStorage.setItem(
        "search-history:main",
        JSON.stringify(["whisper", 42, null]),
      );
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      expect(screen.getAllByText("whisper").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("42")).toBeNull();
    });

    it("renders one row per history term when the query is empty", () => {
      seedHistory(["whisper", "chapters"]);
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      expect(screen.getAllByText("whisper").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("chapters").length).toBeGreaterThanOrEqual(1);
    });

    it("clicking a history row navigates to the search page for that term", () => {
      seedHistory(["whisper"]);
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      fireEvent.click(screen.getAllByText("whisper")[0]);
      expect(mockRouterPush).toHaveBeenCalledWith(
        expect.stringContaining("q=whisper"),
      );
    });

    it("ArrowDown then Enter submits the first history term", () => {
      seedHistory(["whisper", "chapters"]);
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockRouterPush).toHaveBeenCalledWith(
        expect.stringContaining("q=whisper"),
      );
    });

    it("ArrowDown stops at the last history row", () => {
      seedHistory(["whisper", "chapters"]);
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockRouterPush).toHaveBeenCalledWith(
        expect.stringContaining("q=chapters"),
      );
    });

    it("offers the new drive's recent terms when the drive changes while open", () => {
      seedHistory(["whisper"]);
      localStorage.setItem("search-history:other", JSON.stringify(["chapters"]));
      const { rerender } = render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      expect(screen.getAllByText("whisper").length).toBeGreaterThanOrEqual(1);

      offeredTerms.renders = [];
      driveState.current = "other";
      rerender(<GlobalSearch />);

      expect(screen.queryByText("whisper")).toBeNull();
      expect(screen.getAllByText("chapters").length).toBeGreaterThanOrEqual(1);
      expect(offeredTerms.renders.flat()).not.toContain("whisper");
    });

    it("renders nothing in the body when there is no history", () => {
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      expect(screen.queryByText("whisper")).toBeNull();
    });
  });

  describe("recent files", () => {
    function makeRecent(overrides: Partial<FileItem> = {}) {
      return {
        ...makeFile(overrides),
        watch_progress: { position: 0, duration: 0 },
      };
    }

    async function openAndSettle() {
      fireEvent.click(screen.getByLabelText("Search"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    afterEach(() => {
      try {
        localStorage.removeItem("search-history:main");
      } catch {
        /* jsdom */
      }
    });

    it("requests the drive's history with filter 'all'", async () => {
      render(<GlobalSearch />);
      await openAndSettle();

      expect(mockGetWatchHistory).toHaveBeenCalledWith("main", 8, "all");
    });

    it("renders recent files above recent searches", async () => {
      localStorage.setItem(
        "search-history:main",
        JSON.stringify(["whisper"]),
      );
      mockGetWatchHistory.mockResolvedValue([
        makeRecent({ id: "r1", filename: "meeting-notes.md", title: "meeting-notes.md" }),
      ]);

      render(<GlobalSearch />);
      await openAndSettle();

      const fileRow = screen.getByText("meeting-notes.md");
      const termRow = screen.getByText("whisper");
      expect(
        fileRow.compareDocumentPosition(termRow) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("Enter on a recent file opens it", async () => {
      mockGetWatchHistory.mockResolvedValue([
        makeRecent({ id: "r1", filename: "meeting-notes.md", title: "meeting-notes.md" }),
      ]);

      render(<GlobalSearch />);
      await openAndSettle();

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockRouterPush).toHaveBeenCalledWith("/files/r1");
    });

    it("ArrowDown from the last recent file lands on the first search term", async () => {
      localStorage.setItem(
        "search-history:main",
        JSON.stringify(["whisper"]),
      );
      mockGetWatchHistory.mockResolvedValue([
        makeRecent({ id: "r1", filename: "meeting-notes.md", title: "meeting-notes.md" }),
      ]);

      render(<GlobalSearch />);
      await openAndSettle();

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockRouterPush).toHaveBeenCalledWith(
        expect.stringContaining("q=whisper"),
      );
    });

    it("renders no section and does not fetch when there is no drive", async () => {
      driveState.current = null;

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockGetWatchHistory).not.toHaveBeenCalled();
    });

    it("renders no section when the response is empty", async () => {
      mockGetWatchHistory.mockResolvedValue([]);

      render(<GlobalSearch />);
      await openAndSettle();

      expect(screen.queryByText("Recent files")).toBeNull();
    });

    it("does not retarget a live selection when the fetch resolves late", async () => {
      localStorage.setItem(
        "search-history:main",
        JSON.stringify(["whisper"]),
      );
      let resolveHistory: (items: unknown[]) => void = () => {};
      mockGetWatchHistory.mockReturnValue(
        new Promise((resolve) => {
          resolveHistory = resolve as (items: unknown[]) => void;
        }),
      );

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.keyDown(input, { key: "ArrowDown" });

      await act(async () => {
        resolveHistory([
          makeRecent({ id: "r1", filename: "meeting-notes.md", title: "meeting-notes.md" }),
        ]);
        await Promise.resolve();
        await Promise.resolve();
      });

      fireEvent.keyDown(input, { key: "Enter" });
      expect(mockRouterPush).not.toHaveBeenCalledWith("/files/r1");
    });

    it("drops the previous drive's files immediately when the drive changes", async () => {
      mockGetWatchHistory.mockResolvedValue([
        makeRecent({ id: "r1", filename: "meeting-notes.md", title: "meeting-notes.md" }),
      ]);

      const { rerender } = render(<GlobalSearch />);
      await openAndSettle();
      expect(screen.getByText("meeting-notes.md")).toBeInTheDocument();

      // The next drive's request never settles, so anything still on screen is
      // stale state rather than a fresh result.
      mockGetWatchHistory.mockReturnValue(new Promise(() => {}));
      driveState.current = "other";
      await act(async () => {
        rerender(<GlobalSearch />);
        await Promise.resolve();
      });

      expect(screen.queryByText("meeting-notes.md")).toBeNull();
    });

    it("typing a query replaces the recent sections with results", async () => {
      localStorage.setItem(
        "search-history:main",
        JSON.stringify(["whisper"]),
      );
      mockGetWatchHistory.mockResolvedValue([
        makeRecent({ id: "r1", filename: "meeting-notes.md", title: "meeting-notes.md" }),
      ]);
      mockGetDriveFiles.mockResolvedValue({
        data: [makeFile({ id: "f9", title: "found" })],
        meta: { total: 1, page: 1, limit: 8 },
      });

      render(<GlobalSearch />);
      await openAndSettle();
      expect(screen.getByText("meeting-notes.md")).toBeInTheDocument();

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.change(input, { target: { value: "found" } });
      await act(async () => {
        vi.advanceTimersByTime(350);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.queryByText("meeting-notes.md")).toBeNull();
      expect(screen.queryByText("whisper")).toBeNull();
    });
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

    it("spends no accent fill, with badges and pills on screen", async () => {
      mockGetDriveFiles.mockResolvedValue({
        data: [makeFile({ id: "f1", title: "filename-hit" })],
        meta: { total: 1, page: 1, limit: 8 },
      });
      mockFetchSemanticHits.mockResolvedValue([
        makeHit({
          file_id: "f2",
          filename: "semantic-hit.mp4",
          segments: [
            { time_range: [10, 20], matches: [{ type: "transcript", score: 0.7 }] },
            { time_range: [90, 99], matches: [{ type: "transcript", score: 0.6 }] },
          ],
        }),
      ]);

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await typeQuery("hit");
      await waitFor(() =>
        expect(screen.getAllByTestId("merged-result-item").length).toBe(2),
      );
      expect(screen.getAllByText(/^\d+:\d{2}$/)).toHaveLength(2);
      expect(screen.getByText("Transcript")).toBeInTheDocument();

      expect(accentFills(document.body)).toHaveLength(0);
    });

    it("would notice a fill, which is what makes the budget a claim", async () => {
      mockGetDriveFiles.mockResolvedValue({
        data: [makeFile({ id: "f1", title: "filename-hit" })],
        meta: { total: 1, page: 1, limit: 8 },
      });
      mockFetchSemanticHits.mockResolvedValue([]);

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await typeQuery("hit");
      await waitFor(() =>
        expect(screen.getAllByTestId("merged-result-item")).toHaveLength(1),
      );

      const row = screen.getAllByTestId("merged-result-item")[0];
      row.classList.add("bg-accent");
      expect(accentFills(document.body)).toHaveLength(1);
      row.classList.remove("bg-accent");
      expect(accentFills(document.body)).toHaveLength(0);
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
      expect(screen.getByText("semantic-hit.mp4")).toBeInTheDocument();
    });

    describe("two stages", () => {
      const neverResolves = () => new Promise<never>(() => {});

      it("draws the name matches while semantic search is still out", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        mockFetchSemanticHits.mockImplementation(neverResolves);

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");

        await waitFor(() =>
          expect(screen.getByText("filename-hit")).toBeInTheDocument(),
        );
      });

      it("says so in the footer, outside the list that is about to move", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        mockFetchSemanticHits.mockImplementation(neverResolves);

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");

        const pending = await screen.findByText(/Also searching by meaning/);
        expect(pending.closest(".overflow-y-auto")).toBeNull();
        const panel = screen
          .getByPlaceholderText(/Search/)
          .closest(".bg-bg-primary");
        expect(panel).toContainElement(pending);
        const entry = screen.getByRole("button", { name: /Keyboard Shortcuts/ });
        const legend = screen.getByRole("button", { name: /What the badges mean/ });
        const entries = entry.parentElement!;
        const footer = entries.parentElement!;
        expect(footer).toContainElement(pending);
        expect([...footer.children]).toEqual([entries, pending]);
        expect([...entries.children]).toEqual([entry, legend]);
      });

      it("reshuffles the list when the semantic hits land", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        let release: (hits: SemanticHit[]) => void = () => {};
        mockFetchSemanticHits.mockImplementation(
          () => new Promise<SemanticHit[]>((r) => (release = r)),
        );

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");

        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(1),
        );

        await act(async () => {
          release([makeHit({ file_id: "f2", filename: "semantic-hit.mp4" })]);
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(2),
        );
        expect(screen.queryByText(/Also searching by meaning/)).toBeNull();
      });

      it("says nothing on a drive that has no semantic search to wait for", async () => {
        mockIsSemanticSearchAvailable.mockResolvedValue(false);
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");

        await waitFor(() =>
          expect(screen.getByText("filename-hit")).toBeInTheDocument(),
        );
        expect(screen.queryByText(/Also searching by meaning/)).toBeNull();
        expect(mockFetchSemanticHits).not.toHaveBeenCalled();
      });

      it("says nothing while it is still finding out whether there is a second stage", async () => {
        mockIsSemanticSearchAvailable.mockImplementation(neverResolves);
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");

        await waitFor(() =>
          expect(screen.getByText("filename-hit")).toBeInTheDocument(),
        );
        expect(screen.queryByText(/Also searching by meaning/)).toBeNull();
      });

      it("does not let a stage from an abandoned query paint over the current one", async () => {
        const releases: Array<(hits: SemanticHit[]) => void> = [];
        mockFetchSemanticHits.mockImplementation(
          () => new Promise<SemanticHit[]>((r) => releases.push(r)),
        );
        mockGetDriveFiles.mockResolvedValueOnce({
          data: [makeFile({ id: "old", title: "old-query-row" })],
          meta: { total: 1, page: 1, limit: 8 },
        });

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("old");
        await waitFor(() =>
          expect(screen.getByText("old-query-row")).toBeInTheDocument(),
        );

        mockGetDriveFiles.mockResolvedValueOnce({
          data: [makeFile({ id: "new", title: "new-query-row" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        await typeQuery("new");
        await waitFor(() =>
          expect(screen.getByText("new-query-row")).toBeInTheDocument(),
        );

        // The first query's semantic stage comes back now, long after its
        // rows were replaced.
        await act(async () => {
          releases[0]?.([
            makeHit({ file_id: "stale", filename: "stale-hit.mp4" }),
          ]);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.queryByText("stale-hit.mp4")).toBeNull();
        expect(screen.queryByText("old-query-row")).toBeNull();
        expect(screen.getByText("new-query-row")).toBeInTheDocument();
      });

      it("does not call it empty while the second stage is still out", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [],
          meta: { total: 0, page: 1, limit: 8 },
        });
        let release: (hits: SemanticHit[]) => void = () => {};
        mockFetchSemanticHits.mockImplementation(
          () => new Promise<SemanticHit[]>((r) => (release = r)),
        );

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("kyoto temple");

        await screen.findByText(/Also searching by meaning/);
        expect(screen.queryByText(/No matching files found/i)).toBeNull();

        await act(async () => {
          release([makeHit({ file_id: "f2", filename: "kyoto-temple.mp4" })]);
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(1),
        );
        expect(screen.queryByText(/No matching files found/i)).toBeNull();
      });

      it("says so once the second stage has come back empty as well", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [],
          meta: { total: 0, page: 1, limit: 8 },
        });
        mockFetchSemanticHits.mockResolvedValue([]);

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("nothing at all");

        await waitFor(() =>
          expect(screen.getByText(/No matching files found/i)).toBeInTheDocument(),
        );
      });

      it("says so straight away on a drive with no second stage", async () => {
        mockIsSemanticSearchAvailable.mockResolvedValue(false);
        mockGetDriveFiles.mockResolvedValue({
          data: [],
          meta: { total: 0, page: 1, limit: 8 },
        });

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("nothing at all");

        await waitFor(() =>
          expect(screen.getByText(/No matching files found/i)).toBeInTheDocument(),
        );
        expect(screen.queryByText(/Also searching by meaning/)).toBeNull();
      });

      it("keeps the keyboard selection when the second stage changes nothing", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [
            makeFile({ id: "f1", title: "first-hit" }),
            makeFile({ id: "f2", title: "second-hit" }),
          ],
          meta: { total: 2, page: 1, limit: 8 },
        });
        let release: (hits: SemanticHit[]) => void = () => {};
        mockFetchSemanticHits.mockImplementation(
          () => new Promise<SemanticHit[]>((r) => (release = r)),
        );

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");
        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(2),
        );

        const selectedTitles = () =>
          screen
            .getAllByTestId("merged-result-item")
            .filter((row) => row.className.split(/\s+/).includes("bg-bg-elevated"))
            .map((row) => row.textContent);

        const input = screen.getAllByRole("textbox")[0];
        fireEvent.keyDown(input, { key: "ArrowDown" });
        await waitFor(() => expect(selectedTitles()).toHaveLength(1));
        const before = selectedTitles();

        await act(async () => {
          release([]);
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() =>
          expect(screen.queryByText(/Also searching by meaning/)).toBeNull(),
        );
        expect(screen.getAllByTestId("merged-result-item")).toHaveLength(2);
        expect(selectedTitles()).toEqual(before);
      });

      it("does not let an abandoned name stage paint over the current one", async () => {
        mockFetchSemanticHits.mockResolvedValue([]);
        const releases: Array<(res: unknown) => void> = [];
        mockGetDriveFiles.mockImplementationOnce(
          () => new Promise((r) => releases.push(r)),
        );

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("old");

        mockGetDriveFiles.mockResolvedValueOnce({
          data: [makeFile({ id: "new", title: "new-query-row" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        await typeQuery("new");
        await waitFor(() =>
          expect(screen.getByText("new-query-row")).toBeInTheDocument(),
        );

        await act(async () => {
          releases[0]?.({
            data: [makeFile({ id: "old", title: "old-query-row" })],
            meta: { total: 1, page: 1, limit: 8 },
          });
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.queryByText("old-query-row")).toBeNull();
        expect(screen.getByText("new-query-row")).toBeInTheDocument();
      });

      it("stops saying it is searching when the modal closes mid-stage", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        mockFetchSemanticHits.mockImplementation(neverResolves);

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");
        await screen.findByText(/Also searching by meaning/);

        // The backdrop rather than Escape: this render has no
        // `ShortcutsProvider` around it, and the point is the unmount, not
        // which gesture caused it.
        const backdrop = document.querySelector(".bg-black\\/50");
        expect(backdrop).not.toBeNull();
        fireEvent.click(backdrop!);
        await waitFor(() =>
          expect(screen.queryByPlaceholderText(/Search/)).toBeNull(),
        );

        fireEvent.click(screen.getByLabelText("Search"));
        expect(screen.queryByText(/Also searching by meaning/)).toBeNull();
      });

      // A name match scores `1 x FILENAME_BOOST` = 2.0, so outranking one
      // takes several channels at once.
      const strongHit = (id: string) =>
        makeHit({
          file_id: id,
          filename: `${id}.mp4`,
          score: 0.99,
          match_types: ["transcript", "clip", "content"],
          segments: [
            {
              time_range: [10, 20],
              matches: [
                { type: "transcript", score: 0.99 },
                { type: "clip", score: 0.99 },
                { type: "content", score: 0.99 },
              ],
            },
          ],
        });

      const oneNameHit = () => {
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        let release: (hits: SemanticHit[]) => void = () => {};
        mockFetchSemanticHits.mockImplementation(
          () => new Promise<SemanticHit[]>((r) => (release = r)),
        );
        return { release: (hits: SemanticHit[]) => release(hits) };
      };

      const rowIds = () =>
        screen
          .getAllByTestId("merged-result-item")
          .map((row) => row.getAttribute("data-file-id"));

      const highlightFirstRow = async () => {
        const input = screen.getAllByRole("textbox")[0];
        fireEvent.keyDown(input, { key: "ArrowDown" });
        await waitFor(() =>
          expect(
            screen
              .getAllByTestId("merged-result-item")
              .filter((row) => row.className.split(/\s+/).includes("bg-bg-elevated")),
          ).toHaveLength(1),
        );
        return input;
      };

      it("follows its file to a new position", async () => {
        const { release } = oneNameHit();

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");
        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(1),
        );
        const input = await highlightFirstRow();

        await act(async () => {
          release([strongHit("s0")]);
          await Promise.resolve();
          await Promise.resolve();
        });
        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(2),
        );
        expect(rowIds()).toEqual(["s0", "f1"]);

        mockRouterPush.mockClear();
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mockRouterPush).toHaveBeenCalledWith("/files/f1");
      });

      it("keeps the view-all row on the end of the list, not on a number", async () => {
        const { release } = oneNameHit();

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");
        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(1),
        );

        const input = screen.getAllByRole("textbox")[0];
        fireEvent.keyDown(input, { key: "ArrowDown" }); // the file
        fireEvent.keyDown(input, { key: "ArrowDown" }); // view all results

        await act(async () => {
          release([strongHit("s0")]);
          await Promise.resolve();
          await Promise.resolve();
        });
        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(2),
        );

        mockRouterPush.mockClear();
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=hit");
      });

      it("does not let a late watch-history reply take the highlight", async () => {
        let releaseHistory: (items: unknown[]) => void = () => {};
        mockGetWatchHistory.mockImplementation(
          () => new Promise((r) => (releaseHistory = r as (i: unknown[]) => void)),
        );
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        mockFetchSemanticHits.mockResolvedValue([]);

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");
        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(1),
        );
        const input = await highlightFirstRow();

        await act(async () => {
          releaseHistory([]);
          await Promise.resolve();
          await Promise.resolve();
        });

        mockRouterPush.mockClear();
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mockRouterPush).toHaveBeenCalledWith("/files/f1");
      });

      it("lets go once the file it was pointing at is gone", async () => {
        mockGetDriveFiles.mockResolvedValue({
          data: Array.from({ length: 8 }, (_, i) =>
            makeFile({ id: `n${i}`, title: `filename-hit ${i}` }),
          ),
          meta: { total: 8, page: 1, limit: 8 },
        });
        let release: (hits: SemanticHit[]) => void = () => {};
        mockFetchSemanticHits.mockImplementation(
          () => new Promise<SemanticHit[]>((r) => (release = r)),
        );

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");
        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(8),
        );

        const input = screen.getAllByRole("textbox")[0];
        for (let i = 0; i < 8; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
        const lastId = screen.getAllByTestId("merged-result-item")[7].getAttribute("data-file-id");

        // A name match scores `1 × FILENAME_BOOST` = 2.0, so displacing one
        // takes a hit that is strong on several channels at once.
        const strongHit = (i: number) =>
          makeHit({
            file_id: `s${i}`,
            filename: `semantic-hit-${i}.mp4`,
            score: 0.99,
            match_types: ["transcript", "clip", "content"],
            segments: [
              {
                time_range: [10, 20],
                matches: [
                  { type: "transcript", score: 0.99 },
                  { type: "clip", score: 0.99 },
                  { type: "content", score: 0.99 },
                ],
              },
            ],
          });

        await act(async () => {
          release(Array.from({ length: 8 }, (_, i) => strongHit(i)));
          await Promise.resolve();
          await Promise.resolve();
        });
        await waitFor(() =>
          expect(
            screen
              .getAllByTestId("merged-result-item")
              .some((row) => row.getAttribute("data-file-id") === lastId),
          ).toBe(false),
        );

        mockRouterPush.mockClear();
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=hit");
      });

      it("does not pin a highlight the reader never moved", async () => {
        // Two paints: the cached snapshot gives the first, the fetch gives
        // the second.
        mockReadSearchCache.mockReturnValue({
          filenameMatches: [makeFile({ id: "f1", title: "filename-hit" })],
          filenameTotal: 1,
          semanticHits: [],
          ts: Date.now(),
        });
        mockGetDriveFiles.mockResolvedValue({
          data: [makeFile({ id: "f1", title: "filename-hit" })],
          meta: { total: 1, page: 1, limit: 8 },
        });
        mockFetchSemanticHits.mockResolvedValue([strongHit("s0")]);

        render(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        await typeQuery("hit");

        await waitFor(() => expect(rowIds()).toEqual(["s0", "f1"]));

        mockRouterPush.mockClear();
        const input = screen.getAllByRole("textbox")[0];
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=hit");
      });
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
      expect(partial).toMatchObject({ filenameTotal: 1 });
      expect((partial as { filenameMatches: unknown[] }).filenameMatches).toHaveLength(1);
      expect((partial as { semanticHits: unknown[] }).semanticHits).toHaveLength(1);
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

    it("issues one request for a query changed inside the debounce window", async () => {
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

      expect(capturedSignals.length).toBe(1);
      expect(capturedSignals.map((s) => s.aborted)).toEqual([false]);
    });

    it("cache hit → readSearchCache returns data; rows render before debounce fires", async () => {
      mockReadSearchCache.mockReturnValue({
        filenameMatches: [makeFile({ id: "f1", title: "from-cache" })],
        filenameTotal: 1,
        semanticHits: [],
        ts: Date.now(),
      });

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.change(input, { target: { value: "video" } });
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockReadSearchCache).toHaveBeenCalled();
      expect(screen.getByText("from-cache")).toBeInTheDocument();
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

    it("does not navigate on the Enter that confirms a conversion", () => {
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      confirmConversionThenEnter(screen.getAllByRole("textbox")[0], "旅行");
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    it("navigates on an Enter pressed after the grace window", () => {
      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      confirmConversionThenEnter(screen.getAllByRole("textbox")[0], "旅行", { afterGrace: true });
      expect(mockRouterPush).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).toHaveBeenCalledWith(
        `/drive/main/search?q=${encodeURIComponent("旅行")}`,
      );
    });
  });

  describe("the highlight on the empty state", () => {
    it("stays on its row when a row above it is removed", async () => {
      localStorage.setItem(
        "search-history:main",
        JSON.stringify(["alpha", "beta", "gamma"]),
      );
      mockGetWatchHistory.mockResolvedValue([]);

      render(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const input = screen.getAllByRole("textbox")[0];
      fireEvent.keyDown(input, { key: "ArrowDown" }); // alpha
      fireEvent.keyDown(input, { key: "ArrowDown" }); // beta

      fireEvent.click(screen.getByLabelText('Remove "alpha" from history'));
      await act(async () => {
        await Promise.resolve();
      });

      mockRouterPush.mockClear();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=beta");
    });
  });

  describe("the badge legend", () => {
    const openLegend = async () => {
      renderWithShortcuts(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
      await screen.findByRole("button", { name: /What the badges mean/ });
      fireEvent.click(screen.getByRole("button", { name: /What the badges mean/ }));
    };

    it("explains every badge, not the ones that happen to be on screen", async () => {
      await openLegend();
      expect(MATCH_BADGES.length).toBe(8);
      for (const badge of MATCH_BADGES) {
        const help = enMessages.search[badge.helpKey as keyof typeof enMessages.search];
        expect(typeof help).toBe("string");
        expect(screen.getByText(help as string)).toBeInTheDocument();
      }
    });

    it("does not close the search to say it", async () => {
      await openLegend();
      expect(screen.getAllByPlaceholderText("Search in main...")).toHaveLength(1);
    });

    it("gives Escape back one thing at a time", async () => {
      await openLegend();
      fireEvent.keyDown(document, { key: "Escape" });

      const firstHelp = enMessages.search.matchFilenameHelp;
      expect(screen.queryByText(firstHelp)).toBeNull();
      expect(screen.getAllByPlaceholderText("Search in main...")).toHaveLength(1);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
    });

    it("answers on the mobile draw too, which is a different branch", async () => {
      const mql = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
      const answer = (matches: boolean) => (query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });
      mql.mockImplementation(answer(true));
      try {
        localStorage.setItem("search-history:main", JSON.stringify(["kyoto"]));
        renderWithShortcuts(<GlobalSearch />);
        fireEvent.click(screen.getByLabelText("Search"));
        expect(screen.getByLabelText("Close")).toBeInTheDocument();

        fireEvent.click(
          await screen.findByRole("button", { name: /What the badges mean/ }),
        );
        expect(
          screen.getByText(enMessages.search.matchFilenameHelp),
        ).toBeInTheDocument();
      } finally {
        mql.mockImplementation(answer(false));
        localStorage.removeItem("search-history:main");
      }
    });

    it("is a target a thumb can hit", async () => {
      await openLegend();
      const entry = screen.getByRole("button", { name: /What the badges mean/ });
      expect(entry.className).toContain("pointer-coarse:min-h-11");
      expect(entry.closest(".overflow-y-auto")).toBeNull();
    });
  });
});
