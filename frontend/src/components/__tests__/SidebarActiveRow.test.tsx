/**
 * What the sidebar actually highlights, measured through `Sidebar` itself.
 *
 * `isSidebarLinkActive` has close unit coverage and its call site had none:
 * nothing in the suite mounted `Sidebar`, so `linkClass`'s
 * `active ?? isActive(href)`, the `?view=` and `?tag=` reads that feed it,
 * and the `driveBase` the rows are built from could each be deleted with
 * the whole suite green.
 *
 * Two things are held here and nowhere else:
 *
 * - the fixed rows a drive renders, in order, with the `?view=` value each
 *   one carries — declared below as a literal and compared against the DOM,
 *   so a deleted row, a reordered pair or a typo'd href fails;
 * - that **exactly one** of them is highlighted for a given URL, and which.
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
    isOverlay: false,
    close: vi.fn(),
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
    pins: [],
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: { is_admin: false },
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
    expect(FIXED_SIDEBAR_ROWS.length).toBe(8);
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

  it("lights nothing inside a folder, where no fixed row is the subject", () => {
    pathname = `${ENCODED}/recipes`;
    render(<Sidebar />);
    expect(highlighted()).toEqual([]);
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

