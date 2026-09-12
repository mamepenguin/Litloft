import { describe, it, expect } from "vitest";

import { isLibraryRowActive, pinHrefFor } from "../libraryRowActive";
import { isSidebarLinkActive } from "../isSidebarLinkActive";

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
 * Enumerated by role, not by file: the fixed rows of the two sections, the
 * Pin rows (`SidebarPinsSection` passes no override, so a pin decides the
 * same way), and an addon row. Leaving the pins out is what would make
 * "a pinned folder lights nothing" look correct — the row that takes the
 * highlight from Library has to be in the population, or the yield cannot
 * be told from a hole.
 */
const FIXED_ROWS = [
  { name: "Home", href: BASE },
  { name: "Favorites", href: `${BASE}?view=favorites` },
  { name: "Liked", href: `${BASE}?view=liked` },
  { name: "Recently Viewed", href: `${BASE}?view=recent` },
  { name: "Recently Added", href: `${BASE}?view=recent-added` },
  { name: "All Files", href: `${BASE}?view=all` },
  { name: "Trash", href: `${BASE}?view=trash` },
  { name: "Missing Files", href: `${BASE}?view=missing` },
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
    expect(byCount(0)).toHaveLength(4);
    expect(byCount(1).length + byCount(0).length).toBe(STATES.length);
  });
});
