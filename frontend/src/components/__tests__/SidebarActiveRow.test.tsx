import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import { Sidebar } from "../Sidebar";
import { FIXED_SIDEBAR_ROWS } from "../sidebar/__tests__/fixedRows";
import type { CollectionSummary } from "@/types";

/**
 * A drive whose name is not its own encoding, so the two independent
 * constructions of the drive's URL base — `Sidebar`'s `driveBase` and
 * `isSidebarLinkActive`'s `base` — have somewhere to disagree.
 */
const DRIVE = "家族ビデオ & co";
const ENCODED = `/drive/${encodeURIComponent(DRIVE)}`;
const DECODED = `/drive/${DRIVE}`;

/**
 * A pinned folder whose path needs encoding too, for the same reason the
 * drive name does: `pinHrefFor` and the Library row's yield both have to
 * agree about the spelling, and a path of `recipes` cannot tell them apart.
 */
const PINNED_PATH = "料理 & おやつ";
let isAdmin = false;
let overlay = false;
const mockClose = vi.fn();
const UNPINNED_PATH = "旅行";
const SMART_FOLDER_NAME = "ケーキ";
const COLLECTION_NAME = "旅の記録";
let pins: { path: string }[] = [];
let collections: CollectionSummary[] = [];

let pathname = ENCODED;
let search = new URLSearchParams();
let tags: { resolvedScope: { drive: string; folderPath: string | null }; items: { name: string; count: number }[] } | null =
  null;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({
    isOpen: true,
    isOverlay: overlay,
    close: mockClose,
    refreshKey: 0,
  }),
}));

vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: {}, slots: {}, loading: false }),
}));

vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => DRIVE,
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("../sidebar/useSidebarData", () => ({
  useSidebarData: () => ({
    drives: [{ name: DRIVE, file_count: 1 }],
    tags,
    pins,
    collectionList: collections,
    setCollectionList: vi.fn(),
    authStatus: { is_admin: isAdmin },
    driveSummary: { missing_count: 3 },
  }),
}));

vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));

vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: smartFolders(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));
const smartFolders = () => [{ id: "sf1", name: SMART_FOLDER_NAME, query: "cake", file_type: null }];



function driveRows() {
  // Filtered in JS rather than with an attribute selector: the encoded
  // drive name carries `%` and `&`.
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter(
    (a) => (a.getAttribute("href") ?? "").startsWith(ENCODED),
  );
}

const HIGHLIGHT = "bg-bg-elevated";

function highlighted() {
  return driveRows()
    .filter((a) => a.className.split(/\s+/).includes(HIGHLIGHT))
    .map((a) => a.textContent?.replace(/\d+$/, "").trim());
}

beforeEach(() => {
  pathname = ENCODED;
  search = new URLSearchParams();
  tags = null;
  pins = [];
  collections = [];
  isAdmin = false;
  overlay = false;
  mockClose.mockClear();
});

describe("the drive's fixed sidebar rows", () => {
  it("renders each one once, in order, with the view value it carries", () => {
    render(<Sidebar />);
    const seen = driveRows().map((a) => {
      const url = new URL(a.getAttribute("href")!, "http://x");
      return {
        label: a.textContent?.replace(/\d+$/, "").trim(),
        view: url.searchParams.get("view"),
      };
    });
    expect(seen).toEqual(FIXED_SIDEBAR_ROWS);
  });

  it("renders more than nothing, so the table above is not vacuous", () => {
    render(<Sidebar />);
    expect(driveRows().length).toBe(FIXED_SIDEBAR_ROWS.length);
    expect(FIXED_SIDEBAR_ROWS.length).toBe(9);
  });
});

describe("the column's three parts, in order", () => {
  it("puts the reader's own sections between the purpose rows and the drive's", () => {
    pins = [{ path: PINNED_PATH }];
    tags = { resolvedScope: { drive: DRIVE, folderPath: null }, items: [{ name: "soup", count: 2 }] };
    collections = [
      {
        id: "c1",
        name: COLLECTION_NAME,
        description: null,
        drive: DRIVE,
        item_count: 1,
        first_file_id: null,
        created_at: "2026-01-01T00:00:00",
        updated_at: "2026-01-01T00:00:00",
      },
    ];
    const { container } = render(<Sidebar />);
    const text = container.textContent ?? "";
    const at = (needle: string) => {
      const i = text.indexOf(needle);
      expect(i, `${needle} is not on the column`).not.toBe(-1);
      return i;
    };
    // All four, because a chain drawn through one of them holds while
    // any of the other three is missing from the column altogether.
    expect(at("Library")).toBeLessThan(at("All Files"));
    for (const own of [COLLECTION_NAME, PINNED_PATH, SMART_FOLDER_NAME, "soup"]) {
      expect(at("All Files")).toBeLessThan(at(own));
      expect(at(own)).toBeLessThan(at("Trash"));
    }
  });
});

describe("what Sidebar hands the system section", () => {
  it("keeps the dashboard off the column for a viewer who is not an admin", () => {
    render(<Sidebar />);
    expect(document.body.textContent).not.toContain("Dashboard");
  });

  it("puts it there for one who is", () => {
    isAdmin = true;
    render(<Sidebar />);
    expect(document.body.textContent).toContain("Dashboard");
  });

  it.each([
    ["a purpose row", "Library"],
    ["a view row", "All Files"],
    ["a row the reader made", PINNED_PATH],
    ["one of the drive's own", "Trash"],
    ["a tag", "soup"],
    ["a smart folder", SMART_FOLDER_NAME],
  ])("dismisses an overlay sidebar from %s, and leaves an inline one alone", (_part, label) => {
    const press = () => {
      // By text over the whole nav, not over `driveRows()`: a Smart
      // Folder row is a `<button>` that carries no href.
      const row = Array.from(document.querySelectorAll<HTMLElement>("nav a, nav button")).find(
        (el) => el.textContent?.includes(label),
      );
      expect(row, `${label} is not on the column`).toBeTruthy();
      row!.click();
    };

    pins = [{ path: PINNED_PATH }];
    tags = { resolvedScope: { drive: DRIVE, folderPath: null }, items: [{ name: "soup", count: 2 }] };
    overlay = true;
    const { unmount } = render(<Sidebar />);
    press();
    expect(mockClose).toHaveBeenCalled();
    unmount();

    overlay = false;
    mockClose.mockClear();
    render(<Sidebar />);
    press();
    expect(mockClose).not.toHaveBeenCalled();
  });
});

describe("which row the sidebar highlights", () => {
  it.each(FIXED_SIDEBAR_ROWS)("lights $label alone at its own URL", ({ label, view }) => {
    if (view) search = new URLSearchParams({ view });
    render(<Sidebar />);
    expect(highlighted()).toEqual([label]);
  });

  // `usePathname()` reports the encoded or the decoded spelling depending
  // on how the navigation happened, and the rows' hrefs are always
  // encoded. Both spellings are the same page.
  it.each(FIXED_SIDEBAR_ROWS)("lights $label on the decoded path too", ({ label, view }) => {
    pathname = DECODED;
    if (view) search = new URLSearchParams({ view });
    render(<Sidebar />);
    expect(highlighted()).toEqual([label]);
  });

  it("lights the Pin alone inside a pinned folder, and Library yields", () => {
    pins = [{ path: PINNED_PATH }];
    pathname = `${ENCODED}/${encodeURIComponent(PINNED_PATH)}`;
    render(<Sidebar />);
    expect(highlighted()).toEqual([PINNED_PATH]);
  });

  it("yields to the pin on the decoded path too", () => {
    pins = [{ path: PINNED_PATH }];
    pathname = `${DECODED}/${PINNED_PATH}`;
    render(<Sidebar />);
    expect(highlighted()).toEqual([PINNED_PATH]);
  });

  it("follows the pins when they arrive after the first render", () => {
    pins = [];
    pathname = `${ENCODED}/${encodeURIComponent(PINNED_PATH)}`;
    const { rerender } = render(<Sidebar />);
    expect(highlighted()).toEqual(["Library"]);

    pins = [{ path: PINNED_PATH }];
    rerender(<Sidebar />);
    expect(highlighted()).toEqual([PINNED_PATH]);
  });

  it("lights Library in a folder that is not the pinned one", () => {
    pins = [{ path: PINNED_PATH }];
    pathname = `${ENCODED}/${encodeURIComponent(UNPINNED_PATH)}`;
    render(<Sidebar />);
    expect(highlighted()).toEqual(["Library"]);
  });

  it("lights Library inside a folder, which is the subject there", () => {
    pathname = `${ENCODED}/recipes`;
    render(<Sidebar />);
    expect(highlighted()).toEqual(["Library"]);
  });

  it("lights nothing under a tag filter, Home included", () => {
    search = new URLSearchParams({ tag: "soup" });
    render(<Sidebar />);
    expect(highlighted()).toEqual([]);
  });

  it("lights nothing for a view value no row carries", () => {
    search = new URLSearchParams({ view: "not-a-view" });
    render(<Sidebar />);
    expect(highlighted()).toEqual([]);
  });
});

describe("a row whose highlight cannot come from its href", () => {
  beforeEach(() => {
    tags = {
      resolvedScope: { drive: DRIVE, folderPath: null },
      items: [{ name: "soup", count: 2 }],
    };
  });

  it("lights the applied tag, and no fixed row with it", () => {
    search = new URLSearchParams({ tag: "soup" });
    render(<Sidebar />);
    expect(highlighted()).toEqual(["soup"]);
  });

  it("lights nothing while no tag is applied", () => {
    render(<Sidebar />);
    expect(highlighted()).toEqual(["Library"]);
  });
});

