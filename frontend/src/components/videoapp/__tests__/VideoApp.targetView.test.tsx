/**
 * SPEC-CORE-145, SPEC-CORE-146: the Video Library's 分類 and 並び順, remembered
 * per Target, and Video's None grid. Labels are the English messages, which
 * is what the shared next-intl mock resolves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";
import { VideoShelfPage } from "../VideoShelfPage";

const { DRIVE } = vi.hoisted(() => ({ DRIVE: "main" }));

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: DRIVE,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
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
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: `/api/files/${id}/thumbnail`,
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

function shelf(key: string, label: string, title: string) {
  return { key, label, count: 1, items: [item(`${key}-1`, title)] };
}

function defaultShelves(_drive: string, params: Params) {
  switch (params.by) {
    case "folder":
      return { by: "folder", total_shelves: 1, shelves: [shelf("Movies", "Movies", "Movie one")] };
    case "tag":
      return { by: "tag", total_shelves: 1, shelves: [shelf("Trip", "Trip", "Trip one")] };
    case "month":
      return { by: "month", total_shelves: 1, shelves: [shelf("2026-03", "2026-03", "March one")] };
    case "duration":
      return { by: "duration", total_shelves: 1, shelves: [shelf("long", "long", "Long one")] };
    case "watch":
      return { by: "watch", total_shelves: 1, shelves: [shelf("unwatched", "", "Watch one")] };
    case "all": {
      const page = Number(params.page) || 1;
      return {
        by: "all",
        total_shelves: 1,
        shelves: [{ key: "all", label: "", count: 61, items: [item(`g${page}`, `Grid page ${page}`)] }],
      };
    }
    default:
      return { by: params.by, total_shelves: 0, shelves: [] };
  }
}

/** The Library body's requests: grouped shelves (5 per shelf) and the None grid (60). */
function libraryCalls(): Params[] {
  return getShelves.mock.calls
    .map(([, p]) => p as Params)
    .filter((p) => p.per_shelf === 5 || (p.by === "all" && p.per_shelf === 60));
}

const lastLibrary = () => libraryCalls().at(-1)!;

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

const VIEW_KEY = `litloft.videoApp.view.${DRIVE}`;
const OLD_KEY = `litloft.videoApp.classification.${DRIVE}`;
const TRIPS = smartFolder("sf-trips", "Trips", "tag:Trip");
const WORK = smartFolder("sf-work", "Work", "tag:Work");

const groupButton = () => screen.getByRole("button", { name: /Group By/ });
const sortButton = () => screen.getByRole("button", { name: /Sort By/ });
const storedViews = () => JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");

async function choose(button: () => HTMLElement, option: string) {
  await waitFor(() => expect(button()).toBeInTheDocument());
  fireEvent.click(button());
  fireEvent.click(await screen.findByRole("menuitemradio", { name: option }));
}

async function chooseTarget(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: new RegExp(name) }));
}

function openLibrary(target?: string) {
  writeAppPrefs(DRIVE, target ? { face: "library", target } : { face: "library" });
  return render(<VideoApp drive={DRIVE} />);
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([TRIPS, WORK]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-145 choosing the view in force", () => {
  it("SPEC-CORE-145 I3 the default Target inherits the old per-drive classification, other Targets do not", async () => {
    localStorage.setItem(OLD_KEY, "tag");
    openLibrary("sf-trips");

    expect(await screen.findByText("Movie one")).toBeInTheDocument();
    expect(libraryCalls().every((p) => p.by === "folder")).toBe(true);

    await chooseTarget("All videos");

    expect(await screen.findByText("Trip one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "tag" });
    expect(localStorage.getItem(OLD_KEY)).toBe("tag");
  });

  it("SPEC-CORE-145 I3 the Target's stored view wins over the old per-drive value", async () => {
    localStorage.setItem(OLD_KEY, "tag");
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "month", sort: "size" } }));
    openLibrary();

    expect(await screen.findByText("March one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "month", sort: "file_size", order: "desc" });
  });

  it("SPEC-CORE-145 I8 a Target with a stored view sends no Library request under another grouping or sort", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ "sf-trips": { group: "tag", sort: "size" } }));
    openLibrary("sf-trips");

    expect(await screen.findByText("Trip one")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(libraryCalls().length).toBeGreaterThan(0);
    for (const call of libraryCalls()) {
      expect(call).toMatchObject({ by: "tag", sort: "file_size", order: "desc" });
    }
  });

  it("SPEC-CORE-145 a Target never configured opens on Folder, newest first", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "tag", sort: "size" } }));
    openLibrary("sf-work");

    expect(await screen.findByText("Movie one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "folder", sort: "created_at", order: "desc" });
    expect(groupButton()).toHaveTextContent("Folder");
    expect(sortButton()).toHaveTextContent("Date Added (Newest First)");
  });

  it("SPEC-CORE-145 I3 a stored value Video does not offer is skipped and never sent", async () => {
    localStorage.setItem(OLD_KEY, "tag");
    localStorage.setItem(
      VIEW_KEY,
      JSON.stringify({ default: { group: "artist", sort: "size" }, "sf-trips": { group: "none", sort: "played" } }),
    );
    openLibrary();

    expect(await screen.findByText("Trip one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "tag", sort: "file_size" });

    await chooseTarget("Trips");

    expect(await screen.findByText("Movie one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "folder", sort: "created_at", order: "desc" });
    const sent = getShelves.mock.calls.map(([, p]) => p as Params);
    expect(sent.some((p) => p.by === "artist" || p.by === "none" || (p.sort === "last_played" && p.per_shelf === 5))).toBe(
      false,
    );
    expect(JSON.parse(localStorage.getItem(VIEW_KEY)!).default.group).toBe("artist");
  });

  it("SPEC-CORE-145 a stored Watch State without a profile shows Folder, stays stored, and applies once a profile exists", async () => {
    nickname = null;
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "watch" } }));
    const { unmount } = openLibrary();

    expect(await screen.findByText("Movie one")).toBeInTheDocument();
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).by === "watch")).toBe(false);
    expect(storedViews()).toEqual({ default: { group: "watch" } });
    unmount();

    nickname = "alice";
    render(<VideoApp drive={DRIVE} />);
    expect(await screen.findByText("Watch one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "watch" });
  });

  it("SPEC-CORE-145 I6 a saved Target that is gone reads and writes the default Target's view and stays stored", async () => {
    localStorage.setItem(
      VIEW_KEY,
      JSON.stringify({ "sf-gone": { group: "tag" }, default: { group: "month" } }),
    );
    openLibrary("sf-gone");

    expect(await screen.findByText("March one")).toBeInTheDocument();
    await choose(sortButton, "Title");

    await waitFor(() =>
      expect(storedViews()).toEqual({ "sf-gone": { group: "tag" }, default: { group: "month", sort: "title" } }),
    );
    expect(localStorage.getItem(`litloft.videoApp.target.${DRIVE}`)).toBe("sf-gone");
  });

  it("SPEC-CORE-145 each drive reads its own views", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "tag" } }));
    localStorage.setItem("litloft.videoApp.view.other", JSON.stringify({ default: { group: "month" } }));
    writeAppPrefs("other", { face: "library" });
    const { rerender } = openLibrary();

    expect(await screen.findByText("Trip one")).toBeInTheDocument();

    rerender(<VideoApp drive="other" />);

    expect(await screen.findByText("March one")).toBeInTheDocument();
    const calls = getShelves.mock.calls.filter(([d, p]) => d === "other" && (p as Params).per_shelf === 5);
    expect(calls.every(([, p]) => (p as Params).by === "month")).toBe(true);
  });
});

describe("SPEC-CORE-145 saving the view", () => {
  it("SPEC-CORE-145 I1 I2 a menu choice writes that field for the Target in force only, and no old key", async () => {
    const others = '{"sf-work":{"sort":"oldest","group":"duration"}}';
    localStorage.setItem(VIEW_KEY, others);
    localStorage.setItem("litloft.readingApp.view.main", '{"default":{"group":"folder"}}');
    localStorage.setItem("litloft.videoApp.view.other", '{"default":{"group":"tag"}}');
    openLibrary("sf-trips");
    await screen.findByText("Movie one");

    await choose(groupButton, "Tag");

    await waitFor(() => expect(storedViews()["sf-trips"]).toEqual({ group: "tag" }));
    expect(JSON.stringify(storedViews()["sf-work"])).toBe('{"sort":"oldest","group":"duration"}');
    expect(localStorage.getItem("litloft.readingApp.view.main")).toBe('{"default":{"group":"folder"}}');
    expect(localStorage.getItem("litloft.videoApp.view.other")).toBe('{"default":{"group":"tag"}}');
    expect(localStorage.getItem(OLD_KEY)).toBeNull();

    await choose(sortButton, "Size");

    await waitFor(() => expect(storedViews()["sf-trips"]).toEqual({ group: "tag", sort: "size" }));
    expect(localStorage.getItem(OLD_KEY)).toBeNull();
  });

  it("SPEC-CORE-145 choosing the value already shown stores it explicitly", async () => {
    openLibrary();
    await screen.findByText("Movie one");

    await choose(groupButton, "Folder");
    await choose(sortButton, "Date Added (Newest First)");

    await waitFor(() => expect(storedViews()).toEqual({ default: { group: "folder", sort: "newest" } }));
  });

  it("SPEC-CORE-145 I4 each Target shows its own view after switching back and forth", async () => {
    openLibrary();
    await screen.findByText("Movie one");

    await choose(groupButton, "Tag");
    await choose(sortButton, "Size");
    await screen.findByText("Trip one");

    await chooseTarget("Trips");
    expect(await screen.findByText("Movie one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "folder", sort: "created_at", order: "desc" });
    await choose(groupButton, "Date Added");
    await screen.findByText("March one");

    await chooseTarget("All videos");
    expect(await screen.findByText("Trip one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "tag", sort: "file_size", order: "desc" });

    await chooseTarget("Trips");
    expect(await screen.findByText("March one")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "month", sort: "created_at", order: "desc" });
  });

  it("SPEC-CORE-145 I19 choosing the Target already in force changes neither the view nor the stored value", async () => {
    openLibrary();
    await screen.findByText("Movie one");
    await choose(sortButton, "Size");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ sort: "file_size" }));
    const asked = libraryCalls().length;

    await chooseTarget("All videos");

    await act(async () => {
      await Promise.resolve();
    });
    expect(sortButton()).toHaveTextContent("Size");
    expect(libraryCalls()).toHaveLength(asked);
    expect(storedViews()).toEqual({ default: { sort: "size" } });
  });

  it("SPEC-CORE-145 I2 the See all page's sort writes no view, and opens on the Library's sort in force", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { sort: "title" } }));
    openLibrary();
    await screen.findByText("Movie one");

    const link = screen.getAllByRole("link", { name: /See all/ })[0];
    expect(new URL(link.getAttribute("href")!, "http://localhost").searchParams.get("sort")).toBe("title");
    const before = localStorage.getItem(VIEW_KEY);
    cleanup();

    render(<VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" initialSort="title" />);
    await screen.findByText("Movie one");
    fireEvent.click(screen.getByRole("button", { name: /Sort By|Title/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Size" }));
    await waitFor(() =>
      expect(getShelves.mock.calls.some(([, p]) => (p as Params).sort === "file_size")).toBe(true),
    );

    expect(localStorage.getItem(VIEW_KEY)).toBe(before);
  });
});

describe("SPEC-CORE-145 I5 storage that fails", () => {
  it("SPEC-CORE-145 I5 unparsable JSON opens on the defaults, and the next choice replaces the key", async () => {
    localStorage.setItem(VIEW_KEY, "{oops");
    openLibrary();

    expect(await screen.findByText("Movie one")).toBeInTheDocument();
    await choose(groupButton, "None");

    expect(await screen.findByText("Grid page 1")).toBeInTheDocument();
    await waitFor(() => expect(storedViews()).toEqual({ default: { group: "all" } }));
  });

  it("SPEC-CORE-145 I5 with storage throwing, the Library draws the defaults and a choice stays shown", async () => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      render(<VideoApp drive={DRIVE} />);
      fireEvent.click(await screen.findByRole("tab", { name: "Library" }));
      await waitFor(() => expect(groupButton()).toHaveTextContent("Folder"));

      await choose(groupButton, "None");

      expect(await screen.findByText("Grid page 1")).toBeInTheDocument();
      expect(groupButton()).toHaveTextContent("None");
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }
  });
});

describe("SPEC-CORE-145 I16 None lists every video as one grid", () => {
  it("SPEC-CORE-145 I16 None asks by=all&key=all 60 a page under the sort in force and appends the next page", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "all", sort: "title" } }));
    openLibrary();

    expect(await screen.findByText("Grid page 1")).toBeInTheDocument();
    expect(libraryCalls()[0]).toMatchObject({
      by: "all",
      key: "all",
      per_shelf: 60,
      page: 1,
      sort: "title",
      type: ["video"],
    });

    await waitFor(() => expect(FakeObserver.instances.length).toBeGreaterThan(0));
    act(() => {
      for (const observer of FakeObserver.instances) observer.trigger();
    });

    expect(await screen.findByText("Grid page 2")).toBeInTheDocument();
    expect(screen.getByText("Grid page 1")).toBeInTheDocument();
    expect(libraryCalls().filter((p) => p.by === "all").map((p) => p.page)).toEqual([1, 2]);
    expect(libraryCalls().every((p) => p.by === "all" && p.per_shelf === 60)).toBe(true);
  });

  it("SPEC-CORE-145 None under a Target sends the Target's conditions", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ "sf-trips": { group: "all" } }));
    openLibrary("sf-trips");

    expect(await screen.findByText("Grid page 1")).toBeInTheDocument();
    expect([lastLibrary().tag].flat()).toContain("Trip");
  });

  it("SPEC-CORE-145 a failed first None page shows Try again, a failed later page Try again at the end", async () => {
    let failPage: number | null = 1;
    getShelves.mockImplementation(async (d, p: Params) => {
      if (p.by === "all" && p.per_shelf === 60 && Number(p.page) === failPage) throw new Error("boom");
      return defaultShelves(d, p);
    });
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "all" } }));
    openLibrary();

    const retry = await screen.findByRole("button", { name: /retry|try again/i });
    failPage = 2;
    fireEvent.click(retry);
    expect(await screen.findByText("Grid page 1")).toBeInTheDocument();

    await waitFor(() => expect(FakeObserver.instances.length).toBeGreaterThan(0));
    act(() => {
      for (const observer of FakeObserver.instances) observer.trigger();
    });
    expect(await screen.findByRole("button", { name: /retry|try again/i })).toBeInTheDocument();
    expect(screen.getByText("Grid page 1")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-146 the Video Library's menus", () => {
  it("SPEC-CORE-146 I15 I9 the Group By menu lists Folder, Tag, Date Added, Length, Watch State and None, in that order", async () => {
    openLibrary();
    await screen.findByText("Movie one");

    fireEvent.click(groupButton());
    const options = (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent?.trim());

    expect(options).toEqual(["Folder", "Tag", "Date Added", "Length", "Watch State", "None"]);
  });

  it("SPEC-CORE-146 I15 without a profile the Group By menu omits Watch State", async () => {
    nickname = null;
    openLibrary();
    await screen.findByText("Movie one");

    fireEvent.click(groupButton());
    const options = (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent?.trim());

    expect(options).toEqual(["Folder", "Tag", "Date Added", "Length", "None"]);
  });

  it("SPEC-CORE-146 I9 the Sort By menu names its options in the new wording", async () => {
    openLibrary();
    await screen.findByText("Movie one");

    fireEvent.click(sortButton());
    const options = (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent?.trim());

    expect(options).toContain("Date Added (Newest First)");
    expect(options).toContain("Date Added (Oldest First)");
    expect(options.some((o) => /Added \((newest|oldest) first\)/.test(o ?? ""))).toBe(false);
  });

  it("SPEC-CORE-146 I12 Group By draws LayoutList and its label, Sort By draws ArrowDownUp and its label, grouping first", async () => {
    openLibrary();
    await screen.findByText("Movie one");

    const group = groupButton();
    const sort = sortButton();
    expect(group).toHaveTextContent("Group By");
    expect(group).toHaveTextContent("Folder");
    expect(sort).toHaveTextContent("Sort By");
    expect(sort).toHaveTextContent("Date Added (Newest First)");
    expect(group.querySelector("svg")?.getAttribute("class")).toContain("lucide-layout-list");
    expect(sort.querySelector("svg")?.getAttribute("class")).toContain("lucide-arrow-down-up");
    expect(group.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SPEC-CORE-146 I9 the Continue shelf page names its first sort Date Last Opened", async () => {
    render(<VideoShelfPage drive={DRIVE} by="watch" shelfKey="continue" />);
    await screen.findByText("Watch one");

    const button = screen.getAllByRole("button").find((b) => /Date Last Opened/.test(b.textContent ?? ""));
    expect(button).toBeDefined();
    fireEvent.click(button!);
    const options = (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent?.trim());
    expect(options[0]).toBe("Date Last Opened");
    expect(options).toContain("Date Added (Newest First)");
    expect(within(document.body).queryByText("Last opened")).toBeNull();
  });
});
