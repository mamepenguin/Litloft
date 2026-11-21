/**
 * The Reading app's Library face: the Tag / State / Group / Sort controls,
 * paging, and the empty and failed states.
 */

import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readTargetView, writeAppPrefs } from "@/lib/appPrefs";
import { appRequests } from "@/lib/memberTarget";
import { LibraryFace } from "../LibraryFace";
import type { ReadingGroup, SortChoice } from "../labels";
import { ReadingApp } from "../ReadingApp";

const DRIVE = "main";
let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();
const getCollections = vi.fn();
const getTagCounts = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
  getTagCounts: (...args: unknown[]) => getTagCounts(...args),
}));

type Params = Record<string, unknown>;

function book(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    filename: `${title}.pdf`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "Books",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: null,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

function chipShelf(key: string, label: string, count: number) {
  return { key, label, count, items: [book(`chip-${key}`, label)] };
}

function defaultShelves(_drive: string, params: Params) {
  if (params.by === "folder") {
    return {
      by: "folder",
      base: "Books",
      total_shelves: 4,
      shelves: [
        chipShelf("Books/", "Books", 2),
        chipShelf("Books/Comics", "Comics", 7),
        chipShelf("Books/Novels", "Novels", 7),
        chipShelf("Books/Poetry", "Poetry", 3),
      ],
    };
  }
  if (params.by === "all") {
    if (params.per_shelf === 1) {
      return {
        by: "all",
        total_shelves: 1,
        shelves: [{ key: "all", label: "", count: 2, items: [] }],
      };
    }
    return {
      by: "all",
      total_shelves: 1,
      shelves: [{ key: "all", label: "", count: 2, items: [book("f1", "Flat one"), book("f2", "Flat two")] }],
    };
  }
  if (params.by === "tag") {
    return {
      by: "tag",
      total_shelves: 2,
      shelves: [
        { key: "Trip", label: "Trip", count: 2, items: [book("t1", "Trip one")] },
        { key: "no_tag", label: "", count: 1, items: [book("t2", "Untagged one")] },
      ],
    };
  }
  return { by: params.by, shelves: [], total_shelves: 0 };
}

function defaultFiles(_drive: string, params: Params) {
  return {
    data: [book("n1", params.sort === "random" ? "Random pick" : "Newest one")],
    meta: { total: 1, page: 1, limit: Number(params.limit) || 12 },
  };
}

function shelfCalls(match: Params) {
  return getShelves.mock.calls.filter(([, params]) =>
    Object.entries(match).every(([key, value]) =>
      Array.isArray(value)
        ? JSON.stringify((params as Params)[key]) === JSON.stringify(value)
        : (params as Params)[key] === value,
    ),
  );
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (d, p) => defaultFiles(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
  getTagCounts.mockReset().mockResolvedValue([
    { name: "read", count: 4 },
    { name: "later", count: 1 },
  ]);
});

describe("I19 grouping and sort", () => {
  beforeEach(() => {
    writeAppPrefs(DRIVE, { face: "library" }, "reading");
  });

  it("lists Group None through by=all, 60 at a time, newest first", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Flat one");

    const call = shelfCalls({ by: "all", per_shelf: 60 })[0][1] as Params;
    expect(call).toMatchObject({
      key: "all",
      sort: "created_at",
      order: "desc",
      page: 1,
      type: ["pdf", "epub", "archive"],
    });
  });

  it("lists Group By tag through by=tag with no_tag last, and saves the group", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Flat one");

    fireEvent.click(screen.getByRole("button", { name: /Group/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Tag" }));

    await screen.findByText("Trip one");
    const call = shelfCalls({ by: "tag" })[0][1] as Params;
    expect(call).toMatchObject({ per_shelf: 12, shelf_limit: 12, sort: "created_at", order: "desc" });
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(-2)).toEqual(["Trip", "No tag"]);
    expect(readTargetView("reading", DRIVE, "default").group).toBe("tag");
  });

  it("orders the flat grid and every shelf by the chosen sort", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Flat one");

    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByText("Size"));

    await waitFor(() => {
      const sized = shelfCalls({ by: "all", per_shelf: 60, sort: "file_size", order: "desc" });
      expect(sized.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /Group/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Tag" }));
    await screen.findByText("Trip one");
    expect(shelfCalls({ by: "tag", sort: "file_size", order: "desc" }).length).toBeGreaterThan(0);
  });

  it("passes the sort and the conditions in force to See all", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Flat one");

    fireEvent.click(screen.getByRole("button", { name: /Tag/ }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /read/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: /Tag/ }), { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByText("Size"));

    fireEvent.click(screen.getByRole("button", { name: /Group/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Tag" }));

    const link = await screen.findByRole("link", { name: "See all: Trip" });
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect(url.searchParams.get("by")).toBe("tag");
    expect(url.searchParams.get("key")).toBe("Trip");
    expect(url.searchParams.get("sort")).toBe("size");
    expect(url.searchParams.getAll("tag")).toEqual(["read"]);
    expect(url.searchParams.get("from")).toBe("library");
  });
});

function LibraryHarness({
  hasProfile,
  params = { type: ["pdf", "epub", "archive"] },
  onViewerRejected = vi.fn(),
}: {
  hasProfile: boolean;
  params?: { type: ["pdf", "epub", "archive"] } | null;
  onViewerRejected?: () => void;
}) {
  const [sortId, setSortId] = useState<SortChoice["id"]>("newest");
  const [group, setGroup] = useState<ReadingGroup>("none");
  return (
    <LibraryFace
      drive={DRIVE}
      params={params}
      requests={appRequests(null, null)}
      empty={false}
      hasProfile={hasProfile}
      group={group}
      sortId={sortId}
      onGroup={setGroup}
      onSort={setSortId}
      onViewerRejected={onViewerRejected}
    />
  );
}

describe("I20 watch state needs a profile", () => {
  it("draws no State and sends no watch without a profile", async () => {
    render(<LibraryHarness hasProfile={false} />);
    await screen.findByText("Flat one");

    expect(screen.queryByRole("button", { name: /State/ })).not.toBeInTheDocument();
    expect(getShelves.mock.calls.every(([, p]) => (p as Params).watch === undefined)).toBe(true);
  });

  it("sends the chosen state and clears it when the profile goes", async () => {
    const { rerender } = render(<LibraryHarness hasProfile />);
    await screen.findByText("Flat one");

    fireEvent.click(screen.getByRole("button", { name: /State/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "In progress" }));
    await waitFor(() =>
      expect(shelfCalls({ by: "all", watch: "in_progress" }).length).toBeGreaterThan(0),
    );

    const before = shelfCalls({ by: "all" }).length;
    rerender(<LibraryHarness hasProfile={false} />);

    expect(screen.queryByRole("button", { name: /State/ })).not.toBeInTheDocument();
    await waitFor(() => expect(shelfCalls({ by: "all" }).length).toBeGreaterThan(before));
    const latest = shelfCalls({ by: "all" }).at(-1)?.[1] as Params;
    expect(latest.watch).toBeUndefined();
  });
});

describe("I20a a superseded fetch is never drawn", () => {
  it("draws only the latest response after a quick sort change", async () => {
    const pending: Array<{
      params: Params;
      resolve: (value: unknown) => void;
    }> = [];
    getShelves.mockImplementation(async (_d, params: Params) => {
      if (params.by === "folder") return defaultShelves(_d, params);
      return new Promise((resolve) => pending.push({ params, resolve }));
    });

    render(<LibraryHarness hasProfile />);
    await waitFor(() => expect(pending).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByText("Size"));
    await waitFor(() => expect(pending).toHaveLength(2));

    const [first, second] = pending;
    await act(async () => {
      second.resolve({
        by: "all",
        total_shelves: 1,
        shelves: [{ key: "all", label: "", count: 1, items: [book("new", "Newest sort")] }],
      });
    });
    expect(await screen.findByText("Newest sort")).toBeInTheDocument();

    await act(async () => {
      first.resolve({
        by: "all",
        total_shelves: 1,
        shelves: [{ key: "all", label: "", count: 1, items: [book("old", "Stale sort")] }],
      });
    });
    expect(screen.queryByText("Stale sort")).not.toBeInTheDocument();
  });
});

describe("the Library's empty states", () => {
  it("says No books when nothing matches", async () => {
    getShelves.mockImplementation(async (_d, params: Params) =>
      params.by === "folder"
        ? { by: "folder", base: "", total_shelves: 0, shelves: [] }
        : { by: params.by, total_shelves: 1, shelves: [{ key: "all", label: "", count: 0, items: [] }] },
    );
    render(<LibraryHarness hasProfile />);

    expect(await screen.findByText("No books")).toBeInTheDocument();
  });

  it("says the target cannot be used when the kinds miss", () => {
    render(
      <LibraryFace
        drive={DRIVE}
        params={null}
        requests={appRequests(null, null)}
        empty
        hasProfile
        group="none"
        sortId="newest"
        onGroup={vi.fn()}
        onSort={vi.fn()}
        onViewerRejected={vi.fn()}
      />,
    );

    expect(screen.getByText("This target cannot be used")).toBeInTheDocument();
    expect(getShelves).not.toHaveBeenCalled();
  });
});
