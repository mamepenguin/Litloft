/** The See all page: one shelf as a grid, 60 at a time, under the app's target and sort. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoShelfPage } from "../VideoShelfPage";

const DRIVE = "main";

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video/shelf",
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

function item(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Video ${id}`,
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

const pageOf = (p: Params) => {
  const page = Number(p.page);
  const size = page === 1 ? 60 : 5;
  const items = Array.from({ length: size }, (_, i) => item(`p${page}-${i}`));
  return { by: p.by, total_shelves: 1, shelves: [{ key: p.key, label: String(p.key), count: 65, items }] };
};

class FakeObserver {
  static instances: FakeObserver[] = [];
  constructor(private callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  live = true;
  observe() {}
  disconnect() {
    this.live = false;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  trigger() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
}

/** The observer is created in a passive effect, which may land after the text of the same commit. */
async function liveSentinel() {
  await waitFor(() => expect(FakeObserver.instances.some((o) => o.live)).toBe(true));
  return FakeObserver.instances.filter((o) => o.live).at(-1)!;
}

const never = () => new Promise<never>(() => {});

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  getShelves.mockReset().mockImplementation(async (_d, p) => pageOf(p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 65, page: 1, limit: 1 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("See all", () => {
  it("asks for the keyed shelf, 60 to a page, under the target and the default sort", async () => {
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);

    expect(await screen.findByText("Video p1-0")).toBeInTheDocument();
    expect(getShelves.mock.calls[0][1]).toMatchObject({
      by: "folder",
      key: "Movies",
      per_shelf: 60,
      page: 1,
      sort: "created_at",
      order: "desc",
      type: ["video"],
    });
    expect(screen.getByRole("heading", { name: "Movies" })).toBeInTheDocument();
  });

  it("keeps an empty key, and titles the root folder shelf with the drive", async () => {
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="" />);

    await screen.findByText("Video p1-0");
    expect(getShelves.mock.calls[0][1]).toHaveProperty("key", "");
    expect(screen.getByRole("heading", { name: DRIVE })).toBeInTheDocument();
  });

  it("uses the saved smart folder as its target", async () => {
    getSmartFolders.mockResolvedValue([
      { id: "sf", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
    ]);
    writeAppPrefs(DRIVE, { target: "sf" });
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);

    await screen.findByText("Video p1-0");
    expect([getShelves.mock.calls[0][1].tag].flat()).toEqual(["Trip"]);
  });

  it("loads the next page when the end comes into view, keeping the first", async () => {
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);
    await screen.findByText("Video p1-0");

    const sentinel = await liveSentinel();
    act(() => sentinel.trigger());

    expect(await screen.findByText("Video p2-0")).toBeInTheDocument();
    expect(getShelves.mock.calls.at(-1)![1]).toMatchObject({ page: 2 });
    expect(screen.getByText("Video p1-0")).toBeInTheDocument();
  });

  it("refetches from page 1 when the sort changes", async () => {
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);
    await screen.findByText("Video p1-0");

    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByText("Title"));

    await waitFor(() =>
      expect(getShelves.mock.calls.at(-1)![1]).toMatchObject({ sort: "title", order: "asc", page: 1 }),
    );
  });

  it("draws skeletons while loading, retry when it fails, and the grid after a retry", async () => {
    getShelves.mockImplementationOnce(never);
    const view = render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);
    await waitFor(() => expect(view.container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0));
    expect(screen.queryByText("No files")).not.toBeInTheDocument();
    view.unmount();

    getShelves.mockReset().mockRejectedValueOnce(new Error("boom")).mockImplementation(async (_d, p) => pageOf(p));
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Video p1-0")).toBeInTheDocument();
  });

  it("SPEC-CORE-080 I6 draws two rows of skeleton cards before the first page and one row while the next loads, on the two-column floor while unmeasured", async () => {
    getShelves.mockReset().mockImplementation(never);
    const first = render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);
    await waitFor(() => expect(first.container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0));
    expect(first.container.querySelectorAll("li")).toHaveLength(4);
    first.unmount();

    getShelves.mockReset().mockImplementation((_d, p: Params) =>
      Number(p.page) === 1 ? Promise.resolve(pageOf(p)) : never(),
    );
    const view = render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />);
    await screen.findByText("Video p1-0");
    expect(view.container.querySelectorAll("li")).toHaveLength(60);

    const sentinel = await liveSentinel();
    act(() => sentinel.trigger());

    await waitFor(() => expect(getShelves.mock.calls.at(-1)![1]).toMatchObject({ page: 2 }));
    await waitFor(() => expect(view.container.querySelectorAll("li")).toHaveLength(62));
  });

  it("draws the empty state for a shelf with nothing in it", async () => {
    getShelves.mockImplementation(async (_d, p: Params) => ({
      by: p.by,
      total_shelves: 1,
      shelves: [{ key: p.key, label: "", count: 0, items: [] }],
    }));
    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Gone" />);

    expect(await screen.findByText("No files")).toBeInTheDocument();
  });

  it("asks nothing for a Watch state shelf without a profile", async () => {
    nickname = null;
    render(<VideoShelfPage drive={DRIVE} by="watch" shelfKey="in_progress" />);

    expect(await screen.findByText("No files")).toBeInTheDocument();
    expect(getShelves).not.toHaveBeenCalled();
  });

  it("asks nothing for an unknown grouping", async () => {
    render(<VideoShelfPage drive={DRIVE} by={null} shelfKey="x" />);

    expect(await screen.findByText("No files")).toBeInTheDocument();
    expect(getShelves).not.toHaveBeenCalled();
  });
});

describe("the shelf page's title", () => {
  it.each([
    [null, "All videos"],
    ["library", "All videos"],
    ["discover", "New"],
  ])("titles by=all from %s as %s", async (from, title) => {
    render(<VideoShelfPage drive={DRIVE} by="all" shelfKey="all" from={from} />);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });
});
