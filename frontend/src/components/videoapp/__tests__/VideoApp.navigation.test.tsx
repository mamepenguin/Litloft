import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";
import { VideoShelfPage } from "../VideoShelfPage";

const DRIVE = "main";

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
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

function item(id: string, title: string) {
  return {
    id,
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 120,
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
  if (params.by === "watch" && params.key === "in_progress") {
    return {
      by: "watch",
      total_shelves: 1,
      shelves: [{ key: "in_progress", label: "", count: 1, items: [item("c1", "Resume me")] }],
    };
  }
  if (params.by === "watch" && params.key === "unwatched") {
    return {
      by: "watch",
      total_shelves: 1,
      shelves: [{ key: "unwatched", label: "", count: 1, items: [item("r1", "Pick me")] }],
    };
  }
  if (params.by === "folder") {
    return {
      by: "folder",
      total_shelves: 1,
      base: "",
      shelves: [{ key: "Movies", label: "Movies", count: 7, items: [item("m1", "Movie one")] }],
    };
  }
  return { by: params.by, total_shelves: 0, shelves: [] };
}

function files(_drive: string, params: Params) {
  const title = params.sort === "random" ? "Random pick" : "Newest one";
  return { data: [item("n1", title)], meta: { total: 42, page: 1, limit: 12 } };
}

function shelfPage(params: Params) {
  return {
    by: params.by,
    total_shelves: 1,
    base: "",
    shelves: [{ key: params.key, label: String(params.key), count: 1, items: [item("p1", "Video p1-0")] }],
  };
}

function seeAllHrefs() {
  return screen.getAllByRole("link", { name: /See all/ }).map((link) => link.getAttribute("href"));
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (d, p) => files(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

describe("Video's Discover shelves link to See all", () => {
  it("links Continue, Recommended and New to their shelves", async () => {
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Resume me");
    await screen.findByText("Pick me");

    const hrefs = seeAllHrefs();
    expect(hrefs).toContain(`/drive/${DRIVE}/apps/video/shelf?by=watch&key=in_progress&from=discover`);
    expect(hrefs).toContain(`/drive/${DRIVE}/apps/video/shelf?by=watch&key=unwatched&from=discover`);
    expect(hrefs).toContain(`/drive/${DRIVE}/apps/video/shelf?by=all&key=all&from=discover`);
  });

  it("draws no Recommended See all without a profile, and keeps New's", async () => {
    nickname = null;
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Random pick");

    expect(screen.queryByRole("link", { name: "See all: Recommended" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See all: Continue" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all: New" })).toHaveAttribute(
      "href",
      `/drive/${DRIVE}/apps/video/shelf?by=all&key=all&from=discover`,
    );
  });
});

describe("Video's Library sort reaches See all", () => {
  it("passes the chosen sort in the link", async () => {
    writeAppPrefs(DRIVE, { face: "library" });
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Movies");

    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByText("Size"));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "See all: Movies" })).toHaveAttribute(
        "href",
        `/drive/${DRIVE}/apps/video/shelf?by=folder&key=Movies&sort=size&from=library`,
      ),
    );
  });

  it("opens the shelf page on the carried sort", async () => {
    getShelves.mockImplementation(async (_d, p) => shelfPage(p));
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" initialSort="size" />);

    await screen.findByText("Video p1-0");
    expect(getShelves.mock.calls[0][1]).toMatchObject({
      sort: "file_size",
      order: "desc",
      page: 1,
    });
  });
});

describe("a folder key is titled by its last segment", () => {
  beforeEach(() => {
    getShelves.mockImplementation(async (_d, p) => shelfPage(p));
  });

  it.each([
    ["Shows/Season 1", "Season 1"],
    ["Shows/", "Shows"],
  ])("titles %s as %s", async (key, title) => {
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey={key} />);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("titles the root folder shelf with the drive", async () => {
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="" />);

    expect(await screen.findByRole("heading", { name: DRIVE })).toBeInTheDocument();
  });
});
