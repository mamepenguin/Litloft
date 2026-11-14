/**
 * SPEC-CORE-106: the jump palette omits hidden entries. `useJumpDestinations(active, drive, hiddenKeys)`
 * takes the set as its third argument. Section 9, I2, I4, I5. Only the hook is driven here;
 * the palette's null (loading) behaviour is not stated by the spec and is not tested.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import type { AddonMeta } from "@/lib/addons";

let catalogue: Record<string, AddonMeta> = {};
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: catalogue, catalogueDrive: "main", slots: {}, loading: false }),
}));

import { useJumpDestinations } from "@/components/search/useJumpDestinations";

const DRIVE = "main";
const VIDEO = `/drive/${DRIVE}/apps/video`;
const READING = `/drive/${DRIVE}/apps/reading`;
const DIARY = `/drive/${DRIVE}/addons/diary`;
const NOTES = `/drive/${DRIVE}/addons/notes`;

const addon = (label: string, icon: string): AddonMeta => ({
  label,
  icon: "package",
  href: "/drive/{drive}/addons/x",
  scope: "drive",
  navigation: { label, placement: "primary", priority: 1, icon },
});

beforeEach(() => {
  catalogue = {
    diary: addon("Diary", "images"),
    notes: addon("Notes", "notebook-pen"),
  };
});

function hrefsWith(hidden: ReadonlySet<string>) {
  const { result } = renderHook(() => useJumpDestinations(false, DRIVE, hidden));
  return result.current.map((d) => d.href);
}

describe("SPEC-CORE-106 jump palette hidden entries", () => {
  it("SPEC-CORE-106 I2 Section 9: a listed built-in is omitted and the others remain", () => {
    const hrefs = hrefsWith(new Set(["video"]));
    expect(hrefs).not.toContain(VIDEO);
    expect(hrefs).toContain(READING);
  });

  it("SPEC-CORE-106 I2 Section 9: a listed addon entry is omitted and the others remain", () => {
    const hrefs = hrefsWith(new Set(["diary"]));
    expect(hrefs).not.toContain(DIARY);
    expect(hrefs).toContain(NOTES);
  });

  it("SPEC-CORE-106 Section 9: removing one entry keeps every other destination in its order", () => {
    const all = hrefsWith(new Set());
    const hidden = hrefsWith(new Set(["video", "notes"]));
    expect(hidden).toEqual(all.filter((href) => href !== VIDEO && href !== NOTES));
  });

  it("SPEC-CORE-106 I4 I5: library, inbox and an unknown key are ignored while a listed built-in is still omitted", () => {
    const all = hrefsWith(new Set());
    expect(hrefsWith(new Set(["library", "inbox", "nope", "video"]))).toEqual(all.filter((href) => href !== VIDEO));
  });
});
