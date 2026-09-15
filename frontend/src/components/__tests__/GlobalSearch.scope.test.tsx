import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";

import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";
import {
  GlobalSearchProvider,
  useGlobalSearch,
  useSearchScope,
  type SearchScope,
} from "../search/GlobalSearchProvider";
import type { FileItem } from "@/types";
import { accentFills } from "@/__tests__/helpers/accentFills";

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn() }),
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
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
  isSemanticSearchAvailable: (...args: unknown[]) => mockIsSemanticSearchAvailable(...args),
}));

const mockReadSearchCache = vi.fn();
const mockWriteSearchCache = vi.fn();

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => mockReadSearchCache(...args),
  writeSearchCache: (...args: unknown[]) => mockWriteSearchCache(...args),
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => <span data-testid={`icon-${fileType}`} />,
}));

Element.prototype.scrollIntoView = vi.fn();

function answerMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
    id: "f1",
    filename: "f1.md",
    title: "f1",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: null,
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

const page = (files: FileItem[]) => ({
  data: files,
  meta: { total: files.length, page: 1, limit: 8 },
});

const NOTES: SearchScope = {
  label: "Notes",
  type: "text",
  seeAllHref: (q) => `/drive/main/addons/knowledge?view=all&q=${encodeURIComponent(q)}`,
};

function ScopedScreen({ scope = NOTES }: { scope?: SearchScope }) {
  useSearchScope(scope);
  return null;
}

function shell(children: ReactNode) {
  return render(
    <ShortcutsProvider>
      <GlobalSearchProvider>
        <GlobalSearch />
        {children}
      </GlobalSearchProvider>
    </ShortcutsProvider>,
  );
}

const input = () => screen.getAllByRole("textbox")[0];

async function typeQuery(value: string) {
  fireEvent.change(input(), { target: { value } });
  await act(async () => {
    vi.advanceTimersByTime(350);
    await Promise.resolve();
    await Promise.resolve();
  });
}

const openFromHeader = () => fireEvent.click(screen.getByLabelText("Search"));
const rowIds = () =>
  screen.queryAllByTestId("scoped-result-item").map((row) => row.getAttribute("data-file-id"));
const mergedIds = () =>
  screen.queryAllByTestId("merged-result-item").map((row) => row.getAttribute("data-file-id"));
const chipRemover = () => screen.queryByRole("button", { name: "Remove the Notes scope" });

describe("GlobalSearch with a scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    answerMatchMedia(false);
    localStorage.clear();
    mockGetWatchHistory.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue(page([]));
    mockFetchSemanticHits.mockResolvedValue([]);
    mockIsSemanticSearchAvailable.mockResolvedValue(true);
    mockReadSearchCache.mockReturnValue(null);
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  describe("with no scope", () => {
    it("sends the name request without a kind, and the semantic request", async () => {
      shell(null);
      openFromHeader();
      await typeQuery("review");

      await waitFor(() => expect(mockFetchSemanticHits).toHaveBeenCalledTimes(1));
      expect(mockGetDriveFiles).toHaveBeenCalledTimes(1);
      expect(mockGetDriveFiles.mock.calls[0][0]).toBe("main");
      expect(mockGetDriveFiles.mock.calls[0][1]).toEqual({ search: "review", limit: 8 });
      expect(mockGetWatchHistory.mock.calls).toEqual([["main", 8, "all"]]);
      expect(mockReadSearchCache).toHaveBeenCalledWith(
        expect.objectContaining({ query: "review", type: null }),
      );
      expect(chipRemover()).toBeNull();
    });
  });

  describe("registered by a screen", () => {
    it("opens scoped from the header button, with the chip in the input row", () => {
      shell(<ScopedScreen />);
      openFromHeader();

      const remover = chipRemover();
      expect(remover).not.toBeNull();
      expect(remover!.closest("div")).toContainElement(input());
      expect(screen.getByText("Notes")).toBeInTheDocument();
    });

    it("opens scoped from Cmd+K", () => {
      shell(<ScopedScreen />);
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
      expect(chipRemover()).not.toBeNull();
    });

    it("asks the name stage for the scope's kind and never asks the semantic stage", async () => {
      shell(<ScopedScreen />);
      openFromHeader();
      await typeQuery("review");

      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalledTimes(1));
      expect(mockGetDriveFiles.mock.calls[0][1]).toEqual({
        search: "review",
        limit: 8,
        type: "text",
      });
      expect(mockIsSemanticSearchAvailable).not.toHaveBeenCalled();
      expect(mockFetchSemanticHits).not.toHaveBeenCalled();
      expect(mockReadSearchCache).toHaveBeenCalledWith(
        expect.objectContaining({ query: "review", type: "text" }),
      );
    });

    it("lists recent files of the scope's kind only", async () => {
      shell(<ScopedScreen />);
      openFromHeader();
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockGetWatchHistory.mock.calls).toEqual([["main", 8, "all", "text"]]);
    });

    it("drops the scoped recent files as soon as the scope is removed", async () => {
      mockGetWatchHistory.mockResolvedValueOnce([
        { ...makeFile({ id: "n1", title: "plans.md" }), watch_progress: null },
      ]);
      shell(<ScopedScreen />);
      openFromHeader();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText("plans.md")).toBeInTheDocument();

      // The unscoped request never settles, so anything still listed is the
      // scoped answer.
      mockGetWatchHistory.mockReturnValue(new Promise(() => {}));
      fireEvent.click(chipRemover()!);
      expect(screen.queryByText("plans.md")).toBeNull();
    });

    it("does not offer recent search terms, which lead to the unscoped search page", async () => {
      localStorage.setItem("search-history:main", JSON.stringify(["whisper"]));
      shell(<ScopedScreen />);
      openFromHeader();
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByText("whisper")).toBeNull();
    });

    it("opens unscoped once the screen that registered it is gone", () => {
      function Page() {
        const [on, setOn] = useState(true);
        return (
          <>
            {on && <ScopedScreen />}
            <button type="button" onClick={() => setOn(false)}>
              leave
            </button>
          </>
        );
      }
      shell(<Page />);
      fireEvent.click(screen.getByRole("button", { name: "leave" }));
      openFromHeader();
      expect(chipRemover()).toBeNull();
    });
  });

  describe("passed to open", () => {
    function Opener() {
      const search = useGlobalSearch();
      return (
        <button type="button" onClick={() => search.open({ scope: NOTES })}>
          go-to-note
        </button>
      );
    }

    it("opens the modal scoped with no screen registration", () => {
      shell(<Opener />);
      fireEvent.click(screen.getByRole("button", { name: "go-to-note" }));
      expect(chipRemover()).not.toBeNull();
    });

    it("leaves a modal that is already open as it is", () => {
      shell(<Opener />);
      openFromHeader();
      fireEvent.click(screen.getByRole("button", { name: "go-to-note" }));
      expect(chipRemover()).toBeNull();
    });

    it("does not stay scoped for the next opening", () => {
      shell(<Opener />);
      fireEvent.click(screen.getByRole("button", { name: "go-to-note" }));
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("textbox")).toBeNull();

      openFromHeader();
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      expect(chipRemover()).toBeNull();
    });
  });

  describe("removing the scope", () => {
    it("with the chip's button re-runs the same query unscoped", async () => {
      mockGetDriveFiles.mockImplementation(async (_d: string, params: { type?: string }) =>
        params.type
          ? page([makeFile({ id: "n1", title: "review note" })])
          : page([
              makeFile({ id: "n1", title: "review note" }),
              makeFile({ id: "v1", title: "review video", filename: "review.mp4" }),
            ]),
      );
      shell(<ScopedScreen />);
      openFromHeader();
      await typeQuery("review");
      await waitFor(() => expect(rowIds()).toEqual(["n1"]));

      fireEvent.click(chipRemover()!);
      await act(async () => {
        vi.advanceTimersByTime(350);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(chipRemover()).toBeNull();
      expect((input() as HTMLInputElement).value).toBe("review");
      await waitFor(() => expect(mergedIds()).toEqual(["n1", "v1"]));
      expect(mockGetDriveFiles.mock.calls.at(-1)![1]).toEqual({ search: "review", limit: 8 });
      expect(mockFetchSemanticHits).toHaveBeenCalledWith("review", "main", expect.anything());
    });

    it("with Backspace on an empty field", () => {
      shell(<ScopedScreen />);
      openFromHeader();
      fireEvent.keyDown(input(), { key: "Backspace" });
      expect(chipRemover()).toBeNull();
    });

    it("never with Backspace in a field that has text", async () => {
      shell(<ScopedScreen />);
      openFromHeader();
      await typeQuery("r");
      fireEvent.keyDown(input(), { key: "Backspace" });
      expect(chipRemover()).not.toBeNull();
    });

    it("does not let the scoped stage paint over the unscoped results", async () => {
      let releaseScoped: (res: unknown) => void = () => {};
      mockGetDriveFiles.mockImplementation((_d: string, params: { type?: string }) =>
        params.type
          ? new Promise((r) => (releaseScoped = r))
          : Promise.resolve(page([makeFile({ id: "u1", title: "unscoped row" })])),
      );
      shell(<ScopedScreen />);
      openFromHeader();
      await typeQuery("review");

      fireEvent.click(chipRemover()!);
      await act(async () => {
        vi.advanceTimersByTime(350);
        await Promise.resolve();
        await Promise.resolve();
      });
      await waitFor(() => expect(mergedIds()).toEqual(["u1"]));

      await act(async () => {
        releaseScoped(page([makeFile({ id: "s1", title: "stale scoped row" })]));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(rowIds()).toEqual([]);
      expect(mergedIds()).toEqual(["u1"]);
    });
  });

  describe("rows and keys", () => {
    const twoNotes = () =>
      mockGetDriveFiles.mockResolvedValue(
        page([
          makeFile({ id: "n1", title: "Review checklist", folder_path: "Work" }),
          makeFile({ id: "n2", title: "Movie reviews", folder_path: "" }),
        ]),
      );

    it("marks the match in the title and names the folder, drive root included", async () => {
      twoNotes();
      shell(<ScopedScreen />);
      openFromHeader();
      await typeQuery("review");

      await waitFor(() => expect(screen.getAllByTestId("scoped-result-item")).toHaveLength(2));
      const marks = [...document.querySelectorAll("mark")].map((m) => m.textContent);
      expect(marks).toEqual(["Review", "review"]);
      expect(screen.getByText("Work")).toBeInTheDocument();
      expect(screen.getByText("Drive root")).toBeInTheDocument();
      expect(screen.queryByText(/View all/)).toBeNull();
    });

    it("opens the highlighted row on Enter", async () => {
      twoNotes();
      shell(<ScopedScreen />);
      openFromHeader();
      await typeQuery("review");
      await waitFor(() => expect(screen.getAllByTestId("scoped-result-item")).toHaveLength(2));

      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(mockRouterPush).toHaveBeenCalledWith("/files/n2");
    });

    it("goes to the scope's see-all destination on Enter with no highlighted row", async () => {
      shell(<ScopedScreen />);
      openFromHeader();
      fireEvent.change(input(), { target: { value: "a&b 旅行" } });
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(mockRouterPush).toHaveBeenCalledWith(
        `/drive/main/addons/knowledge?view=all&q=${encodeURIComponent("a&b 旅行")}`,
      );
    });

    it("goes to the normal search page when the scope has no see-all destination", () => {
      shell(<ScopedScreen scope={{ label: "Notes", type: "text" }} />);
      openFromHeader();
      fireEvent.change(input(), { target: { value: "review" } });
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=review");
    });

    it("closes on Escape", () => {
      shell(<ScopedScreen />);
      openFromHeader();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });

  describe("the footer", () => {
    it("carries the key hints and a see-all link built from the label", async () => {
      shell(<ScopedScreen />);
      openFromHeader();
      expect(screen.queryByRole("link", { name: /See all Notes/ })).toBeNull();

      fireEvent.change(input(), { target: { value: "a&b" } });
      const link = screen.getByRole("link", { name: "See all Notes matching “a&b”" });
      expect(link).toHaveAttribute("href", "/drive/main/addons/knowledge?view=all&q=a%26b");
      for (const hint of ["Select", "Open", "Remove scope"]) {
        expect(screen.getByText(hint)).toBeInTheDocument();
      }

      fireEvent.click(link);
      expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/addons/knowledge?view=all&q=a%26b");
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("has no link when the scope has no see-all destination", () => {
      shell(<ScopedScreen scope={{ label: "Notes", type: "text" }} />);
      openFromHeader();
      fireEvent.change(input(), { target: { value: "review" } });
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("spends no accent fill", async () => {
      mockGetDriveFiles.mockResolvedValue(page([makeFile({ id: "n1", title: "review" })]));
      shell(<ScopedScreen />);
      openFromHeader();
      await typeQuery("review");
      await waitFor(() => expect(screen.getAllByTestId("scoped-result-item")).toHaveLength(1));
      expect(accentFills(document.body)).toHaveLength(0);
    });
  });

  describe("on a phone", () => {
    beforeEach(() => answerMatchMedia(true));

    it("draws the chip in the full-screen sheet and removes it on Backspace", () => {
      shell(<ScopedScreen />);
      openFromHeader();
      expect(screen.getByLabelText("Close")).toBeInTheDocument();
      expect(chipRemover()).not.toBeNull();

      fireEvent.keyDown(input(), { key: "Backspace" });
      expect(chipRemover()).toBeNull();
    });

    it("keeps the see-all link", () => {
      shell(<ScopedScreen />);
      openFromHeader();
      fireEvent.change(input(), { target: { value: "review" } });
      expect(screen.getByRole("link", { name: "See all Notes matching “review”" })).toBeInTheDocument();
    });
  });
});
