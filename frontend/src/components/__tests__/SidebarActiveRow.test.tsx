/**
 * What the sidebar actually highlights, measured through `Sidebar` itself.
 *
 * `isSidebarLinkActive` has close unit coverage and its call site had none:
 * nothing in the suite mounted `Sidebar`, so `linkClass`'s
 * `active ?? isActive(href)`, the `?view=` and `?tag=` reads that feed it,
 * and the `driveBase` the rows are built from could each be deleted with
 * the whole suite green.
 *
 * Two things are held here:
 *
 * - the fixed rows a drive renders, in order, with the `?view=` value each
 *   one carries — declared in `sidebar/__tests__/fixedRows.ts` and compared
 *   against the DOM, so a deleted row, a reordered pair or a typo'd href
 *   fails. `SidebarDriveSwitcher.test.tsx` holds their *labels* the same
 *   way; what is only here is the `?view=` value and the `Missing Files`
 *   row, which that fixture does not render;
 * - that **exactly one** of them is highlighted for a given URL, and which.
 *   That part is here and nowhere else.
 *   Counting is the point: asserting only that the expected row is lit
 *   cannot see a second row lit beside it, which spec
 *   2026-09-12-purpose-oriented-navigation §5.2 forbids ("Only one purpose
 *   or view destination is selected at a time").
 *
 * Not held here: focus, layout, or which of two responsive copies a viewer
 * sees — jsdom lays nothing out (`.claude/rules/review-workflow.md`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import { Sidebar } from "../Sidebar";
import { FIXED_SIDEBAR_ROWS } from "../sidebar/__tests__/fixedRows";

/**
 * A drive whose name is not its own encoding, so the two independent
 * constructions of the drive's URL base — `Sidebar`'s `driveBase` and
 * `isSidebarLinkActive`'s `base` — have somewhere to disagree. With a
 * drive called "main" they cannot (`.claude/rules/review-workflow.md`,
 * detector rule 2: two sides, two implementations, one test through both).
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
let pins: { path: string }[] = [];

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
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: { is_admin: isAdmin },
    driveSummary: { missing_count: 3 },
  }),
}));

vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));



/** Every rendered link that points into this drive, in document order. */
function driveRows() {
  // Filtered in JS rather than with an attribute selector: the encoded
  // drive name carries `%` and `&`, and a CSS selector is the wrong place
  // to reason about either.
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter(
    (a) => (a.getAttribute("href") ?? "").startsWith(ENCODED),
  );
}

const HIGHLIGHT = "bg-bg-elevated";

/** The labels of the rows rendering as selected — `font-medium` is on the
 *  same class list, but `bg-bg-elevated` is also the hover colour, so the
 *  resting selection is read from the non-hover class. */
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

/**
 * Where the three parts of the column sit relative to each other.
 *
 * The rows are held by the set above; their *position* is not, and it is
 * the whole of what this change does to the shape of the column (spec
 * §5.1). Moving `SidebarSystemSection` above `{order.map(…)}` is a
 * one-line edit that no other case can see.
 *
 * It needs the reader's own sections to actually render, which is why
 * this block gives the data mock a pin and a tag: with all of them empty
 * there is no "below" for the system rows to be below, and the assertion
 * would hold over a column that has only two parts.
 */
describe("the column's three parts, in order", () => {
  it("puts the reader's own sections between the purpose rows and the drive's", () => {
    pins = [{ path: PINNED_PATH }];
    tags = { resolvedScope: { drive: DRIVE, folderPath: null }, items: [{ name: "soup", count: 2 }] };
    const { container } = render(<Sidebar />);
    const text = container.textContent ?? "";
    const at = (needle: string) => {
      const i = text.indexOf(needle);
      expect(i, `${needle} is not on the column`).not.toBe(-1);
      return i;
    };
    // Library and All Files are the ends of the purpose block; Pins is a
    // section the reader owns; Trash is the first of the drive's own.
    expect(at("Library")).toBeLessThan(at("All Files"));
    expect(at("All Files")).toBeLessThan(at(PINNED_PATH));
    expect(at(PINNED_PATH)).toBeLessThan(at("Trash"));
  });
});

/**
 * The four props `Sidebar` hands `SidebarSystemSection`.
 *
 * `SidebarSystemSection.test.tsx` renders that component directly with
 * props of its own, so it can say what the component does with them and
 * nothing about what `Sidebar` passes. Both are new call sites, and two of
 * them carry a stated contract: the dashboard is admin-only, and choosing
 * a destination dismisses the sidebar in overlay mode alone (spec §5.2).
 */
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

  it("dismisses an overlay sidebar when a system row is chosen, and only then", () => {
    overlay = true;
    const { unmount } = render(<Sidebar />);
    driveRows().find((a) => a.textContent?.includes("Trash"))!.click();
    expect(mockClose).toHaveBeenCalled();
    unmount();

    overlay = false;
    mockClose.mockClear();
    render(<Sidebar />);
    driveRows().find((a) => a.textContent?.includes("Trash"))!.click();
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

  /**
   * The pin states, through the mounted sidebar rather than through the
   * predicate.
   *
   * `libraryRowActive.test.ts` hands the predicate a `pinnedHrefs` list it
   * builds itself, which shows the predicate consumes a list — not that
   * `Sidebar` supplies one. The memo that builds it, its `pins`
   * dependency, and the shared `pinHrefFor` are only reachable from here,
   * and cutting the memo to `[]` is what a renamed `pin.path` or a dropped
   * dependency degrades to. What that looks like on screen is arbitration
   * 15 reversed: the Pin row **and** Library lit at once, which is why
   * these assert the whole lit set and not just Library's absence.
   */
  it("lights the Pin alone inside a pinned folder, and Library yields", () => {
    pins = [{ path: PINNED_PATH }];
    pathname = `${ENCODED}/${encodeURIComponent(PINNED_PATH)}`;
    render(<Sidebar />);
    expect(highlighted()).toEqual([PINNED_PATH]);
  });

  it("yields to the pin on the decoded path too", () => {
    // The half `samePath` carries. With a plain comparison the pin row
    // goes dark here and Library lights instead, so this separates the
    // two spellings rather than the two rows.
    pins = [{ path: PINNED_PATH }];
    pathname = `${DECODED}/${PINNED_PATH}`;
    render(<Sidebar />);
    expect(highlighted()).toEqual([PINNED_PATH]);
  });

  it("lights Library in a folder that is not the pinned one", () => {
    // The complement: with a pin in the list and the reader somewhere
    // else, Library keeps the highlight. Without this, "Library yields"
    // is satisfied by a Library row that never lights on a folder at all.
    pins = [{ path: PINNED_PATH }];
    pathname = `${ENCODED}/${encodeURIComponent(UNPINNED_PATH)}`;
    render(<Sidebar />);
    expect(highlighted()).toEqual(["Library"]);
  });

  it("lights Library inside a folder, which is the subject there", () => {
    // Library is selected on a URL it does not link to, so its highlight
    // cannot come from its href — `Sidebar` passes it as the override
    // `linkClass` takes. Measured through the mounted sidebar and not
    // only against the predicate, because the override is the half that
    // a unit test of the predicate cannot reach.
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

/**
 * A tag row's href is a toggle — it stops carrying `?tag=` at the moment
 * the row is selected — so its highlight cannot come from the href.
 * `Sidebar`'s `linkClass(href, active?)` takes an explicit answer for
 * exactly this, and discarding that parameter leaves the design the
 * classifier's own docstring rests on with nothing holding it up.
 */
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
    expect(highlighted()).toEqual(["Home"]);
  });
});

