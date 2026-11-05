/**
 * SPEC-CORE-044: the results header's 「＋ 条件」 menu gains a size list and a
 * length list with fixed presets, and a choice appends exactly one token the
 * parser reads back as that comparison.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { filterFromParsed, parseSearchQuery } from "@/lib/searchQuery";

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

const SIZE_PRESETS = ["Under 10 MB", "100 MB or more", "1 GB or more"];
const LENGTH_PRESETS = ["Under 5 min", "30 min or more", "1 hour or more"];

const trigger = () => screen.getByRole("button", { name: "Add filter" });

const openRoot = () => fireEvent.click(trigger());

const openList = (name: string) => {
  openRoot();
  fireEvent.click(screen.getByRole("menuitem", { name }));
};

const menu = () => screen.getByRole("menu");

const menuRows = () =>
  screen.queryAllByRole("menuitem").map((row) => row.textContent?.trim() ?? "");

const filterOf = (q: string | null) =>
  filterFromParsed(parseSearchQuery(q ?? ""), null);

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

describe("SPEC-CORE-044 menu 1 the first level's order", () => {
  it("offers Tag, Type, Folder, Collection, Size, Length, Favorites in that order", () => {
    renderHeader();
    openRoot();

    expect(menuRows()).toEqual([
      "Tag",
      "Type",
      "Folder",
      "Collection",
      "Size",
      "Length",
      "Favorites",
    ]);
  });
});

describe("SPEC-CORE-044 menu 2 the fixed preset lists", () => {
  it("shows the three size presets with no filter input and no request", () => {
    renderHeader();
    openList("Size");

    for (const label of SIZE_PRESETS) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    expect(within(menu()).queryByRole("textbox")).toBeNull();
    expect(api.getDriveTags).not.toHaveBeenCalled();
    expect(api.getFolderTree).not.toHaveBeenCalled();
    expect(api.getCollections).not.toHaveBeenCalled();
  });

  it("shows the three length presets with no filter input and no request", () => {
    renderHeader();
    openList("Length");

    for (const label of LENGTH_PRESETS) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    expect(within(menu()).queryByRole("textbox")).toBeNull();
    expect(api.getDriveTags).not.toHaveBeenCalled();
    expect(api.getFolderTree).not.toHaveBeenCalled();
    expect(api.getCollections).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-044 menu 4 a preset appends one token and submits once", () => {
  it("appends size:>=1GB and closes the menu", () => {
    renderHeader();

    openList("Size");
    fireEvent.click(screen.getByRole("menuitem", { name: "1 GB or more" }));

    const { pathname, q } = pushed();
    expect(pathname).toBe("/drive/main/search");
    expect(q).toBe("cats size:>=1GB");
    expect(filterOf(q).sizes).toEqual(["gte:1073741824"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("appends size:<10MB for the first size preset", () => {
    renderHeader();

    openList("Size");
    fireEvent.click(screen.getByRole("menuitem", { name: "Under 10 MB" }));

    expect(pushed().q).toBe("cats size:<10MB");
    expect(filterOf(pushed().q).sizes).toEqual(["lt:10485760"]);
  });

  it("appends size:>=100MB for the middle size preset", () => {
    renderHeader();

    openList("Size");
    fireEvent.click(screen.getByRole("menuitem", { name: "100 MB or more" }));

    expect(pushed().q).toBe("cats size:>=100MB");
    expect(filterOf(pushed().q).sizes).toEqual(["gte:104857600"]);
  });

  it("appends duration:<5m for the first length preset", () => {
    renderHeader();

    openList("Length");
    fireEvent.click(screen.getByRole("menuitem", { name: "Under 5 min" }));

    expect(pushed().q).toBe("cats duration:<5m");
    expect(filterOf(pushed().q).durations).toEqual(["lt:300"]);
  });

  it("appends duration:>=30m for the middle length preset", () => {
    renderHeader();

    openList("Length");
    fireEvent.click(screen.getByRole("menuitem", { name: "30 min or more" }));

    expect(pushed().q).toBe("cats duration:>=30m");
    expect(filterOf(pushed().q).durations).toEqual(["gte:1800"]);
  });

  it("appends duration:>=1h for the last length preset", () => {
    renderHeader();

    openList("Length");
    fireEvent.click(screen.getByRole("menuitem", { name: "1 hour or more" }));

    expect(pushed().q).toBe("cats duration:>=1h");
    expect(filterOf(pushed().q).durations).toEqual(["gte:3600"]);
  });

  it("closes an open quote before it appends the token", () => {
    renderHeader({ query: 'path:"My Ph' });

    openList("Size");
    fireEvent.click(screen.getByRole("menuitem", { name: "Under 10 MB" }));

    expect(pushed().q).toBe('path:"My Ph" size:<10MB');
    expect(parseSearchQuery(pushed().q ?? "")).toMatchObject({
      folders: ["My Ph"],
      sizes: [expect.anything()],
    });
  });
});

describe("SPEC-CORE-044 menu 3 a preset already in the query is not offered", () => {
  it("leaves out the comparison the query already holds", () => {
    renderHeader({ query: "size:>=100MB" });

    openList("Size");

    expect(screen.queryByRole("menuitem", { name: "100 MB or more" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "1 GB or more" })).toBeInTheDocument();
  });

  it("compares the amount, not the spelling", () => {
    renderHeader({ query: "size:<10240KB" });

    openList("Size");

    expect(screen.queryByRole("menuitem", { name: "Under 10 MB" })).toBeNull();
  });

  it("leaves out a length preset already in the query", () => {
    renderHeader({ query: "duration:>=30m" });

    openList("Length");

    expect(screen.queryByRole("menuitem", { name: "30 min or more" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "1 hour or more" })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-044 menu 3 an impossible preset is not offered", () => {
  it("leaves out a size preset that contradicts the query", () => {
    renderHeader({ query: "size:>500MB" });

    openList("Size");

    expect(screen.queryByRole("menuitem", { name: "Under 10 MB" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "100 MB or more" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "1 GB or more" })).toBeInTheDocument();
  });

  it("leaves out a length preset that contradicts the query", () => {
    renderHeader({ query: "duration:>1h" });

    openList("Length");

    expect(screen.queryByRole("menuitem", { name: "Under 5 min" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "30 min or more" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "1 hour or more" })).toBeInTheDocument();
  });

  it("shows one muted row and the back item when no preset is left", () => {
    renderHeader({ query: "size:<10MB" });

    openList("Size");

    for (const label of SIZE_PRESETS) {
      expect(screen.queryByRole("menuitem", { name: label })).toBeNull();
    }
    expect(screen.getByRole("menuitem", { name: "Back" })).toBeInTheDocument();
    expect((menu().textContent ?? "").replace("Back", "").trim()).not.toBe("");
  });
});

describe("SPEC-CORE-044 menu 3 a full list disables its first-level entry", () => {
  const fourSizes = "size:>1B size:>2B size:>3B size:>4B";
  const threeSizes = "size:>1B size:>2B size:>3B";
  const fourDurations = "duration:>1s duration:>2s duration:>3s duration:>4s";
  const threeDurations = "duration:>1s duration:>2s duration:>3s";

  it("disables Size at four distinct comparisons and enables it at three", () => {
    const full = renderHeader({ query: fourSizes });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Size" })).toBeDisabled();
    full.unmount();

    renderHeader({ query: threeSizes });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Size" })).toBeEnabled();
  });

  it("disables Length at four distinct comparisons and enables it at three", () => {
    const full = renderHeader({ query: fourDurations });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Length" })).toBeDisabled();
    full.unmount();

    renderHeader({ query: threeDurations });
    openRoot();
    expect(screen.getByRole("menuitem", { name: "Length" })).toBeEnabled();
  });
});

describe("SPEC-CORE-044 states the preset list returns or closes", () => {
  it("returns to the first level on the back item", () => {
    renderHeader();
    openList("Size");

    fireEvent.click(screen.getByRole("menuitem", { name: "Back" }));

    expect(screen.getByRole("menuitem", { name: "Tag" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Size" })).toBeInTheDocument();
  });

  it("returns to the first level on Escape", () => {
    renderHeader();
    openList("Size");

    fireEvent.keyDown(menu(), { key: "Escape" });

    expect(screen.getByRole("menuitem", { name: "Tag" })).toBeInTheDocument();
    expect(menuRows()).toContain("Size");
  });

  it("closes on Escape on the first level", () => {
    renderHeader();
    openList("Size");
    fireEvent.keyDown(menu(), { key: "Escape" });
    fireEvent.keyDown(menu(), { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Tab from a preset list", () => {
    renderHeader();
    openList("Length");

    fireEvent.keyDown(menu(), { key: "Tab" });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on an outside press", () => {
    renderHeader();
    openList("Size");

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
