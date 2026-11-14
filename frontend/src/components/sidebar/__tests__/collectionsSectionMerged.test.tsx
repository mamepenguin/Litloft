/**
 * SPEC-CORE-107: one sidebar section holds collections and Smart Collections
 * (I3–I6), and the sidebar row of a Smart Collection draws ListFilter with no
 * count (SPEC-CORE-106 I1). Driven through the whole `Sidebar`, with the
 * drive's lists answered at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";

import {
  type Col,
  type ListAnswer,
  type Smart,
  dragBefore,
  drawnOrder,
  headingOf,
  iconOf,
  kindIcons,
  renderSidebar,
  rowsFor,
  sectionHeadings,
  sidebarApi,
} from "@/__tests__/helpers/sidebarHarness";
import { json } from "@/__tests__/helpers/nameInUse";
import en from "@/messages-core/en.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
}));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
    catalogueDrive: null,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/sidebar/AddonNavRows", () => ({ AddonNavRows: () => null }));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));

const MERGED_KEY = "sidebar:order:collections-all:main";
const OLD_COLLECTIONS_KEY = "sidebar:order:collections:main";
const OLD_SMART_KEY = "sidebar:order:smart-folders:main";

let api: ReturnType<typeof sidebarApi>;

function serve(collections: ListAnswer<Col>, smart: ListAnswer<Smart>, pins?: { path: string }[]) {
  api = sidebarApi({ collections, smart, pins });
  vi.stubGlobal("fetch", api.fetch);
}

const namesOf = (collections: ListAnswer<Col>, smart: ListAnswer<Smart>) => [
  ...(collections === "fail" ? [] : collections.map((c) => c.name)),
  ...(smart === "fail" ? [] : smart.map((s) => s.name)),
];

async function show(collections: ListAnswer<Col>, smart: ListAnswer<Smart>, pins?: { path: string }[]) {
  serve(collections, smart, pins);
  const view = renderSidebar();
  const names = namesOf(collections, smart);
  await waitFor(() => expect(rowsFor(names)).toHaveLength(names.length));
  return view;
}

const stored = (key = MERGED_KEY) => {
  const raw = localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SPEC-CORE-107 I3 one Collections section", () => {
  it("SPEC-CORE-107 I3 holds both kinds as rows of one list under the Collections heading", async () => {
    const collections = [
      { id: "c1", name: "apple", item_count: 3 },
      { id: "c2", name: "cherry", item_count: 0 },
    ];
    const smart = [{ id: "s1", name: "Banana" }];
    await show(collections, smart);

    expect(drawnOrder(["apple", "Banana", "cherry"])).toEqual(["apple", "Banana", "cherry"]);
    for (const { name, row } of rowsFor(["apple", "Banana", "cherry"])) {
      expect(headingOf(row), name).toBe(en.sidebar.collections);
    }
    const headings = sectionHeadings();
    expect(headings.filter((h) => h === en.sidebar.collections)).toHaveLength(1);
    expect(headings.filter((h) => /smart/i.test(h))).toEqual([]);
    expect(screen.getByRole("button", { name: en.sidebar.createCollection })).toBeInTheDocument();
  });

  it("SPEC-CORE-107 I3 is shown for a drive with no collection and no Smart Collection", async () => {
    serve([], []);
    const empty = renderSidebar();
    await waitFor(() => expect(api.count("GET", /\/smart-folders$/)).toBeGreaterThan(0));
    await waitFor(() => expect(sectionHeadings()).toContain(en.sidebar.collections));
    expect(screen.getByRole("button", { name: en.sidebar.createCollection })).toBeInTheDocument();
    expect(sectionHeadings().filter((h) => /smart/i.test(h))).toEqual([]);

    // A Smart Collection that exists is drawn in that same section.
    empty.unmount();
    vi.unstubAllGlobals();
    await show([], [{ id: "s1", name: "Only smart" }]);
    const [{ row }] = rowsFor(["Only smart"]);
    expect(headingOf(row)).toBe(en.sidebar.collections);
  });

  it("SPEC-CORE-107 I3 collapses both kinds under the collections id, and ignores a smart-folders collapse", async () => {
    localStorage.setItem("sidebar:section:smart-folders:collapsed", "1");
    await show([{ id: "c1", name: "apple" }], [{ id: "s1", name: "Banana" }]);
    expect(drawnOrder(["apple", "Banana"])).toEqual(["apple", "Banana"]);

    const [{ row }] = rowsFor(["apple"]);
    const heading = Array.from(document.querySelectorAll<HTMLElement>("nav button[aria-expanded]")).find(
      (h) => (h.textContent ?? "").trim() === en.sidebar.collections,
    )!;
    expect(headingOf(row)).toBe(en.sidebar.collections);
    fireEvent.click(heading);

    expect(drawnOrder(["apple", "Banana"])).toEqual([]);
    expect(localStorage.getItem("sidebar:section:collections:collapsed")).toBe("1");
  });

  it("SPEC-CORE-107 I3 a saved section order naming smart-folders keeps the others' relative order", async () => {
    localStorage.setItem("sidebar:order:sections", JSON.stringify(["pins", "smart-folders", "collections"]));
    await show([{ id: "c1", name: "apple" }], [{ id: "s1", name: "Banana" }], [{ path: "music" }]);
    await waitFor(() => expect(sectionHeadings()).toContain(en.sidebar.pins));

    const headings = sectionHeadings();
    expect(headings.indexOf(en.sidebar.pins)).toBeLessThan(headings.indexOf(en.sidebar.collections));
    expect(headings.filter((h) => /smart/i.test(h))).toEqual([]);
  });

  it("SPEC-CORE-107 I3 a saved section order with collections first keeps it first", async () => {
    localStorage.setItem("sidebar:order:sections", JSON.stringify(["collections", "smart-folders", "pins"]));
    await show([{ id: "c1", name: "apple" }], [{ id: "s1", name: "Banana" }], [{ path: "music" }]);
    await waitFor(() => expect(sectionHeadings()).toContain(en.sidebar.pins));

    const headings = sectionHeadings();
    expect(headings.indexOf(en.sidebar.collections)).toBeLessThan(headings.indexOf(en.sidebar.pins));
    expect(headings.filter((h) => /smart/i.test(h))).toEqual([]);
  });
});

describe("SPEC-CORE-107 step 2 / SPEC-CORE-106 I1 the rows", () => {
  it("SPEC-CORE-106 I1 a Smart Collection row draws ListFilter and no count; a collection row draws Library and its count", async () => {
    const icons = kindIcons();
    await show([{ id: "c1", name: "apple", item_count: 7 }], [{ id: "s1", name: "Banana" }]);
    const [apple, banana] = rowsFor(["apple", "Banana"]);

    expect(iconOf(banana.row)).toEqual([icons.smart]);
    expect((banana.row.textContent ?? "").trim()).toBe("Banana");
    expect(iconOf(apple.row)).toEqual([icons.collection]);
    expect(apple.row.textContent).toContain("7");
    expect(banana.row.className.split(/\s+/)).toContain("rounded-lg");
    expect(apple.row.className.split(/\s+/)).toContain("rounded-lg");
  });
});

describe("SPEC-CORE-107 I4 name order with nothing saved", () => {
  it("SPEC-CORE-107 I4 sorts by numeric collation across kinds, collection first on equal names, then by id", async () => {
    const icons = kindIcons();
    const collections = [
      { id: "c9", name: "Trip" },
      { id: "cb", name: "Dup" },
      { id: "c1", name: "a10" },
      { id: "ca", name: "Dup" },
      { id: "c2", name: "apple" },
    ];
    const smart = [
      { id: "s1", name: "Banana" },
      { id: "s0", name: "Trip" },
      { id: "s2", name: "a2" },
    ];
    await show(collections, smart);

    const rows = rowsFor(namesOf(collections, smart)).map(({ name, row }) => [
      name,
      iconOf(row)[0] === icons.smart ? "smart" : iconOf(row)[0] === icons.collection ? "collection" : "?",
    ]);
    expect(rows).toEqual([
      ["a2", "smart"],
      ["a10", "collection"],
      ["apple", "collection"],
      ["Banana", "smart"],
      ["Dup", "collection"],
      ["Dup", "collection"],
      ["Trip", "collection"],
      ["Trip", "smart"],
    ]);
  });

  it("SPEC-CORE-107 I4 orders two collections of one name by id in code-unit order", async () => {
    await show(
      [
        { id: "cb", name: "Dup", item_count: 2 },
        { id: "ca", name: "Dup", item_count: 1 },
      ],
      [{ id: "s1", name: "Banana" }],
    );
    const dups = rowsFor(["Dup"]).map(({ row }) => (row.textContent ?? "").replace("Dup", "").trim());
    expect(dups).toEqual(["1", "2"]);
    expect(drawnOrder(["Banana", "Dup"])).toEqual(["Banana", "Dup", "Dup"]);
  });
});

describe("SPEC-CORE-107 I5 a drag order", () => {
  it("SPEC-CORE-107 I5 is saved per drive with kind-prefixed entries and survives a reload", async () => {
    const collections = [
      { id: "c1", name: "apple" },
      { id: "c2", name: "cherry" },
    ];
    const smart = [{ id: "s1", name: "banana" }];
    const view = await show(collections, smart);
    expect(drawnOrder(["apple", "banana", "cherry"])).toEqual(["apple", "banana", "cherry"]);

    const [apple, , cherry] = rowsFor(["apple", "banana", "cherry"]);
    dragBefore(cherry.row, apple.row);

    expect(drawnOrder(["apple", "banana", "cherry"])).toEqual(["cherry", "apple", "banana"]);
    expect(stored()).toEqual(["collection:c2", "collection:c1", "smart:s1"]);

    view.unmount();
    vi.unstubAllGlobals();
    await show(collections, smart);
    expect(drawnOrder(["apple", "banana", "cherry"])).toEqual(["cherry", "apple", "banana"]);
  });

  it("SPEC-CORE-107 I5 moves a Smart Collection row among collection rows", async () => {
    await show(
      [
        { id: "c1", name: "apple" },
        { id: "c2", name: "cherry" },
      ],
      [{ id: "s1", name: "date" }],
    );
    const [apple, , date] = rowsFor(["apple", "cherry", "date"]);
    dragBefore(date.row, apple.row);

    expect(drawnOrder(["apple", "cherry", "date"])).toEqual(["date", "apple", "cherry"]);
    expect(stored()).toEqual(["smart:s1", "collection:c1", "collection:c2"]);
  });

  it("SPEC-CORE-107 I5 places a row missing from the saved order right after its nearest placed predecessor by name", async () => {
    localStorage.setItem(MERGED_KEY, JSON.stringify(["collection:c3", "collection:c1"]));
    await show(
      [
        { id: "c1", name: "apple" },
        { id: "c2", name: "banana" },
        { id: "c3", name: "cherry" },
      ],
      [{ id: "s1", name: "aardvark" }],
    );
    expect(drawnOrder(["aardvark", "apple", "banana", "cherry"])).toEqual([
      "aardvark",
      "cherry",
      "apple",
      "banana",
    ]);
  });

  it("SPEC-CORE-107 I5 keeps a renamed row at its saved position", async () => {
    localStorage.setItem(MERGED_KEY, JSON.stringify(["collection:c1", "smart:s1", "collection:c3"]));
    await show(
      [
        { id: "c3", name: "cherry" },
        { id: "c1", name: "zebra" },
      ],
      [{ id: "s1", name: "mango" }],
    );
    expect(drawnOrder(["cherry", "zebra", "mango"])).toEqual(["zebra", "mango", "cherry"]);
  });

  it("SPEC-CORE-107 I5 a drag while the Smart Collections failed to load keeps their saved entries after the drawn ones", async () => {
    localStorage.setItem(
      MERGED_KEY,
      JSON.stringify(["smart:s1", "collection:c2", "smart:s9", "collection:c1"]),
    );
    await show(
      [
        { id: "c1", name: "apple" },
        { id: "c2", name: "cherry" },
      ],
      "fail",
    );
    await waitFor(() => expect(api.count("GET", /\/smart-folders$/)).toBeGreaterThan(0));
    expect(drawnOrder(["apple", "cherry"])).toEqual(["cherry", "apple"]);

    const [apple, cherry] = rowsFor(["apple", "cherry"]).sort((a, b) => a.name.localeCompare(b.name));
    dragBefore(apple.row, cherry.row);

    expect(drawnOrder(["apple", "cherry"])).toEqual(["apple", "cherry"]);
    expect(stored()).toEqual(["collection:c1", "collection:c2", "smart:s1", "smart:s9"]);
  });

  it("SPEC-CORE-107 I5 a drag while the collections failed to load keeps their saved entries", async () => {
    localStorage.setItem(MERGED_KEY, JSON.stringify(["collection:c1", "smart:s2", "smart:s1"]));
    await show("fail", [
      { id: "s1", name: "banana" },
      { id: "s2", name: "date" },
    ]);
    await waitFor(() => expect(api.count("GET", /\/collections$/)).toBeGreaterThan(0));
    expect(drawnOrder(["banana", "date"])).toEqual(["date", "banana"]);

    const [banana, date] = rowsFor(["banana", "date"]).sort((a, b) => a.name.localeCompare(b.name));
    dragBefore(banana.row, date.row);

    expect(stored()).toEqual(["smart:s1", "smart:s2", "collection:c1"]);
  });

  it("SPEC-CORE-107 step 4 the per-kind keys are neither read nor deleted", async () => {
    localStorage.setItem(OLD_COLLECTIONS_KEY, JSON.stringify(["c2", "c1"]));
    localStorage.setItem(OLD_SMART_KEY, JSON.stringify(["s2", "s1"]));
    await show(
      [
        { id: "c1", name: "apple" },
        { id: "c2", name: "cherry" },
      ],
      [
        { id: "s1", name: "banana" },
        { id: "s2", name: "date" },
      ],
    );
    expect(drawnOrder(["apple", "banana", "cherry", "date"])).toEqual(["apple", "banana", "cherry", "date"]);

    const rows = rowsFor(["apple", "banana", "cherry", "date"]);
    dragBefore(rows[3].row, rows[0].row);

    expect(stored()).toEqual(["smart:s2", "collection:c1", "smart:s1", "collection:c2"]);
    expect(stored(OLD_COLLECTIONS_KEY)).toEqual(["c2", "c1"]);
    expect(stored(OLD_SMART_KEY)).toEqual(["s2", "s1"]);
  });
});

describe("SPEC-CORE-107 failure cases: storage that cannot be used", () => {
  const data = {
    collections: [
      { id: "c1", name: "apple" },
      { id: "c2", name: "cherry" },
    ],
    smart: [{ id: "s1", name: "banana" }],
  };
  const names = ["apple", "banana", "cherry"];

  it.each([
    ["an object", JSON.stringify({ order: ["collection:c2"] })],
    ["an array holding a non-string", JSON.stringify(["collection:c2", 3])],
    ["text that is not JSON", "not json"],
  ])("SPEC-CORE-107 uses name order when the saved value is %s, and a drag still reorders", async (_label, raw) => {
    localStorage.setItem(MERGED_KEY, raw);
    await show(data.collections, data.smart);
    expect(drawnOrder(names)).toEqual(["apple", "banana", "cherry"]);

    const rows = rowsFor(names);
    dragBefore(rows[2].row, rows[0].row);
    expect(drawnOrder(names)).toEqual(["cherry", "apple", "banana"]);
  });

  it("SPEC-CORE-107 uses name order when storage throws, and a drag still reorders for the session", async () => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key.startsWith("sidebar:order:collections-all")) throw new Error("SecurityError");
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith("sidebar:order:collections-all")) throw new Error("QuotaExceededError");
      return setItem.call(this, key, value);
    });
    await show(data.collections, data.smart);
    expect(drawnOrder(names)).toEqual(["apple", "banana", "cherry"]);

    const rows = rowsFor(names);
    dragBefore(rows[2].row, rows[0].row);
    expect(drawnOrder(names)).toEqual(["cherry", "apple", "banana"]);
  });
});

describe("SPEC-CORE-107 I6 a file dropped on a row", () => {
  function fileDrop(target: HTMLElement) {
    const dataTransfer = {
      types: ["application/x-file-ids"],
      getData: (t: string) => (t === "application/x-file-ids" ? JSON.stringify(["f1", "f2"]) : ""),
      setData: () => {},
      effectAllowed: "all",
      dropEffect: "",
    };
    const over = createEvent.dragOver(target, { dataTransfer });
    fireEvent(target, over);
    fireEvent.drop(target, { dataTransfer });
    return over.defaultPrevented;
  }

  it("SPEC-CORE-107 I6 a Smart Collection row does not take it; a collection row adds the files", async () => {
    const icons = kindIcons();
    await show([{ id: "c1", name: "apple" }], [{ id: "s1", name: "Banana" }]);
    api.on("POST", /\/collections\/c1\/items$/, () => json({}));
    const [apple, banana] = rowsFor(["apple", "Banana"]);
    expect(iconOf(banana.row)).toEqual([icons.smart]);

    let accepted = true;
    await act(async () => {
      accepted = fileDrop(banana.row);
    });
    expect(accepted).toBe(false);
    expect(api.calls.filter((c) => c.method !== "GET")).toEqual([]);

    await act(async () => {
      fileDrop(apple.row);
    });
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === "POST")).toEqual([
        { method: "POST", path: "/api/drives/main/collections/c1/items", body: { file_ids: ["f1", "f2"] } },
      ]),
    );
  });
});
