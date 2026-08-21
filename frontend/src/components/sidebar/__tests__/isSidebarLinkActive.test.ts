/**
 * spec 2026-08-21-folder-scoped-tag-filter §5.2
 *
 * The tag branch used to compare `pathname === base`, pinning the active
 * highlight to the drive root. Once a tag href carries a folder path the
 * highlight silently stops working — the user filters by a tag and the
 * sidebar shows nothing selected. The comparison has to move from "are we
 * at the drive root" to "does the pathname match this href's own path".
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
        href: "/drive/main?tag=soup",
        pathname: "/drive/main",
        currentDrive: null,
        activeView: null,
        activeTag: "soup",
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

  it("matches a drive-root tag filter", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main?tag=soup",
        pathname: "/drive/main",
        activeTag: "soup",
      }),
    ).toBe(true);
  });

  it("matches a folder-scoped tag filter", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main/recipes?tag=soup",
        pathname: "/drive/main/recipes",
        activeTag: "soup",
      }),
    ).toBe(true);
  });

  it("does not match a folder-scoped tag href from a different folder", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main/recipes?tag=soup",
        pathname: "/drive/main/dev",
        activeTag: "soup",
      }),
    ).toBe(false);
  });

  it("does not match a drive-root tag href while inside a folder", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main?tag=soup",
        pathname: "/drive/main/recipes",
        activeTag: "soup",
      }),
    ).toBe(false);
  });

  it("does not match a different tag on the same path", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main/recipes?tag=soup",
        pathname: "/drive/main/recipes",
        activeTag: "stew",
      }),
    ).toBe(false);
  });

  it("does not match a tag href while a view is active", () => {
    expect(
      isSidebarLinkActive({
        ...base,
        href: "/drive/main/recipes?tag=soup",
        pathname: "/drive/main/recipes",
        activeTag: "soup",
        activeView: "favorites",
      }),
    ).toBe(false);
  });

  it("matches a percent-encoded folder path against a decoded pathname", () => {
    // usePathname() may report either form depending on the navigation;
    // the plain folder-link branch already compares both.
    const href = `/drive/main/${encodeURIComponent("料理")}?tag=${encodeURIComponent("炒め物")}`;
    expect(
      isSidebarLinkActive({
        ...base,
        href,
        pathname: "/drive/main/料理",
        activeTag: "炒め物",
      }),
    ).toBe(true);
    expect(
      isSidebarLinkActive({
        ...base,
        href,
        pathname: `/drive/main/${encodeURIComponent("料理")}`,
        activeTag: "炒め物",
      }),
    ).toBe(true);
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
