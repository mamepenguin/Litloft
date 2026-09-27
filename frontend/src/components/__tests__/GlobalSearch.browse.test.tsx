import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GlobalSearch } from "../GlobalSearch";
import { confirmConversionThenEnter } from "@/__tests__/helpers/imeEnter";
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
const mockGetDriveTags = vi.fn();
const mockGetFolderTree = vi.fn();
const mockGetCollections = vi.fn();
const mockGetSmartFolders = vi.fn();
const mockGetDriveSummary = vi.fn();
const mockGetAuthStatus = vi.fn();
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: () => Promise.resolve([]),
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
  getDriveTags: (...args: unknown[]) => mockGetDriveTags(...args),
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

const page = (data: FileItem[]) => ({ data, meta: { total: data.length, page: 1, limit: 8 } });

const input = () => screen.getAllByRole("textbox")[0];
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


type Params = { flat?: boolean; root?: string; include_files?: boolean };
const LEVELS: Record<string, unknown[]> = {
  "": [folder("trips"), { kind: "file", name: "readme.md", path: "readme.md", file_id: "r1", file_type: "document" }],
  trips: [folder("trips/kyoto"), { kind: "file", name: "plan.md", path: "trips/plan.md", file_id: "p1", file_type: "document" }],
  "trips/kyoto": [{ kind: "file", name: "temple.jpg", path: "trips/kyoto/temple.jpg", file_id: "t1", file_type: "image" }],
};

const chip = () => screen.queryByLabelText("Stop browsing")?.parentElement ?? null;
const rowNames = () =>
  Array.from(document.querySelectorAll("[data-search-item] > button:first-child"), (b) => b.textContent);
const inputValue = () => (input() as HTMLInputElement).value;
const typeKey = (key: string) => fireEvent.keyDown(input(), { key });
const typeSlash = () => act(async () => {
  fireEvent.change(input(), { target: { value: "/" } });
});

async function openModal() {
  fireEvent.click(screen.getByLabelText("Search"));
  await act(async () => {});
}

describe("GlobalSearch folder browse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    driveState.current = "main";
    mockGetDriveFiles.mockResolvedValue(page([]));
    mockGetPins.mockResolvedValue([]);
    mockGetDriveTags.mockResolvedValue([]);
    mockGetCollections.mockResolvedValue([]);
    mockGetSmartFolders.mockResolvedValue([]);
    mockGetDriveSummary.mockResolvedValue({ missing_count: 0 });
    mockGetAuthStatus.mockResolvedValue({ is_admin: false });
    mockGetFolderTree.mockImplementation((_drive: string, params: Params) =>
      Promise.resolve(params.flat ? [folder("trips"), folder("trips/kyoto")] : LEVELS[params.root ?? ""] ?? []),
    );
  });

  it("starts at the drive root on / in an empty input, without typing it", async () => {
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toEqual(["trips", "readme.md"]));
    expect(chip()?.textContent).toBe("Drive root");
    expect(inputValue()).toBe("");
    expect(mockGetFolderTree).toHaveBeenCalledWith("main", { root: "", include_files: true }, expect.anything());
  });

  it("types / as text after other text", async () => {
    render(<GlobalSearch />);
    await openAndType("a/");
    expect(inputValue()).toBe("a/");
    expect(chip()).toBeNull();
  });

  it("does not climb on a held Backspace or a modified ←", async () => {
    render(<GlobalSearch />);
    await openAndType("kyoto");
    await waitFor(() => expect(folderLabels()).toHaveLength(1));
    typeKey("ArrowDown");
    typeKey("ArrowRight");
    await waitFor(() => expect(chip()?.textContent).toBe("trips/kyoto"));

    fireEvent.keyDown(input(), { key: "Backspace", repeat: true });
    fireEvent.keyDown(input(), { key: "ArrowLeft", metaKey: true });
    expect(chip()?.textContent).toBe("trips/kyoto");
  });

  it("goes up with the chip's up button, which the drive root does not have", async () => {
    render(<GlobalSearch />);
    await openAndType("kyoto");
    await waitFor(() => expect(folderLabels()).toHaveLength(1));
    typeKey("ArrowDown");
    typeKey("ArrowRight");
    await waitFor(() => expect(chip()?.textContent).toBe("trips/kyoto"));

    fireEvent.click(screen.getByLabelText("Up one level"));
    await waitFor(() => expect(chip()?.textContent).toBe("trips"));
    fireEvent.click(screen.getByLabelText("Up one level"));
    await waitFor(() => expect(chip()?.textContent).toBe("Drive root"));
    expect(screen.queryByLabelText("Up one level")).toBeNull();
  });

  it("enters a highlighted folder row on →, and goes up on ← and Backspace in an empty input", async () => {
    render(<GlobalSearch />);
    await openAndType("kyoto");
    await waitFor(() => expect(folderLabels()).toEqual(["kyototrips"]));
    typeKey("ArrowDown");
    typeKey("ArrowRight");
    await waitFor(() => expect(rowNames()).toEqual(["temple.jpg"]));
    expect(chip()?.textContent).toBe("trips/kyoto");
    expect(inputValue()).toBe("");

    typeKey("ArrowLeft");
    await waitFor(() => expect(rowNames()).toEqual(["kyoto", "plan.md"]));
    typeKey("Backspace");
    await waitFor(() => expect(rowNames()).toEqual(["trips", "readme.md"]));
    typeKey("ArrowLeft");
    expect(chip()).toBeNull();
  });

  it("filters the level by name, and leaves ← and Backspace to the text", async () => {
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    await act(async () => {
      fireEvent.change(input(), { target: { value: "READ" } });
    });
    expect(rowNames()).toEqual(["readme.md"]);
    expect(typeKey("ArrowLeft")).toBe(true);
    expect(typeKey("Backspace")).toBe(true);
    expect(chip()?.textContent).toBe("Drive root");
  });

  it("descends with → from a browsed subfolder", async () => {
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    typeKey("ArrowDown");
    typeKey("ArrowRight");
    await waitFor(() => expect(chip()?.textContent).toBe("trips"));
  });

  it.each([
    ["the highlighted file", 2, "/files/p1"],
    ["the highlighted folder", 1, "/drive/main/trips/kyoto"],
    ["the browsed folder with nothing highlighted", 0, "/drive/main/trips"],
  ])("opens %s on Enter", async (_, downs, href) => {
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    typeKey("ArrowDown");
    typeKey("ArrowRight");
    await waitFor(() => expect(chip()?.textContent).toBe("trips"));
    await waitFor(() => expect(rowNames()).toEqual(["kyoto", "plan.md"]));
    for (let i = 0; i < downs; i++) typeKey("ArrowDown");
    typeKey("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith(href);
  });

  it.each([
    ["a filtered row", 1, "/files/r1"],
    ["the folder, with filter text and nothing highlighted", 0, "/drive/main"],
  ])("does not record the filter text as a search when opening %s", async (_, downs, href) => {
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    await act(async () => {
      fireEvent.change(input(), { target: { value: "read" } });
    });
    for (let i = 0; i < downs; i++) typeKey("ArrowDown");
    typeKey("Enter");

    expect(mockRouterPush).toHaveBeenCalledWith(href);
    expect(localStorage.getItem("search-history:main")).toBeNull();
  });

  it("does not start browsing on a / typed while composing", async () => {
    render(<GlobalSearch />);
    await openModal();
    fireEvent.compositionStart(input());
    await act(async () => {
      fireEvent.input(input(), { target: { value: "/" }, isComposing: true });
    });
    expect(chip()).toBeNull();
    expect(inputValue()).toBe("/");
  });

  it("opens the Library for the drive root", async () => {
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    typeKey("Enter");
    expect(mockRouterPush).toHaveBeenCalledWith("/drive/main");
  });

  it("does not open a row on the Enter that confirms a conversion", async () => {
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    confirmConversionThenEnter(input(), "れ");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("never shows a level it has already left", async () => {
    const trips = deferred<unknown[]>();
    mockGetFolderTree.mockImplementation((_drive: string, params: Params) =>
      params.root === "trips" ? trips.promise : Promise.resolve(LEVELS[params.root ?? ""] ?? []),
    );
    render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    typeKey("ArrowDown");
    typeKey("ArrowRight");
    typeKey("ArrowLeft");
    await waitFor(() => expect(rowNames()).toEqual(["trips", "readme.md"]));

    await act(async () => {
      trips.resolve(LEVELS.trips);
    });
    expect(rowNames()).toEqual(["trips", "readme.md"]);
  });

  it("leaves browse mode when the drive changes", async () => {
    const { rerender } = render(<GlobalSearch />);
    await openModal();
    await typeSlash();
    await waitFor(() => expect(chip()).not.toBeNull());

    driveState.current = "other";
    rerender(<GlobalSearch />);

    expect(chip()).toBeNull();
  });
});
