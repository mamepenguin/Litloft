/**
 * SPEC-CORE-106 step 3 (I1, icon half): a Smart Collection's row in the search
 * jump list is drawn with lucide ListFilter.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ListFilter } from "lucide-react";

import { GlobalSearch } from "../GlobalSearch";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
  useSetOverrideDrive: () => vi.fn(),
}));

const mockGetSmartFolders = vi.fn();
vi.mock("@/lib/api", () => ({
  getDriveFiles: () => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 8 } }),
  getWatchHistory: () => Promise.resolve([]),
  getFolderTree: () => Promise.resolve([]),
  getDriveTags: () => Promise.resolve([]),
  getPins: () => Promise.resolve([]),
  getCollections: () => Promise.resolve([]),
  getSmartFolders: (...args: unknown[]) => mockGetSmartFolders(...args),
  getDriveSummary: () => Promise.resolve({ missing_count: 0 }),
  getAuthStatus: () => Promise.resolve({ is_admin: false }),
}));

vi.mock("@/lib/semanticSearch", () => ({
  fetchSemanticHits: () => Promise.resolve({ ok: true, results: [] }),
  isSemanticSearchAvailable: () => Promise.resolve(false),
}));

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: () => null,
  writeSearchCache: () => {},
}));

vi.mock("../FileTypeIcon", () => ({ FileTypeIcon: () => null }));

Element.prototype.scrollIntoView = vi.fn();
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

const iconOf = (el: Element) =>
  (el.querySelector("svg")?.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");

const jumpRows = () =>
  Array.from(
    screen.queryByText("Go to")?.parentElement?.querySelectorAll("[data-search-item] > button:first-child") ?? [],
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("SPEC-CORE-106 I1 the jump-list row of a Smart Collection", () => {
  it("SPEC-CORE-106 I1 draws ListFilter", async () => {
    mockGetSmartFolders.mockResolvedValue([
      { id: "s1", drive: "main", name: "Clips", query: "cat", file_type: "video", sort_by: null },
    ]);
    const { container, unmount } = render(<ListFilter />);
    const listFilter = iconOf(container);
    unmount();

    render(<GlobalSearch />);
    fireEvent.click(screen.getByLabelText("Search"));
    await act(async () => {
      fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "clips" } });
    });
    await waitFor(() => expect(jumpRows().map((r) => r.textContent)).toEqual(["Clips"]));

    expect(listFilter).toHaveLength(1);
    expect(iconOf(jumpRows()[0])).toEqual(listFilter);
  });
});
