/**
 * SPEC-CORE-043: the results header's 「＋ 条件」 menu grows a folder list and a
 * collection list, and a choice appends exactly one token the parser reads back.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { parseSearchQuery } from "@/lib/searchQuery";
import type { CollectionSummary, FolderTreeNode } from "@/types";

import { SearchQueryHeader } from "../SearchQueryHeader";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => "/drive/main/search",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const api = vi.hoisted(() => ({
  getDriveTags: vi.fn(),
  getFolderTree: vi.fn(),
  getCollections: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getDriveTags: (...args: unknown[]) => api.getDriveTags(...args),
  getFolderTree: (...args: unknown[]) => api.getFolderTree(...args),
  getCollections: (...args: unknown[]) => api.getCollections(...args),
}));

const folder = (path: string): FolderTreeNode => ({
  kind: "folder",
  name: path.split("/").at(-1) ?? "",
  path,
  file_count: 0,
  has_children: false,
});

const collection = (name: string, updated_at: string): CollectionSummary => ({
  id: `id-${name}`,
  name,
  description: null,
  drive: "main",
  item_count: 0,
  first_file_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at,
});

function renderHeader(overrides: Record<string, unknown> = {}) {
  return render(
    <SearchQueryHeader
      drive="main"
      query="cats"
      typeFilter={null}
      sort="relevance"
      order="desc"
      smartFolderId={null}
      includeSceneClip={false}
      {...overrides}
    />,
  );
}

const trigger = () => screen.getByRole("button", { name: "Add filter" });

const openRoot = () => fireEvent.click(trigger());
const openFolderList = () => {
  openRoot();
  fireEvent.click(screen.getByRole("menuitem", { name: "Folder" }));
};

const openCollectionList = () => {
  openRoot();
  fireEvent.click(screen.getByRole("menuitem", { name: "Collection" }));
};

const menuRows = () =>
  screen.queryAllByRole("menuitem").map((row) => row.textContent ?? "");

const pushed = () => {
  expect(mockPush).toHaveBeenCalledTimes(1);
  const raw = mockPush.mock.calls[0][0] as string;
  const url = new URL(raw, "http://localhost");
  return { pathname: url.pathname, q: url.searchParams.get("q") };
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getDriveTags.mockResolvedValue([]);
  api.getFolderTree.mockResolvedValue([]);
  api.getCollections.mockResolvedValue([]);
});

describe("SPEC-CORE-043 I9 the menu's first level", () => {
  it("keeps the trigger's visible word while naming it Add filter", () => {
    renderHeader();

    // The extracted ConditionMenu takes its visible text from the caller:
    // the search page still shows the short word, and the accessible name
    // stays the one the screen reader had before the extraction.
    const button = trigger();
    expect(button.textContent).toBe("＋Filter");
    expect(button.getAttribute("aria-label")).toBe("Add filter");
  });

  it("offers Tag, Type, Folder, Collection, Favorites in that order", () => {
    renderHeader();
    openRoot();

    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((row) => row.textContent?.trim()),
    ).toEqual(["Tag", "Type", "Folder", "Collection", "Size", "Length", "Favorites"]);
  });
});

describe("SPEC-CORE-043 I9 choosing a folder", () => {  it("loads the whole drive's flat tree and appends one bare path token", async () => {
    api.getFolderTree.mockResolvedValue([folder(""), folder("Photos"), folder("Photos/2024")]);
    renderHeader();

    openFolderList();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Photos\/2024/ }));

    expect(api.getFolderTree).toHaveBeenCalledWith("main", { flat: true });
    const { pathname, q } = pushed();
    expect(pathname).toBe("/drive/main/search");
    expect(q).toBe("cats path:Photos/2024");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("quotes a folder whose path contains whitespace", async () => {
    api.getFolderTree.mockResolvedValue([folder("My Photos")]);
    renderHeader();

    openFolderList();
    fireEvent.click(await screen.findByRole("menuitem", { name: /My Photos/ }));

    expect(pushed().q).toBe('cats path:"My Photos"');
    expect(parseSearchQuery('cats path:"My Photos"')).toMatchObject({
      text: "cats",
      folders: ["My Photos"],
    });
  });

  it("shows the last segment and the full path on one row", async () => {
    api.getFolderTree.mockResolvedValue([folder("Photos/2024")]);
    renderHeader();

    openFolderList();
    const row = await screen.findByRole("menuitem", { name: /Photos\/2024/ });

    expect(row.textContent).toContain("2024");
    expect(row.textContent).toContain("Photos/2024");
  });
});

describe("SPEC-CORE-043 item 6 the menu's writer quotes a value with whitespace", () => {
  it("quotes a tag whose name contains a space", async () => {
    api.getDriveTags.mockResolvedValue([{ name: "two words", count: 1 }]);
    renderHeader();

    openRoot();
    fireEvent.click(screen.getByRole("menuitem", { name: "Tag" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "two words" }));

    expect(pushed().q).toBe('cats tag:"two words"');
    expect(parseSearchQuery('cats tag:"two words"')).toMatchObject({
      tags: ["two words"],
      text: "cats",
    });
  });

  it("never offers a folder or collection containing a quote", async () => {
    api.getFolderTree.mockResolvedValue([folder('He said "hi"')]);
    const folders = renderHeader();
    openFolderList();
    await waitFor(() => expect(api.getFolderTree).toHaveBeenCalled());
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    folders.unmount();

    api.getCollections.mockResolvedValue([
      collection("Ａ＂full＂ B", "2026-03-01T00:00:00Z"),
    ]);
    renderHeader();
    openCollectionList();
    await waitFor(() => expect(api.getCollections).toHaveBeenCalled());
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });
});

describe("SPEC-CORE-043 I11 nothing already in the query is offered", () => {
  it("leaves out the drive root and the folders already in the query", async () => {
    api.getFolderTree.mockResolvedValue([
      folder(""),
      folder("Photos"),
      folder("Photos/2024"),
      folder("Trips"),
    ]);
    renderHeader({ query: "path:Photos" });

    openFolderList();
    await screen.findByRole("menuitem", { name: /Trips/ });

    const rows = menuRows();
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.includes("Photos/2024"))).toBe(true);
    expect(rows.some((row) => row.includes("Trips"))).toBe(true);
  });

  it("leaves out collection names already in the query, case-insensitively", async () => {
    api.getCollections.mockResolvedValue([
      collection("Trip", "2026-03-01T00:00:00Z"),
      collection("Work", "2026-02-01T00:00:00Z"),
    ]);
    renderHeader({ query: "in:trip" });

    openCollectionList();
    await screen.findByRole("menuitem", { name: /Work/ });

    expect(menuRows().some((row) => row.toLowerCase().includes("trip"))).toBe(false);
  });
});

describe("SPEC-CORE-043 I11 a list is capped at eight options", () => {
  it("renders at most eight folders", async () => {
    api.getFolderTree.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => folder(`Folder${i}`)),
    );
    renderHeader();

    openFolderList();
    await screen.findByRole("menuitem", { name: /Folder0/ });

    expect(screen.getAllByRole("menuitem")).toHaveLength(8);
  });

  it("renders at most eight collections", async () => {
    api.getCollections.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) =>
        collection(`Collection${i}`, `2026-01-0${i + 1}T00:00:00Z`),
      ),
    );
    renderHeader();

    openCollectionList();
    await screen.findByRole("menuitem", { name: /Collection0/ });

    expect(screen.getAllByRole("menuitem")).toHaveLength(8);
  });
});

describe("SPEC-CORE-043 I11 the folder list's ranking", () => {
  it("puts last-segment prefix matches before substring matches, shallower first", async () => {
    api.getFolderTree.mockResolvedValue([
      folder("Archive/old-photos"),
      folder("Photos/2024"),
      folder("Travel/Photos"),
      folder("Photos"),
    ]);
    renderHeader();

    openFolderList();
    fireEvent.change(screen.getByLabelText("Filter folders"), {
      target: { value: "photos" },
    });
    await waitFor(() => expect(menuRows().length).toBeGreaterThan(0));

    const rows = menuRows();
    expect(rows[0]).toContain("Photos");
    expect(rows[0]).not.toContain("Travel");
    expect(rows[1]).toContain("Travel/Photos");
    expect(rows[2]).toContain("Archive/old-photos");
    expect(rows[3]).toContain("Photos/2024");
  });

  it("folds NFKC and case for the comparison only", async () => {
    api.getFolderTree.mockResolvedValue([folder("ＰＨＯＴＯＳ")]);
    renderHeader();

    openFolderList();
    fireEvent.change(screen.getByLabelText("Filter folders"), {
      target: { value: "photos" },
    });
    await waitFor(() => expect(menuRows().length).toBeGreaterThan(0));

    expect(menuRows().some((row) => row.includes("ＰＨＯＴＯＳ"))).toBe(true);
  });
});

describe("SPEC-CORE-043 I11 the collection list's ranking", () => {
  it("keeps the API's updated_at order within the prefix group", async () => {
    api.getCollections.mockResolvedValue([
      collection("trip", "2026-03-01T00:00:00Z"),
      collection("Travel", "2026-02-01T00:00:00Z"),
      collection("Ecotrip", "2026-01-01T00:00:00Z"),
    ]);
    renderHeader();

    openCollectionList();
    fireEvent.change(screen.getByLabelText("Filter collections"), {
      target: { value: "tr" },
    });
    await waitFor(() => expect(menuRows().length).toBeGreaterThan(0));

    const rows = menuRows();
    expect(rows[0]).toContain("trip");
    expect(rows[1]).toContain("Travel");
    expect(rows[2]).toContain("Ecotrip");
  });

  it("appends in:<name>, quoting a name with whitespace", async () => {
    api.getCollections.mockResolvedValue([
      collection("旅行 メモ", "2026-03-01T00:00:00Z"),
    ]);
    renderHeader();

    openCollectionList();
    fireEvent.click(await screen.findByRole("menuitem", { name: /旅行 メモ/ }));

    expect(pushed().q).toBe('cats in:"旅行 メモ"');
    expect(parseSearchQuery('cats in:"旅行 メモ"')).toMatchObject({
      text: "cats",
      collections: ["旅行 メモ"],
    });
  });
});

describe("SPEC-CORE-043 I11 a value list's states", () => {
  it("shows loading, then the folders, with nothing to choose before they arrive", async () => {
    let settle: (nodes: FolderTreeNode[]) => void = () => {};
    api.getFolderTree.mockReturnValue(
      new Promise<FolderTreeNode[]>((resolve) => {
        settle = resolve;
      }),
    );
    renderHeader();

    openFolderList();

    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    const loadingText = screen.getByRole("menu").textContent ?? "";

    settle([folder("Photos")]);
    await screen.findByRole("menuitem", { name: /Photos/ });
    expect(screen.getByRole("menu").textContent).not.toBe(loadingText);
  });

  it("reports a failure instead of loading forever, and appends nothing", async () => {
    let fail: (error: Error) => void = () => {};
    api.getFolderTree.mockReturnValue(
      new Promise<FolderTreeNode[]>((_resolve, reject) => {
        fail = reject;
      }),
    );
    renderHeader();

    openFolderList();
    const loadingText = screen.getByRole("menu").textContent ?? "";

    fail(new Error("offline"));
    await waitFor(() =>
      expect(screen.getByRole("menu").textContent).not.toBe(loadingText),
    );

    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("the none and no-match rows read differently", async () => {
    api.getFolderTree.mockResolvedValue([]);
    const empty = renderHeader();
    openFolderList();
    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));
    const noneText = screen.getByRole("menu").textContent ?? "";
    empty.unmount();

    api.getFolderTree.mockResolvedValue([folder("Photos")]);
    renderHeader();
    openFolderList();
    await screen.findByRole("menuitem", { name: /Photos/ });
    fireEvent.change(screen.getByLabelText("Filter folders"), {
      target: { value: "zzz" },
    });
    const noMatchText = screen.getByRole("menu").textContent ?? "";
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);

    expect(noneText).not.toBe("");
    expect(noMatchText).not.toBe(noneText);
  });

  it("loads the tree again on the next opening", async () => {
    let settle: (nodes: FolderTreeNode[]) => void = () => {};
    api.getFolderTree
      .mockResolvedValueOnce([folder("Photos")])
      .mockReturnValueOnce(
        new Promise<FolderTreeNode[]>((resolve) => {
          settle = resolve;
        }),
      );
    renderHeader();

    openFolderList();
    await screen.findByRole("menuitem", { name: /Photos/ });

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Folder" }));

    expect(api.getFolderTree).toHaveBeenCalledTimes(2);
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);

    settle([folder("Trips")]);
    await screen.findByRole("menuitem", { name: /Trips/ });
  });

  it("the collection list has the same four states", async () => {
    let settle: (items: CollectionSummary[]) => void = () => {};
    api.getCollections.mockReturnValue(
      new Promise<CollectionSummary[]>((resolve) => {
        settle = resolve;
      }),
    );
    renderHeader();

    openCollectionList();
    const loadingText = screen.getByRole("menu").textContent ?? "";
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);

    settle([]);
    await waitFor(() =>
      expect(screen.getByRole("menu").textContent).not.toBe(loadingText),
    );
    expect(api.getCollections).toHaveBeenCalledWith("main");
  });

  it("the collection list reports a failure and loads again on the next opening", async () => {
    let fail: (error: Error) => void = () => {};
    api.getCollections.mockReturnValueOnce(
      new Promise<CollectionSummary[]>((_resolve, reject) => {
        fail = reject;
      }),
    );
    renderHeader();

    openCollectionList();
    const loadingText = screen.getByRole("menu").textContent ?? "";
    fail(new Error("offline"));
    await waitFor(() =>
      expect(screen.getByRole("menu").textContent).not.toBe(loadingText),
    );
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();

    let settle: (items: CollectionSummary[]) => void = () => {};
    api.getCollections.mockReturnValueOnce(
      new Promise<CollectionSummary[]>((resolve) => {
        settle = resolve;
      }),
    );
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Collection" }));

    expect(api.getCollections).toHaveBeenCalledTimes(2);
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);

    settle([collection("Trip", "2026-03-01T00:00:00Z")]);
    await screen.findByRole("menuitem", { name: /Trip/ });
  });

  it("the collection none and no-match rows read differently", async () => {
    api.getCollections.mockResolvedValue([]);
    const empty = renderHeader();
    openCollectionList();
    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));
    const noneText = screen.getByRole("menu").textContent ?? "";
    empty.unmount();

    api.getCollections.mockResolvedValue([
      collection("Trip", "2026-03-01T00:00:00Z"),
    ]);
    renderHeader();
    openCollectionList();
    await screen.findByRole("menuitem", { name: /Trip/ });
    fireEvent.change(screen.getByLabelText("Filter collections"), {
      target: { value: "zzz" },
    });
    const noMatchText = screen.getByRole("menu").textContent ?? "";
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);

    expect(noneText).not.toBe("");
    expect(noMatchText).not.toBe(noneText);
  });
});

describe("SPEC-CORE-043 I11 the first level disables a full list", () => {
  const tenFolders = Array.from({ length: 10 }, (_, i) => `path:f${i}`).join(" ");
  const tenCollections = Array.from({ length: 10 }, (_, i) => `in:c${i}`).join(" ");

  it("disables Folder at ten distinct folders and enables it at nine", () => {
    const { unmount } = renderHeader({ query: tenFolders });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Folder" })).toBeDisabled();
    unmount();

    renderHeader({ query: tenFolders.split(" ").slice(0, 9).join(" ") });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Folder" })).toBeEnabled();
  });

  it("disables Collection at ten distinct collections and enables it at nine", () => {
    const { unmount } = renderHeader({ query: tenCollections });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Collection" })).toBeDisabled();
    unmount();

    renderHeader({ query: tenCollections.split(" ").slice(0, 9).join(" ") });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Collection" })).toBeEnabled();
  });
});

describe("SPEC-CORE-043 I13 a choice while a quoted value is open", () => {
  it("closes the quote, then appends a token of its own", async () => {
    api.getFolderTree.mockResolvedValue([folder("Work")]);
    renderHeader({ query: 'path:"My Ph' });

    openFolderList();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Work/ }));

    const q = pushed().q;
    expect(q).toBe('path:"My Ph" path:Work');
    expect(parseSearchQuery(q ?? "")).toMatchObject({
      folders: ["My Ph", "Work"],
    });
  });
});

describe("SPEC-CORE-043 rule 7 a menu choice on an empty field", () => {
  it("appends the chosen folder without touching an empty query", async () => {
    api.getFolderTree.mockResolvedValue([folder("Work")]);
    renderHeader({ query: "" });

    fireEvent.change(screen.getByRole("textbox", { name: "Search query" }), {
      target: { value: "" },
    });

    openFolderList();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Work/ }));

    expect(pushed().q).toBe("path:Work");
    expect(parseSearchQuery("path:Work")).toMatchObject({
      folders: ["Work"],
      text: "",
    });
  });
});
