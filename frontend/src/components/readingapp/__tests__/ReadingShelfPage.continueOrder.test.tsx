/**
 * SPEC-CORE-072: the Reading app's Continue shelf page opens in last-opened
 * order and offers Date Last Opened in its sort menu; no other page does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { ReadingApp } from "../ReadingApp";
import { ReadingShelfPage } from "../ReadingShelfPage";

const DRIVE = "main";

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading/shelf",
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

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
}));

type Params = Record<string, unknown>;

function item(id: string, title: string) {
  return {
    id,
    filename: `${title}.pdf`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function shelves(_drive: string, params: Params) {
  return {
    by: params.by,
    total_shelves: 1,
    base: "",
    shelves: [
      {
        key: params.key ?? "Movies",
        label: String(params.key ?? "Movies"),
        count: 1,
        items: [item(`i-${String(params.key)}`, `Shelf ${String(params.key)}`)],
      },
    ],
  };
}

function files() {
  return { data: [item("n1", "Newest one")], meta: { total: 1, page: 1, limit: 12 } };
}

function shelfRequests() {
  return getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.per_shelf !== 1);
}

function lastShelfCall(match: Params = {}) {
  return shelfRequests()
    .filter((p) => Object.entries(match).every(([k, v]) => p[k] === v))
    .at(-1);
}

function sortButton() {
  return screen.getByRole("button", { name: /^Sort/ });
}

function openSortMenu() {
  fireEvent.click(sortButton());
  return within(screen.getByRole("menu"));
}

function sortItems() {
  return openSortMenu()
    .getAllByRole("menuitemradio")
    .map((el) => el.textContent?.trim());
}

const FIVE = ["Date Last Opened", "Date Added (Newest First)", "Date Added (Oldest First)", "Title", "Size"];
const FOUR = FIVE.slice(1);

const PAIRS: [string, string, string, string][] = [
  ["played", "Date Last Opened", "last_played", "desc"],
  ["newest", "Date Added (Newest First)", "created_at", "desc"],
  ["oldest", "Date Added (Oldest First)", "created_at", "asc"],
  ["title", "Title", "title", "asc"],
  ["size", "Size", "file_size", "desc"],
];

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async () => files());
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-072 Reading's Continue shelf page opens in last-opened order", () => {
  it("SPEC-CORE-072 I1 asks for last_played desc and shows Date Last Opened as the sort", async () => {
    render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" from="discover" />);
    await screen.findByText("Shelf continue");

    expect(shelfRequests()[0]).toMatchObject({
      by: "watch",
      key: "continue",
      sort: "last_played",
      order: "desc",
      page: 1,
      per_shelf: 60,
    });
    expect(sortButton()).toHaveAccessibleName("Sort By: Date Last Opened");
    expect(openSortMenu().getByRole("menuitemradio", { name: "Date Last Opened" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("SPEC-CORE-072 I2 offers Date Last Opened first, then the four existing choices", async () => {
    render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" />);
    await screen.findByText("Shelf continue");

    expect(sortItems()).toEqual(FIVE);
  });

  it.each(PAIRS.filter(([id]) => id !== "played"))(
    "SPEC-CORE-072 I2 choosing %s re-requests from page 1 with its pair",
    async (_id, label, sort, order) => {
      render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" />);
      await screen.findByText("Shelf continue");
      expect(sortButton()).toHaveAccessibleName("Sort By: Date Last Opened");

      fireEvent.click(openSortMenu().getByRole("menuitemradio", { name: label }));

      await waitFor(() => expect(lastShelfCall()).toMatchObject({ sort, order, page: 1 }));
      expect(sortButton()).toHaveAccessibleName(`Sort By: ${label}`);
    },
  );

  it("SPEC-CORE-072 I2 choosing Date Last Opened again restores last_played desc", async () => {
    render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" />);
    await screen.findByText("Shelf continue");

    fireEvent.click(openSortMenu().getByRole("menuitemradio", { name: "Title" }));
    await waitFor(() => expect(lastShelfCall()).toMatchObject({ sort: "title", order: "asc" }));
    fireEvent.click(openSortMenu().getByRole("menuitemradio", { name: "Date Last Opened" }));

    await waitFor(() =>
      expect(lastShelfCall()).toMatchObject({ sort: "last_played", order: "desc", page: 1 }),
    );
    expect(sortButton()).toHaveAccessibleName("Sort By: Date Last Opened");
  });

  it.each([
    ["newest", "Date Added (Newest First)", "created_at", "desc"],
    ["oldest", "Date Added (Oldest First)", "created_at", "asc"],
    ["title", "Title", "title", "asc"],
    ["size", "Size", "file_size", "desc"],
    ["played", "Date Last Opened", "last_played", "desc"],
    ["bogus", "Date Last Opened", "last_played", "desc"],
    ["", "Date Last Opened", "last_played", "desc"],
    [null, "Date Last Opened", "last_played", "desc"],
  ])("SPEC-CORE-072 I3 sort=%s in the URL opens on %s", async (initialSort, label, sort, order) => {
    render(
      <ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" initialSort={initialSort} />,
    );
    await screen.findByText("Shelf continue");

    expect(shelfRequests()[0]).toMatchObject({ sort, order, page: 1 });
    expect(sortButton()).toHaveAccessibleName(`Sort By: ${label}`);
    const menu = openSortMenu();
    expect(menu.getAllByRole("menuitemradio").map((el) => el.textContent?.trim())).toEqual(FIVE);
    expect(menu.getByRole("menuitemradio", { name: label })).toHaveAttribute("aria-checked", "true");
  });
});

describe("SPEC-CORE-072 I4 every other Reading shelf page and Library keep four choices", () => {
  it.each([
    ["watch", "in_progress"],
    ["watch", "unwatched"],
    ["folder", "Movies"],
    ["all", "all"],
  ] as const)(
    "SPEC-CORE-072 I4 %s %s with sort=played opens on added newest and offers no Date Last Opened",
    async (by, key) => {
      render(<ReadingShelfPage drive={DRIVE} by={by} shelfKey={key} initialSort="played" />);
      await screen.findByText(`Shelf ${key}`);

      expect(shelfRequests()[0]).toMatchObject({ sort: "created_at", order: "desc" });
      expect(getShelves.mock.calls.every(([, p]) => (p as Params).sort !== "last_played")).toBe(true);
      expect(sortButton()).toHaveAccessibleName("Sort By: Date Added (Newest First)");
      expect(sortItems()).toEqual(FOUR);
    },
  );

  it("SPEC-CORE-072 I4 Library's sort menu offers the four existing choices", async () => {
    writeAppPrefs(DRIVE, { face: "library" }, "reading");
    render(<ReadingApp drive={DRIVE} />);
    await waitFor(() => expect(sortButton()).toBeInTheDocument());

    expect(sortButton()).toHaveAccessibleName("Sort By: Date Added (Newest First)");
    expect(sortItems()).toEqual(FOUR);
  });
});

describe("SPEC-CORE-072 I6 Reading's shelf page follows a by/key change while mounted", () => {
  it("SPEC-CORE-072 I6 leaving Continue for another shelf drops Date Last Opened", async () => {
    const view = render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" />);
    await screen.findByText("Shelf continue");
    expect(lastShelfCall({ key: "continue" })).toMatchObject({ sort: "last_played", order: "desc" });

    view.rerender(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="in_progress" />);
    await screen.findByText("Shelf in_progress");

    const after = shelfRequests().filter((p) => p.key === "in_progress");
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((p) => p.sort === "created_at" && p.order === "desc")).toBe(true);
    expect(sortButton()).toHaveAccessibleName("Sort By: Date Added (Newest First)");
    expect(sortItems()).toEqual(FOUR);
  });

  it("SPEC-CORE-072 I6 arriving at Continue from another shelf opens on Date Last Opened", async () => {
    const view = render(<ReadingShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);
    await screen.findByText("Shelf Movies");

    view.rerender(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" />);
    await screen.findByText("Shelf continue");

    await waitFor(() =>
      expect(lastShelfCall({ key: "continue" })).toMatchObject({ sort: "last_played", order: "desc" }),
    );
    expect(sortButton()).toHaveAccessibleName("Sort By: Date Last Opened");
    expect(sortItems()).toEqual(FIVE);
  });

  it("SPEC-CORE-072 I6 a URL sort the new page offers is kept across the change", async () => {
    const view = render(
      <ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" initialSort={null} />,
    );
    await screen.findByText("Shelf continue");
    expect(sortButton()).toHaveAccessibleName("Sort By: Date Last Opened");

    view.rerender(<ReadingShelfPage drive={DRIVE} by="folder" shelfKey="Movies" initialSort="title" />);
    await screen.findByText("Shelf Movies");

    await waitFor(() =>
      expect(lastShelfCall({ key: "Movies" })).toMatchObject({ sort: "title", order: "asc" }),
    );
    expect(sortButton()).toHaveAccessibleName("Sort By: Title");
  });
});
