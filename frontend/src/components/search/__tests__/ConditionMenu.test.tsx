/**
 * SPEC-CORE-044: the search page's 「＋ 条件」 menu is an exported
 * ``ConditionMenu``. It draws the first-level entries the caller lists, in
 * that order, appends the chosen token to ``query`` (closing an open quote
 * first), applies ``typeFilter``'s kind exclusions, and submits nothing
 * itself.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { CollectionSummary, FileKind, FolderTreeNode } from "@/types";

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

const collection = (name: string): CollectionSummary => ({
  id: `id-${name}`,
  name,
  description: null,
  drive: "main",
  item_count: 1,
  first_file_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

type ConditionEntry = "tag" | "kind" | "folder" | "collection" | "favorite";

const ROOT_LABEL: Record<ConditionEntry, string> = {
  tag: "Tag",
  kind: "Type",
  folder: "Folder",
  collection: "Collection",
  favorite: "Favorites",
};

async function renderMenu({
  query = "cats",
  typeFilter = null as FileKind | null,
  entries = ["tag", "kind", "folder", "collection"] as ConditionEntry[],
  onChoose = vi.fn(),
} = {}) {
  const { ConditionMenu } = await vi.importActual<{
    ConditionMenu: React.ComponentType<{
      drive: string;
      query: string;
      typeFilter: FileKind | null;
      entries: ConditionEntry[];
      label: string;
      onChoose: (next: string) => void;
    }>;
  }>("../ConditionMenu");
  render(
    <ConditionMenu
      drive="main"
      query={query}
      typeFilter={typeFilter}
      entries={entries}
      label="＋ 条件"
      onChoose={onChoose}
    />,
  );
  return { onChoose };
}

const openRoot = () =>
  fireEvent.click(screen.getByRole("button", { name: "＋ 条件" }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getDriveTags.mockResolvedValue([]);
  api.getFolderTree.mockResolvedValue([]);
  api.getCollections.mockResolvedValue([]);
});

describe("SPEC-CORE-044 ConditionMenu", () => {
  it("draws only the requested entries, in the given order", async () => {
    await renderMenu({ entries: ["folder", "tag"] });
    openRoot();

    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((row) => row.textContent?.trim()),
    ).toEqual(["Folder", "Tag"]);
  });

  const cases: Array<{
    id: string;
    entry: ConditionEntry;
    load: () => void;
    option: RegExp;
    expected: string;
  }> = [
    {
      id: "folder",
      entry: "folder" as const,
      load: () => {
        api.getFolderTree.mockResolvedValue([folder("My Photos")]);
      },
      option: /My Photos/,
      expected: 'cats path:"My Photos"',
    },
    {
      id: "collection",
      entry: "collection" as const,
      load: () => {
        api.getCollections.mockResolvedValue([collection("読書 メモ")]);
      },
      option: /読書 メモ/,
      expected: 'cats in:"読書 メモ"',
    },
    {
      id: "tag",
      entry: "tag" as const,
      load: () => api.getDriveTags.mockResolvedValue([{ name: "会議", count: 2 }]),
      option: /会議/,
      expected: "cats tag:会議",
    },
    {
      id: "kind",
      entry: "kind" as const,
      load: () => undefined,
      option: /Video/,
      expected: "cats type:video",
    },
  ];
  it.each(cases)(
    "appends the chosen $id token to the query and calls onChoose",
    async ({ entry, load, option, expected }) => {
      load();
      const { onChoose } = await renderMenu({ entries: [entry] });
      openRoot();
      fireEvent.click(screen.getByRole("menuitem", { name: ROOT_LABEL[entry] }));
      fireEvent.click(await screen.findByRole("menuitem", { name: option }));

      await waitFor(() => expect(onChoose).toHaveBeenCalledTimes(1));
      expect(onChoose).toHaveBeenCalledWith(expected);
    },
  );

  it("closes an open quoted value before appending", async () => {
    const { onChoose } = await renderMenu({
      query: 'cats tag:"foo',
      entries: ["kind"],
    });
    openRoot();
    fireEvent.click(screen.getByRole("menuitem", { name: "Type" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Video" }));

    expect(onChoose).toHaveBeenCalledWith('cats tag:"foo" type:video');
  });

  it("removes the kinds typeFilter already selects", async () => {
    await renderMenu({ entries: ["kind"], typeFilter: "video" });
    openRoot();
    fireEvent.click(screen.getByRole("menuitem", { name: "Type" }));

    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("offers Favorites only when the caller lists it", async () => {
    await renderMenu({ entries: ["tag"] });
    openRoot();

    expect(
      screen.queryByRole("menuitem", { name: "Favorites" }),
    ).not.toBeInTheDocument();
  });

  it("submits nothing itself: a choice is only onChoose", async () => {
    api.getFolderTree.mockResolvedValue([folder("Photos")]);
    const { onChoose } = await renderMenu({ entries: ["folder"] });
    openRoot();
    fireEvent.click(screen.getByRole("menuitem", { name: "Folder" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Photos/ }));

    expect(onChoose).toHaveBeenCalledWith("cats path:Photos");
  });
});
