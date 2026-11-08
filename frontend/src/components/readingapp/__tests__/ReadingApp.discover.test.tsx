/**
 * The Reading app's Discover face: the three shelves, their destinations,
 * the profile's effect, and the empty states.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
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

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
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

function oneShelf(key: string, items: unknown[]) {
  return {
    by: "watch",
    total_shelves: 1,
    shelves: [{ key, label: "", count: items.length, items }],
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

function defaultShelves(_drive: string, params: Params) {
  if (params.by === "watch" && params.key === "in_progress") {
    return oneShelf("in_progress", [
      book("c1", "Resume me", { watch_progress: { position: 30, duration: 120 } }),
    ]);
  }
  if (params.by === "watch" && params.key === "unwatched") {
    return oneShelf("unwatched", [book("r1", "Pick me")]);
  }
  if (params.by === "all") {
    return {
      by: "all",
      total_shelves: 1,
      shelves: [{ key: "all", label: "", count: 3, items: [] }],
    };
  }
  if (params.by === "folder") {
    return {
      by: "folder",
      base: "Books",
      total_shelves: 1,
      shelves: [{ key: "Books/Novels", label: "Novels", count: 3, items: [] }],
    };
  }
  return { by: params.by, total_shelves: 0, shelves: [] };
}

function defaultFiles(_drive: string, params: Params) {
  const title = params.sort === "random" ? "Random pick" : "Newest one";
  return {
    data: [book("n1", title)],
    meta: { total: 1, page: 1, limit: Number(params.limit) || 12 },
  };
}

function shelfCalls(match: Params) {
  return getShelves.mock.calls.filter(([, params]) =>
    Object.entries(match).every(([key, value]) => (params as Params)[key] === value),
  );
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (d, p) => defaultFiles(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

describe("I17 Discover's three shelves", () => {
  it("asks for Continue, Not read yet and New under the book target, with no path", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Resume me");

    const continueCall = shelfCalls({ by: "watch", key: "in_progress" })[0][1] as Params;
    expect(continueCall).toMatchObject({
      sort: "last_played",
      per_shelf: 12,
      type: ["pdf", "epub", "archive"],
    });
    expect(continueCall).not.toHaveProperty("path");

    const notRead = shelfCalls({ by: "watch", key: "unwatched" })[0][1] as Params;
    expect(notRead).toMatchObject({
      sort: "random",
      per_shelf: 12,
      type: ["pdf", "epub", "archive"],
    });
    expect(notRead).not.toHaveProperty("path");

    const fresh = getDriveFiles.mock.calls
      .map(([, params]) => params as Params)
      .find((params) => params.sort === "created_at");
    expect(fresh).toMatchObject({
      order: "desc",
      limit: 12,
      type: ["pdf", "epub", "archive"],
    });
    expect(fresh).not.toHaveProperty("path");
  });

  it("draws the three shelves and a progress bar on Continue alone", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Resume me");

    for (const heading of ["Continue reading", "Not read yet", "New"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    const bars = screen.getAllByTestId("progress-fill");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveStyle({ width: "25%" });
  });

  it("does not draw a shelf with no books", async () => {
    getShelves.mockImplementation(async (d, params: Params) =>
      params.by === "watch" && params.key === "in_progress"
        ? oneShelf("in_progress", [])
        : defaultShelves(d, params),
    );
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Pick me");

    expect(screen.queryByText("Continue reading")).not.toBeInTheDocument();
    expect(screen.getByText("Not read yet")).toBeInTheDocument();
  });

  it("draws no Continue and no watch request without a profile", async () => {
    nickname = null;
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Random pick");

    expect(shelfCalls({ by: "watch" })).toHaveLength(0);
    expect(screen.queryByText("Continue reading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See all: Not read yet" })).not.toBeInTheDocument();
  });

  it("sends the listing's random sample without a profile", async () => {
    nickname = null;
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Random pick");

    const random = getDriveFiles.mock.calls
      .map(([, params]) => params as Params)
      .find((params) => params.sort === "random");
    expect(random).toMatchObject({ limit: 12, type: ["pdf", "epub", "archive"] });
    expect(random).not.toHaveProperty("path");
    expect(screen.getByRole("link", { name: "See all: New" })).toBeInTheDocument();
  });
});

describe("Discover's See all destinations", () => {
  it("links each shelf to its page", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Resume me");

    expect(screen.getByRole("link", { name: "See all: Continue reading" })).toHaveAttribute(
      "href",
      `/drive/${DRIVE}/apps/reading/shelf?by=watch&key=in_progress&from=discover`,
    );
    expect(screen.getByRole("link", { name: "See all: Not read yet" })).toHaveAttribute(
      "href",
      `/drive/${DRIVE}/apps/reading/shelf?by=watch&key=unwatched&from=discover`,
    );
    expect(screen.getByRole("link", { name: "See all: New" })).toHaveAttribute(
      "href",
      `/drive/${DRIVE}/apps/reading/shelf?by=all&key=all&from=discover`,
    );
  });
});

describe("Discover's empty states", () => {
  it("says No books when every shelf is empty", async () => {
    getShelves.mockImplementation(async (_d, params: Params) =>
      oneShelf(String(params.key), []),
    );
    getDriveFiles.mockImplementation(async () => ({
      data: [],
      meta: { total: 0, page: 1, limit: 12 },
    }));
    render(<ReadingApp drive={DRIVE} />);

    expect(await screen.findByText("No books")).toBeInTheDocument();
  });

  it("says the target cannot be used and sends no request when the kinds miss", async () => {
    writeAppPrefs(DRIVE, { target: "sf-image" }, "reading");
    getSmartFolders.mockResolvedValue([smartFolder("sf-image", "Pictures", "type:image")]);
    render(<ReadingApp drive={DRIVE} />);

    expect(await screen.findByText("This target cannot be used")).toBeInTheDocument();
    expect(getShelves).not.toHaveBeenCalled();
    expect(getDriveFiles).not.toHaveBeenCalled();
  });
});

describe("I12b an unusable smart folder", () => {
  it("is listed disabled and cannot be chosen", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-length", "Long books", "duration:>1h")]);
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Resume me");

    fireEvent.click(screen.getByRole("button", { name: /Target/ }));
    const row = await screen.findByRole("menuitemradio", { name: "Long books" });
    expect(row).toBeDisabled();
  });
});
