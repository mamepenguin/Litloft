/**
 * SPEC-CORE-172 「＋ 条件」: the first level gains Untagged and In no
 * collection, each appending one token and submitting once, and no choice
 * repeats a token held in either polarity or makes the query impossible.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

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
  getSmartFolders: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getDriveTags: (...args: unknown[]) => api.getDriveTags(...args),
  getFolderTree: (...args: unknown[]) => api.getFolderTree(...args),
  getCollections: (...args: unknown[]) => api.getCollections(...args),
  getSmartFolders: (...args: unknown[]) => api.getSmartFolders(...args),
}));

const folder = (path: string): FolderTreeNode => ({
  kind: "folder",
  name: path.split("/").at(-1) ?? "",
  path,
  file_count: 0,
  has_children: false,
});

const collection = (name: string): CollectionSummary => ({
  id: `id-${name}`,
  name,
  description: null,
  drive: "main",
  item_count: 0,
  first_file_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

function renderHeader(query: string) {
  return render(
    <SearchQueryHeader
      drive="main"
      query={query}
      typeFilter={null}
      sort="relevance"
      order="desc"
      smartFolderId={null}
      includeSceneClip={false}
    />,
  );
}

const openRoot = () => fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
const openList = (name: string) => {
  openRoot();
  fireEvent.click(screen.getByRole("menuitem", { name }));
};
const menuRows = () => screen.queryAllByRole("menuitem").map((row) => row.textContent?.trim() ?? "");
const entry = (name: string) => within(screen.getByRole("menu")).getByRole("menuitem", { name });

const pushedQuery = () => {
  expect(mockPush).toHaveBeenCalledTimes(1);
  return new URL(mockPush.mock.calls[0][0] as string, "http://localhost").searchParams.get("q");
};

type Parsed = ReturnType<typeof parseSearchQuery> & { noTag: boolean; noCollection: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  api.getDriveTags.mockResolvedValue([]);
  api.getFolderTree.mockResolvedValue([]);
  api.getCollections.mockResolvedValue([]);
  api.getSmartFolders.mockResolvedValue([]);
});

describe("SPEC-CORE-172 menu 1 the first level", () => {
  it("ends with Untagged and In no collection after Favorites", () => {
    renderHeader("cats");
    openRoot();

    expect(menuRows()).toEqual([
      "Tag",
      "Type",
      "Folder",
      "Collection",
      "Size",
      "Length",
      "Modified",
      "Favorites",
      "Untagged",
      "In no collection",
    ]);
  });

  it.each([
    ["Untagged", "cats -has:tag", "noTag"],
    ["In no collection", "cats -has:collection", "noCollection"],
  ] as const)("%s appends one token and submits once", (name, expected, flag) => {
    renderHeader("cats");
    openRoot();

    fireEvent.click(entry(name));

    const q = pushedQuery();
    expect(q).toBe(expected);
    expect((parseSearchQuery(q!) as Parsed)[flag]).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("SPEC-CORE-172 menu 2, I14 when the new entries are disabled", () => {
  it.each([
    ["-has:tag", "cats -has:tag", true],
    ["has:tag", "cats has:tag", true],
    ["a positive tag", "cats tag:x", true],
    ["only an excluded tag", "cats -tag:x", false],
  ])("Untagged with %s", (_name, query, disabled) => {
    renderHeader(query);
    openRoot();

    if (disabled) expect(entry("Untagged")).toBeDisabled();
    else expect(entry("Untagged")).toBeEnabled();
  });

  it.each([
    ["-has:collection", "cats -has:collection", true],
    ["has:collection", "cats has:collection", true],
    ["an in: name", 'cats in:"Trip"', false],
  ])("In no collection with %s", (_name, query, disabled) => {
    renderHeader(query);
    openRoot();

    if (disabled) expect(entry("In no collection")).toBeDisabled();
    else expect(entry("In no collection")).toBeEnabled();
  });
});

describe("SPEC-CORE-172 menu 3, I14 the existing entries and negated tokens", () => {
  it("disables Tag while the query holds -has:tag", () => {
    renderHeader("cats -has:tag");
    openRoot();

    expect(entry("Tag")).toBeDisabled();
  });

  it("disables Favorites while the query holds -is:favorite", () => {
    renderHeader("cats -is:favorite");
    openRoot();

    expect(entry("Favorites")).toBeDisabled();
  });

  it("leaves out a tag held negatively", async () => {
    api.getDriveTags.mockResolvedValue([
      { name: "会議", count: 5 },
      { name: "予算", count: 2 },
    ]);
    renderHeader("cats -tag:会議");

    openList("Tag");
    await screen.findByRole("menuitem", { name: /予算/ });

    expect(menuRows().some((row) => row.includes("会議"))).toBe(false);
  });

  it("leaves out a kind held negatively and the kinds it holds", () => {
    renderHeader("cats -type:document");

    openList("Type");

    const rows = menuRows();
    for (const held of ["Document", "PDF", "Text"]) expect(rows).not.toContain(held);
    expect(rows).toContain("Video");
  });

  it("leaves out a kind excluded by its own name only", () => {
    renderHeader("cats -type:pdf");

    openList("Type");

    const rows = menuRows();
    expect(rows).not.toContain("PDF");
    expect(rows).toContain("Document");
  });

  it("leaves out a folder held negatively and the folders inside it", async () => {
    api.getFolderTree.mockResolvedValue([
      folder(""),
      folder("Photos"),
      folder("Photos/2024"),
      folder("PhotosX"),
      folder("Trips"),
    ]);
    renderHeader("cats -path:Photos");

    openList("Folder");
    await screen.findByRole("menuitem", { name: /Trips/ });

    const rows = menuRows();
    expect(rows.some((row) => row.includes("Photos/2024"))).toBe(false);
    expect(rows.some((row) => row.includes("PhotosX"))).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("leaves out a collection held negatively, case-insensitively", async () => {
    api.getCollections.mockResolvedValue([collection("Trip"), collection("Work")]);
    renderHeader("cats -in:trip");

    openList("Collection");
    await screen.findByRole("menuitem", { name: /Work/ });

    expect(menuRows().some((row) => row.toLowerCase().includes("trip"))).toBe(false);
  });

  it("the folder cap counts positive folders only", () => {
    const tenExcluded = Array.from({ length: 10 }, (_, i) => `-path:f${i}`).join(" ");
    renderHeader(`cats -has:tag ${tenExcluded}`);
    openRoot();

    expect(entry("Folder")).toBeEnabled();
    expect(entry("Untagged")).toBeDisabled();
  });
});
