/**
 * The looks of every input the video app decides on while it is loading,
 * refetching or has failed: the profile, each shelf, the Library's pages, the
 * smart folder list and the count in the header.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

import { readAppPrefs, writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";

const DRIVE = "main";

let nickname: string | null = "alice";
const profile = {
  get nickname() {
    return nickname;
  },
  setNickname: vi.fn(),
  clearNickname: vi.fn(),
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({ useProfile: () => profile }));

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

const oneShelf = (key: string, items: unknown[]) => ({
  by: "watch",
  total_shelves: 1,
  shelves: [{ key, label: "", count: items.length, items }],
});

function defaultShelves(_d: string, p: Params) {
  if (p.by === "watch" && p.key === "continue") return oneShelf("continue", [item("c1", "Resume me")]);
  if (p.by === "watch" && p.key === "unwatched") return oneShelf("unwatched", [item("r1", "Pick me")]);
  const names = Array.from({ length: p.offset ? 3 : 12 }, (_, i) => `Shelf ${(Number(p.offset) || 0) + i}`);
  return {
    by: p.by,
    total_shelves: 15,
    shelves: names.map((name) => ({ key: name, label: name, count: 1, items: [item(name, `${name} video`)] })),
  };
}

const defaultFiles = (_d: string, p: Params) => ({
  data: [item("n1", p.sort === "random" ? "Random pick" : "Newest one")],
  meta: { total: 42, page: 1, limit: 12 },
});

const never = () => new Promise<never>(() => {});

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
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (d, p) => defaultFiles(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a shelf while it loads, refetches and fails", () => {
  it("draws skeletons, no retry and no empty state while a shelf is still loading", async () => {
    getShelves.mockImplementation(never);
    getDriveFiles.mockImplementation(never);
    const { container } = render(<VideoApp drive={DRIVE} />);

    await screen.findByText("New");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByText("No files")).not.toBeInTheDocument();
  });

  it("keeps the other shelves and offers retry when New fails, then recovers on retry", async () => {
    let failNew = true;
    getDriveFiles.mockImplementation(async (d: string, p: Params) => {
      if (p.sort === "created_at" && failNew) throw new Error("boom");
      return defaultFiles(d, p);
    });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: /retry/i });
    expect(screen.getByText("Resume me")).toBeInTheDocument();

    failNew = false;
    fireEvent.click(retry);
    expect(await screen.findByText("Newest one")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("draws the empty state when every shelf is empty", async () => {
    getShelves.mockImplementation(async (_d, p: Params) => oneShelf(String(p.key), []));
    getDriveFiles.mockImplementation(async () => ({ data: [], meta: { total: 0, page: 1, limit: 12 } }));
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("No files")).toBeInTheDocument();
  });

  it("drops the answer of a target that was replaced while it was in flight", async () => {
    getSmartFolders.mockResolvedValue([
      { id: "sf", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
    ]);
    let releaseOld: (value: unknown) => void = () => {};
    getDriveFiles.mockImplementation((d: string, p: Params) => {
      if (p.sort === "created_at" && p.tag === undefined) {
        return new Promise((resolve) => {
          releaseOld = () => resolve({ data: [item("old", "Stale answer")], meta: { total: 1, page: 1, limit: 12 } });
        });
      }
      return Promise.resolve(defaultFiles(d, p));
    });
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Resume me");

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByText("Trips"));
    await screen.findByText("Newest one");
    await act(async () => releaseOld(null));

    expect(screen.queryByText("Stale answer")).not.toBeInTheDocument();
  });
});

describe("the profile as an input", () => {
  it("shows Continue once a profile is set, without a reload", async () => {
    nickname = null;
    const view = render(<VideoApp drive={DRIVE} />);
    expect(await screen.findByText("Newest one")).toBeInTheDocument();
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();

    nickname = "alice";
    view.rerender(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    expect(screen.queryByText("Pick me")).not.toBeInTheDocument();
  });

  it("drops Continue and the Watch state choice when the profile is cleared", async () => {
    writeAppPrefs(DRIVE, { face: "library", classification: "watch" });
    const view = render(<VideoApp drive={DRIVE} />);
    await waitFor(() => expect(getShelves.mock.calls.some(([, p]) => p.by === "watch")).toBe(true));

    nickname = null;
    view.rerender(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(getShelves.mock.calls.at(-1)![1]).toMatchObject({ by: "folder" }));
    expect(readAppPrefs(DRIVE).classification).toBe("watch");
  });

  it("falls back to Folder in the Library when the server turns the viewer away", async () => {
    const { ApiStatusError } = await import("@/lib/api");
    writeAppPrefs(DRIVE, { face: "library", classification: "watch" });
    getShelves.mockImplementation(async (d, p: Params) => {
      if (p.by === "watch") throw Object.assign(new ApiStatusError(400, "x"), { detail: "viewer_required" });
      return defaultShelves(d, p);
    });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Shelf 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});

describe("the Library while it pages and fails", () => {
  beforeEach(() => {
    writeAppPrefs(DRIVE, { face: "library" });
  });

  it("draws skeletons while the first page loads, with no empty state", async () => {
    getShelves.mockImplementation(never);
    const { container } = render(<VideoApp drive={DRIVE} />);

    await screen.findByRole("button", { name: /Classification/ });
    await waitFor(() => expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0));
    expect(screen.queryByText("No files")).not.toBeInTheDocument();
  });

  it("offers retry when the first page fails and shows the shelves after it", async () => {
    let fail = true;
    getShelves.mockImplementation(async (d, p: Params) => {
      if (fail) throw new Error("boom");
      return defaultShelves(d, p);
    });
    render(<VideoApp drive={DRIVE} />);

    const retry = await screen.findByRole("button", { name: /retry/i });
    fail = false;
    fireEvent.click(retry);

    expect(await screen.findByText("Shelf 0")).toBeInTheDocument();
  });

  it("loads the next 12 shelves from the offset when the end comes into view", async () => {
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Shelf 0");

    act(() => FakeObserver.instances.at(-1)!.trigger());

    expect(await screen.findByText("Shelf 12")).toBeInTheDocument();
    expect(getShelves.mock.calls.at(-1)![1]).toMatchObject({ offset: 12, shelf_limit: 12 });
    expect(screen.getByText("Shelf 0")).toBeInTheDocument();
  });

  it("keeps the shelves it has and offers retry when a later page fails", async () => {
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Shelf 0");
    getShelves.mockImplementation(async () => {
      throw new Error("boom");
    });

    act(() => FakeObserver.instances.at(-1)!.trigger());

    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByText("Shelf 0")).toBeInTheDocument();
  });

  it("asks for the order the sort menu names", async () => {
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Shelf 0");

    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    expect(screen.queryByText("Random")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Size"));

    await waitFor(() =>
      expect(getShelves.mock.calls.at(-1)![1]).toMatchObject({ sort: "file_size", order: "desc" }),
    );
  });
});

describe("the smart folder list as an input", () => {
  const trips = { id: "sf", drive: DRIVE, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null };

  it("sends nothing while the saved folder is being looked up, then asks under it", async () => {
    let release: (list: unknown[]) => void = () => {};
    getSmartFolders.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    writeAppPrefs(DRIVE, { target: "sf" });
    render(<VideoApp drive={DRIVE} />);

    await screen.findByRole("button", { name: /Target/ });
    expect(getShelves).not.toHaveBeenCalled();
    expect(getDriveFiles).not.toHaveBeenCalled();
    expect(readAppPrefs(DRIVE).target).toBe("sf");

    await act(async () => release([trips]));

    await waitFor(() =>
      expect(getShelves.mock.calls.some(([, p]) => [p.tag].flat().includes("Trip"))).toBe(true),
    );
  });

  it("keeps the saved folder when the list fails, and uses the default meanwhile", async () => {
    getSmartFolders.mockRejectedValue(new Error("boom"));
    writeAppPrefs(DRIVE, { target: "sf" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    expect(readAppPrefs(DRIVE).target).toBe("sf");
    expect(getShelves.mock.calls.every(([, p]) => p.tag === undefined)).toBe(true);
  });
});

describe("the count in the header", () => {
  it("shows the drive alone while the count loads, and when it fails", async () => {
    getDriveFiles.mockImplementation(async (d: string, p: Params) => {
      if (p.limit === 1) throw new Error("boom");
      return defaultFiles(d, p);
    });
    render(<VideoApp drive={DRIVE} />);

    await screen.findByText("Newest one");
    expect(screen.getByText(DRIVE)).toBeInTheDocument();
  });

  it("reads zero for a target with no videos and asks nothing", async () => {
    getSmartFolders.mockResolvedValue([
      { id: "pics", drive: DRIVE, name: "Pictures", query: "", file_type: "image", sort_by: null, sort_order: null, created_at: "", updated_at: null },
    ]);
    writeAppPrefs(DRIVE, { target: "pics" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(/main · 0/)).toBeInTheDocument();
    expect(getShelves).not.toHaveBeenCalled();
    expect(getDriveFiles).not.toHaveBeenCalled();
    expect(await screen.findByText("No files")).toBeInTheDocument();
  });
});
