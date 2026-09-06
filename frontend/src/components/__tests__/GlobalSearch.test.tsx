import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { FileItem } from "@/types";
import type { SemanticHit } from "@/lib/searchMerge";
import { accentFills } from "@/__tests__/helpers/accentFills";

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

// jsdom does not implement scrollIntoView, which the selection effect calls
// whenever selectedIndex >= 0. Only tests that move the selection hit it.
Element.prototype.scrollIntoView = vi.fn();

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
    // Flush pending setTimeout callbacks (e.g., openSearch's focus timer)
    vi.runAllTimers();
    vi.useRealTimers();
  });

  /**
   * The cheat sheet answered `?` and nothing on screen said so. This is the
   * one entry, and it is on both draws of the modal — the mobile full
   * screen and the desktop centre — because the shortcut it advertises is
   * the same one either way.
   */
  describe("the keyboard entry", () => {
    const openModal = () => {
      renderWithShortcuts(<GlobalSearch />);
      fireEvent.click(screen.getByLabelText("Search"));
    };

    /**
     * The mobile draw, which no test in this file had ever rendered:
     * `matchMedia` is stubbed `matches: false` at the top, so
     * `isMobileViewport` was false everywhere and the whole branch was
     * unreachable. Deleting that footer left the suite green while the PR
     * claimed the entry was "in both render paths".
     */
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
      // Not inside the list: 案 5's semantic hits arrive after the name
      // matches, and a row in that list slides as they land.
      expect(entry.closest(".overflow-y-auto")).toBeNull();

      // ...and inside the card that paints the modal. "Outside the list"
      // alone is also true of a footer that has escaped the card entirely,
      // which is how one shipped: no background of its own, and a second
      // child for `justify-center` to centre, which drags the panel left.
      const panel = screen
        .getByPlaceholderText(/Search/)
        .closest(".bg-bg-primary");
      expect(panel).not.toBeNull();
      expect(panel).toContainElement(entry);

      // The centring wrapper holds the backdrop and that card, nothing else.
      expect(panel!.parentElement!.children).toHaveLength(2);
    });

    /**
     * S-3. The modal is portalled to `document.body` and its backdrop covers
     * the viewport, so the panel is centred on the viewport while every other
     * surface is centred on the content area inside the 240px sidebar. At
     * 1512px with the sidebar inline those two centres are 120px apart, and
     * the fix is not to give the overlay a second coordinate system but to
     * make the panel wide enough that the offset stops reading as "left of
     * centre": 120px is 23% of 512px and 16% of 768px.
     */
    it("is 768px wide on the desktop centre, not 512px", () => {
      openModal();
      const panel = screen
        .getByPlaceholderText(/Search/)
        .closest(".bg-bg-primary");
      expect(panel).not.toBeNull();
      expect(panel!.className).toContain("max-w-3xl");
      expect(panel!.className).not.toContain("max-w-lg");
    });

    /**
     * ...and the widening stops at the desktop branch. Below 640px the sheet
     * is full-screen, so any `max-w-*` on it would cap a surface that is
     * meant to be the whole viewport.
     */
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

      // The modal's own input is gone, and the sheet is up.
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

  // The modal's own context sits on top of the stack, so an addon that bound
  // the same chord for editing (Knowledge uses ctrl+k to insert a link) must
  // not win it while the modal is open.
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

  // Same collision, but the editing context enables *after* the modal is
  // already open. Knowledge gates its editor shortcuts on `content !== null`,
  // so opening the modal while a note is still loading produces exactly this
  // order. Push order alone would hand the chord to the editor.
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

    // The note finishes loading while the modal is open.
    fireEvent.click(screen.getByTestId("finish-load"));

    fireEvent.keyDown(document.activeElement!, { key: "k", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search in main...")).toBeNull();
    expect(addonHandler).not.toHaveBeenCalled();
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

  // The empty-query state (search-term history) had no coverage before the
  // Phase 2 refactor that moved it onto a single flat item list. These pin
  // the behaviour so the list restructure — and the rows Phase 3 adds beside
  // it — cannot silently change how the rows render or navigate.
  describe("empty query state", () => {
    function seedHistory(terms: string[]) {
      localStorage.setItem("search-history:main", JSON.stringify(terms));
    }

    afterEach(() => {
      try {
        localStorage.removeItem("search-history:main");
      } catch {
        /* jsdom */
      }
    });

    // Anything can end up under this localStorage key: a hand-edited value, an
    // older schema, another tab. Before Phase 2 a non-array was tolerated by
    // accident (`history.length > 0` was falsy), so the modal rendered nothing
    // rather than crashing. The flat-list refactor maps over it unconditionally,
    // which turns that silent tolerance into a TypeError unless getHistory
    // validates the shape.
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
      // Three presses against two rows: the index must clamp, not overrun
      // into a non-existent row.
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockRouterPush).toHaveBeenCalledWith(
        expect.stringContaining("q=chapters"),
      );
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

    // A viewer without a nickname has no viewer_id, so the endpoint returns an
    // empty list. The section is simply absent rather than an empty heading.
    it("renders no section when the response is empty", async () => {
      mockGetWatchHistory.mockResolvedValue([]);

      render(<GlobalSearch />);
      await openAndSettle();

      expect(screen.queryByText("Recent files")).toBeNull();
    });

    // The list is built after the fetch resolves, but the user can navigate it
    // before then. selectedIndex is a position, so prepending rows underneath a
    // live selection silently retargets it — Enter would open a file the user
    // never highlighted.
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

      // Only the search-term row exists so far; select it.
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

    // GlobalSearch lives in the header under the root layout, so it survives
    // drive navigation. A drive is a security boundary; rows from the drive the
    // user just left must not stay selectable while the new request is in
    // flight.
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

    /**
     * The accent budget, for the screen `accent-budget.test.tsx` names but
     * cannot set up: the modal needs a router, an API and fake timers
     * before it draws a row at all.
     *
     * Zero is the assertion. The modal is a place to pick from, and every
     * row in it is equally the thing you might want — a fill on one of
     * them would be the screen claiming a primary action it does not have.
     * The match badges tint with `bg-accent/15` and friends, which are
     * transparencies rather than this fill, and the timestamp pills are
     * `text-text-muted`, which is not a fill at all.
     */
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
      // The population the name claims. Without this the segment mapping
      // could break, no pill would render, and zero fills would still be
      // found on a screen that was never measured.
      expect(screen.getAllByText(/^\d+:\d{2}$/)).toHaveLength(2);
      expect(screen.getByText("Transcript")).toBeInTheDocument();

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
      // Both rows should be rendered.
      expect(screen.getByText("semantic-hit.mp4")).toBeInTheDocument();
    });

    /**
     * The two stages.
     *
     * Semantic search takes around five seconds on a cold index. Waiting for
     * it before drawing anything meant the name match the user was almost
     * certainly after sat behind a spinner for those five seconds.
     */
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
        // In the results list it would push every row down the moment the
        // second stage landed, which is what the footer row exists to avoid.
        expect(pending.closest(".overflow-y-auto")).toBeNull();
        const panel = screen
          .getByPlaceholderText(/Search/)
          .closest(".bg-bg-primary");
        expect(panel).toContainElement(pending);
        // "Inside the panel, outside the list" is also true of a line put
        // under the input, above the results — which is the placement this
        // row exists instead of. It is the footer's second column.
        const entry = screen.getByRole("button", { name: /Keyboard Shortcuts/ });
        const footer = entry.parentElement!;
        expect(footer).toContainElement(pending);
        expect([...footer.children]).toEqual([entry, pending]);
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
        // Not "0 semantic results": on a drive without the addon that is the
        // absence of a feature, not the outcome of a search.
        expect(screen.queryByText(/Also searching by meaning/)).toBeNull();
        expect(mockFetchSemanticHits).not.toHaveBeenCalled();
      });

      /**
       * ...and it stays silent while the answer to "does this drive have
       * semantic search" is itself outstanding. Announcing a second stage
       * before knowing there is one is the same claim, made earlier.
       */
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

      /**
       * Two stages that resolve independently can interleave with a new
       * query's stages. The abort on the old query is what keeps them apart,
       * so this resolves the old query's slow stage *after* the new query has
       * already painted.
       */
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

      /**
       * "No results" is a verdict, and stage one alone cannot reach it:
       * the phrase a semantic search exists for is exactly the one no
       * filename matches. Every other test here seeds a non-empty name
       * result, so this branch had nothing holding it.
       */
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
        // The verdict is not delayed by a stage that does not exist.
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

      /**
       * ...and only then. A second stage that adds nothing produces the
       * same rows in the same order; taking the highlight off a list that
       * never moved sends the user's next Enter to the search page
       * instead of to the row they were on.
       */
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

      /**
       * The abandoned stage the other test holds open is the semantic one.
       * The name stage resolves promptly there, so its own abort check and
       * `paint()`'s are never the guard that fires — delete either and that
       * test stays green. This one holds the *name* stage open instead.
       */
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

      /**
       * The cleanup clears the flag as well as the `.finally`, because a
       * modal closed mid-stage-two never reaches that `.finally` for the
       * generation the user is looking at next.
       */
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
        // Reopened with no query typed: there is no second stage running,
        // so the footer must not still be reporting one.
        expect(screen.queryByText(/Also searching by meaning/)).toBeNull();
      });

      /**
       * Relevance sorting sees only name matches until the second stage
       * arrives, so the row under the highlight afterwards is a different
       * file. Enter would open something the user never picked.
       */
      it("drops the keyboard selection when the second stage reorders the list", async () => {
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

        // Every row carries `hover:bg-bg-elevated` at rest, so the selected
        // state is the bare token and has to be matched as one.
        const selectedRows = () =>
          screen
            .getAllByTestId("merged-result-item")
            .filter((row) =>
              row.className.split(/\s+/).includes("bg-bg-elevated"),
            );

        const input = screen.getAllByRole("textbox")[0];
        fireEvent.keyDown(input, { key: "ArrowDown" });
        await waitFor(() => expect(selectedRows()).toHaveLength(1));

        await act(async () => {
          release([makeHit({ file_id: "f2", filename: "semantic-hit.mp4" })]);
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() =>
          expect(screen.getAllByTestId("merged-result-item")).toHaveLength(2),
        );
        expect(selectedRows()).toHaveLength(0);
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
      // Lengths, not `expect.any(Array)`: an empty array satisfies that,
      // and a cache entry holding a name-only list is served for the next
      // 60 seconds as if it were the finished answer.
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

      // Enumerated rather than bounded. The signal is the *whole*
      // generation guard — every write in the effect is behind
      // `ctrl.signal.aborted` — so "at least one was aborted" is not
      // enough to carry it: lower bounds hold at every count above the
      // bound, and a conditional assertion is vacuous whenever its
      // condition is false.
      //
      // The first change is abandoned before its debounce fires, so its
      // request never goes out at all; exactly one signal is issued, and
      // it is live because it belongs to the query that is on screen.
      //
      // So this measures the debounce, not the abort — the name used to
      // say "aborts the prior request" and the body proves the opposite,
      // because there is no prior request to abort. The generation guard
      // is carried by `does not let an abandoned name stage paint over
      // the current one`, which holds a request open across the change
      // and does go red when `ctrl.abort()` is removed.
      expect(capturedSignals.length).toBe(1);
      expect(capturedSignals.map((s) => s.aborted)).toEqual([false]);
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
