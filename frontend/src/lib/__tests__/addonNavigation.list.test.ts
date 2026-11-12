/** SPEC-CORE-093 I9, I10: one entry per element of a `navigation` list. */

import { describe, it, expect } from "vitest";

import { addonNavEntries } from "@/lib/addonNavigation";
import type { AddonMeta } from "@/lib/addons";

const DRIVE = "家族 & co";
const BASE = `/drive/${encodeURIComponent(DRIVE)}/addons`;

function addon(navigation: unknown): AddonMeta {
  return {
    label: "Product",
    icon: "package",
    href: "/drive/{drive}/addons/x",
    scope: "drive",
    navigation: navigation as AddonMeta["navigation"],
  };
}

const NOTES = { label: "Notes", placement: "primary", priority: 20, icon: "notebook-pen" };
const CLIPS = { label: "Clips", placement: "primary", priority: 21, icon: "newspaper", path: "clips" };

const summary = (entries: ReturnType<typeof addonNavEntries>) =>
  entries.map((e) => ({ key: (e as { key?: string }).key, href: e.href, label: e.navigation.label }));

describe("SPEC-CORE-093 addonNavEntries with a navigation list", () => {
  it("SPEC-CORE-093 I10 yields one entry per element, the path appended to href and key", () => {
    const entries = addonNavEntries({ notesaddon: addon([NOTES, CLIPS]) }, DRIVE, "primary");

    expect(summary(entries)).toEqual([
      { key: "notesaddon", href: `${BASE}/notesaddon`, label: "Notes" },
      { key: "notesaddon/clips", href: `${BASE}/notesaddon/clips`, label: "Clips" },
    ]);
  });

  it("SPEC-CORE-093 I9 treats a single object as a one-element list, its key the addon name", () => {
    const entries = addonNavEntries({ single: addon(NOTES), listed: addon([CLIPS]) }, DRIVE, "primary");

    expect(summary(entries)).toEqual([
      { key: "single", href: `${BASE}/single`, label: "Notes" },
      { key: "listed/clips", href: `${BASE}/listed/clips`, label: "Clips" },
    ]);
  });

  it("SPEC-CORE-093 orders by priority, then addon name, then place in the list", () => {
    const entries = addonNavEntries(
      {
        bravo: addon([
          { label: "B-first", placement: "primary", priority: 5 },
          { label: "B-second", placement: "primary", priority: 5, path: "second" },
          { label: "B-late", placement: "primary", priority: 30, path: "late" },
        ]),
        alpha: addon({ label: "A", placement: "primary", priority: 5 }),
        charlie: addon([{ label: "C-early", placement: "primary", priority: 1, path: "early" }]),
        delta: addon({ label: "D", placement: "primary", priority: 20 }),
      },
      DRIVE,
      "primary",
    );

    expect(summary(entries).map((e) => e.label)).toEqual(["C-early", "A", "B-first", "B-second", "D", "B-late"]);
  });

  it("SPEC-CORE-093 keeps only the elements of the placement asked for", () => {
    const catalogue = {
      mixed: addon([
        { label: "Main", placement: "primary", priority: 1 },
        { label: "Feed", placement: "sources", priority: 1, path: "feed" },
      ]),
    };

    expect(summary(addonNavEntries(catalogue, DRIVE, "primary"))).toEqual([
      { key: "mixed", href: `${BASE}/mixed`, label: "Main" },
    ]);
    expect(summary(addonNavEntries(catalogue, DRIVE, "sources"))).toEqual([
      { key: "mixed/feed", href: `${BASE}/mixed/feed`, label: "Feed" },
    ]);
  });

  it("SPEC-CORE-093 I10 gives every entry a key unique among all entries", () => {
    const catalogue = {
      notes: addon([NOTES, CLIPS]),
      other: addon([{ ...NOTES, label: "Other" }, { ...CLIPS, label: "Other clips" }]),
    };
    const keys = addonNavEntries(catalogue, DRIVE, "primary").map((e) => (e as { key?: string }).key);

    expect(keys).toHaveLength(4);
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
