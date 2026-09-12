/**
 * spec 2026-08-21-folder-scoped-tag-filter §5.2
 *
 * Tag rows no longer route through here: their href toggles between
 * applying and clearing the tag, so it stops carrying `?tag=` at exactly
 * the moment the row is selected, and an href-derived highlight would
 * vanish there. SidebarTagsSection computes the highlight from the tag
 * name — see SidebarTagsScope.test.tsx.
 *
 * What remains here is every other sidebar link, including the bare drive
 * link, which must *not* light up while a tag filter is applied.
 */

import { describe, it, expect } from "vitest";
import { isSidebarLinkActive } from "../isSidebarLinkActive";

const base = { currentDrive: "main", activeView: null, activeTag: null };

/**
 * Every view SidebarLibrarySection links to as `?view=<value>`.
 *
 * Written out here rather than read from either side. The classifier
 * matches the value the href carries, so it holds no list to compare
 * against, and a list built from the sidebar's own hrefs would lose an
 * entry at the same moment a row was deleted, leaving this green
 * (`.claude/rules/review-workflow.md`, detector rule 5).
 */
const VIEW_ROWS = ["favorites", "liked", "recent", "recent-added", "all", "trash", "missing"];

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
    it("has a row for every view the sidebar links to", () => {
      expect(VIEW_ROWS.length).toBe(7);
    });

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
