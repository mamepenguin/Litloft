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

  it("matches special views at the drive root", () => {
    for (const view of ["favorites", "recent", "recent-added", "all"]) {
      expect(
        isSidebarLinkActive({
          ...base,
          href: `/drive/main?view=${view}`,
          pathname: "/drive/main",
          activeView: view,
        }),
      ).toBe(true);
    }
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
