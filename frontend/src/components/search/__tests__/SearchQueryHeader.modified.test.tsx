/**
 * SPEC-CORE-138 「＋ 条件」 menu: 「更新日」 sits between 「長さ」 and 「お気に入り」,
 * offers three fixed presets, and a choice appends one token that parses back
 * with that preset's identity.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { operatorChips, parseSearchQuery } from "@/lib/searchQuery";
import ja from "@/messages-core/ja.json";

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

const PRESETS = ["Last 30 days", "Over a year ago", "Over 3 years ago"];

const trigger = () => screen.getByRole("button", { name: "Add filter" });

const openRoot = () => fireEvent.click(trigger());

const openList = (name: string) => {
  openRoot();
  fireEvent.click(screen.getByRole("menuitem", { name }));
};

const menu = () => screen.getByRole("menu");

const menuRows = () =>
  screen.queryAllByRole("menuitem").map((row) => row.textContent?.trim() ?? "");

const modifiedOf = (q: string | null): unknown[] | undefined =>
  (parseSearchQuery(q ?? "") as unknown as { modified?: unknown[] }).modified;

const pushed = () => {
  expect(mockPush).toHaveBeenCalledTimes(1);
  const raw = mockPush.mock.calls[0][0] as string;
  const url = new URL(raw, "http://localhost");
  return { pathname: url.pathname, q: url.searchParams.get("q") };
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 18, 3, 0, 0));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getDriveTags.mockResolvedValue([]);
  api.getFolderTree.mockResolvedValue([]);
  api.getCollections.mockResolvedValue([]);
});

describe("SPEC-CORE-138 menu the first level's order", () => {
  it("puts Modified between Length and Favorites", () => {
    renderHeader();
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
});

describe("SPEC-CORE-138 menu the fixed presets", () => {
  it("shows the three presets with no filter input and no request", () => {
    renderHeader();
    openList("Modified");

    for (const label of PRESETS) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    expect(within(menu()).queryByRole("textbox")).toBeNull();
    expect(api.getDriveTags).not.toHaveBeenCalled();
    expect(api.getFolderTree).not.toHaveBeenCalled();
    expect(api.getCollections).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-138 I20 a preset appends one token and submits once", () => {
  it.each([
    ["Last 30 days", "cats modified:>=30d"],
    ["Over a year ago", "cats modified:<1y"],
    ["Over 3 years ago", "cats modified:<3y"],
  ])("%s appends %s", (label, expected) => {
    renderHeader();

    openList("Modified");
    fireEvent.click(screen.getByRole("menuitem", { name: label }));

    const { pathname, q } = pushed();
    expect(pathname).toBe("/drive/main/search");
    expect(q).toBe(expected);
    expect(modifiedOf(q)).toHaveLength(1);
    expect(operatorChips(q ?? "").map((chip) => chip.operator)).toEqual(["modified"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes an open quote before it appends the token", () => {
    renderHeader({ query: 'path:"My Ph' });

    openList("Modified");
    fireEvent.click(screen.getByRole("menuitem", { name: "Over a year ago" }));

    expect(pushed().q).toBe('path:"My Ph" modified:<1y');
    expect(modifiedOf(pushed().q)).toHaveLength(1);
  });
});

describe("SPEC-CORE-138 I12 a preset already in the query is not offered", () => {
  it("leaves out the identity the query already holds, whatever the unit's case", () => {
    renderHeader({ query: "modified:<1Y" });

    openList("Modified");

    expect(screen.queryByRole("menuitem", { name: "Over a year ago" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Over 3 years ago" })).toBeInTheDocument();
  });

  it("compares the typed token, not the resolved comparison", () => {
    renderHeader({ query: "modified:<365d" });

    openList("Modified");

    expect(screen.getByRole("menuitem", { name: "Over a year ago" })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-138 I12 a preset that would make the range impossible is not offered", () => {
  it("leaves out Last 30 days beside a year-old bound", () => {
    renderHeader({ query: "modified:<1y" });

    openList("Modified");

    expect(screen.queryByRole("menuitem", { name: "Last 30 days" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Over 3 years ago" })).toBeInTheDocument();
  });

  it("leaves out the older presets beside a recent bound", () => {
    renderHeader({ query: "modified:>=2026-01" });

    openList("Modified");

    expect(screen.queryByRole("menuitem", { name: "Over a year ago" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Over 3 years ago" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Last 30 days" })).toBeInTheDocument();
  });

  it("shows one muted row and the back item when no preset is left", () => {
    renderHeader({ query: "modified:>=30d" });

    openList("Modified");

    for (const label of PRESETS) {
      expect(screen.queryByRole("menuitem", { name: label })).toBeNull();
    }
    expect(screen.getByRole("menuitem", { name: "Back" })).toBeInTheDocument();
    expect((menu().textContent ?? "").replace("Back", "").trim()).not.toBe("");
  });
});

describe("SPEC-CORE-138 I20 four identities disable the entry", () => {
  it("disables Modified at four distinct identities and enables it at three", () => {
    const full = renderHeader({ query: "modified:<1d modified:<2d modified:<3d modified:<4d" });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Modified" })).toBeDisabled();
    full.unmount();

    renderHeader({ query: "modified:<1d modified:<2d modified:<3d" });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Modified" })).toBeEnabled();
  });

  it("counts two identities with one wire form as two", () => {
    const full = renderHeader({
      query: "modified:<2024 modified:<=2023 modified:<1d modified:<2d",
    });
    openRoot();

    expect(screen.getByRole("menuitem", { name: "Modified" })).toBeDisabled();
    full.unmount();
  });
});

describe("SPEC-CORE-138 menu the Japanese strings", () => {
  const leaves = (node: unknown): string[] =>
    typeof node === "string"
      ? [node]
      : node && typeof node === "object"
        ? Object.values(node).flatMap(leaves)
        : [];

  it("defines 更新日 and the three presets", () => {
    const strings = leaves(ja);

    for (const label of ["更新日", "30 日以内", "1 年以上前", "3 年以上前"]) {
      expect(strings).toContain(label);
    }
  });
});
