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

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: () => null,
  writeSearchCache: vi.fn(),
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

describe("SPEC-CORE-040 I21 the modal keeps show=passages for this drive's search page", () => {
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
    mockGetDriveFiles.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 8 },
    });
    mockFetchSemanticHits.mockResolvedValue({ ok: true, results: [] });
    mockIsSemanticSearchAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    at("/");
  });

  it("carries the view into the new query", () => {
    at("/drive/main/search?q=cats&show=passages");
    shell(null);
    submit("dogs");

    const url = pushed();
    expect(url?.pathname).toBe("/drive/main/search");
    expect(url?.params.get("q")).toBe("dogs");
    expect(url?.params.get("show")).toBe("passages");
  });

  it("reads the URL when the query is submitted, not when the component rendered", () => {
    at("/drive/main/search?q=cats");
    shell(null);
    at("/drive/main/search?q=cats&show=passages");
    submit("dogs");

    expect(pushed()?.params.get("show")).toBe("passages");
  });

  it.each([
    ["this drive's search page showing files", "/drive/main/search?q=cats"],
    ["another drive's search page", "/drive/other/search?q=cats&show=passages"],
    ["a file's detail page", "/files/f1?show=passages"],
    ["the drive's home", "/drive/main?show=passages"],
  ])("starts a query from %s without the view", (_name, url) => {
    at("/drive/main/search?q=cats&show=passages");
    shell(null);
    submit("birds");
    expect(pushed()?.params.get("show")).toBe("passages");

    mockRouterPush.mockClear();
    at(url);
    submit("dogs");

    const pushedUrl = pushed();
    expect(pushedUrl?.pathname).toBe("/drive/main/search");
    expect(pushedUrl?.params.get("q")).toBe("dogs");
    expect(pushedUrl?.params.has("show")).toBe(false);
  });

  it("keeps the view on the see-all link to the search page", () => {
    at("/drive/main/search?q=cats&show=passages");
    shell(<ScopedScreen />);
    openFromHeader();
    fireEvent.change(input(), { target: { value: "review type:text" } });

    const link = screen.getByRole("link", { name: /See all Notes/ });
    const href = new URL(link.getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe("/drive/main/search");
    expect(href.searchParams.get("q")).toBe("review type:text");
    expect(href.searchParams.get("show")).toBe("passages");
  });

  it("leaves the view off the see-all link when the page does not qualify", () => {
    at("/drive/main/search?q=cats&show=passages");
    shell(<ScopedScreen />);
    openFromHeader();
    fireEvent.change(input(), { target: { value: "review type:text" } });
    const first = screen.getByRole("link", { name: /See all Notes/ });
    expect(
      new URL(first.getAttribute("href")!, "http://localhost").searchParams.get("show"),
    ).toBe("passages");

    at("/files/f1?show=passages");
    fireEvent.change(input(), { target: { value: "review type:text " } });
    fireEvent.change(input(), { target: { value: "review type:text" } });
    const link = screen.getByRole("link", { name: /See all Notes/ });
    const href = new URL(link.getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe("/drive/main/search");
    expect(href.searchParams.has("show")).toBe(false);
  });
});
