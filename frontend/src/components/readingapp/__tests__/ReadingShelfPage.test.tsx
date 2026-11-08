/**
 * The Reading app's See all page: one shelf paged 60 at a time, opening on
 * the sort the face carried, with the conditions in force and a Target menu.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReadingShelfPage } from "../ReadingShelfPage";

const DRIVE = "main";
let nickname: string | null = "alice";

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

const getShelves = vi.fn();
const getSmartFolders = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
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

function shelves(_drive: string, params: Params) {
  if (params.by === "all" && params.per_shelf === 1) {
    return {
      by: "all",
      total_shelves: 1,
      shelves: [{ key: "all", label: "", count: 42, items: [] }],
    };
  }
  const page = Number(params.page) || 1;
  return {
    by: params.by,
    total_shelves: 1,
    shelves: [
      {
        key: params.key,
        label: String(params.key),
        count: 61,
        items: [book(`p${page}`, `Shelf page ${page}`)],
      },
    ],
  };
}

function smartFolder(id: string, name: string, query: string) {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

function shelfCall(match: Params) {
  return getShelves.mock.calls
    .map(([, params]) => params as Params)
    .find((params) => Object.entries(match).every(([key, value]) => params[key] === value));
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  constructor(private callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  trigger() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("I21 the shelf page", () => {
  it("opens on the carried sort under the target and the conditions in force", async () => {
    render(
      <ReadingShelfPage
        drive={DRIVE}
        by="tag"
        shelfKey="Trip"
        initialSort="size"
        folders={["Books/Novels"]}
        tags={["read"]}
        watch="in_progress"
      />,
    );
    await screen.findByText("Shelf page 1");

    expect(shelfCall({ by: "tag" })).toMatchObject({
      key: "Trip",
      sort: "file_size",
      order: "desc",
      page: 1,
      per_shelf: 60,
      folder: ["Books/Novels"],
      tag: ["read"],
      watch: "in_progress",
      type: ["pdf", "epub", "archive"],
    });
  });

  it("pages 60 at a time", async () => {
    render(<ReadingShelfPage drive={DRIVE} by="tag" shelfKey="Trip" />);
    await screen.findByText("Shelf page 1");

    await waitFor(() => expect(FakeObserver.instances.length).toBeGreaterThan(0));
    act(() => {
      for (const observer of FakeObserver.instances) observer.trigger();
    });

    await waitFor(() => expect(shelfCall({ by: "tag", page: 2 })).toBeDefined());
    expect(shelfCall({ by: "tag", page: 2 })).toMatchObject({ per_shelf: 60 });
  });

  it("keeps the key when the target changes", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-books", "Books", "path:Books")]);
    render(<ReadingShelfPage drive={DRIVE} by="tag" shelfKey="Trip" />);
    await screen.findByText("Shelf page 1");

    fireEvent.click(screen.getByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Books" }));

    await waitFor(() => {
      const calls = getShelves.mock.calls
        .map(([, params]) => params as Params)
        .filter((params) => params.by === "tag" && params.key === "Trip" && params.folder);
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it("shows No books for a key that names nothing", async () => {
    getShelves.mockImplementation(async (_d, params: Params) =>
      params.per_shelf === 1
        ? shelves(_d, params)
        : {
            by: params.by,
            total_shelves: 1,
            shelves: [{ key: params.key, label: "", count: 0, items: [] }],
          },
    );
    render(<ReadingShelfPage drive={DRIVE} by="tag" shelfKey="Gone" />);

    expect(await screen.findByText("No books")).toBeInTheDocument();
  });

  it("has no watch shelf without a profile", async () => {
    nickname = null;
    render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="in_progress" />);

    expect(await screen.findByText("No books")).toBeInTheDocument();
    expect(
      getShelves.mock.calls.some(
        ([, params]) => (params as Params).by === "watch",
      ),
    ).toBe(false);
  });

  it("sends no request for an empty key under another grouping", async () => {
    render(<ReadingShelfPage drive={DRIVE} by="tag" shelfKey="" />);

    expect(await screen.findByText("No books")).toBeInTheDocument();
    expect(
      getShelves.mock.calls.some(([, params]) => (params as Params).by === "tag"),
    ).toBe(false);
  });
});

describe("the shelf page's title", () => {
  it.each([
    ["watch", "in_progress", null, "Continue reading"],
    ["watch", "unwatched", null, "Not read yet"],
    ["tag", "no_tag", null, "No tag"],
    ["all", "all", null, "All books"],
    ["all", "all", "library", "All books"],
    ["all", "all", "discover", "New"],
    ["folder", "Shows/Season 1", null, "Season 1"],
    ["folder", "", null, DRIVE],
  ])("titles %s %s from %s as %s", async (by, key, from, title) => {
    render(
      <ReadingShelfPage
        drive={DRIVE}
        by={by as never}
        shelfKey={key}
        from={from as string | null}
      />,
    );

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });
});
