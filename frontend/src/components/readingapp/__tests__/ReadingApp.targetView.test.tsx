/**
 * SPEC-CORE-145, SPEC-CORE-146: the Reading Library's 分類 (Tag, Folder, Date
 * Added, None) and 並び順, remembered per Target, and the Folder and Date
 * Added shelves and shelf pages. Labels are the English messages.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "@/components/videoapp/VideoApp";
import { ReadingApp } from "../ReadingApp";
import { ReadingShelfPage } from "../ReadingShelfPage";

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

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: "main",
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
const getDriveTags = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
  getDriveTags: (...args: unknown[]) => getDriveTags(...args),
}));

type Params = Record<string, unknown>;

function book(id: string, title: string) {
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

const isChips = (p: Params) => p.by === "folder" && p.per_shelf === 1;
const isCount = (p: Params) => p.by === "all" && p.per_shelf === 1;

function shelves(_drive: string, params: Params) {
  if (isChips(params)) {
    return {
      by: "folder",
      base: "",
      total_shelves: 2,
      shelves: [
        { key: "Comics", label: "Comics", count: 3, items: [book("chip-c", "Comics")] },
        { key: "Novels", label: "Novels", count: 3, items: [book("chip-n", "Novels")] },
      ],
    };
  }
  if (isCount(params)) {
    return { by: "all", total_shelves: 1, shelves: [{ key: "all", label: "", count: 6, items: [] }] };
  }
  if (params.key !== undefined && params.by !== "all") {
    return {
      by: params.by,
      total_shelves: 1,
      shelves: [{ key: params.key, label: String(params.key), count: 1, items: [book("page-1", "Shelf book")] }],
    };
  }
  switch (params.by) {
    case "folder":
      return {
        by: "folder",
        base: "",
        total_shelves: 2,
        shelves: [
          { key: "Shows/Season 1", label: "Season 1", count: 2, items: [book("f1", "Folder book")] },
          { key: "", label: "", count: 1, items: [book("f2", "Root book")] },
        ],
      };
    case "month":
      return {
        by: "month",
        total_shelves: 1,
        shelves: [{ key: "2026-03", label: "2026-03", count: 1, items: [book("m1", "Month book")] }],
      };
    case "tag":
      return {
        by: "tag",
        total_shelves: 1,
        shelves: [{ key: "Trip", label: "Trip", count: 1, items: [book("t1", "Tag book")] }],
      };
    case "all":
      return {
        by: "all",
        total_shelves: 1,
        shelves: [{ key: "all", label: "", count: 1, items: [book("a1", "Flat book")] }],
      };
    default:
      return { by: params.by, total_shelves: 0, shelves: [] };
  }
}

/** The Library body's requests, without the chips and the count. */
function libraryCalls(): Params[] {
  return getShelves.mock.calls
    .map(([, p]) => p as Params)
    .filter((p) => !isChips(p) && !isCount(p) && p.key !== "continue");
}

const lastLibrary = () => libraryCalls().at(-1)!;

const VIEW_KEY = `litloft.readingApp.view.${DRIVE}`;
const OLD_KEY = `litloft.readingApp.group.${DRIVE}`;
const BOOKS = smartFolder("sf-books", "Books", "tag:read");
const LATER = smartFolder("sf-later", "Later", "tag:later");

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
  writeAppPrefs(DRIVE, target ? { face: "library", target } : { face: "library" }, "reading");
  return render(<ReadingApp drive={DRIVE} />);
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([BOOKS, LATER]);
  getCollections.mockReset().mockResolvedValue([]);
  getDriveTags.mockReset().mockResolvedValue([{ name: "read", count: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-145 choosing Reading's view in force", () => {
  it("SPEC-CORE-145 I3 the default Target inherits the old per-drive group, other Targets open on None", async () => {
    localStorage.setItem(OLD_KEY, "tag");
    openLibrary("sf-books");

    expect(await screen.findByText("Flat book")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "all", sort: "created_at", order: "desc" });

    await chooseTarget("All books");

    expect(await screen.findByText("Tag book")).toBeInTheDocument();
    expect(localStorage.getItem(OLD_KEY)).toBe("tag");
  });

  it("SPEC-CORE-145 I8 a stored view is the first Library request's grouping and sort", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ "sf-books": { group: "month", sort: "size" } }));
    openLibrary("sf-books");

    expect(await screen.findByText("Month book")).toBeInTheDocument();
    expect(libraryCalls().length).toBeGreaterThan(0);
    for (const call of libraryCalls()) expect(call).toMatchObject({ by: "month", sort: "file_size", order: "desc" });
  });

  it("SPEC-CORE-145 I4 each Target shows its own group and sort after switching back and forth", async () => {
    openLibrary();
    await screen.findByText("Flat book");

    await choose(groupButton, "Folder");
    await choose(sortButton, "Title");
    await screen.findByText("Folder book");

    await chooseTarget("Books");
    expect(await screen.findByText("Flat book")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "all", sort: "created_at", order: "desc" });
    await choose(groupButton, "Tag");
    await screen.findByText("Tag book");

    await chooseTarget("All books");
    expect(await screen.findByText("Folder book")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "folder", sort: "title" });

    await chooseTarget("Books");
    expect(await screen.findByText("Tag book")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "tag", sort: "created_at", order: "desc" });
  });

  it("SPEC-CORE-145 I1 I2 a menu choice writes only that field for the Target in force, and not the old group key", async () => {
    localStorage.setItem(VIEW_KEY, '{"sf-later":{"group":"tag"}}');
    openLibrary("sf-books");
    await screen.findByText("Flat book");

    await choose(groupButton, "Date Added");
    await waitFor(() => expect(storedViews()).toEqual({ "sf-later": { group: "tag" }, "sf-books": { group: "month" } }));
    await choose(sortButton, "Size");
    await waitFor(() =>
      expect(storedViews()).toEqual({ "sf-later": { group: "tag" }, "sf-books": { group: "month", sort: "size" } }),
    );

    expect(localStorage.getItem(OLD_KEY)).toBeNull();
    expect(localStorage.getItem(`litloft.videoApp.view.${DRIVE}`)).toBeNull();
  });

  it("SPEC-CORE-145 I6 a saved Target that is gone uses the default Target's view", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ "sf-gone": { group: "tag" }, default: { group: "folder" } }));
    openLibrary("sf-gone");

    expect(await screen.findByText("Folder book")).toBeInTheDocument();
    await choose(sortButton, "Title");
    await waitFor(() =>
      expect(storedViews()).toEqual({ "sf-gone": { group: "tag" }, default: { group: "folder", sort: "title" } }),
    );
    expect(localStorage.getItem(`litloft.readingApp.target.${DRIVE}`)).toBe("sf-gone");
  });

  it("SPEC-CORE-145 I3 a stored group Reading does not offer is skipped and never sent", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "duration", sort: "size" } }));
    openLibrary();

    expect(await screen.findByText("Flat book")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "all", sort: "file_size" });
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).by === "duration")).toBe(false);
  });
});

describe("SPEC-CORE-145 I5 Reading with storage that fails", () => {
  it("SPEC-CORE-145 I5 with storage throwing, the Library draws None and a choice stays shown", async () => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      render(<ReadingApp drive={DRIVE} />);
      fireEvent.click(await screen.findByRole("tab", { name: "Library" }));
      await waitFor(() => expect(groupButton()).toHaveTextContent("None"));

      await choose(groupButton, "Folder");

      expect(await screen.findByText("Folder book")).toBeInTheDocument();
      expect(groupButton()).toHaveTextContent("Folder");
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }
  });

  it("SPEC-CORE-145 I5 unparsable JSON opens on None, and the next choice replaces the key", async () => {
    localStorage.setItem(VIEW_KEY, "[oops");
    openLibrary();

    expect(await screen.findByText("Flat book")).toBeInTheDocument();
    await choose(groupButton, "Tag");

    expect(await screen.findByText("Tag book")).toBeInTheDocument();
    await waitFor(() => expect(storedViews()).toEqual({ default: { group: "tag" } }));
  });
});

describe("SPEC-CORE-145 I18 Reading's Folder and Date Added", () => {
  it("SPEC-CORE-146 I15 the Group By menu lists Tag, Folder, Date Added and None, in that order", async () => {
    openLibrary();
    await screen.findByText("Flat book");

    fireEvent.click(groupButton());
    const options = (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent?.trim());

    expect(options).toEqual(["Tag", "Folder", "Date Added", "None"]);
  });

  it("SPEC-CORE-145 I18 Folder pages folder shelves like By tag, titles them by last segment or the drive name, and See all carries the conditions", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "folder", sort: "size" } }));
    openLibrary();

    expect(await screen.findByText("Folder book")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({
      by: "folder",
      per_shelf: 12,
      shelf_limit: 12,
      sort: "file_size",
      order: "desc",
      type: ["pdf", "epub", "archive"],
    });
    expect(screen.getByRole("heading", { level: 2, name: "Season 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: DRIVE })).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "See all: Season 1" });
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect([url.searchParams.get("by"), url.searchParams.get("key"), url.searchParams.get("sort")]).toEqual([
      "folder",
      "Shows/Season 1",
      "size",
    ]);
  });

  it("SPEC-CORE-145 I18 a folder chip narrows the books and Folder groups the books inside it", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "folder" } }));
    openLibrary();
    await screen.findByText("Folder book");

    fireEvent.click(within(screen.getByTestId("reading-chips")).getByRole("button", { name: "Comics" }));

    await waitFor(() =>
      expect(libraryCalls().some((p) => p.by === "folder" && JSON.stringify(p.folder) === '["Comics"]')).toBe(true),
    );
    expect(lastLibrary()).toMatchObject({ by: "folder", per_shelf: 12 });
  });

  it("SPEC-CORE-145 I18 Date Added asks by=month under the tags in force and See all carries the key and sort", async () => {
    openLibrary();
    await screen.findByText("Flat book");

    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /read/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tag/ }), { key: "Escape" });
    await choose(groupButton, "Date Added");

    expect(await screen.findByText("Month book")).toBeInTheDocument();
    expect(lastLibrary()).toMatchObject({ by: "month", per_shelf: 12, shelf_limit: 12, tag: ["read"] });
    const link = screen.getAllByRole("link", { name: /See all/ })[0];
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect([url.searchParams.get("by"), url.searchParams.get("key")]).toEqual(["month", "2026-03"]);
    expect(url.searchParams.getAll("tag")).toEqual(["read"]);
  });

  it("SPEC-CORE-145 I18 a month shelf and its shelf page are titled as Video titles a month shelf", async () => {
    localStorage.setItem(`litloft.videoApp.view.${DRIVE}`, JSON.stringify({ default: { group: "month" } }));
    writeAppPrefs(DRIVE, { face: "library" });
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Month book");
    const videoTitle = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "").find((t) => /2026/.test(t));
    expect(videoTitle).toBeDefined();
    cleanup();

    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "month" } }));
    openLibrary();
    await screen.findByText("Month book");
    expect(screen.getByRole("heading", { level: 2, name: videoTitle })).toBeInTheDocument();
    cleanup();

    render(<ReadingShelfPage drive={DRIVE} by={"month" as never} shelfKey="2026-03" />);
    expect(await screen.findByRole("heading", { name: videoTitle })).toBeInTheDocument();
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).by === "month" && (p as Params).key === "2026-03")).toBe(true);
  });

  it("SPEC-CORE-145 I18 a month shelf page with a key that is not YYYY-MM shows its invalid-key state and asks nothing", async () => {
    render(<ReadingShelfPage drive={DRIVE} by={"month" as never} shelfKey="2026-3" />);

    expect(await screen.findByText("No books")).toBeInTheDocument();
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).by === "month")).toBe(false);
    cleanup();

    render(<ReadingShelfPage drive={DRIVE} by={"month" as never} shelfKey="2026-04" />);
    await waitFor(() =>
      expect(getShelves.mock.calls.some(([, p]) => (p as Params).by === "month" && (p as Params).key === "2026-04")).toBe(
        true,
      ),
    );
  });

  it("SPEC-CORE-145 a failed first Folder page shows the Library's failed state with a retry", async () => {
    getShelves.mockImplementation(async (d, p: Params) => {
      if (p.by === "folder" && p.per_shelf === 12) throw new Error("boom");
      return shelves(d, p);
    });
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "folder" } }));
    openLibrary();

    expect(await screen.findByRole("button", { name: /retry|try again/i })).toBeInTheDocument();
    await waitFor(() => expect(libraryCalls().some((p) => p.by === "folder" && p.per_shelf === 12)).toBe(true));
  });
});

describe("SPEC-CORE-146 the Reading Library's menus", () => {
  it("SPEC-CORE-146 I9 I12 Group By and Sort By show their labels and icons, grouping first", async () => {
    openLibrary();
    await screen.findByText("Flat book");

    const group = groupButton();
    const sort = sortButton();
    expect(group).toHaveTextContent("None");
    expect(sort).toHaveTextContent("Date Added (Newest First)");
    expect(group.querySelector("svg")?.getAttribute("class")).toContain("lucide-layout-list");
    expect(sort.querySelector("svg")?.getAttribute("class")).toContain("lucide-arrow-down-up");
    expect(group.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SPEC-CORE-146 I9 the Continue shelf page names its first sort Date Last Opened", async () => {
    render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" />);
    await screen.findByText("Shelf book");

    const button = screen.getAllByRole("button").find((b) => /Date Last Opened/.test(b.textContent ?? ""));
    expect(button).toBeDefined();
    fireEvent.click(button!);
    const options = (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent?.trim());
    expect(options[0]).toBe("Date Last Opened");
    expect(options).toContain("Date Added (Newest First)");
  });

  it("SPEC-CORE-146 I9 the Sort By menu names its options in the new wording", async () => {
    openLibrary();
    await screen.findByText("Flat book");

    fireEvent.click(sortButton());
    const options = (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent?.trim());

    expect(options).toContain("Date Added (Newest First)");
    expect(options).toContain("Date Added (Oldest First)");
  });
});
