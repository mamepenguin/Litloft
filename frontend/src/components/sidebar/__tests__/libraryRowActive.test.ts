import { describe, it, expect } from "vitest";

import { isLibraryRowActive, pinHrefFor } from "../libraryRowActive";
import { isSidebarLinkActive } from "../isSidebarLinkActive";
import { FIXED_SIDEBAR_ROWS } from "./fixedRows";

/**
 * Which single fixed row the sidebar lights, in every state that can
 * reach one.
 *
 * The unit under test is not "is Library selected" — that question alone
 * cannot see two rows lit at once, which is the whole failure mode here
 * (stage 1 arbitrations 15 and 20: a Pin or a tag takes the highlight and
 * Library gives it up). So each state declares **the set it expects**, and
 * the count of lit fixed rows is pinned at one.
 *
 * The expected set is declared per state and never built from what was
 * observed: deriving it would move the observation and the expectation
 * together, so a row that stopped lighting would leave both sides equal
 * (detector rule 5).
 *
 * **What this does not hold.** Tag, Collection and Smart Folder rows
 * compute their own highlight inside their own components and are not
 * reachable from here; `SidebarTagsSection` holds the tag row's. What is
 * measured here is that Library *yields* in those states — which is the
 * half that this change can break.
 */

const DRIVE = "main";
const BASE = `/drive/${DRIVE}`;

/**
 * Every row whose highlight is decided by `isSidebarLinkActive`.
 *
 * The fixed rows come from `fixedRows.ts` rather than being written again
 * here: that set is compared against the rendered DOM by
 * `SidebarActiveRow.test.tsx`, so a row deleted from it fails there. A
 * second hand-written copy could be walked back to any length with this
 * file green, which is what the counts below would then be counted
 * against (detector rule 5).
 *
 * Library is not among them — it is the subject, and its answer comes
 * from `isLibraryRowActive` below. The three added here are rows this
 * file needs and that set does not carry: an addon row, a Pin, and the
 * admin dashboard, which is not drive-scoped.
 */
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
}: {
  pathname: string;
  activeView?: string | null;
  activeTag?: string | null;
}): string[] {
  const lit = FIXED_ROWS.filter(({ href }) =>
    isSidebarLinkActive({ href, pathname, currentDrive: DRIVE, activeView, activeTag }),
  ).map(({ name }) => name);

  if (isLibraryRowActive({ pathname, driveBase: BASE, activeView, activeTag, pinnedHrefs })) {
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
    // Arbitration 15: the Pin row names this exact folder, so Library yields.
    ["a pinned folder", { pathname: `${BASE}/recipes/soup` }, ["Pin: recipes/soup"]],
    // Arbitration 20: same sentence in §5.2, same answer. The Tag row that
    // takes the highlight computes it inside `SidebarTagsSection` and is
    // not reachable from here, so these two states declare the empty set:
    // what is measured is that Library gives it up.
    ["a folder with a tag on it", { pathname: `${BASE}/recipes`, activeTag: "soup" }, []],
    ["the drive root with a tag on it", { pathname: BASE, activeTag: "soup" }, []],
    // The state that decides the tag clause at the root. Without it, the
    // row above holds *Home's* yield and not Library's: `activeView` is
    // null there, so `isLibraryRootView` already answers false and the
    // clause could be deleted with this table green.
    ["the Library root with a tag on it", { pathname: BASE, activeView: "library", activeTag: "soup" }, []],
    ["a special view", { pathname: BASE, activeView: "favorites" }, ["Favorites"]],
    ["trash", { pathname: BASE, activeView: "trash" }, ["Trash"]],
    // One state, not two: a Smart Folder navigates to this same
    // `/search` path and differs only in its query, which nothing here
    // reads. A second row spelled the same way would be a case that
    // cannot disagree with the first.
    ["search, which is also where a Smart Folder lands", { pathname: `${BASE}/search` }, []],
    ["a collection", { pathname: `${BASE}/collections/c1` }, []],
    ["an addon page", { pathname: `${BASE}/addons/intelligence` }, ["Ask"]],
    ["the admin dashboard", { pathname: "/admin" }, ["Dashboard"]],
    // `driveBase` and `pathname` can name different drives: `useCurrentDrive`
    // takes an override, which is how opening a collection from another
    // drive switches the column before the route follows. Library must not
    // light over a path that is not this drive's.
    ["a folder on another drive", { pathname: "/drive/other/recipes" }, []],
    ["a page outside any drive", { pathname: "/settings" }, []],
  ];

  it.each(STATES)("lights %s as declared", (_name, url, expected) => {
    expect(litRows(url)).toEqual([...expected].sort());
  });

  it("declares one lit row per state, or none where the owner is elsewhere", () => {
    // Two numbers rather than a bound. "At most one is lit" is satisfied
    // by a table in which nothing ever lights, and "exactly one" is false
    // for the three states whose owning row is computed in its own
    // component. Both counts are declared, so shrinking the table moves
    // one of them and the other stays put.
    const byCount = (n: number) => STATES.filter(([, , expected]) => expected.length === n);
    expect(byCount(1)).toHaveLength(9);
    expect(byCount(0)).toHaveLength(7);
    expect(byCount(1).length + byCount(0).length).toBe(STATES.length);
  });
});
