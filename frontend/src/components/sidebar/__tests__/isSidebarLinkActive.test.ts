/**
 * Tag rows do not route through here: their href stops carrying `?tag=` at
 * exactly the moment the row is selected, so an href-derived highlight would
 * vanish there.
 */

import { describe, it, expect } from "vitest";
import { isSidebarLinkActive, samePath } from "../isSidebarLinkActive";
import { VIEW_ROWS } from "./fixedRows";

const base = { currentDrive: "main", activeView: null, activeTag: null };

/**
 * `usePathname()` may report the path encoded or decoded, and a drive called
 * "main" cannot tell those apart.
 */
const WIDE_DRIVE = "家族ビデオ & co";
const wideBase = `/drive/${encodeURIComponent(WIDE_DRIVE)}`;
const wide = { currentDrive: WIDE_DRIVE, activeView: null, activeTag: null };

describe("isSidebarLinkActive", () => {
  it("matches the home link only at /", () => {
    expect(isSidebarLinkActive({ ...base, href: "/", pathname: "/" })).toBe(true);
    expect(isSidebarLinkActive({ ...base, href: "/", pathname: "/drive/main" })).toBe(false);
  });

  it("matches the admin link only at /admin", () => {
    expect(isSidebarLinkActive({ ...base, href: "/admin", pathname: "/admin" })).toBe(true);
    expect(isSidebarLinkActive({ ...base, href: "/admin", pathname: "/admin/settings" })).toBe(false);
  });

  it("returns false for drive links when no drive is current", () => {
    expect(
      isSidebarLinkActive({
        href: "/drive/main/recipes",
        pathname: "/drive/main/recipes",
        currentDrive: null,
        activeView: null,
        activeTag: null,
      }),
    ).toBe(false);
  });

  describe("?view= rows", () => {
    it.each(VIEW_ROWS)("selects the %s row when that view is applied", (view) => {
      expect(
        isSidebarLinkActive({
          ...base,
          href: `/drive/main?view=${view}`,
          pathname: "/drive/main",
          activeView: view,
        }),
      ).toBe(true);
    });

    it.each(VIEW_ROWS)("leaves the %s row unselected under a different view", (view) => {
      const other = VIEW_ROWS[(VIEW_ROWS.indexOf(view) + 1) % VIEW_ROWS.length];
      expect(
        isSidebarLinkActive({
          ...base,
          href: `/drive/main?view=${view}`,
          pathname: "/drive/main",
          activeView: other,
        }),
      ).toBe(false);
    });

    it.each(VIEW_ROWS)("leaves the %s row unselected outside the drive root", (view) => {
      expect(
        isSidebarLinkActive({
          ...base,
          href: `/drive/main?view=${view}`,
          pathname: "/drive/main/recipes",
          activeView: view,
        }),
      ).toBe(false);
    });

    it("selects nothing for a view value no row carries", () => {
      for (const view of VIEW_ROWS) {
        expect(
          isSidebarLinkActive({
            ...base,
            href: `/drive/main?view=${view}`,
            pathname: "/drive/main",
            activeView: "not-a-view",
          }),
        ).toBe(false);
      }
      expect(
        isSidebarLinkActive({
          ...base,
          href: "/drive/main",
          pathname: "/drive/main",
          activeView: "not-a-view",
        }),
      ).toBe(false);
    });
  });

  it("matches the bare drive link only with no view and no tag", () => {
    expect(
      isSidebarLinkActive({ ...base, href: "/drive/main", pathname: "/drive/main" }),
    ).toBe(true);
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main",
        pathname: "/drive/main",
        activeTag: "soup",
      }),
    ).toBe(false);
  });

  it("matches the bare drive link only at the drive root", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main",
        pathname: "/drive/main/recipes",
      }),
    ).toBe(false);
  });

  describe("a drive name that is not its own encoding", () => {
    it.each(VIEW_ROWS)("selects the %s row on either spelling of the path", (view) => {
      for (const pathname of [wideBase, `/drive/${WIDE_DRIVE}`]) {
        expect(
          isSidebarLinkActive({
            ...wide,
            href: `${wideBase}?view=${view}`,
            pathname,
            activeView: view,
          }),
        ).toBe(true);
      }
    });

    it("selects the bare drive row on either spelling of the path", () => {
      for (const pathname of [wideBase, `/drive/${WIDE_DRIVE}`]) {
        expect(
          isSidebarLinkActive({ ...wide, href: wideBase, pathname }),
        ).toBe(true);
      }
    });

    it("still keeps both off another drive's path", () => {
      const elsewhere = `/drive/${encodeURIComponent("仕事")}`;
      expect(
        isSidebarLinkActive({
          ...wide,
          href: `${wideBase}?view=trash`,
          pathname: elsewhere,
          activeView: "trash",
        }),
      ).toBe(false);
      expect(
        isSidebarLinkActive({ ...wide, href: wideBase, pathname: elsewhere }),
      ).toBe(false);
    });
  });

  it("matches a plain folder link", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: `/drive/main/${encodeURIComponent("料理")}`,
        pathname: "/drive/main/料理",
      }),
    ).toBe(true);
  });
});

describe("samePath", () => {
  it("treats a decoded pathname as the same page as an encoded href", () => {
    expect(samePath("/drive/家族ビデオ", `/drive/${encodeURIComponent("家族ビデオ")}`)).toBe(true);
  });

  it("holds a malformed percent sequence to the raw comparison", () => {
    expect(samePath("/drive/main/%", "/drive/main/%")).toBe(true);
    expect(samePath("/drive/main/%", "/drive/other/%")).toBe(false);
  });
});
