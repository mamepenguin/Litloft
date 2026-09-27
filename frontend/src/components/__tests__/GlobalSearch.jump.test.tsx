import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GlobalSearch } from "../GlobalSearch";
import type { FileItem } from "@/types";

const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn() }),
}));

const driveState = vi.hoisted(() => ({ current: "main" as string | null }));
const mockSetOverrideDrive = vi.fn();
vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => driveState.current,
  useSetOverrideDrive: () => mockSetOverrideDrive,
}));

const mockGetDriveFiles = vi.fn();
const mockGetPins = vi.fn();
const mockGetFolderTree = vi.fn();
const mockGetCollections = vi.fn();
const mockGetSmartFolders = vi.fn();
const mockGetDriveSummary = vi.fn();
const mockGetAuthStatus = vi.fn();
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: () => Promise.resolve([]),
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
  getPins: (...args: unknown[]) => mockGetPins(...args),
  getCollections: (...args: unknown[]) => mockGetCollections(...args),
  getSmartFolders: (...args: unknown[]) => mockGetSmartFolders(...args),
  getDriveSummary: (...args: unknown[]) => mockGetDriveSummary(...args),
  getAuthStatus: (...args: unknown[]) => mockGetAuthStatus(...args),
}));

vi.mock("@/lib/semanticSearch", () => ({
  fetchSemanticHits: () => Promise.resolve([]),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function file(id: string, title: string): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 1,
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
  };
}

const page = (data: FileItem[]) => ({ data, meta: { total: data.length, page: 1, limit: 8 } });

const input = () => screen.getAllByRole("textbox")[0];
const press = (key: string) => fireEvent.keyDown(input(), { key });
const jumpRows = () =>
  screen.queryByText("Go to")?.parentElement?.querySelectorAll("[data-search-item] > button:first-child") ?? [];
const jumpLabels = () => Array.from(jumpRows()).map((row) => row.textContent);
const folderRows = () =>
  screen.queryByText("Folders")?.parentElement?.querySelectorAll("[data-search-item] > button:first-child") ?? [];
const folderLabels = () => Array.from(folderRows()).map((row) => row.textContent);
const folder = (path: string) => ({ kind: "folder", name: path.split("/").pop()!, path });

async function openAndType(query: string) {
  fireEvent.click(screen.getByLabelText("Search"));
  await act(async () => {
    fireEvent.change(input(), { target: { value: query } });
  });
}

describe("GlobalSearch page jump", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    driveState.current = "main";
    mockGetDriveFiles.mockResolvedValue(page([]));
    mockGetPins.mockResolvedValue([]);
    mockGetFolderTree.mockResolvedValue([]);
    mockGetCollections.mockResolvedValue([]);
    mockGetSmartFolders.mockResolvedValue([]);
    mockGetDriveSummary.mockResolvedValue({ missing_count: 0 });
    mockGetAuthStatus.mockResolvedValue({ is_admin: false });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("offers nothing on an empty query", async () => {
    render(<GlobalSearch />);
    await openAndType("");
    expect(screen.queryByText("Go to")).toBeNull();
  });

  it("reaches a destination with no file results, and does not record the query", async () => {
    render(<GlobalSearch />);
    await openAndType("trash");
    await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("No matching files found")).toBeInTheDocument());
    expect(jumpLabels()).toEqual(["Trash"]);

    press("ArrowDown");
    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main?view=trash");
    expect(localStorage.getItem("search-history:main")).toBeNull();
  });

  it("reaches a destination while the file search is still loading", async () => {
    mockGetDriveFiles.mockReturnValue(new Promise(() => {}));
    render(<GlobalSearch />);
    await openAndType("all files");
    await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());

    press("ArrowDown");
    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main?view=all");
  });

  it("still opens the search page on Enter with nothing highlighted", async () => {
    render(<GlobalSearch />);
    await openAndType("trash");
    expect(jumpLabels()).toEqual(["Trash"]);

    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=trash");
  });

  it("keeps a highlighted destination when file results arrive", async () => {
    const files = deferred<ReturnType<typeof page>>();
    mockGetDriveFiles.mockReturnValue(files.promise);
    render(<GlobalSearch />);
    await openAndType("trash");
    press("ArrowDown");
    await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());

    await act(async () => {
      files.resolve(page([file("f1", "trash-notes")]));
    });
    expect(screen.getByText("trash-notes")).toBeInTheDocument();
    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main?view=trash");
  });

  it("keeps a highlighted file when destinations arrive late", async () => {
    const pins = deferred<{ path: string }[]>();
    mockGetPins.mockReturnValue(pins.promise);
    mockGetDriveFiles.mockResolvedValue(page([file("p1", "photo one"), file("p2", "photo two")]));
    render(<GlobalSearch />);
    await openAndType("photo");
    await waitFor(() => expect(screen.getByText("photo two")).toBeInTheDocument());
    expect(screen.queryByText("Go to")).toBeNull();
    press("ArrowDown");
    press("ArrowDown");

    await act(async () => {
      pins.resolve([{ path: "trips/photos" }]);
    });
    expect(jumpLabels()).toEqual(["photos"]);
    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/files/p2");
  });

  it("drops the previous drive's destinations as soon as the drive changes", async () => {
    mockGetPins.mockImplementation((drive: string) =>
      drive === "main" ? Promise.resolve([{ path: "photos" }]) : new Promise(() => {}),
    );
    const { rerender } = render(<GlobalSearch />);
    await openAndType("photos");
    await waitFor(() => expect(jumpLabels()).toEqual(["photos"]));

    driveState.current = "other";
    rerender(<GlobalSearch />);

    expect(jumpLabels()).toEqual([]);
  });

  it.each([
    ["missing", { missing_count: 0 }, { is_admin: true }, []],
    ["missing", { missing_count: 2 }, { is_admin: false }, ["Missing Files"]],
    ["admin", { missing_count: 2 }, { is_admin: false }, []],
    ["admin", { missing_count: 0 }, { is_admin: true }, ["Dashboard"]],
  ])(
    "shows %s only under the sidebar's condition (%o, %o)",
    async (query, summary, auth, expected) => {
      mockGetDriveSummary.mockResolvedValue(summary);
      mockGetAuthStatus.mockResolvedValue(auth);
      render(<GlobalSearch />);
      await openAndType(query);
      await waitFor(() => expect(mockGetAuthStatus).toHaveBeenCalled());
      await act(async () => {});
      expect(jumpLabels()).toEqual(expected);
    },
  );

  it("pins the collection's drive before opening it", async () => {
    mockGetCollections.mockResolvedValue([
      { id: "c1", name: "Road trip", drive: "main", description: null, item_count: 0, first_file_id: null, created_at: "", updated_at: "" },
    ]);
    render(<GlobalSearch />);
    await openAndType("road");
    await waitFor(() => expect(jumpLabels()).toEqual(["Road trip"]));

    fireEvent.click(screen.getByText("Road trip"));

    expect(mockSetOverrideDrive).toHaveBeenCalledWith("main");
    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/collections/c1");
  });

  it("opens a smart folder at its saved search", async () => {
    mockGetSmartFolders.mockResolvedValue([
      { id: "s1", drive: "main", name: "Clips", query: "cat", file_type: "video", sort_by: null },
    ]);
    render(<GlobalSearch />);
    await openAndType("clips");
    await waitFor(() => expect(jumpLabels()).toEqual(["Clips"]));

    fireEvent.click(screen.getByText("Clips"));

    expect(mockRouterPush).toHaveBeenCalledWith(
      "/drive/main/search?q=cat&type=video&smart_folder_id=s1",
    );
  });
});

describe("GlobalSearch folder jump", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    driveState.current = "main";
    mockGetDriveFiles.mockResolvedValue(page([]));
    mockGetPins.mockResolvedValue([]);
    mockGetCollections.mockResolvedValue([]);
    mockGetSmartFolders.mockResolvedValue([]);
    mockGetDriveSummary.mockResolvedValue({ missing_count: 0 });
    mockGetAuthStatus.mockResolvedValue({ is_admin: false });
    mockGetFolderTree.mockResolvedValue([
      folder("trips"),
      folder("trips/kyoto"),
      folder("a b"),
      folder("a b/c#d"),
    ]);
  });

  it("lists folders by their own name, with the parent path beside them", async () => {
    render(<GlobalSearch />);
    await openAndType("kyoto");
    await waitFor(() => expect(folderLabels()).toEqual(["kyototrips"]));
    expect(mockGetFolderTree).toHaveBeenCalledWith("main", { flat: true });
  });

  it("names the drive root as the parent of a top-level folder", async () => {
    render(<GlobalSearch />);
    await openAndType("trips");
    await waitFor(() => expect(folderLabels()).toEqual(["tripsDrive root"]));
  });

  it("opens a folder with zero file results, without recording the query", async () => {
    render(<GlobalSearch />);
    await openAndType("c#d");
    await waitFor(() => expect(folderLabels()).toHaveLength(1));

    press("ArrowDown");
    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/a%20b/c%23d");
    expect(localStorage.getItem("search-history:main")).toBeNull();
  });

  it("still opens the search page on Enter with nothing highlighted", async () => {
    render(<GlobalSearch />);
    await openAndType("kyoto");
    await waitFor(() => expect(folderLabels()).toHaveLength(1));

    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=kyoto");
  });

  it("shows a pinned folder once, and keeps it highlighted when it moves to Go to", async () => {
    const pins = deferred<{ path: string }[]>();
    mockGetPins.mockReturnValue(pins.promise);
    render(<GlobalSearch />);
    await openAndType("kyoto");
    await waitFor(() => expect(folderLabels()).toEqual(["kyototrips"]));
    press("ArrowDown");

    await act(async () => {
      pins.resolve([{ path: "trips/kyoto" }]);
    });
    expect(jumpLabels()).toEqual(["kyoto"]);
    expect(folderLabels()).toEqual([]);
    press("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/trips/kyoto");
  });

  it("drops the previous drive's folders as soon as the drive changes", async () => {
    mockGetFolderTree.mockImplementation((drive: string) =>
      drive === "main" ? Promise.resolve([folder("trips")]) : new Promise(() => {}),
    );
    const { rerender } = render(<GlobalSearch />);
    await openAndType("trips");
    await waitFor(() => expect(folderLabels()).toHaveLength(1));

    driveState.current = "other";
    rerender(<GlobalSearch />);

    expect(folderLabels()).toEqual([]);
  });
});

describe("GlobalSearch page jump with operators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    driveState.current = "main";
    mockGetDriveFiles.mockResolvedValue(page([]));
    mockGetPins.mockResolvedValue([]);
    mockGetCollections.mockResolvedValue([]);
    mockGetSmartFolders.mockResolvedValue([]);
    mockGetDriveSummary.mockResolvedValue({ missing_count: 0 });
    mockGetAuthStatus.mockResolvedValue({ is_admin: false });
    mockGetFolderTree.mockResolvedValue([folder("trash")]);
  });

  it("offers no Go to or Folders rows once an operator is typed", async () => {
    render(<GlobalSearch />);
    await openAndType("trash");
    await waitFor(() => expect(jumpLabels()).toEqual(["Trash"]));
    expect(folderLabels()).toHaveLength(1);

    await act(async () => {
      fireEvent.change(input(), { target: { value: "trash tag:x" } });
    });
    expect(jumpLabels()).toEqual([]);
    expect(folderLabels()).toEqual([]);
  });

  it("opens the search page with the whole query on Enter", async () => {
    render(<GlobalSearch />);
    await openAndType("tag:x");
    press("Enter");
    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main/search?q=tag%3Ax");
  });
});
