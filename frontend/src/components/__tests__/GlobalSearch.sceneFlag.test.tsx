import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";
import {
  GlobalSearchProvider,
  useSearchScope,
  type SearchScope,
} from "../search/GlobalSearchProvider";
import type { FileItem } from "@/types";

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn() }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const driveState = vi.hoisted(() => ({ current: "main" }));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => driveState.current,
  useSetOverrideDrive: () => () => {},
}));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
const mockGetPins = vi.fn();
const mockGetDriveTags = vi.fn();
const mockGetFolderTree = vi.fn();

vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
  getDriveTags: (...args: unknown[]) => mockGetDriveTags(...args),
  getPins: (...args: unknown[]) => mockGetPins(...args),
  getCollections: () => Promise.resolve([]),
  getSmartFolders: () => Promise.resolve([]),
  getDriveSummary: () => Promise.resolve({ missing_count: 0 }),
  getAuthStatus: () => Promise.resolve({ is_admin: false }),
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
const openFromHeader = () => fireEvent.click(screen.getByLabelText("Search"));

function at(url: string) {
  window.history.replaceState(null, "", url);
}

function submit(term: string) {
  openFromHeader();
  fireEvent.change(input(), { target: { value: term } });
  fireEvent.keyDown(input(), { key: "Enter" });
}

const pushed = () => {
  const raw = mockRouterPush.mock.calls.at(-1)?.[0] as string | undefined;
  if (!raw) return null;
  const url = new URL(raw, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

describe("GlobalSearch keeps include_scene_clip (SPEC-CORE-025)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    answerMatchMedia(false);
    localStorage.clear();
    driveState.current = "main";
    mockGetWatchHistory.mockResolvedValue([]);
    mockGetPins.mockResolvedValue([]);
    mockGetDriveTags.mockResolvedValue([]);
    mockGetFolderTree.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue(page([]));
    mockFetchSemanticHits.mockResolvedValue([]);
    mockIsSemanticSearchAvailable.mockResolvedValue(true);
    mockReadSearchCache.mockReturnValue(null);
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    at("/");
  });

  it("carries the flag from this drive's search page into the new query", () => {
    at("/drive/main/search?q=cats&include_scene_clip=true");
    shell(null);
    submit("dogs");
    const url = pushed();
    expect(url?.pathname).toBe("/drive/main/search");
    expect(url?.params.get("q")).toBe("dogs");
    expect(url?.params.get("include_scene_clip")).toBe("true");
  });

  it("reads the URL when the query is submitted, not when the component rendered", () => {
    at("/drive/main/search?q=cats");
    shell(null);
    at("/drive/main/search?q=cats&include_scene_clip=true");
    submit("dogs");
    expect(pushed()?.params.get("include_scene_clip")).toBe("true");
  });

  it("carries the flag for a recent-search row too", () => {
    localStorage.setItem("search-history:main", JSON.stringify(["whisper"]));
    at("/drive/main/search?q=cats&include_scene_clip=true");
    shell(null);
    openFromHeader();
    fireEvent.click(screen.getAllByText("whisper")[0]);
    const url = pushed();
    expect(url?.params.get("q")).toBe("whisper");
    expect(url?.params.get("include_scene_clip")).toBe("true");
  });

  it.each([
    ["this drive's search page with the flag off", "/drive/main/search?q=cats"],
    ["this drive's search page with the flag not true", "/drive/main/search?q=cats&include_scene_clip=false"],
    ["another drive's search page with the flag on", "/drive/other/search?q=cats&include_scene_clip=true"],
    ["a file's detail page", "/files/f1?include_scene_clip=true"],
    ["the drive's home with the flag in the URL", "/drive/main?include_scene_clip=true"],
  ])("starts a query from %s with the flag off", (_n, url) => {
    at("/drive/main/search?q=cats&include_scene_clip=true");
    shell(null);
    submit("birds");
    expect(pushed()?.params.get("include_scene_clip")).toBe("true");

    mockRouterPush.mockClear();
    at(url);
    submit("dogs");
    const pushedUrl = pushed();
    expect(pushedUrl?.pathname).toBe("/drive/main/search");
    expect(pushedUrl?.params.get("q")).toBe("dogs");
    expect(pushedUrl?.params.has("include_scene_clip")).toBe(false);
  });

  it("keeps the flag on the see-all link to the search page and leaves other parameters alone", () => {
    at("/drive/main/search?q=cats&include_scene_clip=true");
    shell(<ScopedScreen />);
    openFromHeader();
    fireEvent.change(input(), { target: { value: "review type:text" } });
    const link = screen.getByRole("link", { name: /See all Notes/ });
    const href = new URL(link.getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe("/drive/main/search");
    expect(href.searchParams.get("q")).toBe("review type:text");
    expect(href.searchParams.get("type")).toBe("text");
    expect(href.searchParams.get("include_scene_clip")).toBe("true");
  });

  it("leaves the see-all link without the flag when the current page does not qualify", () => {
    at("/drive/main/search?q=cats&include_scene_clip=true");
    shell(<ScopedScreen />);
    openFromHeader();
    fireEvent.change(input(), { target: { value: "review type:text" } });
    const first = screen.getByRole("link", { name: /See all Notes/ });
    expect(new URL(first.getAttribute("href")!, "http://localhost").searchParams.get("include_scene_clip")).toBe("true");

    at("/files/f1?include_scene_clip=true");
    fireEvent.change(input(), { target: { value: "review type:text " } });
    fireEvent.change(input(), { target: { value: "review type:text" } });
    const link = screen.getByRole("link", { name: /See all Notes/ });
    const href = new URL(link.getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe("/drive/main/search");
    expect(href.searchParams.has("include_scene_clip")).toBe(false);
  });
});
