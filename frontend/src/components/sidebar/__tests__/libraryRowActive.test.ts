import { describe, it, expect } from "vitest";

import { isLibraryRowActive, pinHrefFor } from "../libraryRowActive";
import { isSidebarLinkActive } from "../isSidebarLinkActive";
import { FIXED_SIDEBAR_ROWS } from "./fixedRows";

const DRIVE = "main";
const BASE = `/drive/${DRIVE}`;

const ODD_DRIVE = "家族ビデオ & co";
const ENCODED_BASE = `/drive/${encodeURIComponent(ODD_DRIVE)}`;
const DECODED_BASE = `/drive/${ODD_DRIVE}`;

const FIXED_ROWS: { name: string; href: string }[] = [
  ...FIXED_SIDEBAR_ROWS.filter((r) => r.label !== "Library").map((r) => ({
    name: r.label,
    href: r.view ? `${BASE}?view=${r.view}` : BASE,
  })),
  { name: "Dashboard", href: "/admin" },
  { name: "Ask", href: `${BASE}/addons/intelligence` },
  { name: "Pin: recipes/soup", href: pinHrefFor(BASE, "recipes/soup") },
];

const pinnedHrefs = [pinHrefFor(BASE, "recipes/soup")];

function litRows({
  pathname,
  activeView = null,
  activeTag = null,
  driveBase = BASE,
}: {
  pathname: string;
  activeView?: string | null;
  activeTag?: string | null;
  driveBase?: string;
}): string[] {
  const lit = FIXED_ROWS.filter(({ href }) =>
    isSidebarLinkActive({ href, pathname, currentDrive: DRIVE, activeView, activeTag }),
  ).map(({ name }) => name);

  if (isLibraryRowActive({ pathname, driveBase, activeView, activeTag, pinnedHrefs })) {
    lit.push("Library");
  }
  return lit.sort();
}

describe("which fixed sidebar row is lit", () => {
  const STATES: [string, Parameters<typeof litRows>[0], string[]][] = [
    ["the drive root", { pathname: BASE }, ["Home"]],
    ["the Library root", { pathname: BASE, activeView: "library" }, ["Library"]],
    ["a folder", { pathname: `${BASE}/recipes` }, ["Library"]],
    ["a nested folder", { pathname: `${BASE}/recipes/winter` }, ["Library"]],
    ["a pinned folder", { pathname: `${BASE}/recipes/soup` }, ["Pin: recipes/soup"]],
    // The Tag row computes its own highlight inside `SidebarTagsSection`, so
    // these states declare the empty set: Library gives it up.
    ["a folder with a tag on it", { pathname: `${BASE}/recipes`, activeTag: "soup" }, []],
    ["the drive root with a tag on it", { pathname: BASE, activeTag: "soup" }, []],
    ["the Library root with a tag on it", { pathname: BASE, activeView: "library", activeTag: "soup" }, []],
    ["a special view", { pathname: BASE, activeView: "favorites" }, ["Favorites"]],
    ["trash", { pathname: BASE, activeView: "trash" }, ["Trash"]],
    ["search, which is also where a Smart Folder lands", { pathname: `${BASE}/search` }, []],
    ["a collection", { pathname: `${BASE}/collections/c1` }, []],
    ["an addon page", { pathname: `${BASE}/addons/intelligence` }, ["Ask"]],
    ["the admin dashboard", { pathname: "/admin" }, ["Dashboard"]],
    // `driveBase` and `pathname` can name different drives: `useCurrentDrive`
    // takes an override while opening a collection from another drive.
    ["a folder on another drive", { pathname: "/drive/other/recipes" }, []],
    ["a page outside any drive", { pathname: "/settings" }, []],
    ["a drive whose name extends this one's", { pathname: `${BASE}-archive/recipes` }, []],
    ["this drive's name with a suffix", { pathname: `${BASE}x` }, []],
    // `usePathname()` reports the encoded or the decoded spelling depending on
    // how the navigation happened, while `driveBase` is always encoded.
    ["a folder under the encoded spelling", { pathname: `${ENCODED_BASE}/recipes`, driveBase: ENCODED_BASE }, ["Library"]],
    ["a folder under the decoded spelling", { pathname: `${DECODED_BASE}/recipes`, driveBase: ENCODED_BASE }, ["Library"]],
  ];

  it.each(STATES)("lights %s as declared", (_name, url, expected) => {
    expect(litRows(url)).toEqual([...expected].sort());
  });

  it("declares one lit row per state, or none where the owner is elsewhere", () => {
    const byCount = (n: number) => STATES.filter(([, , expected]) => expected.length === n);
    expect(byCount(1)).toHaveLength(11);
    expect(byCount(0)).toHaveLength(9);
    expect(byCount(1).length + byCount(0).length).toBe(STATES.length);
  });
});
