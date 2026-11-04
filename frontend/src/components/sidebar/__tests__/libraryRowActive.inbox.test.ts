/**
 * SPEC-CORE-032 I15 — at `?view=inbox` the inbox row is the only fixed row
 * lit: Library names the folder hierarchy, and the inbox is not in it.
 */

import { describe, it, expect } from "vitest";

import { isLibraryRowActive } from "../libraryRowActive";
import { isSidebarLinkActive } from "../isSidebarLinkActive";

const DRIVE = "main";
const BASE = `/drive/${DRIVE}`;

function libraryActive(activeView: string | null): boolean {
  return isLibraryRowActive({
    pathname: BASE,
    driveBase: BASE,
    activeView,
    activeTag: null,
    pinnedHrefs: [],
  });
}

function lit(href: string, activeView: string | null): boolean {
  return isSidebarLinkActive({
    href,
    pathname: BASE,
    currentDrive: DRIVE,
    activeView,
    activeTag: null,
  });
}

describe("SPEC-CORE-032 I15 which row the inbox lights", () => {
  it("SPEC-CORE-032 I15 leaves Library unlit at ?view=inbox", () => {
    expect(libraryActive("inbox")).toBe(false);
  });

  it("SPEC-CORE-032 I15 lights the inbox row at ?view=inbox", () => {
    expect(lit(`${BASE}?view=inbox`, "inbox")).toBe(true);
  });

  it("SPEC-CORE-032 I15 leaves the other fixed view rows unlit at ?view=inbox", () => {
    for (const view of ["favorites", "liked", "recent", "recent-added", "all", "home"]) {
      expect(lit(`${BASE}?view=${view}`, "inbox"), view).toBe(false);
    }
  });

  it("SPEC-CORE-032 I15 keeps Library lit at the bare drive URL", () => {
    expect(libraryActive(null)).toBe(true);
    expect(lit(`${BASE}?view=inbox`, null)).toBe(false);
  });
});
